import Module from 'node:module'
import {afterEach, describe, expect, it, vi} from 'vitest'

const originalLoad = Module._load
const handlers = new Map()
const ipc = {
    handle: vi.fn((channel, callback) => handlers.set(channel, callback)),
}

function clearCommonJsCache() {
    for (const modulePath of [
        '../../../electron/ipc/registerIntegrityCheckHandlers',
    ]) {
        try {
            delete require.cache[require.resolve(modulePath)]
        } catch (_error) {
            // ignore
        }
    }
}

function installElectronMock() {
    Module._load = function loadWithMocks(request) {
        if (request === 'electron') {
            return {ipcMain: ipc}
        }
        return originalLoad.apply(this, arguments)
    }
}

afterEach(() => {
    Module._load = originalLoad
    handlers.clear()
    ipc.handle.mockClear()
    clearCommonJsCache()
})

describe('integrity check IPC handlers', () => {
    it('exposes a manual integrity check channel with structured responses', async () => {
        installElectronMock()
        const {INTEGRITY_CHECK_IPC_CHANNELS, registerIntegrityCheckHandlers} = require('../../../electron/ipc/registerIntegrityCheckHandlers')
        const report = {ok: true, totals: {info: 0, warning: 0, error: 0, critical: 0}, issues: []}
        const service = {run: vi.fn(async () => report)}

        registerIntegrityCheckHandlers({ipc, service})

        expect([...handlers.keys()]).toEqual([INTEGRITY_CHECK_IPC_CHANNELS.RUN])
        const result = await handlers.get(INTEGRITY_CHECK_IPC_CHANNELS.RUN)({}, {source: 'manual'})

        expect(result).toEqual({ok: true, data: report, error: null})
        expect(service.run).toHaveBeenCalledWith(expect.objectContaining({
            source: 'manual',
            reason: 'manual-check',
        }))
    })

    it('wraps integrity errors instead of throwing into the renderer', async () => {
        installElectronMock()
        const {INTEGRITY_CHECK_IPC_CHANNELS, registerIntegrityCheckHandlers} = require('../../../electron/ipc/registerIntegrityCheckHandlers')
        const service = {run: vi.fn(async () => { throw new Error('database unavailable') })}

        registerIntegrityCheckHandlers({ipc, service})
        const result = await handlers.get(INTEGRITY_CHECK_IPC_CHANNELS.RUN)({}, {source: 'manual'})

        expect(result).toEqual({
            ok: false,
            data: null,
            error: {code: 'INTEGRITY_CHECK_FAILED', message: 'database unavailable'},
        })
    })
})
