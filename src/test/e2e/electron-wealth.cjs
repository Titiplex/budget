const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {spawn, spawnSync} = require('node:child_process')

const repoRoot = path.resolve(__dirname, '..', '..', '..')
const electronPath = require('electron')
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-wealth-e2e-'))
const testDbPath = path.join(tempRoot, 'data', 'wealth-e2e.db')
const remoteDebuggingPort = Number(process.env.BUDGET_E2E_CDP_PORT || 9344)

function sqliteUrl(filePath) {
    return `file:${filePath.replace(/\\/g, '/')}`
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: repoRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        ...options,
        env: {
            ...process.env,
            ...options.env,
        },
    })

    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message)
    }
}

async function waitFor(fn, {timeoutMs = 30000, intervalMs = 250, message = 'Timed out'} = {}) {
    const startedAt = Date.now()
    let lastError = null

    while (Date.now() - startedAt < timeoutMs) {
        try {
            const value = await fn()
            if (value) return value
        } catch (error) {
            lastError = error
        }

        await sleep(intervalMs)
    }

    if (lastError) {
        throw new Error(`${message}: ${lastError.message}`)
    }

    throw new Error(message)
}

async function getJson(url) {
    const response = await fetch(url)

    if (!response.ok) {
        throw new Error(`GET ${url} failed with ${response.status}`)
    }

    return response.json()
}

class CdpClient {
    constructor(webSocketUrl) {
        this.nextId = 1
        this.pending = new Map()
        this.socket = new WebSocket(webSocketUrl)

        this.ready = new Promise((resolve, reject) => {
            this.socket.addEventListener('open', resolve, {once: true})
            this.socket.addEventListener('error', reject, {once: true})
        })

        this.socket.addEventListener('message', (event) => {
            const payload = JSON.parse(event.data)
            if (!payload.id) return

            const pending = this.pending.get(payload.id)
            if (!pending) return

            this.pending.delete(payload.id)

            if (payload.error) {
                pending.reject(new Error(payload.error.message || JSON.stringify(payload.error)))
                return
            }

            pending.resolve(payload.result)
        })
    }

    async send(method, params = {}) {
        await this.ready

        const id = this.nextId++
        const payload = {id, method, params}

        return new Promise((resolve, reject) => {
            this.pending.set(id, {resolve, reject})
            this.socket.send(JSON.stringify(payload))
        })
    }

    async evaluate(expression, {awaitPromise = false} = {}) {
        const result = await this.send('Runtime.evaluate', {
            expression,
            awaitPromise,
            returnByValue: true,
        })

        if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed')
        }

        return result.result.value
    }

    close() {
        this.socket.close()
    }
}

