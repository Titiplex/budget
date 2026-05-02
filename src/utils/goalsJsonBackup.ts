import type {
    Account,
    BudgetBackupSnapshot,
    BudgetTarget,
    Category,
    RecurringTransactionTemplate,
    TaxProfile,
    Transaction,
} from '../types/budget'
import {
    BUDGET_BACKUP_KIND,
    BudgetBackupParseError,
    parseBudgetBackup,
    createBudgetBackupSnapshot,
} from './jsonBackup'

export const GOALS_BACKUP_FORMAT_VERSION = 5
export const SUPPORTED_GOALS_BACKUP_VERSIONS = [2, 3, 4, 5] as const

export type BackupFinancialGoalType =
    | 'SAVINGS'
    | 'EMERGENCY_FUND'
    | 'DEBT_PAYOFF'
    | 'PURCHASE'
    | 'INVESTMENT'
    | 'RETIREMENT'
    | 'NET_WORTH'
    | 'OTHER'
export type BackupFinancialGoalStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
export type BackupProjectionScenarioKind = 'PESSIMISTIC' | 'BASE' | 'OPTIMISTIC' | 'CUSTOM'

export interface BudgetBackupFinancialGoal {
    id: number
    name: string
    type: BackupFinancialGoalType
    targetAmount: number
    currency: string
    targetDate: string | null
    startingAmount: number | null
    status: BackupFinancialGoalStatus
    priority: number | null
    notes: string | null
    trackedAssetId: number | null
    trackedPortfolioId: number | null
    trackedLiabilityId: number | null
    baselineNetWorthSnapshotId: number | null
}

export interface BudgetBackupProjectionScenario {
    id: number
    name: string
    kind: BackupProjectionScenarioKind
    description: string | null
    monthlySurplus: number
    annualGrowthRate: number | null
    annualInflationRate: number | null
    horizonMonths: number
    currency: string
    isDefault: boolean
    isActive: boolean
    notes: string | null
}

export interface BudgetBackupProjectionSettings {
    currency: string
    defaultScenarioId: number | null
    horizonMonths: number | null
    manualMonthlyContribution: number | null
}

export type BudgetBackupWithGoalsSnapshot = Omit<BudgetBackupSnapshot, 'version' | 'data'> & {
    version: BudgetBackupSnapshot['version'] | typeof GOALS_BACKUP_FORMAT_VERSION
    data: BudgetBackupSnapshot['data'] & {
        financialGoals: BudgetBackupFinancialGoal[]
        projectionScenarios: BudgetBackupProjectionScenario[]
        projectionSettings: BudgetBackupProjectionSettings | null
    }
}

const FINANCIAL_GOAL_TYPES = ['SAVINGS', 'EMERGENCY_FUND', 'DEBT_PAYOFF', 'PURCHASE', 'INVESTMENT', 'RETIREMENT', 'NET_WORTH', 'OTHER'] as const
const FINANCIAL_GOAL_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'] as const
const PROJECTION_SCENARIO_KINDS = ['PESSIMISTIC', 'BASE', 'OPTIMISTIC', 'CUSTOM'] as const

function fail(message: string): never {
    throw new BudgetBackupParseError(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
    if (!isRecord(value)) fail(`${path} doit être un objet.`)
    return value
}

function requireArray(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) fail(`${path} doit être un tableau.`)
    return value
}

function requireString(value: unknown, path: string): string {
    if (typeof value !== 'string') fail(`${path} doit être une chaîne de caractères.`)
    return value
}

function requireNonEmptyString(value: unknown, path: string): string {
    const normalized = requireString(value, path).trim()
    if (!normalized) fail(`${path} ne peut pas être vide.`)
    return normalized
}

function requireNullableString(value: unknown, path: string): string | null {
    if (value == null) return null
    return requireString(value, path)
}

function optionalNullableString(record: Record<string, unknown>, key: string, path: string): string | null {
    if (!(key in record) || record[key] == null) return null
    return requireString(record[key], `${path}.${key}`)
}

