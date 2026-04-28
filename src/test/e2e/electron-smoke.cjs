const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {spawn, spawnSync} = require('node:child_process')

const repoRoot = path.resolve(__dirname, '..', '..', '..')
const electronPath = require('electron')
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-e2e-'))
const testDbPath = path.join(tempRoot, 'data', 'e2e.db')
const remoteDebuggingPort = Number(process.env.BUDGET_E2E_CDP_PORT || 9333)

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

async function runSmokeTest() {
    fs.mkdirSync(path.dirname(testDbPath), {recursive: true})

    run('npx', ['prisma', 'db', 'push', '--skip-generate'], {
        env: {
            DATABASE_URL: sqliteUrl(testDbPath),
        },
    })

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

    try {
        const target = await waitFor(async () => {
            const targets = await getJson(`http://127.0.0.1:${remoteDebuggingPort}/json/list`)
            return targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
        }, {message: 'Electron renderer did not expose a CDP page target'})

        cdp = new CdpClient(target.webSocketDebuggerUrl)
        await cdp.send('Runtime.enable')

        await waitFor(async () => cdp.evaluate('document.readyState === "complete"'), {
            message: 'Renderer did not finish loading',
        })

        await waitFor(async () => cdp.evaluate('Boolean(window.versions && window.appShell && window.db)'), {
            message: 'Preload APIs were not exposed to the renderer',
        })

        const ping = await cdp.evaluate('window.versions.ping()', {awaitPromise: true})
        assert(ping === 'pong', 'Expected IPC ping to return pong')

        const version = await cdp.evaluate('window.appShell.getVersion()', {awaitPromise: true})
        assert(typeof version === 'string' && version.length > 0, 'Expected app version to be readable')

        const accountCount = await cdp.evaluate('window.db.account.list().then((rows) => rows.length)', {awaitPromise: true})
        assert(accountCount === 0, 'Expected the E2E test database to start empty')

        await waitFor(async () => cdp.evaluate('document.body.innerText.includes("Budget")'), {
            message: 'Budget shell did not render',
        })

        const navMarkers = await cdp.evaluate(`Array.from(document.querySelectorAll('nav button')).map((button) => button.innerText.trim().split(/\\s+/)[0])`)
        for (const marker of ['OV', 'TX', 'AC', 'CA', 'BG', 'RC', 'RP']) {
            assert(navMarkers.includes(marker), `Expected navigation marker ${marker} to be rendered`)
        }

        for (const marker of ['TX', 'AC', 'CA', 'BG', 'RC', 'RP', 'OV']) {
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
        }

        console.log(`Desktop E2E smoke test passed against app version ${version}`)
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

runSmokeTest().catch((error) => {
    console.error(error)
    process.exit(1)
})
