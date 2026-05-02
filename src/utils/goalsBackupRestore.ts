import type {
    BudgetBackupFinancialGoal,
    BudgetBackupProjectionScenario,
    BudgetBackupProjectionSettings,
    BudgetBackupWithGoalsSnapshot,
} from './goalsJsonBackup'

export interface GoalsBackupApiResult<T> {
    ok: boolean
    data: T | null
    error: {message?: string; code?: string} | null
}

export interface GoalsBackupApi {
    listFinancialGoals: (filters?: unknown) => Promise<GoalsBackupApiResult<Array<{id: number}>>>
    deleteFinancialGoal: (id: number) => Promise<GoalsBackupApiResult<unknown>>
    createFinancialGoal: (data: Record<string, unknown>) => Promise<GoalsBackupApiResult<{id: number}>>
    listProjectionScenarios: (filters?: unknown) => Promise<GoalsBackupApiResult<Array<{id: number; isDefault?: boolean}>>>
    removeProjectionScenario: (id: number) => Promise<GoalsBackupApiResult<unknown>>
    createProjectionScenario: (data: Record<string, unknown>) => Promise<GoalsBackupApiResult<{id: number}>>
}

export interface GoalsRestoreResult {
    restoredGoals: number
    restoredScenarios: number
    scenarioIdMap: Map<number, number>
    projectionSettings: BudgetBackupProjectionSettings | null
    warnings: string[]
}

function unwrapResult<T>(result: GoalsBackupApiResult<T>, fallback: string): T {
    if (result.ok && result.data != null) return result.data
    throw new Error(result.error?.message || fallback)
}

function goalToCreatePayload(goal: BudgetBackupFinancialGoal) {
    return {
        name: goal.name,
        type: goal.type,
        targetAmount: goal.targetAmount,
        currency: goal.currency,
        targetDate: goal.targetDate,
        startingAmount: goal.startingAmount,
        status: goal.status,
        priority: goal.priority,
        notes: goal.notes,
        // Wealth objects are not part of the canonical goals backup yet. Keep
        // the raw ids in JSON for future migration, but restore them detached
        // so the projection remains usable even when wealth ids changed.
        trackedAssetId: null,
        trackedPortfolioId: null,
        trackedLiabilityId: null,
        baselineNetWorthSnapshotId: null,
    }
}

function scenarioToCreatePayload(scenario: BudgetBackupProjectionScenario) {
    return {
        name: scenario.name,
        kind: scenario.kind,
        description: scenario.description,
        monthlySurplus: scenario.monthlySurplus,
        annualGrowthRate: scenario.annualGrowthRate,
        annualInflationRate: scenario.annualInflationRate,
        horizonMonths: scenario.horizonMonths,
        currency: scenario.currency,
        isDefault: scenario.isDefault,
        isActive: scenario.isActive,
        notes: scenario.notes,
    }
}

async function clearExistingGoals(api: GoalsBackupApi) {
    const existingGoals = unwrapResult(
        await api.listFinancialGoals({status: 'ALL'}),
        'Impossible de lister les objectifs existants.',
    )

    for (const goal of existingGoals) {
        unwrapResult(await api.deleteFinancialGoal(goal.id), 'Impossible de supprimer un objectif existant.')
    }
}

async function clearCustomScenarios(api: GoalsBackupApi) {
    const existingScenarios = unwrapResult(
        await api.listProjectionScenarios({isActive: 'ALL'}),
        'Impossible de lister les scénarios existants.',
    )

    for (const scenario of existingScenarios) {
        if (scenario.isDefault) continue
        unwrapResult(await api.removeProjectionScenario(scenario.id), 'Impossible de supprimer un scénario existant.')
    }
}

export function remapProjectionSettings(
    settings: BudgetBackupProjectionSettings | null,
    scenarioIdMap: Map<number, number>,
): BudgetBackupProjectionSettings | null {
    if (!settings) return null

    return {
        ...settings,
        defaultScenarioId: settings.defaultScenarioId == null
            ? null
            : scenarioIdMap.get(settings.defaultScenarioId) ?? null,
    }
}

export async function restoreGoalsBackupSnapshot(
    snapshot: BudgetBackupWithGoalsSnapshot,
    api: GoalsBackupApi,
    options: {replaceExisting?: boolean} = {},
): Promise<GoalsRestoreResult> {
    const replaceExisting = options.replaceExisting ?? true
    const warnings: string[] = []
    const scenarioIdMap = new Map<number, number>()

    if (replaceExisting) {
        await clearExistingGoals(api)
        await clearCustomScenarios(api)
    }

    for (const scenario of snapshot.data.projectionScenarios) {
        try {
            const created = unwrapResult(
                await api.createProjectionScenario(scenarioToCreatePayload(scenario)),
                `Impossible de restaurer le scénario "${scenario.name}".`,
            )
            scenarioIdMap.set(scenario.id, created.id)
        } catch (error) {
            warnings.push(error instanceof Error ? error.message : `Scénario "${scenario.name}" ignoré.`)
        }
    }

    let restoredGoals = 0
    for (const goal of snapshot.data.financialGoals) {
        const created = unwrapResult(
            await api.createFinancialGoal(goalToCreatePayload(goal)),
            `Impossible de restaurer l’objectif "${goal.name}".`,
        )

        if (!created.id) {
            throw new Error(`L’objectif "${goal.name}" a été restauré sans identifiant.`)
        }
        restoredGoals += 1
    }

    return {
        restoredGoals,
        restoredScenarios: scenarioIdMap.size,
        scenarioIdMap,
        projectionSettings: remapProjectionSettings(snapshot.data.projectionSettings, scenarioIdMap),
        warnings,
    }
}
