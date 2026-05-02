import fs from 'node:fs'
import path from 'node:path'
import {describe, expect, it} from 'vitest'
import vm from 'node:vm'

const preloadPath = path.resolve(process.cwd(), 'electron', 'preload.js')
const preloadSource = fs.readFileSync(preloadPath, 'utf8')

describe('preload projection scenario contract', () => {
    it('exposes projection scenario methods through the goals bridge', async () => {
        const calls = []
        const exposed = {}

        const sandbox = {
            console,
            process,
            require(moduleName) {
                if (moduleName === 'electron') {
                    return {
                        contextBridge: {
                            exposeInMainWorld(name, value) {
                                exposed[name] = value
                            },
                        },
                        ipcRenderer: {
                            invoke(channel, ...payload) {
                                calls.push([channel, ...payload])

                                return Promise.resolve({
                                    ok: true,
                                    data: null,
                                    error: null,
                                })
                            },
                            send() {},
                            on() {},
                        },
                    }
                }

                return require(moduleName)
            },
        }

        vm.runInNewContext(preloadSource, sandbox, {
            filename: preloadPath,
        })

        expect(exposed.goals).toBeTruthy()

        await exposed.goals.ensureDefaultProjectionScenarios()
        await exposed.goals.listProjectionScenarios({kind: 'BASE'})
        await exposed.goals.getProjectionScenario(1)
        await exposed.goals.createProjectionScenario({
            name: 'Scenario',
            kind: 'OPTIMISTIC',
            monthlySurplus: 1000,
            horizonMonths: 36,
            currency: 'CAD',
        })
        await exposed.goals.updateProjectionScenario(1, {monthlySurplus: 1100})
        await exposed.goals.removeProjectionScenario(1)

        expect(calls.map(([channel]) => channel)).toEqual([
            'db:projectionScenario:ensureDefaults',
            'db:projectionScenario:list',
            'db:projectionScenario:get',
            'db:projectionScenario:create',
            'db:projectionScenario:update',
            'db:projectionScenario:delete',
        ])
        expect(calls[4]).toEqual(['db:projectionScenario:update', 1, {monthlySurplus: 1100}])
    })
})
