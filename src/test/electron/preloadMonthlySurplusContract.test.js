import fs from 'node:fs'
import path from 'node:path'
import {describe, expect, it} from 'vitest'
import vm from 'node:vm'

const preloadPath = path.resolve(process.cwd(), 'electron', 'preload.js')
const preloadSource = fs.readFileSync(preloadPath, 'utf8')

describe('preload monthly surplus contract', () => {
    it('exposes monthly surplus estimation through the goals bridge', async () => {
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

        await exposed.goals.estimateMonthlySurplus({
            currency: 'CAD',
            manualMonthlyContribution: 250,
            referenceDate: '2026-05-01',
        })

        expect(calls).toEqual([
            [
                'db:goalProjection:monthlySurplus:estimate',
                {
                    currency: 'CAD',
                    manualMonthlyContribution: 250,
                    referenceDate: '2026-05-01',
                },
            ],
        ])
    })
})
