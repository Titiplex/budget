import fs from 'node:fs'
import path from 'node:path'
import {describe, expect, it} from 'vitest'
import vm from 'node:vm'

const preloadPath = path.resolve(process.cwd(), 'electron', 'preload.js')
const preloadSource = fs.readFileSync(preloadPath, 'utf8')

describe('preload financial goals contract', () => {
    it('exposes goals only once', () => {
        const matches = preloadSource.match(/exposeInMainWorld\(['"]goals['"]/g) || []

        expect(matches).toHaveLength(1)
    })

    it('exposes the full financial goal preload contract with production IPC channels', async () => {
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

        await exposed.goals.listFinancialGoals({status: 'ACTIVE'})
        await exposed.goals.getFinancialGoal(1)
        await exposed.goals.createFinancialGoal({name: 'Goal', type: 'SAVINGS', targetAmount: 100, currency: 'CAD'})
        await exposed.goals.updateFinancialGoal(1, {targetAmount: 200})
        await exposed.goals.deleteFinancialGoal(1)

        expect(calls.map(([channel]) => channel)).toEqual([
            'db:financialGoal:list',
            'db:financialGoal:get',
            'db:financialGoal:create',
            'db:financialGoal:update',
            'db:financialGoal:delete',
        ])
        expect(calls[3]).toEqual(['db:financialGoal:update', 1, {targetAmount: 200}])
    })
})
