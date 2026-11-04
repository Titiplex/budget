import {spawn} from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const platform = process.argv[2] || 'android'
const root = process.cwd()
const watchedRoots = ['src', 'assets', 'index.html', 'vite.config.mjs', 'capacitor.config.ts']
const ignored = new Set(['node_modules', 'dist', 'out', 'coverage', '.git', 'android', 'ios'])

let running = false
let pending = false
let lastSignature = ''

async function collectFiles(entry, out = []) {
    const absolutePath = path.join(root, entry)
    let stat
    try {
        stat = await fs.stat(absolutePath)
    } catch {
        return out
    }

    if (stat.isFile()) {
        out.push(`${entry}:${stat.mtimeMs}:${stat.size}`)
        return out
    }

    if (!stat.isDirectory()) return out

    const name = path.basename(entry)
    if (ignored.has(name)) return out

    const children = await fs.readdir(absolutePath)
    for (const child of children) {
        await collectFiles(path.join(entry, child), out)
    }
    return out
}

async function signature() {
    const all = []
    for (const entry of watchedRoots) {
        await collectFiles(entry, all)
    }
    return all.sort().join('\n')
}

function run(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {stdio: 'inherit', shell: process.platform === 'win32'})
        child.on('exit', (code) => {
            if (code === 0) resolve()
            else reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`))
        })
    })
}

async function sync() {
    if (running) {
        pending = true
        return
    }

    running = true
    pending = false

    try {
        await run('npm', ['run', `mobile:sync:${platform}`])
        console.log(`[mobile] ${platform} sync complete.`)
    } catch (error) {
        console.error(`[mobile] ${error.message}`)
    } finally {
        running = false
        if (pending) sync()
    }
}

console.log(`[mobile] Watching JS/TS/Vue/CSS/assets and syncing Capacitor ${platform}. Press Ctrl+C to stop.`)
lastSignature = await signature()
await sync()

setInterval(async () => {
    const next = await signature()
    if (next !== lastSignature) {
        lastSignature = next
        await sync()
    }
}, 1200)
