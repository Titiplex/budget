import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import Module from 'node:module'

const originalLoad = (Module as any)._load

if (!(Module as any).__budgetVitestCjsShimInstalled) {
    ;(Module as any)._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
        if (request === 'vitest') {
            return {
                afterAll,
                afterEach,
                beforeAll,
                beforeEach,
                describe,
                expect,
                it,
                vi,
            }
        }

        return originalLoad.apply(this, arguments as any)
    }
    ;(Module as any).__budgetVitestCjsShimInstalled = true
}

afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    document.documentElement.className = ''
})