const fs = require('node:fs')
const path = require('node:path')
const {app} = require('electron')

function resolveDatabasePath() {
    if (!app.isPackaged) {
        return path.join(app.getAppPath(), 'prisma', 'dev.db')
    }

    const userDataPath = app.getPath('userData')
    const dbDir = path.join(userDataPath, 'data')

    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, {recursive: true})
    }

    return path.join(dbDir, 'app.db')
}

module.exports = {resolveDatabasePath}