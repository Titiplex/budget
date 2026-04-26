import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {afterEach, describe, expect, it} from 'vitest'

const require = createRequire(import.meta.url)
const {
    resolveDatabasePathForApp,
    resolvePackagedDatabaseTemplatePath,
} = require('../../electron/db/resolveDatabasePath')

const tempDirs = []

function makeTempDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-db-path-'))
    tempDirs.push(dir)
    return dir
}

function fakeApp({isPackaged, userDataPath, appPath}) {
    return {
        isPackaged,
        getPath(name) {
            if (name !== 'userData') {
                throw new Error(`Unexpected Electron path request: ${name}`)
            }

            return userDataPath
        },
        getAppPath() {
            return appPath
        },
    }
}

afterEach(() => {
    while (tempDirs.length > 0) {
        fs.rmSync(tempDirs.pop(), {recursive: true, force: true})
    }
})

describe('resolveDatabasePathForApp', () => {
    it('uses prisma/dev.db inside the repository in development', () => {
        const repoRoot = makeTempDir()
        const app = fakeApp({isPackaged: false})

        const dbPath = resolveDatabasePathForApp(app, {repoRoot})

        expect(dbPath).toBe(path.join(repoRoot, 'prisma', 'dev.db'))
        expect(fs.existsSync(path.dirname(dbPath))).toBe(true)
    })

    it('copies the packaged database template to userData on first launch', () => {
        const appPath = makeTempDir()
        const userDataPath = makeTempDir()
        const templatePath = path.join(appPath, 'assets', 'database', 'app.db')
        fs.mkdirSync(path.dirname(templatePath), {recursive: true})
        fs.writeFileSync(templatePath, 'sqlite-template')

        const app = fakeApp({isPackaged: true, userDataPath, appPath})
        const dbPath = resolveDatabasePathForApp(app)

        expect(dbPath).toBe(path.join(userDataPath, 'data', 'app.db'))
        expect(fs.readFileSync(dbPath, 'utf8')).toBe('sqlite-template')
    })

    it('keeps an existing packaged database so user data survives updates', () => {
        const appPath = makeTempDir()
        const userDataPath = makeTempDir()
        const dbPath = path.join(userDataPath, 'data', 'app.db')
        const templatePath = path.join(appPath, 'assets', 'database', 'app.db')
        fs.mkdirSync(path.dirname(templatePath), {recursive: true})
        fs.mkdirSync(path.dirname(dbPath), {recursive: true})
        fs.writeFileSync(templatePath, 'fresh-template')
        fs.writeFileSync(dbPath, 'existing-user-data')

        const app = fakeApp({isPackaged: true, userDataPath, appPath})

        expect(resolveDatabasePathForApp(app)).toBe(dbPath)
        expect(fs.readFileSync(dbPath, 'utf8')).toBe('existing-user-data')
    })

    it('fails clearly when a packaged build does not contain a database template', () => {
        const appPath = makeTempDir()
        const userDataPath = makeTempDir()
        const app = fakeApp({isPackaged: true, userDataPath, appPath})

        expect(() => resolveDatabasePathForApp(app)).toThrow(/npm run build:packaged-db/)
    })

    it('resolves the packaged database template relative to the app path', () => {
        const appPath = makeTempDir()

        expect(resolvePackagedDatabaseTemplatePath(appPath)).toBe(
            path.join(appPath, 'assets', 'database', 'app.db'),
        )
    })
})
