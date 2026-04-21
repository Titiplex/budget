import {describe, expect, it} from 'vitest'
import {
    buildPreviousPeriod,
    buildReportComparison,
    summarizeTransactions,
    withinRange
} from '../../utils/reportComparison'

describe('report comparison utils', () => {
    it('builds the previous equivalent period', () => {
        const period = buildPreviousPeriod('2026-04-10', '2026-04-20')
        expect(period.previousStartDate).toBe('2026-03-30')
        expect(period.previousEndDate).toBe('2026-04-09')
        expect(period.daySpan).toBe(11)
    })

    it('summarizes transactions without counting transfers as income or expense', () => {
        const summary = summarizeTransactions([
            {
                id: 1,
                label: 'Salary',
                amount: 1000,
                sourceAmount: 1000,
                sourceCurrency: 'CAD',
                conversionMode: 'NONE',
                exchangeRate: 1,
                exchangeProvider: 'ACCOUNT',
                exchangeDate: '2026-04-01T00:00:00.000Z',
                kind: 'INCOME',
                date: '2026-04-01T00:00:00.000Z',
                note: null,
                accountId: 1,
                categoryId: null,
                account: {id: 1, name: 'Main', type: 'BANK', currency: 'CAD', description: null},
                category: null,
            },
            {
                id: 2,
                label: 'Rent',
                amount: 500,
                sourceAmount: 500,
                sourceCurrency: 'CAD',
                conversionMode: 'NONE',
                exchangeRate: 1,
                exchangeProvider: 'ACCOUNT',
                exchangeDate: '2026-04-02T00:00:00.000Z',
                kind: 'EXPENSE',
                date: '2026-04-02T00:00:00.000Z',
                note: null,
                accountId: 1,
                categoryId: 1,
                account: {id: 1, name: 'Main', type: 'BANK', currency: 'CAD', description: null},
                category: {id: 1, name: 'Housing', kind: 'EXPENSE', color: null, description: null},
            },
            {
                id: 3,
                label: 'Move to savings',
                amount: 300,
                sourceAmount: 300,
                sourceCurrency: 'CAD',
                conversionMode: 'NONE',
                exchangeRate: 1,
                exchangeProvider: 'ACCOUNT',
                exchangeDate: '2026-04-03T00:00:00.000Z',
                kind: 'TRANSFER',
                date: '2026-04-03T00:00:00.000Z',
                note: null,
                accountId: 1,
                categoryId: null,
                transferGroup: 'grp-1',
                transferDirection: 'OUT',
                transferPeerAccountId: 2,
                account: {id: 1, name: 'Main', type: 'BANK', currency: 'CAD', description: null},
                category: null,
                transferPeerAccount: {id: 2, name: 'Savings', type: 'SAVINGS', currency: 'CAD', description: null},
            },
            {
                id: 4,
                label: 'Move to savings',
                amount: 300,
                sourceAmount: 300,
                sourceCurrency: 'CAD',
                conversionMode: 'NONE',
                exchangeRate: 1,
                exchangeProvider: 'ACCOUNT',
                exchangeDate: '2026-04-03T00:00:00.000Z',
                kind: 'TRANSFER',
                date: '2026-04-03T00:00:00.000Z',
                note: null,
                accountId: 2,
                categoryId: null,
                transferGroup: 'grp-1',
                transferDirection: 'IN',
                transferPeerAccountId: 1,
                account: {id: 2, name: 'Savings', type: 'SAVINGS', currency: 'CAD', description: null},
                category: null,
                transferPeerAccount: {id: 1, name: 'Main', type: 'BANK', currency: 'CAD', description: null},
            },
        ], '2026-04-01', '2026-04-30')

        expect(summary.income).toBe(1000)
        expect(summary.expense).toBe(500)
        expect(summary.net).toBe(500)
        expect(summary.internalTransferCount).toBe(1)
    })

    it('compares two summaries', () => {
        const comparison = buildReportComparison(
            {
                startDate: '2026-04-01',
                endDate: '2026-04-30',
                transactionCount: 10,
                income: 1000,
                expense: 600,
                net: 400,
                savingsRate: 40,
                averageExpense: 200,
                averageIncome: 500,
                foreignTransactionCount: 2,
                internalTransferCount: 1,
            },
            {
                startDate: '2026-03-01',
                endDate: '2026-03-31',
                transactionCount: 8,
                income: 900,
                expense: 650,
                net: 250,
                savingsRate: 27.8,
                averageExpense: 216.67,
                averageIncome: 450,
                foreignTransactionCount: 1,
                internalTransferCount: 3,
            },
        )

        expect(comparison.previousStartDate).toBe('2026-03-01')
        expect(comparison.income.delta).toBe(100)
        expect(comparison.expense.delta).toBe(-50)
        expect(comparison.internalTransferCount.delta).toBe(-2)
        expect(withinRange('2026-04-15T10:00:00.000Z', '2026-04-01', '2026-04-30')).toBe(true)
    })
})
