/**
 * Shared renderer/main contracts for financial goals and projections.
 *
 * Keep this module pure: no Prisma models, no Electron APIs, no Vue dependencies
 * and no financial-advice concepts. Backend services can map database rows into
 * these contracts, then the renderer can consume the same neutral projection
 * shapes without depending on implementation details.
 */
export type GoalId = number
export type ProjectionScenarioId = number
export type ProjectionSettingId = number
export type ProjectionDateString = string
export type ProjectionDateTimeString = string
export type GoalCurrencyCode = string

export type FinancialGoalType =
    | 'savings'
    | 'emergencyFund'
    | 'debtPayoff'
    | 'purchase'
    | 'investment'
    | 'retirement'
    | 'netWorth'
    | 'other'

export type FinancialGoalStatus = 'active' | 'paused' | 'completed' | 'archived'
export type ProjectionScenarioKind = 'pessimistic' | 'base' | 'optimistic' | 'custom'
export type ProjectionResultStatus = 'reachable' | 'unreachableWithinHorizon' | 'alreadyReached' | 'invalidInput'

export type GoalsProjectionErrorCode =
    | 'goalNotFound'
    | 'invalidTargetAmount'
    | 'invalidHorizon'
    | 'invalidCurrency'
    | 'projectionImpossible'

export const FINANCIAL_GOAL_TYPES = [
    'savings',
    'emergencyFund',
    'debtPayoff',
    'purchase',
    'investment',
    'retirement',
    'netWorth',
    'other',
] as const satisfies readonly FinancialGoalType[]

export const FINANCIAL_GOAL_STATUSES = [
    'active',
    'paused',
    'completed',
    'archived',
] as const satisfies readonly FinancialGoalStatus[]

export const PROJECTION_SCENARIO_KINDS = [
    'pessimistic',
    'base',
    'optimistic',
    'custom',
] as const satisfies readonly ProjectionScenarioKind[]

export const PROJECTION_RESULT_STATUSES = [
    'reachable',
    'unreachableWithinHorizon',
    'alreadyReached',
    'invalidInput',
] as const satisfies readonly ProjectionResultStatus[]

export const GOALS_PROJECTION_ERROR_CODES = [
    'goalNotFound',
    'invalidTargetAmount',
    'invalidHorizon',
    'invalidCurrency',
    'projectionImpossible',
] as const satisfies readonly GoalsProjectionErrorCode[]

export interface FinancialGoal {
    id: GoalId
    name: string
    type: FinancialGoalType
    targetAmount: number
    currency: GoalCurrencyCode
    targetDate: ProjectionDateString | null
    startingAmount: number | null
    status: FinancialGoalStatus
    priority: number | null
    notes: string | null
    trackedAssetId: number | null
    trackedPortfolioId: number | null
    trackedLiabilityId: number | null
    baselineNetWorthSnapshotId: number | null
    createdAt: ProjectionDateTimeString
    updatedAt: ProjectionDateTimeString
}

export interface ProjectionScenario {
    id: ProjectionScenarioId
    name: string
    kind: ProjectionScenarioKind
    description: string | null
    isDefault: boolean
    createdAt: ProjectionDateTimeString
    updatedAt: ProjectionDateTimeString
}

export interface ProjectionInput {
    goalId?: GoalId | null
    scenarioId?: ProjectionScenarioId | null
    scenarioKind: ProjectionScenarioKind
    targetAmount: number
    currency: GoalCurrencyCode
    startingAmount?: number | null
    startDate: ProjectionDateString
    targetDate?: ProjectionDateString | null
    horizonMonths: number
    estimatedMonthlySurplus: number
    manualMonthlyContribution?: number | null
    annualGrowthRate?: number | null
}

export interface ProjectionMonth {
    monthIndex: number
    month: ProjectionDateString
    projectedValue: number
    contributionAmount: number
    growthAmount: number
    remainingAmount: number
    progressPercent: number
    currency: GoalCurrencyCode
}

