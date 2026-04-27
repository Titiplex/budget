const fs = require('node:fs')
const path = require('node:path')
const {spawnSync} = require('node:child_process')

const repoRoot = path.resolve(__dirname, '..')
const schemaPath = path.join(repoRoot, 'prisma', 'schema.prisma')
const databaseDir = path.join(repoRoot, 'assets', 'database')
const databasePath = path.join(databaseDir, 'app.db')
const prismaBin = path.join(
    repoRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
)

function toSqliteUrl(filePath) {
    return `file:${filePath.replace(/\\/g, '/')}`
}

function runPrismaDbPush() {
    return spawnSync(
        prismaBin,
        ['db', 'push', '--skip-generate', '--schema', schemaPath],
        {
            cwd: repoRoot,
            stdio: 'inherit',
            shell: process.platform === 'win32',
            env: {
                ...process.env,
                DATABASE_URL: toSqliteUrl(databasePath),
            },
        },
    )
}

fs.mkdirSync(databaseDir, {recursive: true})
fs.rmSync(databasePath, {force: true})

console.log(`Building packaged database template at ${databasePath}`)
console.log(`Using Prisma binary at ${prismaBin}`)

const result = runPrismaDbPush()
if (result.error) {
    console.error('Failed to start Prisma db push for packaged database template.')
    console.error(result.error)
    process.exit(1)
}

if (result.status !== 0) {
    console.error(`Prisma db push failed with exit code ${result.status}.`)
    process.exit(result.status || 1)
}

const stats = fs.statSync(databasePath)
if (!stats.isFile() || stats.size === 0) {
    throw new Error(`Packaged database template was not created at ${databasePath}.`)
}

console.log(`Created packaged database template at ${databasePath}`)
