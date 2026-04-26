import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import {useRecurringTemplates} from '../../composables/useRecurringTemplates'
import type {Account, Category, RecurringTransactionTemplate} from '../../types/budget'
import {i18n} from '../../i18n'

function makeAccount(overrides: Partial<Account> = {}): Account {
    return {
        id: 1,
        name: 'Main',
        type: 'BANK',
        currency: 'CAD',
        description: null,
        ...overrides,
    }
}

function makeCategory(overrides: Partial<Category> = {}): Category {
    return {
        id: 10,
        name: 'Groceries',
        kind: 'EXPENSE',
        color: '#22c55e',
        description: null,
        ...overrides,
    }
}

function makeTemplate(overrides: Partial<RecurringTransactionTemplate> = {}): RecurringTransactionTemplate {
    return {
        id: 100,
        label: 'Rent',
        sourceAmount: 1000,
        sourceCurrency: 'CAD',
        accountAmount: 1000,
        conversionMode: 'NONE',
        exchangeRate: 1,
        exchangeProvider: 'ACCOUNT',
        kind: 'EXPENSE',
        note: null,
        frequency: 'MONTHLY',
        intervalCount: 1,
        startDate: '2026-01-01',
        nextOccurrenceDate: '2026-04-01',
        endDate: null,
        isActive: true,
        accountId: 1,
        categoryId: 10,
        account: makeAccount(),
        category: makeCategory(),
        ...overrides,
    }
}

function installBridgeMocks() {
    ;(window as any).db = {
        recurringTemplate: {
            list: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockResolvedValue({id: 501}),
            update: vi.fn().mockResolvedValue({id: 502}),
            delete: vi.fn().mockResolvedValue(undefined),
            generateDue: vi.fn().mockResolvedValue({generatedTransactions: 0, generatedTemplates: 0}),
        },
    }
}

function createHarness(accounts = [makeAccount()], categories = [makeCategory()]) {
    const showNotice = vi.fn()
    const refreshTransactions = vi.fn().mockResolvedValue(undefined)
    const recurring = useRecurringTemplates({
        accounts: ref(accounts),
        categories: ref(categories),
        showNotice,
        refreshTransactions,
    })

    return {recurring, showNotice, refreshTransactions}
}

