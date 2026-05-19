#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const {spawn} = require('node:child_process')

const root = process.cwd()
const platform = process.argv[2] || 'android'
const validPlatforms = new Set(['android', 'ios'])
const ignoredDirs = new Set([
    '.git',
    '.github',
    '.idea',
    '.vscode',
    'android',
    'coverage',
    'dist',
    'ios',
    'node_modules',
    'out',
])
const watchedFiles = new Set([
    'index.html',
    'package.json',
    'vite.config.mjs',
    'capacitor.config.ts',
])
const watchedExtensions = new Set([
    '.cjs',
    '.css',
    '.html',
    '.ico',
    '.jpeg',
    '.jpg',
    '.js',
    '.json',
    '.mjs',
    '.png',
    '.svg',
    '.ts',
    '.vue',
    '.webp',
])

let debounceTimer = null
let running = false
let pending = false
const watchers = []

function relative(filePath) {
    return path.relative(root, filePath).replace(/\\/g, '/')
}

function shouldWatchFile(filePath) {
    const rel = relative(filePath)
    if (watchedFiles.has(rel)) return true
    if (rel.startsWith('src/') || rel.startsWith('assets/')) {
        return watchedExtensions.has(path.extname(filePath).toLowerCase())
    }
    return false
}

function runSync(reason) {
    if (running) {
        pending = true
        return
    }

    running = true
    pending = false
    console.log(`\n[mobile:watch] Sync triggered${reason ? ` by ${reason}` : ''}.`)

    const child = spawn('node', ['scripts/mobile-sync.cjs', platform], {
        cwd: root,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: process.env,
    })

    child.on('exit', (code) => {
        running = false
        if (code !== 0) {
            console.error(`[mobile:watch] Sync failed with exit code ${code}. Watching continues.`)
        }
        if (pending) runSync('queued changes')
    })
}

function scheduleSync(reason) {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => runSync(reason), 900)
}

function watchFile(filePath) {
    try {
        const watcher = fs.watch(filePath, {persistent: true}, () => {
            if (shouldWatchFile(filePath)) scheduleSync(relative(filePath))
        })
        watchers.push(watcher)
    } catch (error) {
        console.warn(`[mobile:watch] Could not watch ${relative(filePath)}: ${error.message}`)
    }
}

function watchDirectory(dirPath) {
    const name = path.basename(dirPath)
    if (ignoredDirs.has(name)) return

    let entries
    try {
        entries = fs.readdirSync(dirPath, {withFileTypes: true})
    } catch (error) {
        console.warn(`[mobile:watch] Could not read ${relative(dirPath)}: ${error.message}`)
        return
    }

    try {
        const watcher = fs.watch(dirPath, {persistent: true}, (eventType, filename) => {
            if (!filename) return
            const changedPath = path.join(dirPath, filename.toString())
            if (fs.existsSync(changedPath)) {
                const stat = fs.statSync(changedPath)
                if (stat.isDirectory()) {
                    watchDirectory(changedPath)
                    return
                }
            }
            if (shouldWatchFile(changedPath)) scheduleSync(relative(changedPath))
        })
        watchers.push(watcher)
    } catch (error) {
        console.warn(`[mobile:watch] Could not watch ${relative(dirPath)}: ${error.message}`)
    }

    for (const entry of entries) {
        const child = path.join(dirPath, entry.name)
        if (entry.isDirectory()) watchDirectory(child)
        else if (shouldWatchFile(child)) watchFile(child)
    }
}

function shutdown() {
    for (const watcher of watchers) watcher.close()
    process.exit(0)
}

async function main() {
    if (!validPlatforms.has(platform)) {
        throw new Error('Usage: node scripts/mobile-watch.cjs <android|ios>')
    }

    if (!fs.existsSync(path.join(root, platform))) {
        throw new Error(`Missing ${platform}/ directory. Run npm run mobile:init:${platform} first.`)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    for (const file of watchedFiles) {
        const filePath = path.join(root, file)
        if (fs.existsSync(filePath)) watchFile(filePath)
    }

    for (const dir of ['src', 'assets']) {
        const dirPath = path.join(root, dir)
        if (fs.existsSync(dirPath)) watchDirectory(dirPath)
    }

    console.log(`[mobile:watch] Watching JS/TS/Vue/CSS/assets for ${platform}.`)
    console.log('[mobile:watch] Keep this process open while you code. Ctrl+C stops it.')
    runSync('startup')
}

main().catch((error) => {
    console.error(`\n[mobile:watch] ${error.message}\n`)
    process.exit(1)
})
