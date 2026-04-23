import {beforeEach, describe, expect, it, vi} from 'vitest'
import {useBudgetData} from '../../composables/useBudgetData'

describe('useBudgetData multi-currency transfer', () => {
    const accountRows = [
        {id: 1, name: 'Euro account', type: 'BANK', currency: 'EUR', description: null},
        {id: 2, name: 'CAD savings', type: 'SAVINGS', currency: 'CAD', description: null},
    ]

    beforeEach(() => {
        ;(window as any).db = {
            account: {
                list: vi.fn().mockResolvedValue(accountRows),
                create: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
            },
            category: {
                list: vi.fn().mockResolvedValue([]),
                create: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
            },
            transaction: {
                list: vi.fn().mockResolvedValue([]),
                create: vi.fn().mockResolvedValue({id: 99}),
                update: vi.fn(),
                delete: vi.fn(),
            },
            budgetTarget: {
                list: vi.fn().mockResolvedValue([]),
                create: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
            },
            recurringTemplate: {
                list: vi.fn().mockResolvedValue([]),
                create: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
            },
        }

        ;(window as any).fx = {
            quoteHistorical: vi.fn().mockResolvedValue({
                convertedAmount: 150,
                rate: 1.5,
                provider: 'TEST_FX',
                date: '2026-04-10',
            }),
        }

        ;(window as any).file = {
            saveText: vi.fn(),
            openText: vi.fn(),
        }
    })

    it('creates an automatic converted transfer with the correct payload', async () => {
        const notices = vi.fn()
        const budget = useBudgetData((type, text) => notices(type, text))

        budget.accounts.value = accountRows as any
        budget.categories.value = []

        budget.transactionForm.label = 'Move to CAD'
        budget.transactionForm.kind = 'TRANSFER'
        budget.transactionForm.accountId = '1'
        budget.transactionForm.transferTargetAccountId = '2'
        budget.transactionForm.amount = '100'
        budget.transactionForm.date = '2026-04-10'
        budget.transactionForm.note = 'FX transfer'
        budget.transactionForm.conversionMode = 'AUTOMATIC'

        await budget.submitTransaction()

        expect(window.fx.quoteHistorical).toHaveBeenCalledWith({
            from: 'EUR',
            to: 'CAD',
            amount: 100,
            date: '2026-04-10',
        })

        expect(window.db.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
            label: 'Move to CAD',
            kind: 'TRANSFER',
            sourceAmount: 100,
            sourceCurrency: 'EUR',
            amount: 150,
            conversionMode: 'AUTOMATIC',
            exchangeRate: 1.5,
            exchangeProvider: 'TEST_FX',
            exchangeDate: '2026-04-10',
            accountId: 1,
            categoryId: null,
            transferTargetAccountId: 2,
            note: 'FX transfer',
            date: '2026-04-10',
        }))

        expect(notices).toHaveBeenCalledWith('success', expect.any(String))
    })
})