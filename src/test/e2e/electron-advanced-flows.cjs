const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {spawn, spawnSync} = require('node:child_process')

const repoRoot = path.resolve(__dirname, '..', '..', '..')
const electronPath = require('electron')
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-advanced-e2e-'))
const testDbPath = path.join(tempRoot, 'data', 'advanced-e2e.db')
const userDataDir = path.join(tempRoot, 'electron-user-data')
const artifactsDir = path.join(tempRoot, 'artifacts')
const importFixturePath = path.join(__dirname, 'fixtures', 'advanced-import.csv')
const importFixtureCsv = fs.readFileSync(importFixturePath, 'utf8')
const remoteDebuggingPort = Number(process.env.BUDGET_E2E_ADVANCED_CDP_PORT || process.env.BUDGET_E2E_CDP_PORT || 9355)

function sqliteUrl(filePath) {
    return `file:${filePath.replace(/\\/g, '/')}`
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function runNodeScript(scriptPath, args, options = {}) {
    const result = spawnSync(process.execPath, [scriptPath, ...args], {
        cwd: repoRoot,
        stdio: 'inherit',
        shell: false,
        windowsHide: true,
        ...options,
        env: {
            ...process.env,
            ...options.env,
        },
    })

    if (result.error) {
        throw new Error(`${path.basename(scriptPath)} ${args.join(' ')} failed to start: ${result.error.message}`)
    }

    if (result.signal) {
        throw new Error(`${path.basename(scriptPath)} ${args.join(' ')} was terminated by signal ${result.signal}`)
    }

    if (result.status !== 0) {
        throw new Error(`${path.basename(scriptPath)} ${args.join(' ')} failed with exit code ${result.status}`)
    }
}

function findPrismaCliPath() {
    const candidates = [
        path.join(repoRoot, 'node_modules', 'prisma', 'build', 'index.js'),
        path.join(repoRoot, 'node_modules', 'prisma', 'build', 'public', 'assets', 'index.js'),
    ]

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate
        }
    }

    throw new Error('Unable to find local Prisma CLI. Run npm install first.')
}

function runPrismaDbPush(databasePath) {
    const prismaCliPath = findPrismaCliPath()
    const schemaPath = path.join(repoRoot, 'prisma', 'schema.prisma')

    runNodeScript(
        prismaCliPath,
        ['db', 'push', '--skip-generate', '--schema', schemaPath],
        {
            env: {
                DATABASE_URL: sqliteUrl(databasePath),
            },
        },
    )
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
            const details = result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime evaluation failed'
            throw new Error(details)
        }

        return result.result.value
    }

    async captureScreenshot(fileName) {
        await this.send('Page.enable')
        const result = await this.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true})
        fs.mkdirSync(artifactsDir, {recursive: true})
        const filePath = path.join(artifactsDir, fileName)
        fs.writeFileSync(filePath, Buffer.from(result.data, 'base64'))
        return filePath
    }

    close() {
        this.socket.close()
    }
}

async function navigateTo(cdp, marker, expectedText) {
    const clicked = await cdp.evaluate(`(() => {
        const button = Array.from(document.querySelectorAll('nav button')).find((entry) => entry.innerText.trim().startsWith('${marker}'))
        if (!button) return false
        button.click()
        return true
    })()`)

    assert(clicked, `Could not click navigation marker ${marker}`)

    await waitFor(async () => cdp.evaluate(`(() => {
        const active = document.querySelector('nav button.nav-item-active')
        return Boolean(active && active.innerText.trim().startsWith('${marker}'))
    })()`), {
        message: `Navigation did not activate marker ${marker}`,
    })

    if (expectedText) {
        const expectedTexts = Array.isArray(expectedText) ? expectedText : [expectedText]
        await waitFor(async () => cdp.evaluate(`(() => {
            const text = document.body.innerText
            return ${JSON.stringify(expectedTexts)}.some((entry) => text.includes(entry))
        })()`), {
            message: `Expected section text ${expectedTexts.join(' / ')} after clicking ${marker}`,
        })
    }
}

async function refreshRendererData(cdp) {
    await cdp.evaluate(`window.appShell?.sendMenuCommand?.('refresh-data')`)

    await waitFor(async () => cdp.evaluate(`(() => {
        const text = document.body.innerText
        return text.includes('2 cpt') && text.includes('2 cat')
    })()`), {
        timeoutMs: 45000,
        message: 'Renderer did not refresh the advanced E2E core dataset after IPC writes',
    })
}

