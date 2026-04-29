import fs from 'node:fs'
import path from 'node:path'
import {describe, expect, it} from 'vitest'

const preloadPath = path.resolve(process.cwd(), 'electron', 'preload.js')
const preloadSource = fs.readFileSync(preloadPath, 'utf8')

describe('preload market data contract', () => {
  it('exposes marketData only once so later APIs are not skipped at runtime', () => {
    const matches = preloadSource.match(/exposeInMainWorld\(['"]marketData['"]/g) || []

    expect(matches).toHaveLength(1)
  })

  it('exposes the watchlist methods through window.marketData', () => {
    expect(preloadSource).toContain('listWatchlist')
    expect(preloadSource).toContain('addWatchlistInstrument')
    expect(preloadSource).toContain('removeWatchlistInstrument')
    expect(preloadSource).toContain('refreshWatchlist')
  })

  it('still exposes wealth after marketData', () => {
    const marketDataIndex = preloadSource.indexOf("exposeInMainWorld('marketData'")
    const wealthIndex = preloadSource.indexOf("exposeInMainWorld('wealth'")

    expect(marketDataIndex).toBeGreaterThanOrEqual(0)
    expect(wealthIndex).toBeGreaterThan(marketDataIndex)
  })
})
