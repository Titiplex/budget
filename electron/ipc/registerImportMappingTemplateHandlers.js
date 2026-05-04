const {app, ipcMain} = require('electron')

const {
    createMappingTemplate,
    defaultTemplateStore,
    deleteMappingTemplate,
    duplicateMappingTemplate,
    getMappingTemplate,
    listMappingTemplates,
    saveTemplateFromSuccessfulImport,
    toMappingTemplateIpcError,
    updateMappingTemplate,
    validateMappingTemplate,
} = require('../import/mappingTemplateService')

const IMPORT_MAPPING_TEMPLATE_IPC_CHANNELS = Object.freeze({
    LIST: 'import:mappingTemplate:list',
    GET: 'import:mappingTemplate:get',
    CREATE: 'import:mappingTemplate:create',
    UPDATE: 'import:mappingTemplate:update',
    DELETE: 'import:mappingTemplate:delete',
    DUPLICATE: 'import:mappingTemplate:duplicate',
    VALIDATE: 'import:mappingTemplate:validate',
    SAVE_FROM_IMPORT: 'import:mappingTemplate:saveFromImport',
})

function ok(data) {
    return {ok: true, data, error: null}
}

function fail(error) {
    return {ok: false, data: null, error: toMappingTemplateIpcError(error)}
}

function registerSafeImportMappingTemplateHandler(ipc, channel, handler) {
    ipc.handle(channel, async (_event, ...args) => {
        try {
            return ok(await handler(...args))
        } catch (error) {
            return fail(error)
        }
    })
}

function registerImportMappingTemplateHandlers({ipc = ipcMain, store = defaultTemplateStore(app)} = {}) {
    registerSafeImportMappingTemplateHandler(ipc, IMPORT_MAPPING_TEMPLATE_IPC_CHANNELS.LIST, (filters) =>
        listMappingTemplates(store, filters),
    )
    registerSafeImportMappingTemplateHandler(ipc, IMPORT_MAPPING_TEMPLATE_IPC_CHANNELS.GET, (id) =>
        getMappingTemplate(store, id),
    )
    registerSafeImportMappingTemplateHandler(ipc, IMPORT_MAPPING_TEMPLATE_IPC_CHANNELS.CREATE, (data) =>
        createMappingTemplate(store, data),
    )
    registerSafeImportMappingTemplateHandler(ipc, IMPORT_MAPPING_TEMPLATE_IPC_CHANNELS.UPDATE, (id, data) =>
        updateMappingTemplate(store, id, data),
    )
    registerSafeImportMappingTemplateHandler(ipc, IMPORT_MAPPING_TEMPLATE_IPC_CHANNELS.DELETE, (id) =>
        deleteMappingTemplate(store, id),
    )
    registerSafeImportMappingTemplateHandler(ipc, IMPORT_MAPPING_TEMPLATE_IPC_CHANNELS.DUPLICATE, (id, overrides) =>
        duplicateMappingTemplate(store, id, overrides),
    )
    registerSafeImportMappingTemplateHandler(ipc, IMPORT_MAPPING_TEMPLATE_IPC_CHANNELS.VALIDATE, (data) =>
        validateMappingTemplate(data),
    )
    registerSafeImportMappingTemplateHandler(ipc, IMPORT_MAPPING_TEMPLATE_IPC_CHANNELS.SAVE_FROM_IMPORT, (input) =>
        saveTemplateFromSuccessfulImport(store, input),
    )

    return {
        createMappingTemplate: (data) => createMappingTemplate(store, data),
        deleteMappingTemplate: (id) => deleteMappingTemplate(store, id),
        duplicateMappingTemplate: (id, overrides) => duplicateMappingTemplate(store, id, overrides),
        getMappingTemplate: (id) => getMappingTemplate(store, id),
        listMappingTemplates: (filters) => listMappingTemplates(store, filters),
        saveTemplateFromSuccessfulImport: (input) => saveTemplateFromSuccessfulImport(store, input),
        updateMappingTemplate: (id, data) => updateMappingTemplate(store, id, data),
        validateMappingTemplate,
    }
}

module.exports = {
    IMPORT_MAPPING_TEMPLATE_IPC_CHANNELS,
    fail,
    ok,
    registerImportMappingTemplateHandlers,
    registerSafeImportMappingTemplateHandler,
}