async function runAdvancedFlows() {
    fs.mkdirSync(path.dirname(testDbPath), {recursive: true})
    fs.mkdirSync(userDataDir, {recursive: true})
    fs.mkdirSync(artifactsDir, {recursive: true})

    runPrismaDbPush(testDbPath)

    const electron = spawn(electronPath, [
        `--remote-debugging-port=${remoteDebuggingPort}`,
        `--user-data-dir=${userDataDir}`,
        '--no-sandbox',
        repoRoot,
    ], {
        cwd: repoRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            BUDGET_DATABASE_PATH: testDbPath,
            ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
        },
    })

    const logs = []
    electron.stdout.on('data', (chunk) => logs.push(chunk.toString()))
    electron.stderr.on('data', (chunk) => logs.push(chunk.toString()))
    electron.on('exit', (code, signal) => {
        if (code !== 0 && signal !== 'SIGTERM') {
            logs.push(`Electron exited with code ${code} signal ${signal}`)
        }
    })

    let cdp = null
    let screenshotPath = null

    try {
        const target = await waitFor(async () => {
            const targets = await getJson(`http://127.0.0.1:${remoteDebuggingPort}/json/list`)
            return targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
        }, {message: 'Electron renderer did not expose a CDP page target'})

        cdp = new CdpClient(target.webSocketDebuggerUrl)
        await cdp.send('Runtime.enable')
        await cdp.send('Page.enable')

        await waitFor(async () => cdp.evaluate('document.readyState === "complete"'), {
            message: 'Renderer did not finish loading',
        })

        await waitFor(async () => cdp.evaluate('Boolean(window.versions && window.db && window.wealth && window.goals && window.imports)'), {
            message: 'Advanced preload APIs were not exposed to the renderer',
        })

        const ping = await cdp.evaluate('window.versions.ping()', {awaitPromise: true})
        assert(ping === 'pong', 'Expected IPC ping to return pong')

        const result = await cdp.evaluate(`
            (async () => {
                const importCsv = ${JSON.stringify(importFixtureCsv)}

                function fail(message) {
                    throw new Error(message)
                }

                function assert(condition, message) {
                    if (!condition) fail(message)
                }

                function assertMoney(actual, expected, label) {
                    const rounded = Math.round(Number(actual || 0) * 100) / 100
                    if (rounded !== expected) fail(label + ': expected ' + expected + ', got ' + actual)
                }

                function unwrap(result, label) {
                    if (result && typeof result === 'object' && 'ok' in result) {
                        if (result.ok) return result.data
                        const errorMessage = result.error && result.error.message ? result.error.message : JSON.stringify(result.error)
                        fail(label + ': ' + errorMessage)
                    }
                    return result
                }

                function unwrapAllowFailure(result) {
                    if (result && typeof result === 'object' && 'ok' in result) return result
                    return {ok: true, data: result, error: null}
                }

                async function createCoreDataset() {
                    const mainAccount = await window.db.account.create({
                        name: 'E2E Advanced Main',
                        type: 'BANK',
                        currency: 'CAD',
                        description: 'Advanced E2E temporary account',
                    })
                    const savingsAccount = await window.db.account.create({
                        name: 'E2E Advanced Savings',
                        type: 'SAVINGS',
                        currency: 'CAD',
                        description: 'Advanced E2E savings account',
                    })
                    const expenseCategory = await window.db.category.create({
                        name: 'E2E Advanced Expense',
                        kind: 'EXPENSE',
                        color: '#7c3aed',
                        description: 'Advanced E2E expense category',
                    })
                    const incomeCategory = await window.db.category.create({
                        name: 'E2E Advanced Income',
                        kind: 'INCOME',
                        color: '#16a34a',
                        description: 'Advanced E2E income category',
                    })
                    await window.db.transaction.create({
                        label: 'E2E Advanced Salary',
                        amount: 5000,
                        sourceAmount: 5000,
                        sourceCurrency: 'CAD',
                        conversionMode: 'NONE',
                        kind: 'INCOME',
                        date: '2026-05-01',
                        accountId: mainAccount.id,
                        categoryId: incomeCategory.id,
                    })
                    await window.db.transaction.create({
                        label: 'E2E Advanced Groceries',
                        amount: 250,
                        sourceAmount: 250,
                        sourceCurrency: 'CAD',
                        conversionMode: 'NONE',
                        kind: 'EXPENSE',
                        date: '2026-05-02',
                        accountId: mainAccount.id,
                        categoryId: expenseCategory.id,
                    })
                    await window.db.budgetTarget.create({
                        name: 'E2E Advanced Budget',
                        amount: 700,
                        period: 'MONTHLY',
                        startDate: '2026-05-01',
                        endDate: null,
                        currency: 'CAD',
                        isActive: true,
                        note: 'Advanced E2E budget',
                        categoryId: expenseCategory.id,
                    })
                    const recurring = await window.db.recurringTemplate.create({
                        label: 'E2E Advanced Rent',
                        sourceAmount: 900,
                        sourceCurrency: 'CAD',
                        conversionMode: 'NONE',
                        kind: 'EXPENSE',
                        frequency: 'MONTHLY',
                        intervalCount: 1,
                        startDate: '2026-05-01',
                        nextOccurrenceDate: '2026-05-01',
                        endDate: null,
                        isActive: true,
                        accountId: mainAccount.id,
                        categoryId: expenseCategory.id,
                    })
                    const generated = await window.db.recurringTemplate.generateDue({
                        templateId: recurring.id,
                        asOfDate: '2026-05-02',
                    })

                    assert(generated.generatedTransactions === 1, 'Expected recurring generation to create one transaction')
                    return {mainAccount, savingsAccount, expenseCategory, incomeCategory}
                }

                async function runWealthScenario(core) {
                    const portfolio = await window.wealth.createPortfolio({
                        name: 'E2E Advanced TFSA',
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
                        cashBalance: 500,
                        valueAsOf: '2026-05-03',
                        accountId: core.savingsAccount.id,
                        note: 'Advanced E2E portfolio',
                    })
                    const asset = await window.wealth.createAsset({
                        name: 'E2E Advanced Condo',
                        type: 'REAL_ESTATE',
                        status: 'ACTIVE',
                        currency: 'CAD',
                        valuationMode: 'MANUAL',
                        currentValue: 320000,
                        includeInNetWorth: true,
                        ownershipPercent: 50,
                        acquisitionValue: 300000,
                        acquiredAt: '2021-01-01',
                        valueAsOf: '2026-05-03',
                        institutionName: 'E2E Bank',
                        institutionCountry: 'CA',
                        institutionRegion: 'QC',
                        note: 'Advanced E2E asset',
                    })
                    const liability = await window.wealth.createLiability({
                        name: 'E2E Advanced Mortgage',
                        type: 'MORTGAGE',
                        status: 'ACTIVE',
                        currency: 'CAD',
                        currentBalance: 110000,
                        includeInNetWorth: true,
                        initialAmount: 200000,
                        interestRate: 0.045,
                        minimumPayment: 1200,
                        paymentFrequency: 'MONTHLY',
                        rateType: 'FIXED',
                        lenderName: 'E2E Bank',
                        institutionCountry: 'CA',
                        institutionRegion: 'QC',
                        openedAt: '2021-01-01',
                        dueAt: '2046-01-01',
                        balanceAsOf: '2026-05-03',
                        securedAssetId: asset.id,
                        accountId: null,
                        note: 'Advanced E2E liability',
                    })
                    const overview = await window.wealth.getOverview({currency: 'CAD'})
                    assertMoney(overview.totals.totalStandaloneAssets, 160000, 'wealth standalone assets')
                    assertMoney(overview.totals.totalPortfolios, 40000, 'wealth portfolios')
                    assertMoney(overview.totals.totalLiabilities, 110000, 'wealth liabilities')
                    assertMoney(overview.totals.netWorth, 90000, 'wealth net worth')

                    const snapshot = await window.wealth.createGeneratedNetWorthSnapshot({
                        currency: 'CAD',
                        snapshotDate: '2026-05-03T12:00:00.000Z',
                        note: 'Advanced E2E generated snapshot',
                    })
                    assertMoney(snapshot.netWorth, 90000, 'snapshot net worth')

                    return {portfolio, asset, liability, snapshot, overview}
                }

                async function runGoalsScenario(wealth) {
                    const scenario = unwrap(await window.goals.createProjectionScenario({
                        name: 'E2E Advanced Base Scenario',
                        kind: 'BASE',
                        monthlySurplus: 500,
                        annualGrowthRate: 0,
                        annualInflationRate: 0,
                        horizonMonths: 12,
                        currency: 'CAD',
                        isDefault: false,
                        isActive: true,
                        description: 'Advanced E2E deterministic scenario',
                        notes: 'No market prediction.',
                    }), 'create projection scenario')

                    const goal = unwrap(await window.goals.createFinancialGoal({
                        name: 'E2E Advanced Emergency Fund',
                        type: 'EMERGENCY_FUND',
                        targetAmount: 6000,
                        currency: 'CAD',
                        targetDate: '2027-05-01',
                        startingAmount: 1000,
                        status: 'ACTIVE',
                        priority: 1,
                        notes: 'Advanced E2E goal',
                        baselineNetWorthSnapshotId: wealth.snapshot.id,
                    }), 'create financial goal')

                    const scenarios = unwrap(await window.goals.listProjectionScenarios({search: 'E2E Advanced Base'}), 'list projection scenarios')
                    const goals = unwrap(await window.goals.listFinancialGoals({search: 'E2E Advanced Emergency'}), 'list goals')
                    const surplus = unwrap(await window.goals.estimateMonthlySurplus({
                        currency: 'CAD',
                        manualMonthlyContribution: 500,
                        referenceDate: '2026-05-01',
                    }), 'estimate monthly surplus')

                    const monthsToReach = Math.ceil((goal.targetAmount - goal.startingAmount) / scenario.monthlySurplus)
                    const estimatedReachDate = new Date(Date.UTC(2026, 4 + monthsToReach, 1)).toISOString().slice(0, 10)

                    assert(scenarios.some((row) => row.id === scenario.id && row.kind === 'BASE'), 'Expected created projection scenario to be listed')
                    assert(goals.some((row) => row.id === goal.id && row.name === goal.name), 'Expected created financial goal to be listed')
                    assert(surplus.monthlyContributionUsed === 500, 'Expected manual monthly contribution to be used')
                    assert(monthsToReach === 10, 'Expected deterministic goal reach horizon to be 10 months')
                    assert(estimatedReachDate === '2027-03-01', 'Expected deterministic estimated reach date')

                    return {goal, scenario, surplus, monthsToReach, estimatedReachDate}
                }

                async function runImportScenario(core) {
                    const template = {
                        importType: 'transactions',
                        defaultCurrency: 'CAD',
                        columnMappings: [
                            {sourceColumn: 'Date', targetField: 'date'},
                            {sourceColumn: 'Description', targetField: 'label'},
                            {sourceColumn: 'Amount', targetField: 'amount'},
                            {sourceColumn: 'Currency', targetField: 'currency'},
                            {sourceColumn: 'Account', targetField: 'accountName'},
                        ],
                    }

                    const created = unwrap(await window.imports.createBatch({
                        importType: 'transactions',
                        defaultCurrency: 'CAD',
                        fileMetadata: {fileName: 'advanced-import.csv', provider: 'advanced-e2e'},
                        template,
                    }), 'create import batch')

                    const parsed = unwrap(await window.imports.parseFile({
                        batchId: created.id,
                        rawText: importCsv,
                        defaultCurrency: 'CAD',
                    }), 'parse import file')
                    const preview = unwrap(await window.imports.preview({
                        batchId: created.id,
                        targetAccountId: core.mainAccount.id,
                        defaultCurrency: 'CAD',
                    }), 'preview import')

                    const errorCodes = preview.blockingErrors.map((error) => error.code)
                    assert(preview.dryRun === true, 'Expected import preview to be a dry-run')
                    assert(preview.stats.totalRows === 4, 'Expected four fixture rows')
                    assert(preview.stats.skippedRows >= 1, 'Expected at least one skipped row for invalid fixture data')
                    assert(preview.stats.duplicateCount >= 1, 'Expected duplicate fixture row to be detected')
                    assert(errorCodes.includes('invalidDate'), 'Expected invalid date error in import preview')
                    assert(errorCodes.includes('invalidAmount'), 'Expected invalid amount error in import preview')

                    const beforeApplyTransactions = await window.db.transaction.list()
                    const applied = unwrap(await window.imports.apply({batchId: created.id}), 'apply import')
                    const afterApplyTransactions = await window.db.transaction.list()

                    assert(beforeApplyTransactions.length === afterApplyTransactions.length, 'Import dry-run/apply must not mutate DB transactions directly')
                    assert(applied.appliedLinks.some((link) => link.operation === 'created'), 'Expected at least one created import link')
                    assert(applied.appliedLinks.some((link) => link.operation === 'updated'), 'Expected duplicate row to produce an update link')
                    assert(applied.appliedLinks.some((link) => link.operation === 'skipped'), 'Expected invalid row to produce a skipped link')

                    const errors = unwrap(await window.imports.listErrors(created.id), 'list import errors')
                    const duplicates = unwrap(await window.imports.listDuplicateCandidates(created.id), 'list duplicate candidates')
                    const history = unwrap(await window.imports.listHistory({}), 'list import history')
                    assert(errors.some((error) => error.code === 'invalidDate'), 'Expected persisted invalidDate error')
                    assert(duplicates.length >= 1, 'Expected persisted duplicate candidates')
                    assert(history.some((entry) => entry.id === created.id), 'Expected applied import in history')

                    return {created, parsed, preview, applied, errors, duplicates, historyCount: history.length}
                }

                try {
                    const core = await createCoreDataset()
                    const wealth = await runWealthScenario(core)
                    const goals = await runGoalsScenario(wealth)
                    const imports = await runImportScenario(core)

                    return {
                        ok: true,
                        wealthNetWorth: wealth.overview.totals.netWorth,
                        snapshotId: wealth.snapshot.id,
                        goalId: goals.goal.id,
                        scenarioId: goals.scenario.id,
                        estimatedReachDate: goals.estimatedReachDate,
                        importBatchId: imports.created.id,
                        importDuplicateCount: imports.preview.stats.duplicateCount,
                        importErrorCount: imports.preview.stats.errorCount,
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

        assert(result && result.ok, `Advanced renderer/preload flow failed: ${result?.message}\n${result?.stack || ''}`)

        await refreshRendererData(cdp)

        await navigateTo(cdp, 'WL', ['Patrimoine', 'Wealth'])
        await waitFor(async () => cdp.evaluate(`document.body.innerText.includes('E2E Advanced Condo') || document.body.innerText.includes('90')`), {
            message: 'Wealth UI did not show advanced scenario data',
        })

        await navigateTo(cdp, 'IM', ['Historique', 'Imports', 'Import history'])
        await waitFor(async () => cdp.evaluate(`document.body.innerText.includes('advanced-import.csv') || document.body.innerText.includes('advanced-e2e') || document.body.innerText.includes('Import')`), {
            message: 'Import history UI did not render advanced import data',
        })

        await navigateTo(cdp, 'RP', ['Rapports', 'Reports'])
        await waitFor(async () => cdp.evaluate(`document.body.innerText.includes('E2E Advanced') || document.body.innerText.includes('Rapport') || document.body.innerText.includes('Reports')`), {
            message: 'Reports UI did not render after advanced dataset creation',
        })

        console.log([
            'Advanced Electron E2E passed.',
            `DB=${testDbPath}`,
            `netWorth=${result.wealthNetWorth}`,
            `snapshot=${result.snapshotId}`,
            `goal=${result.goalId}`,
            `scenario=${result.scenarioId}`,
            `estimatedReachDate=${result.estimatedReachDate}`,
            `importBatch=${result.importBatchId}`,
            `duplicates=${result.importDuplicateCount}`,
            `importErrors=${result.importErrorCount}`,
        ].join(' '))
    } catch (error) {
        if (cdp) {
            try {
                screenshotPath = await cdp.captureScreenshot('advanced-e2e-failure.png')
            } catch (screenshotError) {
                logs.push(`Failed to capture screenshot: ${screenshotError.message}`)
            }
        }

        console.error('\nElectron output before failure:\n')
        console.error(logs.join('\n'))
        if (screenshotPath) console.error(`Failure screenshot: ${screenshotPath}`)
        throw error
    } finally {
        if (cdp) cdp.close()
        electron.kill('SIGTERM')
        await sleep(500)

        if (process.env.BUDGET_E2E_KEEP_ARTIFACTS === '1') {
            console.log(`Keeping advanced E2E artifacts at ${tempRoot}`)
        } else {
            fs.rmSync(tempRoot, {recursive: true, force: true})
        }
    }
}

runAdvancedFlows().catch((error) => {
    console.error(error)
    process.exit(1)
})
