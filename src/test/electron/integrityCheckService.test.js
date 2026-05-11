import {describe, expect, it, vi} from 'vitest'

function loadService() {
    return require('../../../electron/integrity/integrityCheckService')
}

function delegate(rows) {
    return {findMany: vi.fn(async () => rows)}
}

function prisma(rowsByModel = {}) {
    return Object.fromEntries(Object.entries(rowsByModel).map(([model, rows]) => [model, delegate(rows)]))
}

const accounts = [
    {id: 1, name: 'Checking', currency: 'CAD', openedAt: '2026-01-01', closedAt: null},
    {id: 2, name: 'Savings', currency: 'CAD', openedAt: '2026-01-01', closedAt: null},
]
const categories = [
    {id: 10, name: 'Salary', kind: 'INCOME'},
    {id: 11, name: 'Groceries', kind: 'EXPENSE'},
]
const transactions = [
    {id: 100, label: 'Salary', amount: 1000, sourceAmount: 1000, sourceCurrency: 'CAD', exchangeRate: 1, exchangeDate: '2026-01-15', kind: 'INCOME', date: '2026-01-15', accountId: 1, categoryId: 10, transferGroup: null, transferDirection: null, transferPeerAccountId: null},
    {id: 101, label: 'Transfer out', amount: 50, sourceAmount: 50, sourceCurrency: 'CAD', exchangeRate: 1, exchangeDate: '2026-01-16', kind: 'TRANSFER', date: '2026-01-16', accountId: 1, categoryId: null, transferGroup: 'tr-1', transferDirection: 'OUT', transferPeerAccountId: 2},
    {id: 102, label: 'Transfer in', amount: 50, sourceAmount: 50, sourceCurrency: 'CAD', exchangeRate: 1, exchangeDate: '2026-01-16', kind: 'TRANSFER', date: '2026-01-16', accountId: 2, categoryId: null, transferGroup: 'tr-1', transferDirection: 'IN', transferPeerAccountId: 1},
]
const budgets = [{id: 200, name: 'Food', amount: 500, currency: 'CAD', startDate: '2026-01-01', endDate: '2026-12-31', categoryId: 11}]
const recurring = [{id: 300, label: 'Rent', sourceAmount: 1200, sourceCurrency: 'CAD', accountAmount: null, exchangeRate: null, kind: 'EXPENSE', intervalCount: 1, startDate: '2026-01-01', nextOccurrenceDate: '2026-02-01', endDate: null, accountId: 1, categoryId: 11}]

function validPrisma(extra = {}) {
    return prisma({
        account: accounts,
        category: categories,
        transaction: transactions,
        budgetTarget: budgets,
        recurringTransactionTemplate: recurring,
        ...extra,
    })
}

