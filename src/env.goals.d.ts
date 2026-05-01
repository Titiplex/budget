type FinancialGoalTypeDto =
    | 'SAVINGS'
    | 'EMERGENCY_FUND'
    | 'DEBT_PAYOFF'
    | 'PURCHASE'
    | 'INVESTMENT'
    | 'RETIREMENT'
    | 'NET_WORTH'
    | 'OTHER'

type FinancialGoalStatusDto = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'

type FinancialGoalErrorCodeDto =
    | 'goalNotFound'
    | 'invalidTargetAmount'
    | 'invalidHorizon'
    | 'invalidCurrency'
    | 'projectionImpossible'
    | 'invalidName'
    | 'invalidTargetDate'
    | 'invalidGoalType'
    | 'invalidGoalStatus'
    | 'invalidPriority'
    | 'invalidStartingAmount'
    | 'invalidRelation'
    | 'unknownGoalError'

type ProjectionScenarioKindDto = 'PESSIMISTIC' | 'BASE' | 'OPTIMISTIC' | 'CUSTOM'
type ProjectionScenarioDbKindDto = 'CONSERVATIVE' | 'BASELINE' | 'OPTIMISTIC' | 'CUSTOM'

type ProjectionScenarioErrorCodeDto =
    | 'scenarioNotFound'
    | 'invalidScenarioName'
    | 'invalidScenarioKind'
    | 'invalidHorizon'
    | 'invalidRate'
    | 'invalidCurrency'
    | 'invalidMonthlySurplus'
    | 'unknownProjectionScenarioError'

interface FinancialGoalIpcErrorDto {
    code: FinancialGoalErrorCodeDto | string
    message: string
    field: string | null
    goalId: number | null
    details: unknown | null
    recoverable: boolean
}

interface ProjectionScenarioIpcErrorDto {
    code: ProjectionScenarioErrorCodeDto | string
    message: string
    field: string | null
    scenarioId: number | null
    details: unknown | null
    recoverable: boolean
}

interface FinancialGoalIpcResultDto<T> {
    ok: boolean
    data: T | null
    error: FinancialGoalIpcErrorDto | null
}

interface ProjectionScenarioIpcResultDto<T> {
    ok: boolean
    data: T | null
    error: ProjectionScenarioIpcErrorDto | null
}

interface FinancialGoalDto {
    id: number
    name: string
    type: FinancialGoalTypeDto
    targetAmount: number
    currency: string
    targetDate: string | null
    startingAmount: number | null
    status: FinancialGoalStatusDto
    priority: number | null
    notes: string | null
    trackedAssetId: number | null
    trackedPortfolioId: number | null
    trackedLiabilityId: number | null
    baselineNetWorthSnapshotId: number | null
    createdAt: string | null
    updatedAt: string | null
    trackedAsset?: unknown | null
    trackedPortfolio?: unknown | null
    trackedLiability?: unknown | null
    baselineNetWorthSnapshot?: unknown | null
}

interface ProjectionScenarioDto {
    id: number
    name: string
    kind: ProjectionScenarioKindDto
    dbKind: ProjectionScenarioDbKindDto
    description: string | null
    monthlySurplus: number
    annualGrowthRate: number | null
    annualInflationRate: number | null
    horizonMonths: number
    horizonYears: number
    currency: string
    isDefault: boolean
    isActive: boolean
    notes: string | null
    createdAt: string | null
    updatedAt: string | null
}

interface FinancialGoalListFiltersDto {
    status?: FinancialGoalStatusDto | 'ALL' | string
    type?: FinancialGoalTypeDto | 'ALL' | string
    currency?: string
    search?: string
}

interface ProjectionScenarioListFiltersDto {
    kind?: ProjectionScenarioKindDto | ProjectionScenarioDbKindDto | 'ALL' | string
    currency?: string
    isActive?: boolean | 'ALL'
    search?: string
}

interface CreateFinancialGoalDto {
    name: string
    type: FinancialGoalTypeDto | string
    targetAmount: number
    currency: string
    targetDate?: string | null
    startingAmount?: number | null
    status?: FinancialGoalStatusDto | string
    priority?: number | null
    notes?: string | null
    trackedAssetId?: number | null
    trackedPortfolioId?: number | null
    trackedLiabilityId?: number | null
    baselineNetWorthSnapshotId?: number | null
}

interface CreateProjectionScenarioDto {
    name: string
    kind: ProjectionScenarioKindDto | ProjectionScenarioDbKindDto | string
    monthlySurplus: number
    annualGrowthRate?: number | null
    annualInflationRate?: number | null
    horizonMonths?: number
    horizonYears?: number
    currency: string
    description?: string | null
    notes?: string | null
    isDefault?: boolean
    isActive?: boolean
}

type UpdateFinancialGoalDto = Partial<CreateFinancialGoalDto>
type UpdateProjectionScenarioDto = Partial<CreateProjectionScenarioDto>

interface FinancialGoalDeleteResultDto {
    ok: true
    id: number
    entityType: 'financialGoal'
}

interface ProjectionScenarioDeleteResultDto {
    ok: true
    id: number
    entityType: 'projectionScenario'
    deactivated: boolean
}

interface Window {
    goals: {
        listFinancialGoals: (
            filters?: FinancialGoalListFiltersDto,
        ) => Promise<FinancialGoalIpcResultDto<FinancialGoalDto[]>>
        getFinancialGoal: (id: number) => Promise<FinancialGoalIpcResultDto<FinancialGoalDto>>
        createFinancialGoal: (data: CreateFinancialGoalDto) => Promise<FinancialGoalIpcResultDto<FinancialGoalDto>>
        updateFinancialGoal: (
            id: number,
            data: UpdateFinancialGoalDto,
        ) => Promise<FinancialGoalIpcResultDto<FinancialGoalDto>>
        deleteFinancialGoal: (id: number) => Promise<FinancialGoalIpcResultDto<FinancialGoalDeleteResultDto>>
        ensureDefaultProjectionScenarios: () => Promise<ProjectionScenarioIpcResultDto<ProjectionScenarioDto[]>>
        listProjectionScenarios: (
            filters?: ProjectionScenarioListFiltersDto,
        ) => Promise<ProjectionScenarioIpcResultDto<ProjectionScenarioDto[]>>
        getProjectionScenario: (id: number) => Promise<ProjectionScenarioIpcResultDto<ProjectionScenarioDto>>
        createProjectionScenario: (
            data: CreateProjectionScenarioDto,
        ) => Promise<ProjectionScenarioIpcResultDto<ProjectionScenarioDto>>
        updateProjectionScenario: (
            id: number,
            data: UpdateProjectionScenarioDto,
        ) => Promise<ProjectionScenarioIpcResultDto<ProjectionScenarioDto>>
        removeProjectionScenario: (id: number) => Promise<ProjectionScenarioIpcResultDto<ProjectionScenarioDeleteResultDto>>
    }
}
