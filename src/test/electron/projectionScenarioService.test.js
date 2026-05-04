import {createRequire} from 'node:module'
import {describe, expect, it} from 'vitest'

const require = createRequire(import.meta.url)
const {
    createProjectionScenario,
    deleteProjectionScenario,
    ensureDefaultProjectionScenarios,
    getProjectionScenarioById,
    listProjectionScenarios,
    updateProjectionScenario,
} = require('../../../electron/goals/projectionScenarioService.js')

const baseScenarioColumns = [
    'id',
    'name',
    'kind',
    'description',
    'isDefault',
    'createdAt',
    'updatedAt',
    'monthlySurplus',
    'annualGrowthRate',
    'annualInflationRate',
    'horizonMonths',
    'currency',
    'isActive',
    'notes',
]

function createFakePrisma(seed = [], options = {}) {
    const rows = seed.map((row) => ({...row}))
    const columns = new Set(options.columns || baseScenarioColumns)
    let nextId = 1 + Math.max(0, ...rows.map((row) => Number(row.id) || 0))

    function normalizeSqlValue(value) {
        if (value === 'NULL') return null
        if (value === 'true') return true
        if (value === 'false') return false
        if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)
        if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'")
        return value
    }

    function extractAssignments(sql) {
        const setMatch = sql.match(/SET\s+([\s\S]+?)\s+WHERE/i)
        if (!setMatch) return {}

        return Object.fromEntries(
            setMatch[1]
                .split(/,\s*(?=\"[^\"]+\"\s*=)/)
                .map((assignment) => {
                    const match = assignment.match(/\"([^\"]+)\"\s*=\s*([\s\S]+)/)
                    return match ? [match[1], normalizeSqlValue(match[2].trim())] : null
                })
                .filter(Boolean),
        )
    }

    function assertKnownColumns(sql) {
        const insertColumnsMatch = sql.match(/INSERT INTO "ProjectionScenario"\s*\(([\s\S]+?)\)\s*VALUES/i)
        if (insertColumnsMatch) {
            for (const column of [...insertColumnsMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1])) {
                if (!columns.has(column)) throw new Error(`table ProjectionScenario has no column named ${column}`)
            }
        }

        const updateColumnsMatch = sql.match(/UPDATE "ProjectionScenario" SET ([\s\S]+?) WHERE/i)
        if (updateColumnsMatch) {
            for (const column of [...updateColumnsMatch[1].matchAll(/"([^"]+)"\s*=/g)].map((match) => match[1])) {
                if (!columns.has(column)) throw new Error(`table ProjectionScenario has no column named ${column}`)
            }
        }
    }

    return {
        rows,
        columns,
        prisma: {
            async $queryRawUnsafe(sql) {
                if (sql.startsWith('PRAGMA table_info("ProjectionScenario")')) {
                    return [...columns].map((name, index) => ({cid: index, name}))
                }

                if (sql.includes('WHERE "id" =')) {
                    const id = Number(sql.match(/WHERE "id" = (\d+)/)?.[1])
                    return rows.filter((row) => row.id === id)
                }

                if (sql.includes('WHERE "name" =')) {
                    const name = sql.match(/WHERE "name" = '([^']+)'/)?.[1]
                    return rows.filter((row) => row.name === name)
                }

                let result = [...rows]

                if (sql.includes('"kind" =')) {
                    const kind = sql.match(/"kind" = '([^']+)'/)?.[1]
                    result = result.filter((row) => row.kind === kind)
                }

                if (sql.includes('"currency" =')) {
                    const currency = sql.match(/"currency" = '([^']+)'/)?.[1]
                    result = result.filter((row) => row.currency === currency)
                }

                if (sql.includes('"isActive" = false')) {
                    result = result.filter((row) => row.isActive === false)
                } else if (sql.includes('"isActive" = true')) {
                    result = result.filter((row) => row.isActive === true)
                }

                return result.sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name))
            },
            async $executeRawUnsafe(sql) {
                if (sql.startsWith('ALTER TABLE "ProjectionScenario" ADD COLUMN')) {
                    const columnName = sql.match(/ADD COLUMN "([^"]+)"/)?.[1]
                    if (columnName) columns.add(columnName)
                    return 1
                }

                if (sql.startsWith('CREATE INDEX IF NOT EXISTS')) return 1

                assertKnownColumns(sql)

                if (sql.startsWith('INSERT INTO "ProjectionScenario"')) {
                    const valuesBlock = sql.match(/VALUES\s*\(([\s\S]+)\)\s*$/)?.[1]
                    const values = valuesBlock
                        .split(/,\s*(?=(?:[^']*'[^']*')*[^']*$)/)
                        .map((value) => normalizeSqlValue(value.trim()))
                    const row = {
                        id: nextId++,
                        name: values[0],
                        kind: values[1],
                        description: values[2],
                        isDefault: values[3],
                        monthlySurplus: values[4],
                        annualGrowthRate: values[5],
                        annualInflationRate: values[6],
                        horizonMonths: values[7],
                        currency: values[8],
                        isActive: values[9],
                        notes: values[10],
                        createdAt: new Date('2026-05-01T12:00:00.000Z'),
                        updatedAt: new Date('2026-05-01T12:00:00.000Z'),
                    }
                    rows.push(row)
                    return 1
                }

                if (sql.startsWith('UPDATE "ProjectionScenario"')) {
                    const id = Number(sql.match(/WHERE "id" = (\d+)/)?.[1])
                    const index = rows.findIndex((row) => row.id === id)
                    if (index < 0) return 0
                    rows[index] = {...rows[index], ...extractAssignments(sql), updatedAt: new Date('2026-05-01T12:01:00.000Z')}
                    return 1
                }

                if (sql.startsWith('DELETE FROM "ProjectionScenario"')) {
                    const id = Number(sql.match(/WHERE "id" = (\d+)/)?.[1])
                    const index = rows.findIndex((row) => row.id === id)
                    if (index >= 0) rows.splice(index, 1)
                    return 1
                }

                throw new Error(`Unsupported SQL in fake prisma: ${sql}`)
            },
        },
    }
}

describe('projection scenario service', () => {
    it('ensures the three editable default scenarios', async () => {
        const {rows, prisma} = createFakePrisma()

        const defaults = await ensureDefaultProjectionScenarios(prisma)

        expect(defaults.map((scenario) => scenario.kind).sort()).toEqual(['BASE', 'OPTIMISTIC', 'PESSIMISTIC'])
        expect(defaults.every((scenario) => scenario.isDefault)).toBe(true)
        expect(defaults.every((scenario) => scenario.isActive)).toBe(true)
        expect(rows).toHaveLength(3)
    })

    it('heals legacy scenario tables missing assumption columns before querying', async () => {
        const legacyColumns = ['id', 'name', 'kind', 'description', 'isDefault', 'createdAt', 'updatedAt']
        const {columns, prisma} = createFakePrisma([], {columns: legacyColumns})

        const defaults = await ensureDefaultProjectionScenarios(prisma)

        expect(defaults).toHaveLength(3)
        expect(columns).toEqual(expect.objectContaining ? columns : columns)
        expect([...columns]).toEqual(expect.arrayContaining([
            'monthlySurplus',
            'annualGrowthRate',
            'annualInflationRate',
            'horizonMonths',
            'currency',
            'isActive',
            'notes',
        ]))
    })

    it('creates, lists, fetches and updates custom scenario assumptions', async () => {
        const {prisma} = createFakePrisma()

        const created = await createProjectionScenario(prisma, {
            name: 'Custom family plan',
            kind: 'base',
            monthlySurplus: 900,
            annualGrowthRate: 0.04,
            annualInflationRate: 0.025,
            horizonYears: 3,
            currency: 'cad',
            notes: 'Manual assumptions only',
        })

        expect(created.kind).toBe('BASE')
        expect(created.dbKind).toBe('BASELINE')
        expect(created.horizonMonths).toBe(36)
        expect(created.currency).toBe('CAD')

        const fetched = await getProjectionScenarioById(prisma, created.id)
        expect(fetched.name).toBe('Custom family plan')

        const updated = await updateProjectionScenario(prisma, created.id, {
            monthlySurplus: 950,
            annualInflationRate: null,
            isActive: false,
        })
        expect(updated.monthlySurplus).toBe(950)
        expect(updated.annualInflationRate).toBeNull()
        expect(updated.isActive).toBe(false)

        const listed = await listProjectionScenarios(prisma, {isActive: false})
        expect(listed.map((scenario) => scenario.id)).toContain(created.id)
    })

    it('deactivates default scenarios instead of deleting them', async () => {
        const {rows, prisma} = createFakePrisma([
            {
                id: 1,
                name: 'Base',
                kind: 'BASELINE',
                isDefault: true,
                monthlySurplus: 500,
                horizonMonths: 24,
                currency: 'CAD',
                isActive: true,
            },
        ])

        const result = await deleteProjectionScenario(prisma, 1)

        expect(result).toEqual({ok: true, id: 1, entityType: 'projectionScenario', deactivated: true})
        expect(rows).toHaveLength(1)
        expect(rows[0].isActive).toBe(false)
    })

    it('rejects invalid assumptions cleanly', async () => {
        const {prisma} = createFakePrisma()

        await expect(createProjectionScenario(prisma, {
            name: '',
            kind: 'BASE',
            monthlySurplus: 100,
            horizonMonths: 12,
            currency: 'CAD',
        })).rejects.toMatchObject({code: 'invalidScenarioName'})

        await expect(createProjectionScenario(prisma, {
            name: 'Invalid horizon',
            kind: 'BASE',
            monthlySurplus: 100,
            horizonMonths: 0,
            currency: 'CAD',
        })).rejects.toMatchObject({code: 'invalidHorizon'})

        await expect(createProjectionScenario(prisma, {
            name: 'Invalid rate',
            kind: 'BASE',
            monthlySurplus: 100,
            annualGrowthRate: 2,
            horizonMonths: 12,
            currency: 'CAD',
        })).rejects.toMatchObject({code: 'invalidRate'})

        await expect(createProjectionScenario(prisma, {
            name: 'Invalid currency',
            kind: 'BASE',
            monthlySurplus: 100,
            horizonMonths: 12,
            currency: 'CAD$'
        })).rejects.toMatchObject({code: 'invalidCurrency'})
    })
})
