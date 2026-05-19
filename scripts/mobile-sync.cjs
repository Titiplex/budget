#!/usr/bin/env node
const {existsSync} = require('node:fs')
const {join} = require('node:path')
const {spawnSync} = require('node:child_process')

const root = process.cwd()
const validPlatforms = new Set(['android', 'ios'])
const requestedPlatforms = process.argv.slice(2).filter(Boolean)

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: options.cwd || root,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: process.env,
    })

    if (result.status !== 0) {
        const rendered = [command, ...args].join(' ')
        throw new Error(`${rendered} failed with exit code ${result.status ?? 'unknown'}`)
    }
}

function npxCommand() {
    return process.platform === 'win32' ? 'npx.cmd' : 'npx'
}

function existingPlatforms() {
    return ['android', 'ios'].filter((platform) => existsSync(join(root, platform)))
}

function resolvePlatforms() {
    if (requestedPlatforms.length === 0) {
        const existing = existingPlatforms()
        if (existing.length > 0) return existing
        throw new Error('No Capacitor platform directory found. Run npm run mobile:init:android or npm run mobile:init:ios first.')
    }

    const invalid = requestedPlatforms.filter((platform) => !validPlatforms.has(platform))
    if (invalid.length > 0) {
        throw new Error(`Unsupported mobile platform: ${invalid.join(', ')}. Expected android or ios.`)
    }

    const missing = requestedPlatforms.filter((platform) => !existsSync(join(root, platform)))
    if (missing.length > 0) {
        throw new Error(`Missing Capacitor platform directory: ${missing.join(', ')}. Run npm run mobile:init:${missing[0]} first.`)
    }

    return requestedPlatforms
}

async function main() {
    const platforms = resolvePlatforms()

    console.log(`\n[mobile] Building web assets for ${platforms.join(', ')}...`)
    run('npm', ['run', 'mobile:build:web'])

    console.log(`\n[mobile] Syncing Capacitor project${platforms.length > 1 ? 's' : ''}: ${platforms.join(', ')}...`)
    run(npxCommand(), ['cap', 'sync', ...platforms])

    console.log('\n[mobile] Done. Native assets are up to date.\n')
}

main().catch((error) => {
    console.error(`\n[mobile] ${error.message}\n`)
    process.exit(1)
})
