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

interface FinancialGoalIpcErrorDto {
    code: FinancialGoalErrorCodeDto | string
    message: string
    field: string | null
    goalId: number | null
    details: unknown | null
    recoverable: boolean
}

interface FinancialGoalIpcResultDto<T> {
    ok: boolean
    data: T | null
    error: FinancialGoalIpcErrorDto | null
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

interface FinancialGoalListFiltersDto {
    status?: FinancialGoalStatusDto | 'ALL' | string
    type?: FinancialGoalTypeDto | 'ALL' | string
    currency?: string
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

type UpdateFinancialGoalDto = Partial<CreateFinancialGoalDto>

interface FinancialGoalDeleteResultDto {
    ok: true
    id: number
    entityType: 'financialGoal'
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
    }
}
