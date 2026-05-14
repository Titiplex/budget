import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {config} from '@vue/test-utils'
import Module from 'node:module'

import {i18n} from '../i18n'

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

config.global.plugins = [
    ...((config.global.plugins || []) as unknown[]),
    i18n,
]

beforeEach(() => {
    i18n.global.locale.value = 'fr'
})

afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    document.documentElement.className = ''
    i18n.global.locale.value = 'fr'
})