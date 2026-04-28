import {createRequire} from 'node:module'
import {describe, expect, it} from 'vitest'

const require = createRequire(import.meta.url)

const {buildOverview} = require('../../electron/ipc/wealthOverviewHandlers')

describe('wealthOverviewHandlers buildOverview', () => {
    it('computes CAD net worth using inclusion flags and ownership percentage', () => {
        const overview = buildOverview({
            currency: 'CAD',
            assets: [
                {
                    id: 1,
                    name: 'Maison',
                    type: 'REAL_ESTATE',
                    status: 'ACTIVE',
                    currency: 'CAD',
                    currentValue: 500000,
                    includeInNetWorth: true,
                    ownershipPercent: 50,
                },
                {
                    id: 2,
                    name: 'Wallet perdu',
                    type: 'CRYPTO',
                    status: 'ACTIVE',
                    currency: 'CAD',
                    currentValue: 99999,
                    includeInNetWorth: false,
                    ownershipPercent: 100,
                },
                {
                    id: 3,
                    name: 'Ancien véhicule',
                    type: 'VEHICLE',
                    status: 'ARCHIVED',
                    currency: 'CAD',
                    currentValue: 99999,
                    includeInNetWorth: true,
                    ownershipPercent: 100,
                },
            ],
            portfolios: [
                {
                    id: 1,
                    name: 'CELI',
                    type: 'RETIREMENT',
                    status: 'ACTIVE',
                    currency: 'CAD',
                    currentValue: 40000,
                    includeInNetWorth: true,
                    ownershipPercent: 100,
                },
            ],
            liabilities: [
                {
                    id: 1,
                    name: 'Hypothèque',
                    type: 'MORTGAGE',
                    status: 'ACTIVE',
                    currency: 'CAD',
                    currentBalance: 120000,
                    includeInNetWorth: true,
                },
            ],
        })

        expect(overview.canConsolidate).toBe(true)
        expect(overview.currency).toBe('CAD')
        expect(overview.totals.totalStandaloneAssets).toBe(250000)
        expect(overview.totals.totalPortfolios).toBe(40000)
        expect(overview.totals.totalAssets).toBe(290000)
        expect(overview.totals.totalLiabilities).toBe(120000)
        expect(overview.totals.netWorth).toBe(170000)
        expect(overview.totals.assetCount).toBe(1)
        expect(overview.breakdown).toHaveLength(3)
    })

    it('does not fake a consolidated total when several currencies exist and no target currency is provided', () => {
        const overview = buildOverview({
            assets: [
                {
                    id: 1,
                    name: 'Cash CAD',
                    type: 'CASH',
                    status: 'ACTIVE',
                    currency: 'CAD',
                    currentValue: 100,
                    includeInNetWorth: true,
                    ownershipPercent: 100,
                },
                {
                    id: 2,
                    name: 'Cash EUR',
                    type: 'CASH',
                    status: 'ACTIVE',
                    currency: 'EUR',
                    currentValue: 200,
                    includeInNetWorth: true,
                    ownershipPercent: 100,
                },
            ],
            portfolios: [],
            liabilities: [],
        })

        expect(overview.canConsolidate).toBe(false)
        expect(overview.currency).toBe(null)
        expect(overview.totals.totalAssets).toBe(null)
        expect(overview.totals.netWorth).toBe(null)
        expect(overview.totalsByCurrency.CAD.totalAssets).toBe(100)
        expect(overview.totalsByCurrency.EUR.totalAssets).toBe(200)
    })

    it('filters totals to the requested currency', () => {
        const overview = buildOverview({
            currency: 'CAD',
            assets: [
                {
                    id: 1,
                    name: 'Cash CAD',
                    type: 'CASH',
                    status: 'ACTIVE',
                    currency: 'CAD',
                    currentValue: 100,
                    includeInNetWorth: true,
                    ownershipPercent: 100,
                },
                {
                    id: 2,
                    name: 'Cash EUR',
                    type: 'CASH',
                    status: 'ACTIVE',
                    currency: 'EUR',
                    currentValue: 200,
                    includeInNetWorth: true,
                    ownershipPercent: 100,
                },
            ],
            portfolios: [],
            liabilities: [],
        })

        expect(overview.canConsolidate).toBe(true)
        expect(overview.currency).toBe('CAD')
        expect(overview.totals.totalAssets).toBe(100)
        expect(overview.breakdown.map((row: { currency: string }) => row.currency)).toEqual(['CAD'])
    })
})