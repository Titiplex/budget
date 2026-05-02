const {ipcMain} = require('electron')

const {getPrisma} = require('../db')
const {
    createProjectionScenario,
    deleteProjectionScenario,
    ensureDefaultProjectionScenarios,
    getProjectionScenarioById,
    listProjectionScenarios,
    toProjectionScenarioIpcError,
    updateProjectionScenario,
} = require('../goals/projectionScenarioService')

const PROJECTION_SCENARIO_IPC_CHANNELS = Object.freeze({
    ENSURE_DEFAULTS: 'db:projectionScenario:ensureDefaults',
    LIST: 'db:projectionScenario:list',
    GET: 'db:projectionScenario:get',
    CREATE: 'db:projectionScenario:create',
    UPDATE: 'db:projectionScenario:update',
    DELETE: 'db:projectionScenario:delete',
})

function ok(data) {
    return {ok: true, data, error: null}
}

function fail(error) {
    return {ok: false, data: null, error: toProjectionScenarioIpcError(error)}
}

function registerSafeProjectionScenarioHandler(ipc, channel, handler) {
    ipc.handle(channel, async (_event, ...args) => {
        try {
            return ok(await handler(...args))
        } catch (error) {
            return fail(error)
        }
    })
}

function registerProjectionScenarioHandlers({ipc = ipcMain, prisma = getPrisma()} = {}) {
    registerSafeProjectionScenarioHandler(ipc, PROJECTION_SCENARIO_IPC_CHANNELS.ENSURE_DEFAULTS, () =>
        ensureDefaultProjectionScenarios(prisma),
    )
    registerSafeProjectionScenarioHandler(ipc, PROJECTION_SCENARIO_IPC_CHANNELS.LIST, (filters) =>
        listProjectionScenarios(prisma, filters),
    )
    registerSafeProjectionScenarioHandler(ipc, PROJECTION_SCENARIO_IPC_CHANNELS.GET, (id) =>
        getProjectionScenarioById(prisma, id),
    )
    registerSafeProjectionScenarioHandler(ipc, PROJECTION_SCENARIO_IPC_CHANNELS.CREATE, (data) =>
        createProjectionScenario(prisma, data),
    )
    registerSafeProjectionScenarioHandler(ipc, PROJECTION_SCENARIO_IPC_CHANNELS.UPDATE, (id, data) =>
        updateProjectionScenario(prisma, id, data),
    )
    registerSafeProjectionScenarioHandler(ipc, PROJECTION_SCENARIO_IPC_CHANNELS.DELETE, (id) =>
        deleteProjectionScenario(prisma, id),
    )

    return {
        createProjectionScenario: (data) => createProjectionScenario(prisma, data),
        deleteProjectionScenario: (id) => deleteProjectionScenario(prisma, id),
        ensureDefaultProjectionScenarios: () => ensureDefaultProjectionScenarios(prisma),
        getProjectionScenarioById: (id) => getProjectionScenarioById(prisma, id),
        listProjectionScenarios: (filters) => listProjectionScenarios(prisma, filters),
        updateProjectionScenario: (id, data) => updateProjectionScenario(prisma, id, data),
    }
}

module.exports = {
    PROJECTION_SCENARIO_IPC_CHANNELS,
    fail,
    ok,
    registerProjectionScenarioHandlers,
    registerSafeProjectionScenarioHandler,
}
