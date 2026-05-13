const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {spawn, spawnSync} = require('node:child_process')

const repoRoot = path.resolve(__dirname, '..', '..', '..')
const electronPath = require('electron')

function sqliteUrl(filePath) {
    return `file:${filePath.replace(/\\/g, '/')}`
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message)
    }
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

    throw new Error(
        'Unable to find local Prisma CLI. Expected node_modules/prisma/build/index.js. Run npm install first.',
    )
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
            const details = result.exceptionDetails
            const exception = details.exception?.description || details.exception?.value || details.text
            throw new Error(exception || 'Runtime evaluation failed')
        }

        return result.result.value
    }

    async screenshot(filePath) {
        await this.send('Page.enable')
        const result = await this.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true})
        fs.writeFileSync(filePath, Buffer.from(result.data, 'base64'))
        return filePath
    }

    close() {
        this.socket.close()
    }
}

function defaultPort(prefix) {
    const seed = Array.from(prefix).reduce((total, char) => total + char.charCodeAt(0), 0)
    return 9300 + (seed % 200)
}

async function launchElectronE2e({prefix = 'budget-e2e', dbFileName = 'e2e.db', port = null} = {}) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
    const artifactsDir = path.join(tempRoot, 'artifacts')
    const testDbPath = path.join(tempRoot, 'data', dbFileName)
    const remoteDebuggingPort = Number(port || process.env.BUDGET_E2E_CDP_PORT || defaultPort(prefix))
    const logs = []

    fs.mkdirSync(path.dirname(testDbPath), {recursive: true})
    fs.mkdirSync(artifactsDir, {recursive: true})
    runPrismaDbPush(testDbPath)

    const electron = spawn(electronPath, [
        `--remote-debugging-port=${remoteDebuggingPort}`,
        '--no-sandbox',
        repoRoot,
    ], {
        cwd: repoRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            BUDGET_DATABASE_PATH: testDbPath,
            ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
            BUDGET_E2E_ARTIFACT_DIR: artifactsDir,
        },
    })

    electron.stdout.on('data', (chunk) => logs.push(chunk.toString()))
    electron.stderr.on('data', (chunk) => logs.push(chunk.toString()))
    electron.on('exit', (code, signal) => {
        if (code !== 0 && signal !== 'SIGTERM') {
            logs.push(`Electron exited with code ${code} signal ${signal}`)
        }
    })

    const target = await waitFor(async () => {
        const targets = await getJson(`http://127.0.0.1:${remoteDebuggingPort}/json/list`)
        return targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
    }, {message: 'Electron renderer did not expose a CDP page target'})

    const cdp = new CdpClient(target.webSocketDebuggerUrl)
    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')

    await waitFor(async () => cdp.evaluate('document.readyState === "complete"'), {
        message: 'Renderer did not finish loading',
    })

    async function captureFailureArtifacts(label = 'failure') {
        const safeLabel = String(label).replace(/[^a-z0-9_.-]+/gi, '-').replace(/^-|-$/g, '') || 'failure'
        const screenshotPath = path.join(artifactsDir, `${safeLabel}.png`)
        const logPath = path.join(artifactsDir, `${safeLabel}.log`)

        try {
            await cdp.screenshot(screenshotPath)
        } catch (error) {
            logs.push(`Failed to capture screenshot: ${error.message}`)
        }

        fs.writeFileSync(logPath, logs.join('\n'), 'utf8')
        return {screenshotPath, logPath, artifactsDir}
    }

    async function cleanup({keepArtifacts = process.env.BUDGET_E2E_KEEP_ARTIFACTS === '1'} = {}) {
        try {
            cdp.close()
        } catch (_error) {
            // Ignore cleanup errors.
        }

        electron.kill('SIGTERM')
        await sleep(500)

        if (!keepArtifacts) {
            fs.rmSync(tempRoot, {recursive: true, force: true})
        }
    }

    return {
        artifactsDir,
        captureFailureArtifacts,
        cdp,
        cleanup,
        logs,
        remoteDebuggingPort,
        repoRoot,
        tempRoot,
        testDbPath,
    }
}

module.exports = {
    CdpClient,
    assert,
    launchElectronE2e,
    repoRoot,
    runPrismaDbPush,
    sleep,
    sqliteUrl,
    waitFor,
}
