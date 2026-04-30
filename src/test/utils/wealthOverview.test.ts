
import {describe, expect, it} from 'vitest'

import {buildWealthOverview} from '../../utils/wealthOverview'

describe('buildWealthOverview', () => {
  it('computes net worth with ownership and liabilities', () => {
    const overview = buildWealthOverview({
      assets: [
        {
          id: 1,
          name: 'Maison',
          type: 'REAL_ESTATE',
          status: 'ACTIVE',
          currency: 'CAD',
          currentValue: 500_000,
          ownershipPercent: 50,
        },
      ],
      portfolios: [
        {
          id: 1,
          name: 'CELI',
          type: 'RETIREMENT',
          status: 'ACTIVE',
          currency: 'CAD',
          currentValue: 40_000,
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
          currentBalance: 120_000,
        },
      ],
      currency: 'CAD',
    })

    expect(overview.totals.totalStandaloneAssets).toBe(250_000)
    expect(overview.totals.totalPortfolios).toBe(40_000)
    expect(overview.totals.totalAssets).toBe(290_000)
    expect(overview.totals.totalLiabilities).toBe(120_000)
    expect(overview.totals.netWorth).toBe(170_000)
  })

  it('excludes archived and explicitly excluded records', () => {
    const overview = buildWealthOverview({
      assets: [
        {
          id: 1,
          name: 'Voiture',
          type: 'VEHICLE',
          status: 'ARCHIVED',
          currency: 'CAD',
          currentValue: 20_000,
        },
        {
          id: 2,
          name: 'Wallet perdu',
          type: 'CRYPTO',
          status: 'ACTIVE',
          currency: 'CAD',
          currentValue: 10_000,
          includeInNetWorth: false,
        },
      ],
      portfolios: [],
      liabilities: [],
      currency: 'CAD',
    })

    expect(overview.totals.totalAssets).toBe(0)
    expect(overview.totals.assetCount).toBe(0)
  })

  it('does not fake a consolidated total when multiple currencies exist without target currency', () => {
    const overview = buildWealthOverview({
      assets: [
        {
          id: 1,
          name: 'Cash CAD',
          type: 'CASH',
          status: 'ACTIVE',
          currency: 'CAD',
          currentValue: 100,
        },
        {
          id: 2,
          name: 'Cash EUR',
          type: 'CASH',
          status: 'ACTIVE',
          currency: 'EUR',
          currentValue: 100,
        },
      ],
      portfolios: [],
      liabilities: [],
    })

    expect(overview.canConsolidate).toBe(false)
    expect(overview.currency).toBe(null)
    expect(overview.totals.totalAssets).toBe(null)
    expect(overview.totalsByCurrency.CAD.totalAssets).toBe(100)
    expect(overview.totalsByCurrency.EUR.totalAssets).toBe(100)
  })
})
