#!/usr/bin/env node
const {existsSync} = require('node:fs')
const {join} = require('node:path')
const {spawnSync} = require('node:child_process')

const root = process.cwd()
const platform = process.argv[2]
const validPlatforms = new Set(['android', 'ios'])

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

async function main() {
    if (!validPlatforms.has(platform)) {
        throw new Error('Usage: node scripts/mobile-init.cjs <android|ios>')
    }

    console.log(`\n[mobile] Preparing web assets before adding ${platform}...`)
    run('npm', ['run', 'mobile:build:web'])

    if (existsSync(join(root, platform))) {
        console.log(`[mobile] ${platform}/ already exists. Skipping npx cap add ${platform}.`)
    } else {
        console.log(`[mobile] Adding Capacitor ${platform} project...`)
        run(npxCommand(), ['cap', 'add', platform])
    }

    console.log(`[mobile] Syncing ${platform}...`)
    run('node', ['scripts/mobile-sync.cjs', platform])

    console.log(`[mobile] ${platform} is ready. Commit the generated ${platform}/ directory after reviewing native files.\n`)
}

main().catch((error) => {
    console.error(`\n[mobile] ${error.message}\n`)
    process.exit(1)
})