function requireFiniteNumber(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${path} doit être un nombre fini.`)
    return value
}

function requirePositiveNumber(value: unknown, path: string): number {
    const parsed = requireFiniteNumber(value, path)
    if (parsed <= 0) fail(`${path} doit être strictement positif.`)
    return parsed
}

function requireNonNegativeNumber(value: unknown, path: string): number {
    const parsed = requireFiniteNumber(value, path)
    if (parsed < 0) fail(`${path} doit être positif ou nul.`)
    return parsed
}

function requireIntegerId(value: unknown, path: string): number {
    const parsed = requireFiniteNumber(value, path)
    if (!Number.isInteger(parsed) || parsed <= 0) fail(`${path} doit être un identifiant entier positif.`)
    return parsed
}

function optionalNullableIntegerId(record: Record<string, unknown>, key: string, path: string): number | null {
    if (!(key in record) || record[key] == null) return null
    return requireIntegerId(record[key], `${path}.${key}`)
}

function optionalNullableNonNegativeNumber(record: Record<string, unknown>, key: string, path: string): number | null {
    if (!(key in record) || record[key] == null) return null
    return requireNonNegativeNumber(record[key], `${path}.${key}`)
}

function optionalNullableRate(record: Record<string, unknown>, key: string, path: string): number | null {
    if (!(key in record) || record[key] == null) return null
    const parsed = requireFiniteNumber(record[key], `${path}.${key}`)
    if (parsed < -1 || parsed > 1) fail(`${path}.${key} doit être compris entre -100% et 100%.`)
    return parsed
}

function requireBoolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') fail(`${path} doit être un booléen.`)
    return value
}

function optionalBoolean(record: Record<string, unknown>, key: string, path: string, fallback: boolean) {
    if (!(key in record) || record[key] == null) return fallback
    return requireBoolean(record[key], `${path}.${key}`)
}

function requireOneOf<T extends readonly string[]>(value: unknown, path: string, allowed: T): T[number] {
    if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
        fail(`${path} contient une valeur non supportée.`)
    }
    return value as T[number]
}

function optionalOneOf<T extends readonly string[]>(record: Record<string, unknown>, key: string, path: string, allowed: T, fallback: T[number]): T[number] {
    if (!(key in record) || record[key] == null) return fallback
    return requireOneOf(record[key], `${path}.${key}`, allowed)
}

function normalizeCurrency(value: unknown, path: string) {
    const currency = requireNonEmptyString(value, path).toUpperCase()
    if (!/^[A-Z]{3}$/.test(currency)) fail(`${path} doit être une devise ISO à 3 lettres.`)
    return currency
}

function requireNullableDateOnly(value: unknown, path: string): string | null {
    if (value == null) return null
    const date = requireString(value, path)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`${path} doit être une date au format YYYY-MM-DD.`)
    return date
}

function ensureUniqueIds(rows: {id: number}[], label: string) {
    const seen = new Set<number>()
    for (const row of rows) {
        if (seen.has(row.id)) fail(`${label} contient un identifiant dupliqué (${row.id}).`)
        seen.add(row.id)
    }
}

function normalizeFinancialGoal(value: unknown, index: number): BudgetBackupFinancialGoal {
    const path = `data.financialGoals[${index}]`
    const goal = requireRecord(value, path)

    return {
        id: requireIntegerId(goal.id, `${path}.id`),
        name: requireNonEmptyString(goal.name, `${path}.name`),
        type: requireOneOf(goal.type, `${path}.type`, FINANCIAL_GOAL_TYPES) as BackupFinancialGoalType,
        targetAmount: requirePositiveNumber(goal.targetAmount, `${path}.targetAmount`),
        currency: normalizeCurrency(goal.currency, `${path}.currency`),
        targetDate: requireNullableDateOnly(goal.targetDate, `${path}.targetDate`),
        startingAmount: optionalNullableNonNegativeNumber(goal, 'startingAmount', path),
        status: optionalOneOf(goal, 'status', path, FINANCIAL_GOAL_STATUSES, 'ACTIVE') as BackupFinancialGoalStatus,
        priority: optionalNullableNonNegativeNumber(goal, 'priority', path),
        notes: optionalNullableString(goal, 'notes', path),
        trackedAssetId: optionalNullableIntegerId(goal, 'trackedAssetId', path),
        trackedPortfolioId: optionalNullableIntegerId(goal, 'trackedPortfolioId', path),
        trackedLiabilityId: optionalNullableIntegerId(goal, 'trackedLiabilityId', path),
        baselineNetWorthSnapshotId: optionalNullableIntegerId(goal, 'baselineNetWorthSnapshotId', path),
    }
}

function normalizeProjectionScenario(value: unknown, index: number): BudgetBackupProjectionScenario {
    const path = `data.projectionScenarios[${index}]`
    const scenario = requireRecord(value, path)
    const horizonMonths = requireFiniteNumber(scenario.horizonMonths, `${path}.horizonMonths`)

    if (!Number.isInteger(horizonMonths) || horizonMonths <= 0 || horizonMonths > 1200) {
        fail(`${path}.horizonMonths doit être un entier entre 1 et 1200.`)
    }

    return {
        id: requireIntegerId(scenario.id, `${path}.id`),
        name: requireNonEmptyString(scenario.name, `${path}.name`),
        kind: requireOneOf(scenario.kind, `${path}.kind`, PROJECTION_SCENARIO_KINDS) as BackupProjectionScenarioKind,
        description: requireNullableString(scenario.description ?? null, `${path}.description`),
        monthlySurplus: requireNonNegativeNumber(scenario.monthlySurplus, `${path}.monthlySurplus`),
        annualGrowthRate: optionalNullableRate(scenario, 'annualGrowthRate', path),
        annualInflationRate: optionalNullableRate(scenario, 'annualInflationRate', path),
        horizonMonths,
        currency: normalizeCurrency(scenario.currency, `${path}.currency`),
        isDefault: optionalBoolean(scenario, 'isDefault', path, false),
        isActive: optionalBoolean(scenario, 'isActive', path, true),
        notes: requireNullableString(scenario.notes ?? null, `${path}.notes`),
    }
}

function normalizeProjectionSettings(value: unknown): BudgetBackupProjectionSettings | null {
    if (value == null) return null
    const settings = requireRecord(value, 'data.projectionSettings')
    const horizonMonths = optionalNullableNonNegativeNumber(settings, 'horizonMonths', 'data.projectionSettings')

    if (horizonMonths != null && (!Number.isInteger(horizonMonths) || horizonMonths > 1200 || horizonMonths === 0)) {
        fail('data.projectionSettings.horizonMonths doit être un entier entre 1 et 1200.')
    }

    return {
        currency: normalizeCurrency(settings.currency ?? 'CAD', 'data.projectionSettings.currency'),
        defaultScenarioId: optionalNullableIntegerId(settings, 'defaultScenarioId', 'data.projectionSettings'),
        horizonMonths,
        manualMonthlyContribution: optionalNullableNonNegativeNumber(settings, 'manualMonthlyContribution', 'data.projectionSettings'),
    }
}

function normalizeGoalsExtension(data: Record<string, unknown>, version: number) {
    if (version < GOALS_BACKUP_FORMAT_VERSION) {
        return {
            financialGoals: [],
            projectionScenarios: [],
            projectionSettings: null,
        }
    }

    const financialGoals = requireArray(data.financialGoals, 'data.financialGoals').map(normalizeFinancialGoal)
    const projectionScenarios = requireArray(data.projectionScenarios, 'data.projectionScenarios').map(normalizeProjectionScenario)
    const projectionSettings = normalizeProjectionSettings(data.projectionSettings)

    ensureUniqueIds(financialGoals, 'data.financialGoals')
    ensureUniqueIds(projectionScenarios, 'data.projectionScenarios')

    if (projectionSettings?.defaultScenarioId != null && !projectionScenarios.some((scenario) => scenario.id === projectionSettings.defaultScenarioId)) {
        fail(`data.projectionSettings.defaultScenarioId référence un scénario absent (${projectionSettings.defaultScenarioId}).`)
    }

    return {financialGoals, projectionScenarios, projectionSettings}
}

function coreCompatibleSnapshot(parsed: Record<string, unknown>, version: number, data: Record<string, unknown>) {
    const compatibleVersion = version >= GOALS_BACKUP_FORMAT_VERSION ? 4 : version
    const {
        financialGoals: _financialGoals,
        projectionScenarios: _projectionScenarios,
        projectionSettings: _projectionSettings,
        ...coreData
    } = data

    return {
        ...parsed,
        version: compatibleVersion,
        data: coreData,
    }
}

export function createBudgetBackupSnapshotWithGoals(
    accounts: Account[],
    categories: Category[],
    budgetTargets: BudgetTarget[],
    recurringTemplates: RecurringTransactionTemplate[],
    transactions: Transaction[],
    taxProfiles: TaxProfile[] = [],
    financialGoals: BudgetBackupFinancialGoal[] = [],
    projectionScenarios: BudgetBackupProjectionScenario[] = [],
    projectionSettings: BudgetBackupProjectionSettings | null = null,
): BudgetBackupWithGoalsSnapshot {
    const normalizedGoals = financialGoals.map((goal) => ({
        ...goal,
        currency: goal.currency.toUpperCase(),
        targetDate: goal.targetDate ?? null,
        startingAmount: goal.startingAmount ?? null,
        priority: goal.priority ?? null,
        notes: goal.notes ?? null,
        trackedAssetId: goal.trackedAssetId ?? null,
        trackedPortfolioId: goal.trackedPortfolioId ?? null,
        trackedLiabilityId: goal.trackedLiabilityId ?? null,
        baselineNetWorthSnapshotId: goal.baselineNetWorthSnapshotId ?? null,
    }))
    const normalizedScenarios = projectionScenarios.map((scenario) => ({
        ...scenario,
        currency: scenario.currency.toUpperCase(),
        description: scenario.description ?? null,
        annualGrowthRate: scenario.annualGrowthRate ?? null,
        annualInflationRate: scenario.annualInflationRate ?? null,
        notes: scenario.notes ?? null,
    }))
    const baseSnapshot = createBudgetBackupSnapshot(
        accounts,
        categories,
        budgetTargets,
        recurringTemplates,
        transactions,
        taxProfiles,
    )

    return {
        ...baseSnapshot,
        version: GOALS_BACKUP_FORMAT_VERSION,
        data: {
            ...baseSnapshot.data,
            financialGoals: normalizedGoals,
            projectionScenarios: normalizedScenarios,
            projectionSettings,
        },
    }
}

export function serializeBudgetBackupWithGoals(snapshot: BudgetBackupWithGoalsSnapshot) {
    return `${JSON.stringify(snapshot, null, 2)}\n`
}

export function parseBudgetBackupWithGoals(content: string): BudgetBackupWithGoalsSnapshot {
    let parsed: unknown

    try {
        parsed = JSON.parse(content)
    } catch (_error) {
        fail('Le fichier JSON est invalide ou corrompu.')
    }

    const root = requireRecord(parsed, 'backup')
    if (root.kind !== BUDGET_BACKUP_KIND) fail('Le fichier JSON ne correspond pas à un backup budget valide.')

    const version = requireFiniteNumber(root.version, 'version')
    if (!Number.isInteger(version) || !(SUPPORTED_GOALS_BACKUP_VERSIONS as readonly number[]).includes(version)) {
        fail(`Version de backup JSON non supportée (${version}). Versions supportées : ${SUPPORTED_GOALS_BACKUP_VERSIONS.join(', ')}.`)
    }

    const data = requireRecord(root.data, 'data')
    const coreSnapshot = parseBudgetBackup(JSON.stringify(coreCompatibleSnapshot(root, version, data)))
    const goalsExtension = normalizeGoalsExtension(data, version)

    return {
        ...coreSnapshot,
        version: version as BudgetBackupWithGoalsSnapshot['version'],
        data: {
            ...coreSnapshot.data,
            ...goalsExtension,
        },
    }
}

function escapeMarkdownCell(value: unknown) {
    return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function escapeCsvCell(value: unknown) {
    const raw = String(value ?? '')
    if (!/[",\n;]/.test(raw)) return raw
    return `"${raw.replace(/"/g, '""')}"`
}

export function exportFinancialGoalsMarkdown(goals: BudgetBackupFinancialGoal[]) {
    const rows = [
        '| Objectif | Type | Statut | Cible | Départ | Date cible | Devise |',
        '| --- | --- | --- | ---: | ---: | --- | --- |',
        ...goals.map((goal) => [
            escapeMarkdownCell(goal.name),
            goal.type,
            goal.status,
            goal.targetAmount,
            goal.startingAmount ?? 0,
            goal.targetDate ?? '—',
            goal.currency,
        ].join(' | ')).map((row) => `| ${row} |`),
    ]

    return `${rows.join('\n')}\n`
}

export function exportFinancialGoalsCsv(goals: BudgetBackupFinancialGoal[]) {
    const header = ['id', 'name', 'type', 'status', 'targetAmount', 'startingAmount', 'targetDate', 'currency', 'notes']
    const rows = goals.map((goal) => [
        goal.id,
        goal.name,
        goal.type,
        goal.status,
        goal.targetAmount,
        goal.startingAmount ?? '',
        goal.targetDate ?? '',
        goal.currency,
        goal.notes ?? '',
    ])

    return `${[header, ...rows].map((row) => row.map(escapeCsvCell).join(';')).join('\n')}\n`
}
