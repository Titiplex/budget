import {createRequire} from 'node:module'
import {describe, expect, it} from 'vitest'

const require = createRequire(import.meta.url)
const {
    createFinancialGoal,
    deleteFinancialGoal,
    getFinancialGoalById,
    listFinancialGoals,
    updateFinancialGoal,
} = require('../../../electron/goals/financialGoalService.js')

type Row = Record<string, any>

type FakeDb = {
    financialGoals: Row[]
    assets: Row[]
    portfolios: Row[]
    liabilities: Row[]
    netWorthSnapshots: Row[]
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value))
}

function matchesContains(row: Row, fieldName: string, expected: string) {
    return typeof row[fieldName] === 'string' && row[fieldName].includes(expected)
}

function matchesWhere(row: Row, where: Row = {}) {
    return Object.entries(where).every(([fieldName, expected]) => {
        if (fieldName === 'OR' && Array.isArray(expected)) {
            return expected.some((entry) => matchesWhere(row, entry))
        }

        if (expected && typeof expected === 'object' && 'contains' in expected) {
            return matchesContains(row, fieldName, String(expected.contains))
        }

        return row[fieldName] === expected
    })
}

function sortRows(rows: Row[], orderBy: Row[] = []) {
    return [...rows].sort((a, b) => {
        for (const order of orderBy) {
            const [fieldName, direction] = Object.entries(order)[0]
            const left = a[fieldName] ?? ''
            const right = b[fieldName] ?? ''

            if (left === right) continue

            const result = left > right ? 1 : -1
            return direction === 'desc' ? -result : result
        }

        return 0
    })
}

function createDelegate(rows: Row[], nextIdRef: {value: number}, withRelations: (row: Row, include?: Row) => Row) {
    return {
        findUnique: async ({where, include}: {where: {id: number}; include?: Row}) => {
            const row = rows.find((entry) => entry.id === where.id)
            return row ? withRelations(row, include) : null
        },
        findMany: async ({where = {}, orderBy = [], include}: {where?: Row; orderBy?: Row[]; include?: Row} = {}) => {
            return sortRows(rows.filter((row) => matchesWhere(row, where)), orderBy).map((row) =>
                withRelations(row, include),
            )
        },
        create: async ({data, include}: {data: Row; include?: Row}) => {
            const now = new Date('2026-05-01T12:00:00.000Z')
            const row = {id: nextIdRef.value, ...data, createdAt: now, updatedAt: now}
            nextIdRef.value += 1
            rows.push(row)
            return withRelations(row, include)
        },
        update: async ({where, data, include}: {where: {id: number}; data: Row; include?: Row}) => {
            const index = rows.findIndex((row) => row.id === where.id)
            if (index < 0) throw new Error('Not found')
            rows[index] = {...rows[index], ...data, updatedAt: new Date('2026-05-01T12:01:00.000Z')}
            return withRelations(rows[index], include)
        },
        delete: async ({where}: {where: {id: number}}) => {
            const index = rows.findIndex((row) => row.id === where.id)
            if (index < 0) throw new Error('Not found')
            const [deleted] = rows.splice(index, 1)
            return withRelations(deleted)
        },
    }
}

function createFakePrisma(seed: Partial<FakeDb> = {}) {
    const db: FakeDb = {
        financialGoals: seed.financialGoals || [],
        assets: seed.assets || [],
        portfolios: seed.portfolios || [],
        liabilities: seed.liabilities || [],
        netWorthSnapshots: seed.netWorthSnapshots || [],
    }
    const nextIdRef = {value: 1 + Math.max(0, ...Object.values(db).flat().map((row) => Number(row.id) || 0))}

    const prisma: any = {}
    prisma.asset = createDelegate(db.assets, nextIdRef, (row) => clone(row))
    prisma.portfolio = createDelegate(db.portfolios, nextIdRef, (row) => clone(row))
    prisma.liability = createDelegate(db.liabilities, nextIdRef, (row) => clone(row))
    prisma.netWorthSnapshot = createDelegate(db.netWorthSnapshots, nextIdRef, (row) => clone(row))
    prisma.financialGoal = createDelegate(db.financialGoals, nextIdRef, (row, include = {}) => ({
        ...clone(row),
        ...(include.trackedAsset ? {trackedAsset: db.assets.find((asset) => asset.id === row.trackedAssetId) || null} : {}),
        ...(include.trackedPortfolio
            ? {trackedPortfolio: db.portfolios.find((portfolio) => portfolio.id === row.trackedPortfolioId) || null}
            : {}),
        ...(include.trackedLiability
            ? {trackedLiability: db.liabilities.find((liability) => liability.id === row.trackedLiabilityId) || null}
            : {}),
        ...(include.baselineNetWorthSnapshot
            ? {
                  baselineNetWorthSnapshot:
                      db.netWorthSnapshots.find((snapshot) => snapshot.id === row.baselineNetWorthSnapshotId) || null,
              }
            : {}),
    }))

    return {db, prisma}
}

