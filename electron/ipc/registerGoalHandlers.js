const {ipcMain} = require('electron')

const {getPrisma} = require('../db')
const {
    createFinancialGoal,
    deleteFinancialGoal,
    getFinancialGoalById,
    listFinancialGoals,
    toGoalIpcError,
    updateFinancialGoal,
} = require('../goals/financialGoalService')

const GOAL_IPC_CHANNELS = Object.freeze({
    LIST: 'db:financialGoal:list',
    GET: 'db:financialGoal:get',
    CREATE: 'db:financialGoal:create',
    UPDATE: 'db:financialGoal:update',
    DELETE: 'db:financialGoal:delete',
})

function ok(data) {
    return {ok: true, data, error: null}
}

function fail(error) {
    return {ok: false, data: null, error: toGoalIpcError(error)}
}

function registerSafeGoalHandler(ipc, channel, handler) {
    ipc.handle(channel, async (_event, ...args) => {
        try {
            return ok(await handler(...args))
        } catch (error) {
            return fail(error)
        }
    })
}

function registerGoalHandlers({ipc = ipcMain, prisma = getPrisma(), now} = {}) {
    const serviceOptions = now ? {now} : {}

    registerSafeGoalHandler(ipc, GOAL_IPC_CHANNELS.LIST, (filters) => listFinancialGoals(prisma, filters))
    registerSafeGoalHandler(ipc, GOAL_IPC_CHANNELS.GET, (id) => getFinancialGoalById(prisma, id))
    registerSafeGoalHandler(ipc, GOAL_IPC_CHANNELS.CREATE, (data) =>
        createFinancialGoal(prisma, data, serviceOptions),
    )
    registerSafeGoalHandler(ipc, GOAL_IPC_CHANNELS.UPDATE, (id, data) =>
        updateFinancialGoal(prisma, id, data, serviceOptions),
    )
    registerSafeGoalHandler(ipc, GOAL_IPC_CHANNELS.DELETE, (id) => deleteFinancialGoal(prisma, id))

    return {
        createFinancialGoal: (data) => createFinancialGoal(prisma, data, serviceOptions),
        deleteFinancialGoal: (id) => deleteFinancialGoal(prisma, id),
        getFinancialGoalById: (id) => getFinancialGoalById(prisma, id),
        listFinancialGoals: (filters) => listFinancialGoals(prisma, filters),
        updateFinancialGoal: (id, data) => updateFinancialGoal(prisma, id, data, serviceOptions),
    }
}

module.exports = {
    GOAL_IPC_CHANNELS,
    fail,
    ok,
    registerGoalHandlers,
    registerSafeGoalHandler,
}
