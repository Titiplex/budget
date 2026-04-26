const fs = require('node:fs')
const path = require('node:path')
const {spawnSync} = require('node:child_process')

const repoRoot = path.resolve(__dirname, '..')
const schemaPath = path.join(repoRoot, 'prisma', 'schema.prisma')
const databaseDir = path.join(repoRoot, 'assets', 'database')
const databasePath = path.join(databaseDir, 'app.db')

function toSqliteUrl(filePath) {
    return `file:${filePath.replace(/\\/g, '/')}`
}

function runPrismaDbPush() {
    const prismaBin = process.platform === 'win32' ? 'npx.cmd' : 'npx'
    return spawnSync(
        prismaBin,
        ['prisma', 'db', 'push', '--skip-generate', '--schema', schemaPath],
        {
            cwd: repoRoot,
            stdio: 'inherit',
            env: {
                ...process.env,
                DATABASE_URL: toSqliteUrl(databasePath),
            },
        },
    )
}

fs.mkdirSync(databaseDir, {recursive: true})
fs.rmSync(databasePath, {force: true})

const result = runPrismaDbPush()
if (result.status !== 0) {
    process.exit(result.status || 1)
}

const stats = fs.statSync(databasePath)
if (!stats.isFile() || stats.size === 0) {
    throw new Error(`Packaged database template was not created at ${databasePath}.`)
}

console.log(`Created packaged database template at ${databasePath}`)