describe('useRecurringTemplates workflows', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'))
        i18n.global.locale.value = 'en'
        installBridgeMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('refreshes recurring templates and reports load failures', async () => {
        const {recurring, showNotice} = createHarness()
        ;(window as any).db.recurringTemplate.list.mockResolvedValueOnce([makeTemplate({id: 1})])

        await recurring.refreshRecurringTemplates()

        expect(recurring.recurringLoading.value).toBe(false)
        expect(recurring.recurringTemplates.value).toHaveLength(1)
        expect(recurring.recurringTemplates.value[0].id).toBe(1)

        ;(window as any).db.recurringTemplate.list.mockRejectedValueOnce(new Error('load failed'))
        await recurring.refreshRecurringTemplates()

        expect(recurring.recurringLoading.value).toBe(false)
        expect(showNotice).toHaveBeenCalledWith('error', 'load failed')
    })

    it('opens create/edit dialogs, computes selected currency and resets on close', () => {
        const account = makeAccount({id: 7, name: 'Euro account', currency: 'EUR'})
        const {recurring} = createHarness([account])

        recurring.openCreateRecurring()

        expect(recurring.recurringDialogOpen.value).toBe(true)
        expect(recurring.editingRecurringId.value).toBeNull()
        expect(recurring.recurringForm.accountId).toBe('7')
        expect(recurring.recurringForm.sourceCurrency).toBe('EUR')
        expect(recurring.selectedRecurringAccountCurrency.value).toBe('EUR')
        expect(recurring.recurringIsForeignCurrency.value).toBe(false)

        recurring.recurringForm.sourceCurrency = 'usd'
        expect(recurring.recurringIsForeignCurrency.value).toBe(true)

        recurring.openEditRecurring(makeTemplate({
            id: 88,
            label: 'Salary',
            sourceAmount: 2500,
            sourceCurrency: 'USD',
            accountAmount: 3400,
            conversionMode: 'MANUAL',
            exchangeRate: 1.36,
            exchangeProvider: 'Manual bank rate',
            kind: 'INCOME',
            note: 'Payroll',
            frequency: 'WEEKLY',
            intervalCount: 2,
            startDate: '2026-04-01T00:00:00.000Z',
            nextOccurrenceDate: '2026-04-15T00:00:00.000Z',
            endDate: '2026-06-30T00:00:00.000Z',
            isActive: false,
            accountId: 7,
            categoryId: null,
        }))

        expect(recurring.editingRecurringId.value).toBe(88)
        expect(recurring.recurringForm.label).toBe('Salary')
        expect(recurring.recurringForm.accountAmount).toBe('3400')
        expect(recurring.recurringForm.exchangeRate).toBe('1.36')
        expect(recurring.recurringForm.nextOccurrenceDate).toBe('2026-04-15')
        expect(recurring.recurringForm.endDate).toBe('2026-06-30')
        expect(recurring.recurringForm.categoryId).toBe('')

        recurring.closeRecurringDialog()

        expect(recurring.recurringDialogOpen.value).toBe(false)
        expect(recurring.editingRecurringId.value).toBeNull()
        expect(recurring.recurringForm.label).toBe('')
        expect(recurring.recurringForm.sourceCurrency).toBe('CAD')
    })

    it('validates required recurring form fields before saving', async () => {
        const {recurring, showNotice} = createHarness()

        await recurring.submitRecurring()
        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))

        recurring.recurringForm.label = 'Rent'
        recurring.recurringForm.sourceAmount = '0'
        await recurring.submitRecurring()
        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))

        recurring.recurringForm.sourceAmount = '100'
        recurring.recurringForm.intervalCount = '1.5'
        await recurring.submitRecurring()
        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))

        recurring.recurringForm.intervalCount = '1'
        recurring.recurringForm.accountId = ''
        await recurring.submitRecurring()
        expect(showNotice).toHaveBeenLastCalledWith('error', expect.any(String))

        expect((window as any).db.recurringTemplate.create).not.toHaveBeenCalled()
        expect(recurring.recurringSaving.value).toBe(false)
    })

    it('creates same-currency recurring templates with normalized payloads', async () => {
        const {recurring, showNotice} = createHarness()
        recurring.openCreateRecurring()
        recurring.recurringForm.label = '  Coffee  '
        recurring.recurringForm.sourceAmount = '12.50'
        recurring.recurringForm.note = '  Morning coffee  '
        recurring.recurringForm.categoryId = '10'
        recurring.recurringForm.startDate = '2026-04-10'
        recurring.recurringForm.nextOccurrenceDate = '2026-04-10'
        recurring.recurringForm.endDate = '2026-05-10'

        await recurring.submitRecurring()

        expect((window as any).db.recurringTemplate.create).toHaveBeenCalledWith({
            label: 'Coffee',
            sourceAmount: 12.5,
            sourceCurrency: 'CAD',
            accountAmount: 12.5,
            conversionMode: 'NONE',
            exchangeRate: 1,
            exchangeProvider: 'ACCOUNT',
            kind: 'EXPENSE',
            note: 'Morning coffee',
            frequency: 'MONTHLY',
            intervalCount: 1,
            startDate: '2026-04-10',
            nextOccurrenceDate: '2026-04-10',
            endDate: '2026-05-10',
            isActive: true,
            accountId: 1,
            categoryId: 10,
        })
        expect((window as any).db.recurringTemplate.list).toHaveBeenCalled()
        expect(recurring.recurringDialogOpen.value).toBe(false)
        expect(recurring.recurringSaving.value).toBe(false)
        expect(showNotice).toHaveBeenCalledWith('success', expect.any(String))
    })

    it('updates manual foreign-currency templates and derives missing exchange rates', async () => {
        const {recurring, showNotice} = createHarness([makeAccount({id: 1, currency: 'CAD'})])
        recurring.openEditRecurring(makeTemplate({id: 42, accountId: 1, sourceCurrency: 'USD'}))
        recurring.recurringForm.sourceAmount = '100'
        recurring.recurringForm.sourceCurrency = 'USD'
        recurring.recurringForm.accountAmount = '135'
        recurring.recurringForm.conversionMode = 'MANUAL'
        recurring.recurringForm.exchangeRate = ''
        recurring.recurringForm.exchangeProvider = ''

        await recurring.submitRecurring()

        expect((window as any).db.recurringTemplate.update).toHaveBeenCalledWith(42, expect.objectContaining({
            sourceAmount: 100,
            sourceCurrency: 'USD',
            accountAmount: 135,
            conversionMode: 'MANUAL',
            exchangeRate: 1.35,
            exchangeProvider: 'MANUAL',
            accountId: 1,
        }))
        expect(showNotice).toHaveBeenCalledWith('success', expect.any(String))
    })

    it('creates automatic foreign-currency templates and keeps future conversion unresolved', async () => {
        const {recurring} = createHarness([makeAccount({id: 1, currency: 'CAD'})])
        recurring.openCreateRecurring()
        recurring.recurringForm.label = 'Foreign subscription'
        recurring.recurringForm.sourceAmount = '20'
        recurring.recurringForm.sourceCurrency = 'EUR'
        recurring.recurringForm.conversionMode = 'AUTOMATIC'
        recurring.recurringForm.exchangeProvider = 'Custom provider'

        await recurring.submitRecurring()

        expect((window as any).db.recurringTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
            label: 'Foreign subscription',
            sourceAmount: 20,
            sourceCurrency: 'EUR',
            accountAmount: null,
            conversionMode: 'AUTOMATIC',
            exchangeRate: null,
            exchangeProvider: 'Custom provider',
        }))
    })

    it('reports manual conversion and persistence errors while restoring saving state', async () => {
        const {recurring, showNotice} = createHarness([makeAccount({id: 1, currency: 'CAD'})])
        recurring.openCreateRecurring()
        recurring.recurringForm.label = 'Bad FX'
        recurring.recurringForm.sourceAmount = '100'
        recurring.recurringForm.sourceCurrency = 'USD'
        recurring.recurringForm.conversionMode = 'MANUAL'
        recurring.recurringForm.accountAmount = '0'

        await recurring.submitRecurring()

        expect(showNotice).toHaveBeenCalledWith('error', expect.any(String))
        expect((window as any).db.recurringTemplate.create).not.toHaveBeenCalled()
        expect(recurring.recurringSaving.value).toBe(false)

        recurring.recurringForm.accountAmount = '135'
        ;(window as any).db.recurringTemplate.create.mockRejectedValueOnce(new Error('save failed'))
        await recurring.submitRecurring()

        expect(showNotice).toHaveBeenCalledWith('error', 'save failed')
        expect(recurring.recurringSaving.value).toBe(false)
    })

    it('deletes recurring templates and reports deletion failures', async () => {
        const {recurring, showNotice} = createHarness()

        await recurring.deleteRecurring(123)

        expect((window as any).db.recurringTemplate.delete).toHaveBeenCalledWith(123)
        expect((window as any).db.recurringTemplate.list).toHaveBeenCalled()
        expect(showNotice).toHaveBeenCalledWith('success', expect.any(String))

        ;(window as any).db.recurringTemplate.delete.mockRejectedValueOnce(new Error('delete failed'))
        await recurring.deleteRecurring(456)

        expect(showNotice).toHaveBeenCalledWith('error', 'delete failed')
    })

    it('generates due recurring transactions with and without generated rows', async () => {
        const {recurring, showNotice, refreshTransactions} = createHarness()
        ;(window as any).db.recurringTemplate.generateDue.mockResolvedValueOnce({
            generatedTransactions: 3,
            generatedTemplates: 2,
        })

        await recurring.generateDueRecurring(77)

        expect((window as any).db.recurringTemplate.generateDue).toHaveBeenCalledWith({
            asOfDate: '2026-04-26',
            templateId: 77,
        })
        expect((window as any).db.recurringTemplate.list).toHaveBeenCalled()
        expect(refreshTransactions).toHaveBeenCalledTimes(1)
        expect(showNotice).toHaveBeenCalledWith('success', expect.any(String))
        expect(recurring.recurringGenerating.value).toBe(false)

        ;(window as any).db.recurringTemplate.generateDue.mockResolvedValueOnce({
            generatedTransactions: 0,
            generatedTemplates: 0,
        })
        await recurring.generateDueRecurring()

        expect((window as any).db.recurringTemplate.generateDue).toHaveBeenLastCalledWith({
            asOfDate: '2026-04-26',
        })
        expect(showNotice).toHaveBeenCalledWith('success', expect.any(String))
    })

    it('reports generation failures and restores generating state', async () => {
        const {recurring, showNotice} = createHarness()
        ;(window as any).db.recurringTemplate.generateDue.mockRejectedValueOnce(new Error('generate failed'))

        await recurring.generateDueRecurring()

        expect(showNotice).toHaveBeenCalledWith('error', 'generate failed')
        expect(recurring.recurringGenerating.value).toBe(false)
    })

    it('computes rows, sorting, due counts, summaries and forecast previews', () => {
        const {recurring} = createHarness()
        recurring.recurringTemplates.value = [
            makeTemplate({
                id: 1,
                label: 'Daily due',
                frequency: 'DAILY',
                intervalCount: 1,
                nextOccurrenceDate: '2026-04-24',
                endDate: '2026-04-25',
                account: null,
                category: null,
            }),
            makeTemplate({
                id: 2,
                label: 'Weekly due',
                frequency: 'WEEKLY',
                intervalCount: 1,
                nextOccurrenceDate: '2026-04-19',
            }),
            makeTemplate({
                id: 3,
                label: 'Monthly due',
                frequency: 'MONTHLY',
                intervalCount: 1,
                nextOccurrenceDate: '2026-03-26',
            }),
            makeTemplate({
                id: 4,
                label: 'Yearly due',
                frequency: 'YEARLY',
                intervalCount: 1,
                nextOccurrenceDate: '2025-04-26',
            }),
            makeTemplate({
                id: 5,
                label: 'Inactive due date',
                isActive: false,
                nextOccurrenceDate: '2026-01-01',
            }),
        ]

        expect(recurring.recurringRows.value).toHaveLength(5)
        expect(recurring.recurringRows.value[0].label).toBe('Daily due')
        expect(recurring.recurringRows.value[0].dueCount).toBe(2)
        expect(recurring.recurringRows.value[0].overdue).toBe(true)
        expect(recurring.recurringRows.value[0].accountCurrency).toBe('CAD')
        expect(recurring.recurringRows.value[0].accountName).toBe('Unknown account')
        expect(recurring.recurringRows.value[0].categoryName).toBe('No category')
        expect(recurring.recurringRows.value.at(-1)?.label).toBe('Inactive due date')
        expect(recurring.recurringSummary.value).toMatchObject({
            total: 5,
            active: 4,
            dueTemplates: 4,
            overdueTemplates: 3,
        })
        expect(recurring.recurringSummary.value.dueOccurrences).toBeGreaterThanOrEqual(5)
        expect(recurring.recurringForecast.value.length).toBeGreaterThan(0)
        expect(recurring.recurringInsights.value.activeCount).toBe(4)
        expect(recurring.recurringUpcomingPreview.value.length).toBeLessThanOrEqual(8)
    })
})
