import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {afterEach, beforeEach, vi} from 'vitest'

export const DEFAULT_FIXED_TEST_NOW = '2026-01-15T12:00:00.000Z'

export interface FlakyTrackingMetadata {
    issueUrl: string
    reason: string
    expiresOn: string
}

export interface TempTestDir {
    path: string
    cleanup: () => void
}

export interface IsolatedSqliteDatabase {
    rootDir: string
    dbPath: string
    databaseUrl: string
    cleanup: () => void
}

export interface WaitForStableConditionOptions {
    timeoutMs?: number
    intervalMs?: number
    stableSamples?: number
    message?: string
}

function normalizeDate(value: string | Date) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid fixed test clock date: ${String(value)}`)
    }
    return date
}

function sqliteUrl(filePath: string) {
    return `file:${filePath.replace(/\\/g, '/')}`
}

export function useFixedTestClock(now: string | Date = DEFAULT_FIXED_TEST_NOW) {
    const fixedNow = normalizeDate(now)

    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(fixedNow)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    return fixedNow
}

export function createTempTestDir(prefix = 'budget-test-'): TempTestDir {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))

    return {
        path: root,
        cleanup: () => cleanupPaths(root),
    }
}

export function cleanupPaths(...pathsToRemove: Array<string | null | undefined>) {
    for (const filePath of pathsToRemove) {
        if (!filePath) continue
        fs.rmSync(filePath, {recursive: true, force: true})
    }
}

export async function withTempDir<T>(
    callback: (dir: string) => T | Promise<T>,
    prefix = 'budget-test-',
): Promise<T> {
    const tempDir = createTempTestDir(prefix)

    try {
        return await callback(tempDir.path)
    } finally {
        tempDir.cleanup()
    }
}

export function createIsolatedSqliteDatabase(prefix = 'budget-db-test-'): IsolatedSqliteDatabase {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    const dbPath = path.join(rootDir, 'data', 'test.db')
    fs.mkdirSync(path.dirname(dbPath), {recursive: true})

    return {
        rootDir,
        dbPath,
        databaseUrl: sqliteUrl(dbPath),
        cleanup: () => cleanupPaths(rootDir),
    }
}

export async function waitForStableCondition<T>(
    read: () => T | Promise<T>,
    predicate: (value: T) => boolean = Boolean,
    options: WaitForStableConditionOptions = {},
): Promise<T> {
    const timeoutMs = options.timeoutMs ?? 3000
    const intervalMs = options.intervalMs ?? 25
    const stableSamples = Math.max(1, options.stableSamples ?? 2)
    const message = options.message ?? 'Condition did not become stable before timeout.'
    const startedAt = Date.now()
    let stableCount = 0
    let lastValue: T | undefined
    let lastError: unknown = null

    while (Date.now() - startedAt <= timeoutMs) {
        try {
            const value = await read()
            lastValue = value

            if (predicate(value)) {
                stableCount += 1
                if (stableCount >= stableSamples) return value
            } else {
                stableCount = 0
            }
        } catch (error) {
            lastError = error
            stableCount = 0
        }

        await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }

    const suffix = lastError instanceof Error
        ? ` Last error: ${lastError.message}`
        : lastValue == null
            ? ''
            : ` Last value: ${JSON.stringify(lastValue)}`

    throw new Error(`${message}${suffix}`)
}

export function validateFlakyTracking(metadata: FlakyTrackingMetadata) {
    if (!/^https:\/\/github\.com\/Titiplex\/budget\/issues\/\d+$/.test(metadata.issueUrl)) {
        throw new Error('A flaky test must reference a Titiplex/budget GitHub issue.')
    }

    if (!metadata.reason.trim()) {
        throw new Error('A flaky test must document the suspected reason.')
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.expiresOn)) {
        throw new Error('A flaky test expiration must use YYYY-MM-DD.')
    }

    const expiry = new Date(`${metadata.expiresOn}T23:59:59.999Z`)
    if (Number.isNaN(expiry.getTime())) {
        throw new Error('A flaky test expiration date is invalid.')
    }

    if (expiry.getTime() < Date.now()) {
        throw new Error(`Flaky tracking expired on ${metadata.expiresOn}. Fix or re-triage the test.`)
    }

    return metadata
}

export function flakyTestName(name: string, metadata: FlakyTrackingMetadata) {
    const valid = validateFlakyTracking(metadata)
    const issueNumber = valid.issueUrl.split('/').pop()
    return `${name} [flaky tracked by #${issueNumber}, expires ${valid.expiresOn}]`
}