export interface GoalProgress {
    goalId: GoalId | null
    currentAmount: number
    targetAmount: number
    remainingAmount: number
    progressPercent: number
    currency: GoalCurrencyCode
    status: FinancialGoalStatus
    calculatedAt: ProjectionDateTimeString
}

export interface GoalAttainmentEstimate {
    status: ProjectionResultStatus
    estimatedReachDate: ProjectionDateString | null
    estimatedMonthsToReach: number | null
    withinHorizon: boolean
    finalProjectedValue: number
    shortfallAmount: number
    currency: GoalCurrencyCode
}

export interface ProjectionResult {
    goalId: GoalId | null
    scenarioId: ProjectionScenarioId | null
    scenarioKind: ProjectionScenarioKind
    status: ProjectionResultStatus
    input: ProjectionInput
    months: ProjectionMonth[]
    progress: GoalProgress
    attainmentEstimate: GoalAttainmentEstimate
    errors: GoalsProjectionError[]
    generatedAt: ProjectionDateTimeString
}

export interface CreateFinancialGoalInput {
    name: string
    type: FinancialGoalType
    targetAmount: number
    currency: GoalCurrencyCode
    targetDate?: ProjectionDateString | null
    startingAmount?: number | null
    status?: FinancialGoalStatus
    priority?: number | null
    notes?: string | null
    trackedAssetId?: number | null
    trackedPortfolioId?: number | null
    trackedLiabilityId?: number | null
    baselineNetWorthSnapshotId?: number | null
}

export interface UpdateFinancialGoalInput extends Partial<CreateFinancialGoalInput> {
    id: GoalId
}

export interface CreateProjectionScenarioInput {
    name: string
    kind: ProjectionScenarioKind
    description?: string | null
    isDefault?: boolean
}

export interface UpdateProjectionScenarioInput extends Partial<CreateProjectionScenarioInput> {
    id: ProjectionScenarioId
}

export interface GoalsProjectionError {
    code: GoalsProjectionErrorCode
    message: string
    field: string | null
    goalId: GoalId | null
    scenarioId: ProjectionScenarioId | null
    recoverable: boolean
}

export type GoalsProjectionSuccess<TData> = {
    ok: true
    data: TData
    warnings: GoalsProjectionError[]
}

export type GoalsProjectionFailure = {
    ok: false
    error: GoalsProjectionError
    errors: GoalsProjectionError[]
}

export type GoalsProjectionResult<TData> = GoalsProjectionSuccess<TData> | GoalsProjectionFailure

export function isFinancialGoalType(value: string): value is FinancialGoalType {
    return FINANCIAL_GOAL_TYPES.includes(value as FinancialGoalType)
}

export function isFinancialGoalStatus(value: string): value is FinancialGoalStatus {
    return FINANCIAL_GOAL_STATUSES.includes(value as FinancialGoalStatus)
}

export function isProjectionScenarioKind(value: string): value is ProjectionScenarioKind {
    return PROJECTION_SCENARIO_KINDS.includes(value as ProjectionScenarioKind)
}

export function isProjectionResultStatus(value: string): value is ProjectionResultStatus {
    return PROJECTION_RESULT_STATUSES.includes(value as ProjectionResultStatus)
}

export function isGoalsProjectionErrorCode(value: string): value is GoalsProjectionErrorCode {
    return GOALS_PROJECTION_ERROR_CODES.includes(value as GoalsProjectionErrorCode)
}

export function normalizeGoalCurrency(
    currency: string | null | undefined,
    fallback: GoalCurrencyCode = 'CAD',
): GoalCurrencyCode {
    const normalized = String(currency || '')
        .trim()
        .toUpperCase()

    return /^[A-Z]{3}$/.test(normalized) ? normalized : fallback.trim().toUpperCase()
}

export function createGoalsProjectionError(
    code: GoalsProjectionErrorCode,
    message: string,
    options: Partial<Omit<GoalsProjectionError, 'code' | 'message'>> = {},
): GoalsProjectionError {
    return {
        code,
        message,
        field: options.field ?? null,
        goalId: options.goalId ?? null,
        scenarioId: options.scenarioId ?? null,
        recoverable: options.recoverable ?? false,
    }
}
