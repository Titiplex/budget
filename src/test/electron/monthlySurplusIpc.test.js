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
        '../../../electron/ipc/registerMonthlySurplusHandlers',
        '../../../electron/db',
        '../../../electron/goals/monthlySurplusEstimator',
    ]) {
        try {
            delete require.cache[require.resolve(modulePath)]
        } catch (_error) {
            // Module was not loaded yet.
        }
    }
}

function installCommonJsMocks() {
    Module._load = function loadWithMonthlySurplusIpcMocks(request, parent, isMain) {
        if (request === 'electron') return {ipcMain}
        if (request === '../db' || request.endsWith('/db') || request.endsWith('electron/db')) {
            return {getPrisma: () => ({})}
        }

        return originalLoad.apply(this, arguments)
    }
}

function createDelegate(rows) {
    return {
        findMany: vi.fn(async ({where = {}} = {}) => rows.filter((row) => {
            if (where.isActive != null && row.isActive !== where.isActive) return false
            if (where.currency && row.currency !== where.currency) return false
            if (where.sourceCurrency && row.sourceCurrency !== where.sourceCurrency) return false
            if (where.kind?.in && !where.kind.in.includes(row.kind)) return false
            return true
        })),
    }
}

afterEach(() => {
    Module._load = originalLoad
    handlers.clear()
    ipcMain.handle.mockClear()
    clearCommonJsCache()
})

describe('monthly surplus IPC handlers', () => {
    it('registers the estimate channel and returns a safe success envelope', async () => {
        clearCommonJsCache()
        installCommonJsMocks()
        const {registerMonthlySurplusHandlers} = require('../../../electron/ipc/registerMonthlySurplusHandlers')
        const prisma = {
            budgetTarget: createDelegate([]),
            transaction: createDelegate([]),
            recurringTransactionTemplate: createDelegate([
                {id: 1, label: 'Salary', kind: 'INCOME', sourceAmount: 3000, sourceCurrency: 'CAD', frequency: 'MONTHLY', intervalCount: 1, isActive: true},
                {id: 2, label: 'Rent', kind: 'EXPENSE', sourceAmount: 1000, sourceCurrency: 'CAD', frequency: 'MONTHLY', intervalCount: 1, isActive: true},
            ]),
        }

        registerMonthlySurplusHandlers({ipc: ipcMain, prisma})

        expect(handlers.has('db:goalProjection:monthlySurplus:estimate')).toBe(true)

        const result = await handlers.get('db:goalProjection:monthlySurplus:estimate')({}, {
            currency: 'CAD',
            referenceDate: '2026-05-01',
        })

        expect(result).toMatchObject({
            ok: true,
            data: {
                source: 'automaticFromRecurring',
                estimatedMonthlyIncome: 3000,
                estimatedMonthlyExpense: 1000,
                monthlyContributionUsed: 2000,
            },
            error: null,
        })
    })

    it('returns validation errors instead of throwing raw exceptions', async () => {
        clearCommonJsCache()
        installCommonJsMocks()
        const {registerMonthlySurplusHandlers} = require('../../../electron/ipc/registerMonthlySurplusHandlers')
        const prisma = {
            budgetTarget: createDelegate([]),
            transaction: createDelegate([]),
            recurringTransactionTemplate: createDelegate([]),
        }

        registerMonthlySurplusHandlers({ipc: ipcMain, prisma})

        const result = await handlers.get('db:goalProjection:monthlySurplus:estimate')({}, {
            currency: 'CAD',
            manualMonthlyContribution: -10,
        })

        expect(result.ok).toBe(false)
        expect(result.data).toBeNull()
        expect(result.error).toMatchObject({code: 'invalidManualContribution', field: 'manualMonthlyContribution'})
    })
})