const fixedNow = new Date('2026-05-01T12:00:00.000Z')

describe('financial goal service', () => {
    it('creates a financial goal with validation, normalization and optional wealth links', async () => {
        const {db, prisma} = createFakePrisma({
            portfolios: [{id: 10, name: 'Brokerage'}],
            netWorthSnapshots: [{id: 20, snapshotDate: new Date('2026-04-30T00:00:00.000Z')}],
        })

        const result = await createFinancialGoal(
            prisma,
            {
                name: '  Emergency reserve  ',
                type: 'emergencyFund',
                targetAmount: '5000',
                currency: 'cad',
                targetDate: '2026-12-31',
                startingAmount: '250',
                priority: '1',
                notes: '  Local demo goal ',
                trackedPortfolioId: 10,
                baselineNetWorthSnapshotId: 20,
            },
            {now: fixedNow},
        )

        expect(result.name).toBe('Emergency reserve')
        expect(result.type).toBe('EMERGENCY_FUND')
        expect(result.currency).toBe('CAD')
        expect(result.targetAmount).toBe(5000)
        expect(result.startingAmount).toBe(250)
        expect(result.status).toBe('ACTIVE')
        expect(result.trackedPortfolio?.name).toBe('Brokerage')
        expect(result.baselineNetWorthSnapshot?.snapshotDate).toBe('2026-04-30T00:00:00.000Z')
        expect(db.financialGoals).toHaveLength(1)
    })

    it('rejects invalid creation payloads before writing', async () => {
        const {db, prisma} = createFakePrisma()

        await expect(createFinancialGoal(prisma, {
            name: '',
            type: 'SAVINGS',
            targetAmount: 100,
            currency: 'CAD',
        })).rejects.toMatchObject({code: 'invalidName'})

        await expect(createFinancialGoal(prisma, {
            name: 'Invalid amount',
            type: 'SAVINGS',
            targetAmount: 0,
            currency: 'CAD',
        })).rejects.toMatchObject({code: 'invalidTargetAmount'})

        await expect(createFinancialGoal(prisma, {
            name: 'Invalid currency',
            type: 'SAVINGS',
            targetAmount: 100,
            currency: 'dollar',
        })).rejects.toMatchObject({code: 'invalidCurrency'})

        await expect(createFinancialGoal(prisma, {
            name: 'Past date',
            type: 'SAVINGS',
            targetAmount: 100,
            currency: 'CAD',
            targetDate: '2026-04-01',
        }, {now: fixedNow})).rejects.toMatchObject({code: 'invalidTargetDate'})

        expect(db.financialGoals).toHaveLength(0)
    })

    it('lists, retrieves and updates goals without overwriting omitted fields', async () => {
        const {prisma} = createFakePrisma({
            financialGoals: [
                {
                    id: 1,
                    name: 'Down payment',
                    type: 'PURCHASE',
                    targetAmount: 30000,
                    currency: 'CAD',
                    targetDate: new Date('2027-01-01T00:00:00.000Z'),
                    startingAmount: 1000,
                    status: 'ACTIVE',
                    priority: 2,
                    notes: null,
                    createdAt: new Date('2026-05-01T00:00:00.000Z'),
                    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
                },
            ],
        })

        const listed = await listFinancialGoals(prisma, {type: 'purchase'})
        expect(listed.map((goal: Row) => goal.name)).toEqual(['Down payment'])

        const fetched = await getFinancialGoalById(prisma, 1)
        expect(fetched.targetDate).toBe('2027-01-01T00:00:00.000Z')

        const updated = await updateFinancialGoal(prisma, 1, {targetAmount: 35000, status: 'paused'}, {now: fixedNow})
        expect(updated.name).toBe('Down payment')
        expect(updated.targetAmount).toBe(35000)
        expect(updated.status).toBe('PAUSED')
    })

    it('deletes goals deliberately and reports missing goals cleanly', async () => {
        const {db, prisma} = createFakePrisma({
            financialGoals: [{id: 1, name: 'Goal', type: 'OTHER', targetAmount: 100, currency: 'CAD'}],
        })

        await expect(getFinancialGoalById(prisma, 999)).rejects.toMatchObject({code: 'goalNotFound'})

        const deleted = await deleteFinancialGoal(prisma, 1)
        expect(deleted).toEqual({ok: true, id: 1, entityType: 'financialGoal'})
        expect(db.financialGoals).toHaveLength(0)
    })
})
