import Module from 'node:module'
import {afterEach, describe, expect, it, vi} from 'vitest'

const originalLoad = Module._load
const handlers = new Map()
const ipcMain = {
    handle: vi.fn((channel, callback) => {
        handlers.set(channel, callback)
    }),
}

function clearCommonJsCache() {
    for (const modulePath of [
        '../../../electron/ipc/registerGoalHandlers',
        '../../../electron/db',
        '../../../electron/goals/financialGoalService',
    ]) {
        try {
            delete require.cache[require.resolve(modulePath)]
        } catch (_error) {
            // Module was not loaded yet.
        }
    }
}

function installCommonJsMocks() {
    Module._load = function loadWithGoalIpcMocks(request, parent, isMain) {
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

describe('financial goal IPC handlers', () => {
    it('registers the main CRUD channels and returns safe success envelopes', async () => {
        clearCommonJsCache()
        installCommonJsMocks()
        const {registerGoalHandlers} = require('../../../electron/ipc/registerGoalHandlers')
        const prisma = {
            asset: {findUnique: vi.fn()},
            portfolio: {findUnique: vi.fn()},
            liability: {findUnique: vi.fn()},
            netWorthSnapshot: {findUnique: vi.fn()},
            financialGoal: {
                findMany: vi.fn(async () => []),
                findUnique: vi.fn(async ({where}) => ({
                    id: where.id,
                    name: 'Goal',
                    type: 'SAVINGS',
                    targetAmount: 100,
                    currency: 'CAD',
                    status: 'ACTIVE',
                    createdAt: new Date('2026-05-01T00:00:00.000Z'),
                    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
                })),
                create: vi.fn(async ({data}) => ({
                    id: 1,
                    ...data,
                    createdAt: new Date('2026-05-01T00:00:00.000Z'),
                    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
                })),
                update: vi.fn(async ({where, data}) => ({
                    id: where.id,
                    name: 'Goal',
                    type: 'SAVINGS',
                    targetAmount: 100,
                    currency: 'CAD',
                    status: 'ACTIVE',
                    ...data,
                    createdAt: new Date('2026-05-01T00:00:00.000Z'),
                    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
                })),
                delete: vi.fn(async () => ({})),
            },
        }

        registerGoalHandlers({ipc: ipcMain, prisma, now: new Date('2026-05-01T00:00:00.000Z')})

        expect([...handlers.keys()]).toEqual(expect.arrayContaining([
            'db:financialGoal:list',
            'db:financialGoal:get',
            'db:financialGoal:create',
            'db:financialGoal:update',
            'db:financialGoal:delete',
        ]))

        const created = await handlers.get('db:financialGoal:create')({}, {
            name: 'Emergency fund',
            type: 'SAVINGS',
            targetAmount: 500,
            currency: 'CAD',
        })
        const deleted = await handlers.get('db:financialGoal:delete')({}, 1)

        expect(created).toMatchObject({ok: true, data: {name: 'Emergency fund'}, error: null})
        expect(deleted).toEqual({ok: true, data: {ok: true, id: 1, entityType: 'financialGoal'}, error: null})
    })

    it('returns validation errors instead of throwing raw exceptions', async () => {
        clearCommonJsCache()
        installCommonJsMocks()
        const {registerGoalHandlers} = require('../../../electron/ipc/registerGoalHandlers')
        const prisma = {
            asset: {findUnique: vi.fn()},
            portfolio: {findUnique: vi.fn()},
            liability: {findUnique: vi.fn()},
            netWorthSnapshot: {findUnique: vi.fn()},
            financialGoal: {
                findMany: vi.fn(),
                findUnique: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
            },
        }

        registerGoalHandlers({ipc: ipcMain, prisma, now: new Date('2026-05-01T00:00:00.000Z')})

        const result = await handlers.get('db:financialGoal:create')({}, {
            name: '',
            type: 'SAVINGS',
            targetAmount: 0,
            currency: '',
        })

        expect(result.ok).toBe(false)
        expect(result.data).toBeNull()
        expect(result.error).toMatchObject({code: 'invalidName', field: 'name'})
        expect(prisma.financialGoal.create).not.toHaveBeenCalled()
    })
})
