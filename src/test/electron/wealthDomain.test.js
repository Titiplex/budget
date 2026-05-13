import {createRequire} from 'node:module'
import {describe, expect, it, vi} from 'vitest'
import {makeAsset, makeLiability, makePortfolio, stableFixtureDate} from '../fixtures/demoData'

const require = createRequire(import.meta.url)
const {
    createAsset,
    createLiability,
    createPortfolio,
    deleteAsset,
    deleteLiability,
    updateAsset,
    updateLiability,
} = require('../../../electron/ipc/wealthHandlers')
const {
    buildOverview,
    createGeneratedNetWorthSnapshot,
    listNetWorthSnapshots,
} = require('../../../electron/ipc/wealthOverviewHandlers')

function stripFixtureKeys(fixture, overrides = {}) {
    const row = {...fixture, ...overrides}

    for (const key of Object.keys(row)) {
        if (key === 'key' || key.endsWith('Key')) {
            delete row[key]
        }
    }

    return row
}

function assetRow(id, overrides = {}) {
    return stripFixtureKeys(makeAsset(overrides), {id})
}

function portfolioRow(id, overrides = {}) {
    return stripFixtureKeys(makePortfolio(overrides), {id})
}

function liabilityRow(id, overrides = {}) {
    return stripFixtureKeys(makeLiability(overrides), {id})
}

function cloneRecord(record) {
    return Object.fromEntries(
        Object.entries(record).map(([key, value]) => [key, value instanceof Date ? new Date(value.getTime()) : value]),
    )
}

function createMemoryDelegate(initialRows = []) {
    const rows = initialRows.map((row) => cloneRecord(row))
    let nextId = rows.reduce((max, row) => Math.max(max, Number(row.id || 0)), 0) + 1

    return {
        rows,
        create: vi.fn(async ({data}) => {
            const created = {id: nextId++, ...cloneRecord(data)}
            rows.push(created)
            return cloneRecord(created)
        }),
        update: vi.fn(async ({where, data}) => {
            const row = rows.find((candidate) => candidate.id === where.id)
            if (!row) throw new Error(`Row ${where.id} not found`)
            Object.assign(row, cloneRecord(data))
            return cloneRecord(row)
        }),
        delete: vi.fn(async ({where}) => {
            const index = rows.findIndex((candidate) => candidate.id === where.id)
            if (index === -1) throw new Error(`Row ${where.id} not found`)
            const [deleted] = rows.splice(index, 1)
            return cloneRecord(deleted)
        }),
        findUnique: vi.fn(async ({where}) => {
            const row = rows.find((candidate) => candidate.id === where.id)
            return row ? cloneRecord(row) : null
        }),
        findFirst: vi.fn(async ({where} = {}) => {
            let candidates = rows
            if (where?.currency) {
                candidates = candidates.filter((row) => row.currency === where.currency)
            }
            return candidates.length ? cloneRecord(candidates[candidates.length - 1]) : null
        }),
        findMany: vi.fn(async ({where} = {}) => {
            let candidates = rows

            if (where?.currency) {
                candidates = candidates.filter((row) => row.currency === where.currency)
            }

            if (where?.snapshotDate?.gte) {
                candidates = candidates.filter((row) => row.snapshotDate >= where.snapshotDate.gte)
            }

            if (where?.snapshotDate?.lte) {
                candidates = candidates.filter((row) => row.snapshotDate <= where.snapshotDate.lte)
            }

            return candidates.map((row) => cloneRecord(row)).reverse()
        }),
    }
}

function createWealthPrismaMock({accounts = [], assets = [], portfolios = [], liabilities = [], snapshots = []} = {}) {
    return {
        account: createMemoryDelegate(accounts),
        asset: createMemoryDelegate(assets),
        portfolio: createMemoryDelegate(portfolios),
        liability: createMemoryDelegate(liabilities),
        netWorthSnapshot: createMemoryDelegate(snapshots),
    }
}

