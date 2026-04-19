const fs = require('node:fs')
const path = require('node:path')
const {app} = require('electron')

function ensureParentDir(filePath) {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {recursive: true})
    }
}

function resolveDatabasePath() {
    if (!app.isPackaged) {
        const repoRoot = path.resolve(__dirname, '..', '..')
        const dbPath = path.join(repoRoot, 'prisma', 'dev.db')
        ensureParentDir(dbPath)
        return dbPath
    }

    const userDataPath = app.getPath('userData')
    const dbPath = path.join(userDataPath, 'data', 'app.db')
    ensureParentDir(dbPath)
    return dbPath
}

module.exports = {resolveDatabasePath}