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

interface ProjectionScenarioIpcErrorDto {
    code: ProjectionScenarioErrorCodeDto | string
    message: string
    field: string | null
    scenarioId: number | null
    details: unknown | null
    recoverable: boolean
}

interface ProjectionScenarioIpcResultDto<T> {
    ok: boolean
    data: T | null
    error: ProjectionScenarioIpcErrorDto | null
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

interface ProjectionScenarioListFiltersDto {
    kind?: ProjectionScenarioKindDto | ProjectionScenarioDbKindDto | 'ALL' | string
    currency?: string
    isActive?: boolean | 'ALL'
    search?: string
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

type UpdateProjectionScenarioDto = Partial<CreateProjectionScenarioDto>

interface ProjectionScenarioDeleteResultDto {
    ok: true
    id: number
    entityType: 'projectionScenario'
    deactivated: boolean
}

interface Window {
    goals: Window['goals'] & {
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
