import {createRequire} from 'node:module'
import {describe, expect, it} from 'vitest'

const require = createRequire(import.meta.url)
const {
    estimateMonthlySurplus,
    monthlyizeBudgetAmount,
    monthlyizeRecurringAmount,
    summarizeBudgetTargets,
    summarizeHistoricalTransactions,
    summarizeRecurringTemplates,
} = require('../../../electron/goals/monthlySurplusEstimator.js')

function createFakeDelegate(rows) {
    return {
        findMany: async ({where = {}} = {}) => rows.filter((row) => {
            if (where.isActive != null && row.isActive !== where.isActive) return false
            if (where.currency && row.currency !== where.currency) return false
            if (where.sourceCurrency && row.sourceCurrency !== where.sourceCurrency) return false
            if (where.kind?.in && !where.kind.in.includes(row.kind)) return false
            if (where.date?.gte && new Date(row.date) < where.date.gte) return false
            if (where.date?.lt && new Date(row.date) >= where.date.lt) return false
            return true
        }),
    }
}

function createFakePrisma({budgetTargets = [], recurringTemplates = [], transactions = []} = {}) {
    return {
        budgetTarget: createFakeDelegate(budgetTargets),
        recurringTransactionTemplate: createFakeDelegate(recurringTemplates),
        transaction: createFakeDelegate(transactions),
    }
}

