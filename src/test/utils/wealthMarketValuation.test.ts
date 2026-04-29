import {describe, expect, it} from 'vitest'

import {
    createPortfolioManualValuationRow,
    createWealthAssetValuationRow,
    summarizeWealthMarketValuations,
    type WealthAssetWithMarketInstrument,
} from '../../utils/wealthMarketValuation'
import type {WealthPortfolio} from '../../types/wealth'

function asset(overrides: Partial<WealthAssetWithMarketInstrument> = {}): WealthAssetWithMarketInstrument {
    return {
        id: 1,
        name: 'ETF Monde',
        type: 'OTHER',
        status: 'ACTIVE',
        currency: 'CAD',
        valuationMode: 'MANUAL',
        currentValue: 100,
        includeInNetWorth: true,
        ownershipPercent: 100,
        acquisitionValue: null,
        acquiredAt: null,
        valueAsOf: '2026-04-01T00:00:00.000Z',
        institutionName: null,
        institutionCountry: null,
        institutionRegion: null,
        note: null,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
        ...overrides,
    }
}

function portfolio(overrides: Partial<WealthPortfolio> = {}): WealthPortfolio {
    return {
        id: 2,
        name: 'CELI',
        type: 'TAXABLE_BROKERAGE',
        status: 'ACTIVE',
        currency: 'CAD',
        institutionName: null,
        institutionCountry: null,
        institutionRegion: null,
        taxWrapper: 'TFSA',
        valuationMode: 'MANUAL',
        currentValue: 2500,
        includeInNetWorth: true,
        ownershipPercent: 50,
        cashBalance: 0,
        valueAsOf: '2026-04-02T00:00:00.000Z',
        accountId: null,
        note: null,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
        ...overrides,
    }
}

describe('wealth market valuation display helpers', () => {
    it('uses the latest local market snapshot when an asset is linked to an instrument', () => {
        const row = createWealthAssetValuationRow({
            asset: asset({marketInstrumentId: 7}),
            instrument: {id: 7, symbol: 'XEQT', quoteCurrency: 'CAD', freshnessStatus: 'FRESH'},
            snapshot: {
                id: 11,
                marketInstrumentId: 7,
                unitPrice: 32.45,
                currency: 'CAD',
                pricedAt: '2026-04-27T16:00:00.000Z',
                provider: 'mock',
                freshnessStatus: 'FRESH',
            },
        })

        expect(row.source).toBe('MARKET')
        expect(row.status).toBe('FRESH')
        expect(row.unitPrice).toBe(32.45)
        expect(row.valueUsed).toBe(32.45)
        expect(row.pricedAt).toBe('2026-04-27T16:00:00.000Z')
    })

    it('marks stale local data explicitly', () => {
        const row = createWealthAssetValuationRow({
            asset: asset({marketInstrumentId: 7}),
            snapshot: {
                id: 12,
                marketInstrumentId: 7,
                unitPrice: 30,
                currency: 'CAD',
                pricedAt: '2026-04-20T16:00:00.000Z',
                freshnessStatus: 'STALE',
            },
        })

        expect(row.source).toBe('MARKET')
        expect(row.status).toBe('STALE')
        expect(row.statusLabel).toBe('Donnée stale')
    })

    it('falls back to manual value when market data is absent', () => {
        const row = createWealthAssetValuationRow({
            asset: asset({marketInstrumentId: 7, currentValue: 1000, ownershipPercent: 25}),
            error: {code: 'NO_LOCAL_DATA', message: 'Aucun snapshot local.'},
        })

        expect(row.source).toBe('MANUAL_FALLBACK')
        expect(row.status).toBe('UNAVAILABLE')
        expect(row.valueUsed).toBe(250)
        expect(row.unitPrice).toBeNull()
    })

    it('does not break the summary when some rows are unavailable or provider errors exist', () => {
        const market = createWealthAssetValuationRow({
            asset: asset({id: 1, marketInstrumentId: 7}),
            snapshot: {
                id: 1,
                unitPrice: 100,
                currency: 'CAD',
                pricedAt: '2026-04-27T00:00:00.000Z',
                freshnessStatus: 'FRESH'
            },
        })
        const manual = createPortfolioManualValuationRow(portfolio())
        const unavailable = createWealthAssetValuationRow({
            asset: asset({id: 3, name: 'Private shares', currentValue: 0}),
            error: {code: 'PROVIDER_UNAVAILABLE', message: 'Provider down.'},
        })

        const summary = summarizeWealthMarketValuations([market, manual, unavailable], 'CAD')

        expect(summary.totalMarketValue).toBe(100)
        expect(summary.totalManualFallbackValue).toBe(1250)
        expect(summary.totalUnavailableCount).toBe(1)
        expect(summary.totalErrorCount).toBe(1)
        expect(summary.netWorthSafeContribution).toBe(1350)
    })
})
