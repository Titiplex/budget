const {PrismaClient} = require('@prisma/client')

const prisma = new PrismaClient()

const PROJECTION_SCENARIO_ASSUMPTION_COLUMNS = [
    ['monthlySurplus', 'REAL NOT NULL DEFAULT 0'],
    ['annualGrowthRate', 'REAL'],
    ['annualInflationRate', 'REAL'],
    ['horizonMonths', 'INTEGER NOT NULL DEFAULT 60'],
    ['currency', "TEXT NOT NULL DEFAULT 'CAD'"],
    ['isActive', 'BOOLEAN NOT NULL DEFAULT true'],
    ['notes', 'TEXT'],
]

const DEMO_SCENARIOS = [
    {
        name: 'Demo pessimistic projection',
        kind: 'CONSERVATIVE',
        description: 'Demo conservative scenario: lower surplus, lower growth, higher inflation.',
        monthlySurplus: 250,
        annualGrowthRate: 0.01,
        annualInflationRate: 0.03,
        horizonMonths: 24,
        currency: 'CAD',
        isDefault: true,
        isActive: true,
        notes: 'Demo assumptions only. Not financial advice or a forecast.',
    },
    {
        name: 'Demo base projection',
        kind: 'BASELINE',
        description: 'Demo baseline scenario: medium surplus, medium growth, medium inflation.',
        monthlySurplus: 500,
        annualGrowthRate: 0.03,
        annualInflationRate: 0.02,
        horizonMonths: 24,
        currency: 'CAD',
        isDefault: true,
        isActive: true,
        notes: 'Demo assumptions only. Not financial advice or a forecast.',
    },
    {
        name: 'Demo optimistic projection',
        kind: 'OPTIMISTIC',
        description: 'Demo optimistic scenario: higher surplus and stronger growth.',
        monthlySurplus: 750,
        annualGrowthRate: 0.05,
        annualInflationRate: 0.02,
        horizonMonths: 24,
        currency: 'CAD',
        isDefault: true,
        isActive: true,
        notes: 'Demo assumptions only. Not financial advice or a forecast.',
    },
]

const DEMO_GOALS = [
    {
        name: 'Demo emergency fund goal',
        type: 'EMERGENCY_FUND',
        targetAmount: 6000,
        currency: 'CAD',
        targetDate: new Date('2027-05-01T00:00:00.000Z'),
        startingAmount: 1000,
        status: 'ACTIVE',
        priority: 1,
        notes: 'Demo goal for validating monthly projections. Not financial advice.',
    },
    {
        name: 'Demo house down payment goal',
        type: 'PURCHASE',
        targetAmount: 25000,
        currency: 'CAD',
        targetDate: new Date('2029-05-01T00:00:00.000Z'),
        startingAmount: 5000,
        status: 'ACTIVE',
        priority: 2,
        notes: 'Demo longer-horizon goal for comparing pessimistic/base/optimistic scenarios.',
    },
    {
        name: 'Demo already reached goal',
        type: 'SAVINGS',
        targetAmount: 1000,
        currency: 'CAD',
        targetDate: null,
        startingAmount: 1500,
        status: 'COMPLETED',
        priority: 3,
        notes: 'Demo edge case for alreadyReached projections.',
    },
]

function sqlString(value) {
    if (value == null) return 'NULL'
    return `'${String(value).replace(/'/g, "''")}'`
}

function sqlNumber(value) {
    if (value == null) return 'NULL'
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return 'NULL'
    return String(parsed)
}

function sqlBoolean(value) {
    return value ? 'true' : 'false'
}

async function ensureProjectionScenarioAssumptionColumns() {
    const rows = await prisma.$queryRawUnsafe('PRAGMA table_info("ProjectionScenario")')
    const existingColumns = new Set(rows.map((row) => row.name))

    for (const [columnName, columnDefinition] of PROJECTION_SCENARIO_ASSUMPTION_COLUMNS) {
        if (!existingColumns.has(columnName)) {
            await prisma.$executeRawUnsafe(
                `ALTER TABLE "ProjectionScenario" ADD COLUMN "${columnName}" ${columnDefinition}`,
            )
        }
    }
}

async function findScenarioByName(name) {
    const rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM "ProjectionScenario" WHERE "name" = ${sqlString(name)} LIMIT 1`,
    )
    return rows[0] || null
}

async function upsertScenario(scenario) {
    const existing = await findScenarioByName(scenario.name)
    const assignments = [
        `"kind" = ${sqlString(scenario.kind)}`,
        `"description" = ${sqlString(scenario.description)}`,
        `"isDefault" = ${sqlBoolean(scenario.isDefault)}`,
        `"monthlySurplus" = ${sqlNumber(scenario.monthlySurplus)}`,
        `"annualGrowthRate" = ${sqlNumber(scenario.annualGrowthRate)}`,
        `"annualInflationRate" = ${sqlNumber(scenario.annualInflationRate)}`,
        `"horizonMonths" = ${sqlNumber(scenario.horizonMonths)}`,
        `"currency" = ${sqlString(scenario.currency)}`,
        `"isActive" = ${sqlBoolean(scenario.isActive)}`,
        `"notes" = ${sqlString(scenario.notes)}`,
        '"updatedAt" = CURRENT_TIMESTAMP',
    ]

    if (existing) {
        await prisma.$executeRawUnsafe(
            `UPDATE "ProjectionScenario" SET ${assignments.join(', ')} WHERE "id" = ${sqlNumber(existing.id)}`,
        )
        return findScenarioByName(scenario.name)
    }

    await prisma.$executeRawUnsafe(`INSERT INTO "ProjectionScenario" (
        "name", "kind", "description", "isDefault", "monthlySurplus", "annualGrowthRate",
        "annualInflationRate", "horizonMonths", "currency", "isActive", "notes", "createdAt", "updatedAt"
    ) VALUES (
        ${sqlString(scenario.name)}, ${sqlString(scenario.kind)}, ${sqlString(scenario.description)},
        ${sqlBoolean(scenario.isDefault)}, ${sqlNumber(scenario.monthlySurplus)}, ${sqlNumber(scenario.annualGrowthRate)},
        ${sqlNumber(scenario.annualInflationRate)}, ${sqlNumber(scenario.horizonMonths)}, ${sqlString(scenario.currency)},
        ${sqlBoolean(scenario.isActive)}, ${sqlString(scenario.notes)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )`)

    return findScenarioByName(scenario.name)
}

async function upsertGoal(goal) {
    const existing = await prisma.financialGoal.findFirst({where: {name: goal.name}})

    if (existing) {
        return prisma.financialGoal.update({
            where: {id: existing.id},
            data: goal,
        })
    }

    return prisma.financialGoal.create({data: goal})
}

async function main() {
    await ensureProjectionScenarioAssumptionColumns()

    const scenarios = []
    for (const scenario of DEMO_SCENARIOS) {
        scenarios.push(await upsertScenario(scenario))
    }

    for (const goal of DEMO_GOALS) {
        await upsertGoal(goal)
    }

    console.log(`Seeded ${DEMO_GOALS.length} demo goals and ${scenarios.length} demo projection scenarios.`)
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (error) => {
        console.error(error)
        await prisma.$disconnect()
        process.exit(1)
    })
