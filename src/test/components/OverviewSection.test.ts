import {mount} from '@vue/test-utils'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import OverviewSection from '../../components/OverviewSection.vue'
import type {Transaction} from '../../types/budget'
import {i18n} from '../../i18n'
import {WritableComputedRef} from "vue";

function makeTransaction(overrides: Partial<Transaction>): Transaction {
    return {
        id: 1,
        label: 'Move to savings',
        amount: 100,
        sourceAmount: 100,
        sourceCurrency: 'CAD',
        conversionMode: 'NONE',
        exchangeRate: 1,
        exchangeProvider: 'ACCOUNT',
        exchangeDate: '2026-04-02T00:00:00.000Z',
        kind: 'TRANSFER',
        date: '2026-04-02T00:00:00.000Z',
        note: null,
        accountId: 1,
        categoryId: null,
        transferGroup: 'grp-1',
        transferDirection: 'OUT',
        transferPeerAccountId: 2,
        account: {id: 1, name: 'Main', type: 'BANK', currency: 'CAD', description: null},
        category: null,
        transferPeerAccount: {id: 2, name: 'Savings', type: 'SAVINGS', currency: 'CAD', description: null},
        ...overrides,
    }
}

describe('OverviewSection', () => {
    let previousLocale: WritableComputedRef<"fr" | "en", "fr" | "en">

    beforeEach(() => {
        previousLocale = i18n.global.locale
        i18n.global.locale.value = 'fr'
    })

    afterEach(() => {
        i18n.global.locale.value = previousLocale.value
    })

    it('renders transfer rows with a readable route and internal transfer label', () => {
        const wrapper = mount(OverviewSection, {
            props: {
                recentTransactions: [makeTransaction({})],
                monthlyTrend: [],
                expenseBreakdown: [],
                totalExpense: 0,
                summaryCurrency: 'CAD',
                recurringPreview: [],
                recurringProjection: null,
            },
            global: {
                plugins: [i18n],
            },
        })

        expect(wrapper.text()).toContain('Main → Savings')
        expect(wrapper.text()).toContain(i18n.global.t('transfer.internal'))
        expect(wrapper.text()).toContain(i18n.global.t('transfer.directionOut'))
    })
})