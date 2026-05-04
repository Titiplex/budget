import Module from 'node:module'
import {afterEach, describe, expect, it, vi} from 'vitest'

const originalLoad = Module._load
const handlers = new Map()
const ipcMain = {
    handle: vi.fn((channel, callback) => {
        handlers.set(channel, callback)
    }),
}

const projectionScenarioColumns = [
    'id',
    'name',
    'kind',
    'description',
    'isDefault',
    'createdAt',
    'updatedAt',
    'monthlySurplus',
    'annualGrowthRate',
    'annualInflationRate',
    'horizonMonths',
    'currency',
    'isActive',
    'notes',
]

function clearCommonJsCache() {
    for (const modulePath of [
        '../../../electron/ipc/registerProjectionScenarioHandlers',
        '../../../electron/db',
        '../../../electron/goals/projectionScenarioService',
    ]) {
        try {
            delete require.cache[require.resolve(modulePath)]
        } catch (_error) {
            // Module was not loaded yet.
        }
    }
}

function installCommonJsMocks() {
    Module._load = function loadWithProjectionScenarioIpcMocks(request, parent, isMain) {
        if (request === 'electron') return {ipcMain}
        if (request === '../db' || request.endsWith('/db') || request.endsWith('electron/db')) {
            return {getPrisma: () => ({})}
        }

        return originalLoad.apply(this, arguments)
    }
}

afterEach(() => {
    Module._load = originalLoad
    handlers.clear()
    ipcMain.handle.mockClear()
    clearCommonJsCache()
})

function createSqlPrisma() {
    const rows = []
    const columns = new Set(projectionScenarioColumns)
    let nextId = 1

    return {
        rows,
        prisma: {
            async $queryRawUnsafe(sql) {
                if (sql.startsWith('PRAGMA table_info("ProjectionScenario")')) {
                    return [...columns].map((name, index) => ({cid: index, name}))
                }

                if (sql.includes('WHERE "id" =')) {
                    const id = Number(sql.match(/WHERE "id" = (\d+)/)?.[1])
                    return rows.filter((row) => row.id === id)
                }

                if (sql.includes('WHERE "name" =')) {
                    const name = sql.match(/WHERE "name" = '([^']+)'/)?.[1]
                    return rows.filter((row) => row.name === name)
                }

                return [...rows]
            },
            async $executeRawUnsafe(sql) {
                if (sql.startsWith('ALTER TABLE "ProjectionScenario" ADD COLUMN')) {
                    const columnName = sql.match(/ADD COLUMN "([^"]+)"/)?.[1]
                    if (columnName) columns.add(columnName)
                    return 1
                }

                if (sql.startsWith('CREATE INDEX IF NOT EXISTS')) return 1

                if (sql.startsWith('INSERT INTO "ProjectionScenario"')) {
                    const valuesBlock = sql.match(/VALUES\s*\(([\s\S]+)\)\s*$/)?.[1]
                    const values = valuesBlock.split(/,\s*(?=(?:[^']*'[^']*')*[^']*$)/).map((value) => value.trim())
                    const clean = (value) => value === 'NULL' ? null : value === 'true' ? true : value === 'false' ? false : value.startsWith("'") ? value.slice(1, -1) : Number(value)
                    rows.push({
                        id: nextId++,
                        name: clean(values[0]),
                        kind: clean(values[1]),
                        description: clean(values[2]),
                        isDefault: clean(values[3]),
                        monthlySurplus: clean(values[4]),
                        annualGrowthRate: clean(values[5]),
                        annualInflationRate: clean(values[6]),
                        horizonMonths: clean(values[7]),
                        currency: clean(values[8]),
                        isActive: clean(values[9]),
                        notes: clean(values[10]),
                    })
                    return 1
                }

                if (sql.startsWith('UPDATE "ProjectionScenario"')) {
                    const id = Number(sql.match(/WHERE "id" = (\d+)/)?.[1])
                    const row = rows.find((entry) => entry.id === id)
                    if (row && sql.includes('"isActive" = false')) row.isActive = false
                    return 1
                }

                return 1
            },
        },
    }
}

describe('projection scenario IPC handlers', () => {
    it('registers scenario CRUD channels and returns safe success envelopes', async () => {
        clearCommonJsCache()
        installCommonJsMocks()
        const {registerProjectionScenarioHandlers} = require('../../../electron/ipc/registerProjectionScenarioHandlers')
        const {prisma} = createSqlPrisma()

        registerProjectionScenarioHandlers({ipc: ipcMain, prisma})

        expect([...handlers.keys()]).toEqual(expect.arrayContaining([
            'db:projectionScenario:ensureDefaults',
            'db:projectionScenario:list',
            'db:projectionScenario:get',
            'db:projectionScenario:create',
            'db:projectionScenario:update',
            'db:projectionScenario:delete',
        ]))

        const defaults = await handlers.get('db:projectionScenario:ensureDefaults')({})
        const created = await handlers.get('db:projectionScenario:create')({}, {
            name: 'Custom scenario',
            kind: 'optimistic',
            monthlySurplus: 1000,
            annualGrowthRate: 0.05,
            horizonMonths: 36,
            currency: 'CAD',
        })

        expect(defaults.ok).toBe(true)
        expect(defaults.data).toHaveLength(3)
        expect(created).toMatchObject({ok: true, data: {name: 'Custom scenario', kind: 'OPTIMISTIC'}, error: null})
    })

    it('returns validation errors instead of throwing raw exceptions', async () => {
        clearCommonJsCache()
        installCommonJsMocks()
        const {registerProjectionScenarioHandlers} = require('../../../electron/ipc/registerProjectionScenarioHandlers')
        const {prisma} = createSqlPrisma()

        registerProjectionScenarioHandlers({ipc: ipcMain, prisma})

        const result = await handlers.get('db:projectionScenario:create')({}, {
            name: 'Bad scenario',
            kind: 'base',
            monthlySurplus: 100,
            horizonMonths: -1,
            currency: 'CAD',
        })

        expect(result.ok).toBe(false)
        expect(result.data).toBeNull()
        expect(result.error).toMatchObject({code: 'invalidHorizon', field: 'horizonMonths'})
    })
})
