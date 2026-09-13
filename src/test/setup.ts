import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {config} from '@vue/test-utils'
import type {Plugin} from 'vue'
import Module from 'node:module'

import {i18n} from '../i18n'

const originalLoad = (Module as any)._load

type TestPlugin = Plugin | [Plugin, ...unknown[]]

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

const existingPlugins = (config.global.plugins || []) as TestPlugin[]
config.global.plugins = [
    ...existingPlugins,
    i18n as unknown as Plugin,
]

beforeEach(() => {
    i18n.global.locale.value = 'fr'
})

function clearTestLocalStorage() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.clear()
        }
    } catch {
        // jsdom/Node can expose a window without storage depending on runtime flags.
    }
}

afterEach(() => {
    vi.restoreAllMocks()
    clearTestLocalStorage()
    document.documentElement.className = ''
    i18n.global.locale.value = 'fr'
})