async function runWealthE2eTest() {
    fs.mkdirSync(path.dirname(testDbPath), {recursive: true})

    run('npx', ['prisma', 'db', 'push', '--skip-generate'], {
        env: {
            DATABASE_URL: sqliteUrl(testDbPath),
        },
    })

    const electron = spawn(
        electronPath,
        [
            `--remote-debugging-port=${remoteDebuggingPort}`,
            '--no-sandbox',
            repoRoot,
        ],
        {
            cwd: repoRoot,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                BUDGET_DATABASE_PATH: testDbPath,
                ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
            },
        },
    )

    const logs = []

    electron.stdout.on('data', (chunk) => logs.push(chunk.toString()))
    electron.stderr.on('data', (chunk) => logs.push(chunk.toString()))
    electron.on('exit', (code, signal) => {
        if (code !== 0 && signal !== 'SIGTERM') {
            logs.push(`Electron exited with code ${code} signal ${signal}`)
        }
    })

    let cdp = null

    try {
        const target = await waitFor(
            async () => {
                const targets = await getJson(`http://127.0.0.1:${remoteDebuggingPort}/json/list`)
                return targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
            },
            {message: 'Electron renderer did not expose a CDP page target'},
        )

        cdp = new CdpClient(target.webSocketDebuggerUrl)
        await cdp.send('Runtime.enable')

        await waitFor(
            async () => cdp.evaluate('document.readyState === "complete"'),
            {message: 'Renderer did not finish loading'},
        )

        await waitFor(
            async () => cdp.evaluate('Boolean(window.versions && window.db && window.wealth)'),
            {message: 'Preload APIs were not exposed to the renderer'},
        )

        const uiNavigation = await cdp.evaluate(`
      (() => {
        const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'))
        const wealthButton = candidates.find((element) => {
          const text = String(element.innerText || element.textContent || '').trim()
          return /patrimoine|wealth|\\bWT\\b|\\bWL\\b|\\bWE\\b/i.test(text)
        })

        if (!wealthButton) {
          return {
            ok: false,
            labels: candidates
              .map((element) => String(element.innerText || element.textContent || '').trim())
              .filter(Boolean)
              .slice(0, 40),
          }
        }

        wealthButton.click()

        return {
          ok: true,
          label: String(wealthButton.innerText || wealthButton.textContent || '').trim(),
        }
      })()
    `)

        assert(
            uiNavigation.ok,
            `Expected a Wealth/Patrimoine navigation control. Found labels: ${JSON.stringify(uiNavigation.labels)}`,
        )

        await waitFor(
            async () =>
                cdp.evaluate(`
          document.body.innerText.includes('Patrimoine') ||
          document.body.innerText.includes('Wealth')
        `),
            {message: 'Wealth section did not render after navigation'},
        )

        const wealthResult = await cdp.evaluate(`
      (async () => {
        function assert(condition, message) {
          if (!condition) throw new Error(message)
        }

        function assertEqual(actual, expected, label) {
          if (actual !== expected) {
            throw new Error(label + ': expected ' + expected + ', got ' + actual)
          }
        }

        function assertMoney(actual, expected, label) {
          const rounded = Math.round(Number(actual || 0))
          if (rounded !== expected) {
            throw new Error(label + ': expected ' + expected + ', got ' + actual)
          }
        }

        try {
          const api = window.wealth

          assert(api, 'window.wealth is missing')
          assert(typeof api.getOverview === 'function', 'window.wealth.getOverview is missing')
          assert(typeof api.createGeneratedNetWorthSnapshot === 'function', 'window.wealth.createGeneratedNetWorthSnapshot is missing')

          const empty = await api.getOverview({currency: 'CAD'})
          assertEqual(empty.totals.assetCount, 0, 'empty asset count')
          assertEqual(empty.totals.portfolioCount, 0, 'empty portfolio count')
          assertEqual(empty.totals.liabilityCount, 0, 'empty liability count')
          assertMoney(empty.totals.netWorth, 0, 'empty net worth')

          const maison = await api.createAsset({
            name: 'E2E Maison',
            type: 'REAL_ESTATE',
            status: 'ACTIVE',
            currency: 'CAD',
            valuationMode: 'MANUAL',
            currentValue: 500000,
            includeInNetWorth: true,
            ownershipPercent: 50,
            acquisitionValue: 450000,
            acquiredAt: '2022-01-01',
            valueAsOf: '2026-04-28',
            institutionName: 'E2E Banque',
            institutionCountry: 'CA',
            institutionRegion: 'QC',
            note: 'Created by wealth e2e',
          })

          await api.createAsset({
            name: 'E2E Excluded wallet',
            type: 'CRYPTO',
            status: 'ACTIVE',
            currency: 'CAD',
            valuationMode: 'MANUAL',
            currentValue: 99999,
            includeInNetWorth: false,
            ownershipPercent: 100,
            valueAsOf: '2026-04-28',
          })

          await api.createAsset({
            name: 'E2E Archived car',
            type: 'VEHICLE',
            status: 'ARCHIVED',
            currency: 'CAD',
            valuationMode: 'MANUAL',
            currentValue: 99999,
            includeInNetWorth: true,
            ownershipPercent: 100,
            valueAsOf: '2026-04-28',
          })

          await api.createAsset({
            name: 'E2E EUR cash',
            type: 'CASH',
            status: 'ACTIVE',
            currency: 'EUR',
            valuationMode: 'MANUAL',
            currentValue: 100,
            includeInNetWorth: true,
            ownershipPercent: 100,
            valueAsOf: '2026-04-28',
          })

          const portfolio = await api.createPortfolio({
            name: 'E2E CELI',
            type: 'RETIREMENT',
            status: 'ACTIVE',
            currency: 'CAD',
            institutionName: 'E2E Broker',
            institutionCountry: 'CA',
            institutionRegion: 'QC',
            taxWrapper: 'TFSA',
            valuationMode: 'MANUAL',
            currentValue: 40000,
            includeInNetWorth: true,
            ownershipPercent: 100,
            cashBalance: 1500,
            valueAsOf: '2026-04-28',
            accountId: null,
            note: 'Created by wealth e2e',
          })

          const liability = await api.createLiability({
            name: 'E2E Hypothèque',
            type: 'MORTGAGE',
            status: 'ACTIVE',
            currency: 'CAD',
            currentBalance: 120000,
            includeInNetWorth: true,
            initialAmount: 200000,
            interestRate: 4.75,
            minimumPayment: 1500,
            paymentFrequency: 'MONTHLY',
            rateType: 'VARIABLE',
            lenderName: 'E2E Banque',
            institutionCountry: 'CA',
            institutionRegion: 'QC',
            openedAt: '2020-01-01',
            dueAt: '2045-01-01',
            balanceAsOf: '2026-04-28',
            securedAssetId: maison.id,
            accountId: null,
            note: 'Created by wealth e2e',
          })

          const cadOverview = await api.getOverview({currency: 'CAD'})

          assert(cadOverview.canConsolidate === true, 'CAD overview should be consolidated')
          assertEqual(cadOverview.currency, 'CAD', 'CAD overview currency')
          assertMoney(cadOverview.totals.totalStandaloneAssets, 250000, 'CAD standalone assets')
          assertMoney(cadOverview.totals.totalPortfolios, 40000, 'CAD portfolios')
          assertMoney(cadOverview.totals.totalAssets, 290000, 'CAD total assets')
          assertMoney(cadOverview.totals.totalLiabilities, 120000, 'CAD liabilities')
          assertMoney(cadOverview.totals.netWorth, 170000, 'CAD net worth')
          assertEqual(cadOverview.totals.assetCount, 3, 'included active asset count across currencies')
          assertEqual(cadOverview.totals.portfolioCount, 1, 'included portfolio count')
          assertEqual(cadOverview.totals.liabilityCount, 1, 'included liability count')

          const allCurrenciesOverview = await api.getOverview()

          assert(allCurrenciesOverview.canConsolidate === false, 'multi-currency overview should not be consolidated')
          assert(allCurrenciesOverview.currency === null, 'multi-currency overview currency should be null')
          assert(allCurrenciesOverview.totals.totalAssets === null, 'multi-currency totalAssets should be null')
          assertMoney(allCurrenciesOverview.totalsByCurrency.CAD.totalAssets, 290000, 'CAD bucket assets')
          assertMoney(allCurrenciesOverview.totalsByCurrency.EUR.totalAssets, 100, 'EUR bucket assets')

          const realEstateAssets = await api.listAssets({
            status: 'ACTIVE',
            currency: 'CAD',
            assetType: 'REAL_ESTATE',
          })

          assert(
            realEstateAssets.some((asset) => asset.name === 'E2E Maison'),
            'Expected listAssets filter to return E2E Maison',
          )

          const snapshot = await api.createGeneratedNetWorthSnapshot({
            currency: 'CAD',
            snapshotDate: '2026-04-28T12:00:00.000Z',
            note: 'E2E generated snapshot',
          })

          assertMoney(snapshot.totalAssets, 290000, 'snapshot total assets')
          assertMoney(snapshot.totalLiabilities, 120000, 'snapshot liabilities')
          assertMoney(snapshot.netWorth, 170000, 'snapshot net worth')
          assertEqual(snapshot.source, 'GENERATED', 'snapshot source')

          const snapshots = await api.listNetWorthSnapshots({currency: 'CAD'})
          assert(snapshots.length >= 1, 'Expected at least one CAD snapshot')
          assert(
            snapshots.some((row) => row.id === snapshot.id),
            'Expected generated snapshot to be listed',
          )

          await api.updateAsset(maison.id, {
            currentValue: 600000,
            ownershipPercent: 50,
          })

          const updatedOverview = await api.getOverview({currency: 'CAD'})
          assertMoney(updatedOverview.totals.totalStandaloneAssets, 300000, 'updated standalone assets')
          assertMoney(updatedOverview.totals.totalAssets, 340000, 'updated total assets')
          assertMoney(updatedOverview.totals.netWorth, 220000, 'updated net worth')

          await api.deleteLiability(liability.id)
          await api.deletePortfolio(portfolio.id)
          await api.deleteAsset(maison.id)

          return {
            ok: true,
            cadNetWorth: cadOverview.totals.netWorth,
            updatedNetWorth: updatedOverview.totals.netWorth,
            snapshotId: snapshot.id,
          }
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : null,
          }
        }
      })()
    `, {awaitPromise: true})

        assert(
            wealthResult && wealthResult.ok,
            `Wealth renderer/IPC E2E failed: ${wealthResult?.message}\n${wealthResult?.stack || ''}`,
        )

        console.log(
            `Wealth E2E passed. Initial CAD net worth=${wealthResult.cadNetWorth}, updated=${wealthResult.updatedNetWorth}, snapshot=${wealthResult.snapshotId}`,
        )
    } catch (error) {
        console.error('\nElectron output before failure:\n')
        console.error(logs.join('\n'))
        throw error
    } finally {
        if (cdp) cdp.close()

        electron.kill('SIGTERM')
        await sleep(500)
        fs.rmSync(tempRoot, {recursive: true, force: true})
    }
}

runWealthE2eTest().catch((error) => {
    console.error(error)
    process.exit(1)
})