describe('IntegrityCheckService', () => {
    it('returns an ok report for coherent core finance data', async () => {
        const {createIntegrityCheckService} = loadService()
        const service = createIntegrityCheckService({
            prisma: validPrisma(),
            auditLog: {recordAuditEvent: vi.fn()},
            clock: () => new Date('2026-05-11T12:00:00.000Z'),
        })

        const report = await service.run({source: 'manual'})

        expect(report.ok).toBe(true)
        expect(report.generatedAt).toBe('2026-05-11T12:00:00.000Z')
        expect(report.totals).toEqual({info: 0, warning: 0, error: 0, critical: 0})
        expect(report.issues).toEqual([])
    })

    it('detects broken references, invalid amounts and corrupted transfer groups', async () => {
        const {createIntegrityCheckService} = loadService()
        const auditLog = {recordAuditEvent: vi.fn(async () => null)}
        const service = createIntegrityCheckService({
            prisma: prisma({
                account: [{id: 1, name: 'Broken', currency: 'CA', openedAt: '2026-01-01', closedAt: '2025-01-01'}],
                category: [{id: 10, name: 'Groceries', kind: 'EXPENSE'}],
                transaction: [
                    {id: 1, label: 'Invalid tx', amount: -10, sourceAmount: 10, sourceCurrency: 'CAD', exchangeRate: 1, exchangeDate: 'bad-date', kind: 'INCOME', date: 'bad-date', accountId: 99, categoryId: 10, transferGroup: null, transferDirection: null, transferPeerAccountId: null},
                    {id: 2, label: 'Half transfer', amount: 25, sourceAmount: 25, sourceCurrency: 'CAD', exchangeRate: 1, exchangeDate: '2026-01-01', kind: 'TRANSFER', date: '2026-01-01', accountId: 1, categoryId: null, transferGroup: 'broken-transfer', transferDirection: 'OUT', transferPeerAccountId: 99},
                ],
                budgetTarget: [{id: 1, name: 'Bad budget', amount: 100, currency: 'CAD', startDate: '2026-02-01', endDate: '2026-01-01', categoryId: 99}],
                recurringTransactionTemplate: [{id: 1, label: 'Bad recurring', sourceAmount: 0, sourceCurrency: 'cad$', accountAmount: null, exchangeRate: null, kind: 'EXPENSE', intervalCount: 0, startDate: '2026-02-01', nextOccurrenceDate: '2026-01-01', endDate: null, accountId: 99, categoryId: 99}],
            }),
            auditLog,
        })

        const report = await service.run({source: 'manual', reason: 'test'})

        expect(report.ok).toBe(false)
        expect(report.totals.warning).toBeGreaterThan(0)
        expect(report.totals.error).toBeGreaterThan(0)
        expect(report.totals.critical).toBeGreaterThan(0)
        expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
            'MISSING_REFERENCE',
            'INVALID_AMOUNT',
            'TRANSFER_GROUP_SIZE_INVALID',
            'BUDGET_DATE_RANGE_INVALID',
            'RECURRING_INTERVAL_INVALID',
        ]))
        expect(auditLog.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'integrityCheckFailed',
            domain: 'integrity',
            severity: 'CRITICAL',
            status: 'FAILED',
            source: 'manual',
            metadata: expect.objectContaining({totals: report.totals}),
        }))
    })

    it('checks optional wealth, projections and import audit references when models exist', async () => {
        const {createIntegrityCheckService} = loadService()
        const service = createIntegrityCheckService({
            prisma: validPrisma({
                asset: [{id: 1, name: 'House', currency: 'CAD', currentValue: 100000, acquisitionValue: null, ownershipPercent: 100, marketInstrumentId: null}],
                portfolio: [{id: 1, name: 'Brokerage', currency: 'CAD', currentValue: 1000, cashBalance: 100, accountId: 999}],
                liability: [{id: 1, name: 'Loan', currency: 'CAD', currentBalance: 5000, initialAmount: 6000, minimumPayment: 100, securedAssetId: 404, accountId: null}],
                marketInstrument: [], holdingLot: [], priceSnapshot: [], investmentInstrument: [], investmentPosition: [], investmentMovement: [], netWorthSnapshot: [],
                financialGoal: [{id: 1, name: 'Goal', targetAmount: 10000, currency: 'CAD', startingAmount: 0, trackedAssetId: 404, trackedPortfolioId: null, trackedLiabilityId: null, baselineNetWorthSnapshotId: null}],
                projectionScenario: [{id: 1, name: 'Base'}],
                projectionSetting: [{id: 1, goalId: 1, scenarioId: 1, projectionHorizonMonths: 12, displayCurrency: 'CAD'}],
                projectionResult: [{id: 1, goalId: 999, scenarioId: 1, settingId: 1, projectionMonth: '2026-01-01', projectedValue: 1, remainingAmount: 1, progressPercent: 1}],
                importSource: [{id: 1, sourceKey: 'bank', defaultCurrency: 'CAD', defaultAccountId: 999}],
                importBatch: [{id: 1, sourceId: 999, defaultCurrency: 'CAD', rowCount: 1, errorCount: 0}],
                importRawRow: [{id: 1, batchId: 1}],
                importNormalizedRow: [{id: 1, batchId: 1, rawRowId: 1, currency: 'CAD', transactionDate: '2026-01-01', amount: 10}],
                importError: [],
                importReconciliationDecision: [{id: 1, batchId: 1, normalizedRowId: 1, candidateTransactionId: 999, candidateAssetId: null}],
                importAppliedLink: [{id: 1, batchId: 1, normalizedRowId: 1, decisionId: 1, transactionId: 999, assetId: null}],
            }),
            auditLog: {recordAuditEvent: vi.fn()},
        })

        const report = await service.run({auditCritical: false})

        expect(report.ok).toBe(false)
        expect(report.issues.map((issue) => issue.code)).toContain('MISSING_REFERENCE')
        expect(report.issues.some((issue) => issue.entityType === 'portfolio')).toBe(true)
        expect(report.issues.some((issue) => issue.entityType === 'financialGoal')).toBe(true)
        expect(report.issues.some((issue) => issue.entityType === 'projectionResult')).toBe(true)
        expect(report.issues.some((issue) => issue.entityType === 'importAppliedLink')).toBe(true)
    })

    it('does not audit warning-only reports', async () => {
        const {createIntegrityCheckService} = loadService()
        const auditLog = {recordAuditEvent: vi.fn()}
        const service = createIntegrityCheckService({
            prisma: validPrisma({
                transaction: [{id: 100, label: 'Uncategorized', amount: 1000, sourceAmount: 1000, sourceCurrency: 'CAD', exchangeRate: 1, exchangeDate: '2026-01-15', kind: 'INCOME', date: '2026-01-15', accountId: 1, categoryId: null, transferGroup: null, transferDirection: null, transferPeerAccountId: null}],
            }),
            auditLog,
        })

        const report = await service.run({source: 'manual'})

        expect(report.ok).toBe(true)
        expect(report.totals.warning).toBe(1)
        expect(auditLog.recordAuditEvent).not.toHaveBeenCalled()
    })
})
