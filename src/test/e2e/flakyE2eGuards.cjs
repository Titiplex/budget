const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function sqliteUrl(filePath) {
    return `file:${filePath.replace(/\\/g, '/')}`
}

function createE2eRunContext(options = {}) {
    const prefix = options.prefix || 'budget-e2e-'
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    const artifactDir = path.join(tempRoot, 'artifacts')
    const dbPath = path.join(tempRoot, 'data', 'e2e.db')
    const logs = []

    fs.mkdirSync(path.dirname(dbPath), {recursive: true})
    fs.mkdirSync(artifactDir, {recursive: true})

    return {
        tempRoot,
        artifactDir,
        dbPath,
        databaseUrl: sqliteUrl(dbPath),
        logs,
        appendLog(value) {
            logs.push(String(value))
        },
        writeLogFile(fileName = 'electron-output.log') {
            const logPath = path.join(artifactDir, fileName)
            fs.writeFileSync(logPath, logs.join('\n'), 'utf8')
            return logPath
        },
        cleanup({keepArtifacts = false} = {}) {
            if (keepArtifacts) {
                this.writeLogFile()
                return
            }

            fs.rmSync(tempRoot, {recursive: true, force: true})
        },
    }
}

function assertTempDatabasePath(dbPath, repoRoot = process.cwd()) {
    const resolvedDbPath = path.resolve(dbPath)
    const resolvedRepoRoot = path.resolve(repoRoot)
    const devDbPath = path.join(resolvedRepoRoot, 'prisma', 'dev.db')
    const tmpRoot = path.resolve(os.tmpdir())

    if (resolvedDbPath === devDbPath) {
        throw new Error(`E2E must not use the development DB: ${devDbPath}`)
    }

    if (!resolvedDbPath.startsWith(tmpRoot)) {
        throw new Error(`E2E database must live under the OS temp directory. Got: ${resolvedDbPath}`)
    }

    return resolvedDbPath
}

function attachProcessLogs(child, logs) {
    if (child.stdout) {
        child.stdout.on('data', (chunk) => logs.push(chunk.toString()))
    }

    if (child.stderr) {
        child.stderr.on('data', (chunk) => logs.push(chunk.toString()))
    }

    child.on('exit', (code, signal) => {
        if (code !== 0 && signal !== 'SIGTERM') {
            logs.push(`Process exited with code ${code} signal ${signal}`)
        }
    })
}

async function waitFor(fn, options = {}) {
    const timeoutMs = options.timeoutMs || 30000
    const intervalMs = options.intervalMs || 250
    const message = options.message || 'Timed out while waiting for condition'
    const startedAt = Date.now()
    let lastError = null
    let lastValue = null

    while (Date.now() - startedAt < timeoutMs) {
        try {
            const value = await fn()
            lastValue = value
            if (value) return value
        } catch (error) {
            lastError = error
        }

        await sleep(intervalMs)
    }

    if (lastError) {
        throw new Error(`${message}: ${lastError.message}`)
    }

    throw new Error(`${message}${lastValue == null ? '' : `; last value=${JSON.stringify(lastValue).slice(0, 500)}`}`)
}

async function stableRendererEval(cdp, expression, options = {}) {
    const stableSamples = Math.max(1, options.stableSamples || 2)
    const timeoutMs = options.timeoutMs || 30000
    const intervalMs = options.intervalMs || 250
    const message = options.message || `Renderer expression did not become stable: ${expression}`
    let stableCount = 0

    return waitFor(async () => {
        const value = await cdp.evaluate(expression, {awaitPromise: Boolean(options.awaitPromise)})

        if (value) {
            stableCount += 1
            return stableCount >= stableSamples ? value : false
        }

        stableCount = 0
        return false
    }, {timeoutMs, intervalMs, message})
}

async function captureRendererDiagnostics(cdp, context, label = 'failure') {
    const safeLabel = String(label).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'failure'
    const written = []

    if (!context || !context.artifactDir) return written
    fs.mkdirSync(context.artifactDir, {recursive: true})

    try {
        if (cdp && typeof cdp.send === 'function') {
            await cdp.send('Page.enable').catch(() => null)
            const screenshot = await cdp.send('Page.captureScreenshot', {format: 'png'}).catch(() => null)
            if (screenshot && screenshot.data) {
                const screenshotPath = path.join(context.artifactDir, `${safeLabel}.png`)
                fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'))
                written.push(screenshotPath)
            }
        }
    } catch (error) {
        context.logs.push(`Unable to capture screenshot: ${error.message}`)
    }

    try {
        if (cdp && typeof cdp.evaluate === 'function') {
            const diagnostics = await cdp.evaluate(`(() => ({
                href: location.href,
                readyState: document.readyState,
                title: document.title,
                bodyText: String(document.body && document.body.innerText || '').slice(0, 12000),
                buttons: Array.from(document.querySelectorAll('button, a, [role="button"]'))
                    .map((element) => String(element.innerText || element.textContent || '').trim())
                    .filter(Boolean)
                    .slice(0, 80),
            }))()`)
            const diagnosticsPath = path.join(context.artifactDir, `${safeLabel}.renderer.json`)
            fs.writeFileSync(diagnosticsPath, JSON.stringify(diagnostics, null, 2), 'utf8')
            written.push(diagnosticsPath)
        }
    } catch (error) {
        context.logs.push(`Unable to capture renderer diagnostics: ${error.message}`)
    }

    if (context.logs) {
        written.push(context.writeLogFile(`${safeLabel}.electron.log`))
    }

    return written
}

async function runWithE2eDiagnostics(options, action) {
    const context = options.context
    const cdp = options.cdp
    const label = options.label || 'failure'

    try {
        return await action()
    } catch (error) {
        await captureRendererDiagnostics(cdp, context, label)
        throw error
    }
}

module.exports = {
    assertTempDatabasePath,
    attachProcessLogs,
    captureRendererDiagnostics,
    createE2eRunContext,
    runWithE2eDiagnostics,
    sleep,
    sqliteUrl,
    stableRendererEval,
    waitFor,
}