describe('monthly surplus estimator', () => {
    it('monthlyizes budget and recurring amounts', () => {
        expect(monthlyizeBudgetAmount({amount: 1200, period: 'YEARLY'})).toBe(100)
        expect(monthlyizeBudgetAmount({amount: 300, period: 'MONTHLY'})).toBe(300)
        expect(monthlyizeRecurringAmount({sourceAmount: 1200, frequency: 'YEARLY', intervalCount: 1})).toBe(100)
        expect(Math.round(monthlyizeRecurringAmount({sourceAmount: 100, frequency: 'WEEKLY', intervalCount: 1}))).toBe(435)
    })

    it('estimates surplus from budget expenses and historical income while ignoring transfers', async () => {
        const prisma = createFakePrisma({
            budgetTargets: [
                {id: 1, name: 'Rent', amount: 1200, period: 'MONTHLY', currency: 'CAD', isActive: true, category: {kind: 'EXPENSE'}},
                {id: 2, name: 'Groceries', amount: 6000, period: 'YEARLY', currency: 'CAD', isActive: true, category: {kind: 'EXPENSE'}},
            ],
            transactions: [
                {id: 1, kind: 'INCOME', amount: 3000, date: '2026-03-10', sourceCurrency: null},
                {id: 2, kind: 'INCOME', amount: 3000, date: '2026-04-10', sourceCurrency: null},
                {id: 3, kind: 'INCOME', amount: 3000, date: '2026-05-10', sourceCurrency: null},
                {id: 4, kind: 'TRANSFER', amount: 9999, date: '2026-05-11', sourceCurrency: null},
                {id: 5, kind: 'EXPENSE', amount: 150, date: '2026-05-12', sourceCurrency: null},
            ],
        })

        const result = await estimateMonthlySurplus(prisma, {
            currency: 'cad',
            lookbackMonths: 3,
            referenceDate: '2026-05-01',
        })

        expect(result.source).toBe('automaticFromBudget')
        expect(result.estimatedMonthlyIncome).toBe(3000)
        expect(result.estimatedMonthlyExpense).toBe(1700)
        expect(result.netMonthlyEstimate).toBe(1300)
        expect(result.monthlyContributionUsed).toBe(1300)
        expect(result.breakdown.historical.incomeTransactionCount).toBe(3)
        expect(result.breakdown.budget.expenseTargetCount).toBe(2)
    })

    it('falls back to recurring templates when budget and historical data are unavailable', async () => {
        const prisma = createFakePrisma({
            recurringTemplates: [
                {id: 1, label: 'Salary', kind: 'INCOME', sourceAmount: 4000, sourceCurrency: 'CAD', frequency: 'MONTHLY', intervalCount: 1, isActive: true},
                {id: 2, label: 'Insurance', kind: 'EXPENSE', sourceAmount: 1200, sourceCurrency: 'CAD', frequency: 'YEARLY', intervalCount: 1, isActive: true},
                {id: 3, label: 'Internal move', kind: 'TRANSFER', sourceAmount: 5000, sourceCurrency: 'CAD', frequency: 'MONTHLY', intervalCount: 1, isActive: true},
            ],
        })

        const result = await estimateMonthlySurplus(prisma, {
            currency: 'CAD',
            referenceDate: '2026-05-01',
        })

        expect(result.source).toBe('automaticFromRecurring')
        expect(result.estimatedMonthlyIncome).toBe(4000)
        expect(result.estimatedMonthlyExpense).toBe(100)
        expect(result.monthlyContributionUsed).toBe(3900)
        expect(result.breakdown.recurring.ignoredTransferCount).toBe(1)
    })

    it('uses manual override even when automatic data exists', async () => {
        const prisma = createFakePrisma({
            recurringTemplates: [
                {id: 1, label: 'Salary', kind: 'INCOME', sourceAmount: 4000, sourceCurrency: 'CAD', frequency: 'MONTHLY', intervalCount: 1, isActive: true},
            ],
        })

        const result = await estimateMonthlySurplus(prisma, {
            currency: 'CAD',
            manualMonthlyContribution: 250,
            referenceDate: '2026-05-01',
        })

        expect(result.source).toBe('manualOverride')
        expect(result.manualMonthlyContribution).toBe(250)
        expect(result.estimatedMonthlySurplus).toBe(4000)
        expect(result.monthlyContributionUsed).toBe(250)
    })

    it('returns unavailable when there is no automatic signal and no manual override', async () => {
        const result = await estimateMonthlySurplus(createFakePrisma(), {
            currency: 'CAD',
            referenceDate: '2026-05-01',
        })

        expect(result.source).toBe('unavailable')
        expect(result.monthlyContributionUsed).toBe(0)
        expect(result.warnings).toHaveLength(1)
    })

    it('summarizes rows without treating transfers as income', () => {
        expect(summarizeBudgetTargets([
            {amount: 1000, period: 'MONTHLY', category: {kind: 'EXPENSE'}},
            {amount: 5000, period: 'MONTHLY', category: {kind: 'TRANSFER'}},
        ])).toMatchObject({
            estimatedMonthlyIncome: 0,
            estimatedMonthlyExpense: 1000,
            ignoredTransferCount: 1,
        })

        expect(summarizeRecurringTemplates([
            {sourceAmount: 2000, frequency: 'MONTHLY', kind: 'TRANSFER'},
            {sourceAmount: 300, frequency: 'MONTHLY', kind: 'EXPENSE'},
        ])).toMatchObject({
            estimatedMonthlyIncome: 0,
            estimatedMonthlyExpense: 300,
            ignoredTransferCount: 1,
        })

        expect(summarizeHistoricalTransactions([
            {amount: 3000, kind: 'INCOME'},
            {amount: 3000, kind: 'TRANSFER'},
            {amount: 900, kind: 'EXPENSE'},
        ], 3)).toMatchObject({
            estimatedMonthlyIncome: 1000,
            estimatedMonthlyExpense: 300,
            ignoredTransferCount: 1,
        })
    })

    it('rejects invalid manual override values cleanly', async () => {
        await expect(estimateMonthlySurplus(createFakePrisma(), {
            currency: 'CAD',
            manualMonthlyContribution: -1,
            referenceDate: '2026-05-01',
        })).rejects.toMatchObject({code: 'invalidManualContribution'})

        await expect(estimateMonthlySurplus(createFakePrisma(), {
            currency: 'CAD$',
            referenceDate: '2026-05-01',
        })).rejects.toMatchObject({code: 'invalidCurrency'})

        await expect(estimateMonthlySurplus(createFakePrisma(), {
            currency: 'CAD',
            lookbackMonths: 0,
            referenceDate: '2026-05-01',
        })).rejects.toMatchObject({code: 'invalidLookback'})
    })
})