describe('wealth domain unit tests', () => {
    it('creates, updates and deletes assets with deterministic fixture data', async () => {
        const prisma = createWealthPrismaMock()

        const created = await createAsset(
            prisma,
            makeAsset({
                key: 'asset-zero-cash',
                name: 'Zero cash reserve',
                type: 'CASH',
                currentValue: 0,
                currency: undefined,
                valueAsOf: stableFixtureDate('2026-05-01T00:00:00.000Z'),
            }),
        )

        expect(created).toMatchObject({
            id: 1,
            name: 'Zero cash reserve',
            type: 'CASH',
            currentValue: 0,
            currency: 'CAD',
            includeInNetWorth: true,
        })

        const updated = await updateAsset(prisma, created.id, {
            name: 'Updated cash reserve',
            currentValue: 1250,
            ownershipPercent: 80,
        })

        expect(updated).toMatchObject({
            id: created.id,
            name: 'Updated cash reserve',
            currentValue: 1250,
            ownershipPercent: 80,
        })

        const deleted = await deleteAsset(prisma, created.id)

        expect(deleted).toEqual({ok: true, id: created.id, entityType: 'asset'})
        expect(prisma.asset.rows).toHaveLength(0)
    })

    it('rejects invalid negative asset amounts before persistence', async () => {
        const prisma = createWealthPrismaMock()

        await expect(createAsset(prisma, makeAsset({currentValue: -1}))).rejects.toThrow(/positif ou nul/)
        expect(prisma.asset.create).not.toHaveBeenCalled()
    })

    it('creates, updates and deletes liabilities with deterministic fixture data', async () => {
        const prisma = createWealthPrismaMock({
            accounts: [{id: 10, name: 'Credit card', type: 'CREDIT', currency: 'CAD'}],
            assets: [assetRow(20, {name: 'Secured vehicle'})],
        })

        const created = await createLiability(
            prisma,
            makeLiability({
                key: 'liability-zero-loan',
                name: 'Zero balance loan',
                type: 'PERSONAL_LOAN',
                currentBalance: 0,
                currency: undefined,
                accountKey: undefined,
                securedAssetKey: undefined,
                accountId: 10,
                securedAssetId: 20,
            }),
        )

        expect(created).toMatchObject({
            id: 1,
            name: 'Zero balance loan',
            type: 'PERSONAL_LOAN',
            currentBalance: 0,
            currency: 'CAD',
            accountId: 10,
            securedAssetId: 20,
        })

        const updated = await updateLiability(prisma, created.id, {
            currentBalance: 425,
            minimumPayment: 50,
            rateType: 'FIXED',
        })

        expect(updated).toMatchObject({
            id: created.id,
            currentBalance: 425,
            minimumPayment: 50,
            rateType: 'FIXED',
        })

        const deleted = await deleteLiability(prisma, created.id)

        expect(deleted).toEqual({ok: true, id: created.id, entityType: 'liability'})
        expect(prisma.liability.rows).toHaveLength(0)
    })

    it('rejects invalid negative liability amounts before persistence', async () => {
        const prisma = createWealthPrismaMock()

        await expect(createLiability(prisma, makeLiability({currentBalance: -0.01}))).rejects.toThrow(/positif ou nul/)
        expect(prisma.liability.create).not.toHaveBeenCalled()
    })

    it('validates portfolio account associations without touching the UI', async () => {
        const prisma = createWealthPrismaMock({
            accounts: [{id: 42, name: 'TFSA account', type: 'INVESTMENT', currency: 'CAD'}],
        })

        const linked = await createPortfolio(
            prisma,
            makePortfolio({
                key: 'portfolio-linked-tfsa',
                name: 'Linked TFSA',
                accountKey: undefined,
                accountId: 42,
            }),
        )

        expect(linked).toMatchObject({name: 'Linked TFSA', accountId: 42})

        await expect(
            createPortfolio(prisma, makePortfolio({accountKey: undefined, accountId: 999})),
        ).rejects.toThrow(/compte budget lié est introuvable/)
    })

    it('calculates gross assets and net worth from standalone assets, portfolios and liabilities', () => {
        const overview = buildOverview({
            assets: [
                assetRow(1, {name: 'Cash', type: 'CASH', currentValue: 1000}),
                assetRow(2, {name: 'Half owned car', type: 'VEHICLE', currentValue: 8000, ownershipPercent: 50}),
            ],
            portfolios: [portfolioRow(10, {name: 'TFSA', currentValue: 6000})],
            liabilities: [liabilityRow(20, {name: 'Card', currentBalance: 1200})],
            currency: 'CAD',
        })

        expect(overview.totals).toMatchObject({
            totalStandaloneAssets: 5000,
            totalPortfolios: 6000,
            totalAssets: 11000,
            totalLiabilities: 1200,
            netWorth: 9800,
            assetCount: 2,
            portfolioCount: 1,
            liabilityCount: 1,
        })
        expect(overview.breakdown).toEqual(expect.arrayContaining([
            expect.objectContaining({entityType: 'asset', label: 'Half owned car', amount: 4000}),
            expect.objectContaining({entityType: 'portfolio', label: 'TFSA', amount: 6000}),
            expect.objectContaining({entityType: 'liability', label: 'Card', amount: 1200}),
        ]))
    })

    it('supports assets without portfolios and negative net worth when liabilities exceed assets', () => {
        const overview = buildOverview({
            assets: [assetRow(1, {name: 'Small cash balance', type: 'CASH', currentValue: 100})],
            portfolios: [],
            liabilities: [liabilityRow(2, {name: 'Large card balance', currentBalance: 250})],
            currency: 'CAD',
        })

        expect(overview.totals).toMatchObject({
            totalStandaloneAssets: 100,
            totalPortfolios: 0,
            totalAssets: 100,
            totalLiabilities: 250,
            netWorth: -150,
            portfolioCount: 0,
        })
    })

    it('keeps multi-currency totals separated unless a target currency is selected', () => {
        const multiCurrencyOverview = buildOverview({
            assets: [assetRow(1, {name: 'CAD cash', currentValue: 1000, currency: 'CAD'})],
            portfolios: [portfolioRow(2, {name: 'USD brokerage', currentValue: 500, currency: 'USD'})],
            liabilities: [liabilityRow(3, {name: 'CAD card', currentBalance: 100, currency: 'CAD'})],
        })

        expect(multiCurrencyOverview.canConsolidate).toBe(false)
        expect(multiCurrencyOverview.currency).toBeNull()
        expect(multiCurrencyOverview.currencies).toEqual(['CAD', 'USD'])
        expect(multiCurrencyOverview.totals.netWorth).toBeNull()
        expect(multiCurrencyOverview.totalsByCurrency).toMatchObject({
            CAD: {totalAssets: 1000, totalLiabilities: 100, netWorth: 900},
            USD: {totalAssets: 500, totalLiabilities: 0, netWorth: 500},
        })

        const usdOnlyOverview = buildOverview({
            assets: multiCurrencyOverview.assets,
            portfolios: multiCurrencyOverview.portfolios,
            liabilities: multiCurrencyOverview.liabilities,
            currency: 'USD',
        })

        expect(usdOnlyOverview.canConsolidate).toBe(true)
        expect(usdOnlyOverview.currency).toBe('USD')
        expect(usdOnlyOverview.totals).toMatchObject({totalAssets: 500, totalLiabilities: 0, netWorth: 500})
    })

    it('creates deterministic generated net worth snapshots, including the empty snapshot case', async () => {
        const prisma = createWealthPrismaMock()
        const snapshotDate = stableFixtureDate('2026-05-02T00:00:00.000Z')

        const snapshot = await createGeneratedNetWorthSnapshot(prisma, {
            currency: 'CAD',
            snapshotDate,
            note: 'Empty deterministic snapshot.',
        })

        expect(snapshot).toMatchObject({
            snapshotDate,
            currency: 'CAD',
            totalStandaloneAssets: 0,
            totalPortfolios: 0,
            totalAssets: 0,
            totalLiabilities: 0,
            netWorth: 0,
            source: 'GENERATED',
            assetBreakdownJson: '[]',
            portfolioBreakdownJson: '[]',
            liabilityBreakdownJson: '[]',
            note: 'Empty deterministic snapshot.',
        })
    })

    it('lists snapshots by deterministic date range and currency', async () => {
        const prisma = createWealthPrismaMock({
            snapshots: [
                {
                    id: 1,
                    snapshotDate: stableFixtureDate('2026-04-01T00:00:00.000Z'),
                    currency: 'CAD',
                    netWorth: 1000,
                },
                {
                    id: 2,
                    snapshotDate: stableFixtureDate('2026-05-01T00:00:00.000Z'),
                    currency: 'CAD',
                    netWorth: 1500,
                },
                {
                    id: 3,
                    snapshotDate: stableFixtureDate('2026-05-01T00:00:00.000Z'),
                    currency: 'USD',
                    netWorth: 300,
                },
            ],
        })

        const snapshots = await listNetWorthSnapshots(prisma, {
            currency: 'CAD',
            startDate: '2026-05-01T00:00:00.000Z',
            endDate: '2026-05-31T23:59:59.999Z',
        })

        expect(snapshots).toEqual([expect.objectContaining({id: 2, currency: 'CAD', netWorth: 1500})])
    })
})
