import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useSettings } from '../../composables/useSettings'
import { useBudgetData } from '../../composables/useBudgetData'
import SettingsDialog from '../../components/SettingsDialog.vue'

const storageKey = 'budget-default-transaction-currency'

function setup() {
  const settings = useSettings()
  settings.initSettings()
  const budget = useBudgetData(vi.fn(), settings.defaultTransactionCurrency)
  budget.accounts.value = [
    {
      id: 1,
      name: 'CAD account',
      type: 'BANK',
      currency: 'CAD',
      description: null,
    },
  ]
  return { settings, budget }
}

describe('default transaction currency', () => {
  it('defaults to CAD and restores a normalized saved preference', () => {
    expect(setup().settings.defaultTransactionCurrency.value).toBe('CAD')
    localStorage.setItem(storageKey, ' eur ')
    expect(setup().settings.defaultTransactionCurrency.value).toBe('EUR')
    localStorage.setItem(storageKey, 'invalid')
    expect(setup().settings.defaultTransactionCurrency.value).toBe('CAD')
  })

  it('persists valid changes and rejects invalid codes', () => {
    const { settings } = setup()
    settings.setDefaultTransactionCurrency(' usd ')
    expect(settings.defaultTransactionCurrency.value).toBe('USD')
    expect(localStorage.getItem(storageKey)).toBe('USD')
    for (const code of ['', 'EU', '123', 'EURO'])
      settings.setDefaultTransactionCurrency(code)
    expect(settings.defaultTransactionCurrency.value).toBe('USD')
    expect(setup().settings.defaultTransactionCurrency.value).toBe('USD')
  })

  it('prefills new expenses and income even with one account, preserving manual choices', async () => {
    const { settings, budget } = setup()
    settings.setDefaultTransactionCurrency('EUR')
    budget.openCreatePanel('transaction')
    await nextTick()
    expect(budget.transactionForm.accountId).toBe('1')
    expect(budget.transactionForm.currency).toBe('EUR')
    expect(budget.isTransactionForeignCurrency.value).toBe(true)
    budget.transactionForm.kind = 'INCOME'
    await nextTick()
    expect(budget.transactionForm.currency).toBe('EUR')
    budget.transactionForm.currency = 'GBP'
    settings.setDefaultTransactionCurrency('USD')
    await nextTick()
    expect(budget.transactionForm.currency).toBe('GBP')
    budget.closeCreatePanel()
    budget.openCreatePanel('transaction')
    await nextTick()
    expect(budget.transactionForm.currency).toBe('USD')
  })

  it('preserves existing transaction currencies when editing and uses the source account for transfers', async () => {
    const { settings, budget } = setup()
    settings.setDefaultTransactionCurrency('EUR')
    budget.openEditTransaction({
      id: 5,
      label: 'Existing',
      amount: -10,
      sourceCurrency: 'GBP',
      kind: 'EXPENSE',
      date: '2026-11-04',
      accountId: 1,
      account: budget.accounts.value[0],
    } as any)
    await nextTick()
    settings.setDefaultTransactionCurrency('USD')
    await nextTick()
    expect(budget.transactionForm.currency).toBe('GBP')
    budget.closeCreatePanel()
    budget.openCreatePanel('transaction')
    budget.transactionForm.kind = 'TRANSFER'
    await nextTick()
    expect(budget.transactionForm.currency).toBe('CAD')
  })

  it('uses the preference with several accounts and after account selection', async () => {
    const { settings, budget } = setup()
    budget.accounts.value.push({
      id: 2,
      name: 'EUR account',
      type: 'BANK',
      currency: 'EUR',
      description: null,
    })
    settings.setDefaultTransactionCurrency('USD')
    budget.openCreatePanel('transaction')
    expect(budget.transactionForm.accountId).toBe('')
    expect(budget.transactionForm.currency).toBe('USD')
    budget.transactionForm.accountId = '2'
    await nextTick()
    expect(budget.transactionForm.currency).toBe('USD')
  })

  it('shows the setting and emits normalized changes from the dialog', async () => {
    const wrapper = mount(SettingsDialog, {
      props: {
        open: true,
        currentLocale: 'fr',
        currentTheme: 'dark',
        defaultTransactionCurrency: 'CAD',
      },
      global: {
        stubs: {
          SecurityRecoveryPanel: true,
          FreshnessBadge: true,
          ProvenanceBadge: true,
        },
      },
    })
    const input = wrapper.get('#default-transaction-currency')
    expect((input.element as HTMLInputElement).value).toBe('CAD')
    await input.setValue('eur')
    expect(wrapper.emitted('update-default-transaction-currency')).toEqual([
      ['EUR'],
    ])
    await input.setValue('12')
    expect(wrapper.emitted('update-default-transaction-currency')).toHaveLength(
      1,
    )
    wrapper.unmount()
  })
})
