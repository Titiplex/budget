const fs = require('node:fs')
const path = require('node:path')

const PACKAGED_DATABASE_RELATIVE_PATH = path.join('assets', 'database', 'app.db')

function getElectronApp() {
    const electron = require('electron')

    if (!electron || !electron.app) {
        throw new Error('Electron app API is unavailable. Pass an app-like object to resolveDatabasePathForApp() in tests.')
    }

    return electron.app
}

function ensureParentDir(filePath) {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {recursive: true})
    }
}

function resolvePackagedDatabaseTemplatePath(appPath) {
    if (!appPath) {
        throw new Error('Cannot resolve packaged database template path without an Electron app path.')
    }

    return path.join(appPath, PACKAGED_DATABASE_RELATIVE_PATH)
}

function assertReadableDatabaseTemplate(templatePath) {
    if (!fs.existsSync(templatePath)) {
        throw new Error(
            `Packaged database template is missing at ${templatePath}. Run npm run build:packaged-db before packaging.`,
        )
    }

    const stats = fs.statSync(templatePath)
    if (!stats.isFile() || stats.size === 0) {
        throw new Error(`Packaged database template is empty or invalid at ${templatePath}.`)
    }
}

function copyDatabaseTemplate(templatePath, dbPath) {
    assertReadableDatabaseTemplate(templatePath)
    fs.writeFileSync(dbPath, fs.readFileSync(templatePath))
}

function shouldSeedPackagedDatabase(dbPath) {
    if (!fs.existsSync(dbPath)) {
        return true
    }

    return fs.statSync(dbPath).size === 0
}

function resolveDatabasePathForApp(appApi, options = {}) {
    if (!appApi) {
        throw new Error('An Electron app-like object is required to resolve the database path.')
    }

    if (!appApi.isPackaged) {
        const repoRoot = options.repoRoot || path.resolve(__dirname, '..', '..')
        const dbPath = path.join(repoRoot, 'prisma', 'dev.db')
        ensureParentDir(dbPath)
        return dbPath
    }

    const userDataPath = options.userDataPath || appApi.getPath('userData')
    const dbPath = options.dbPath || path.join(userDataPath, 'data', 'app.db')
    ensureParentDir(dbPath)

    if (shouldSeedPackagedDatabase(dbPath)) {
        const appPath = options.appPath || appApi.getAppPath()
        const templatePath = options.templatePath || resolvePackagedDatabaseTemplatePath(appPath)
        copyDatabaseTemplate(templatePath, dbPath)
    }

    return dbPath
}

function resolveDatabasePath(options = {}) {
    return resolveDatabasePathForApp(getElectronApp(), options)
}

module.exports = {
    PACKAGED_DATABASE_RELATIVE_PATH,
    ensureParentDir,
    resolveDatabasePath,
    resolveDatabasePathForApp,
    resolvePackagedDatabaseTemplatePath,
}
