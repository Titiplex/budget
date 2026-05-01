import type {
    GoalAttainmentEstimate,
    GoalCurrencyCode,
    GoalProgress,
    GoalsProjectionErrorCode,
    ProjectionMonth,
    ProjectionResultStatus,
    ProjectionScenarioId,
    ProjectionScenarioKind,
} from '../types/goals'

export interface MonthlyProjectionInput {
    initialValue: number
    targetAmount: number
    monthlyContribution?: number | null
    monthlySurplus?: number | null
    horizonMonths: number
    annualGrowthRate?: number | null
    annualInflationRate?: number | null
    currency: GoalCurrencyCode
    scenarioId?: ProjectionScenarioId | null
    scenarioKind?: ProjectionScenarioKind | null
    startDate?: string | Date | null
}

export interface MonthlyProjectionError {
    code: GoalsProjectionErrorCode
    message: string
    field: string | null
    recoverable: boolean
}

export interface MonthlyProjectionResult {
    scenarioId: ProjectionScenarioId | null
    scenarioKind: ProjectionScenarioKind
    status: ProjectionResultStatus
    currency: GoalCurrencyCode
    startDate: string
    targetAmount: number
    initialValue: number
    monthlyContribution: number
    horizonMonths: number
    annualGrowthRate: number | null
    annualInflationRate: number | null
    months: ProjectionMonth[]
    progress: GoalProgress
    attainmentEstimate: GoalAttainmentEstimate
    errors: MonthlyProjectionError[]
    generatedAt: string
}

const DEFAULT_START_DATE = '1970-01-01'
const DEFAULT_SCENARIO_KIND: ProjectionScenarioKind = 'custom'
const INVALID_STATUS: ProjectionResultStatus = 'invalidInput'
const ALREADY_REACHED_STATUS: ProjectionResultStatus = 'alreadyReached'
const REACHABLE_STATUS: ProjectionResultStatus = 'reachable'
const UNREACHABLE_STATUS: ProjectionResultStatus = 'unreachableWithinHorizon'

function createMonthlyProjectionError(
    code: GoalsProjectionErrorCode,
    message: string,
    field: string | null,
): MonthlyProjectionError {
    return {
        code,
        message,
        field,
        recoverable: true,
    }
}

function toFiniteNumber(value: unknown): number | null {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function roundProjectionNumber(value: number, precision = 2): number {
    if (!Number.isFinite(value)) return 0

    const safePrecision = Number.isInteger(precision) ? Math.min(Math.max(precision, 0), 8) : 2
    const factor = 10 ** safePrecision

    return Math.round((value + Number.EPSILON) * factor) / factor
}

function normalizeCurrency(currency: string | null | undefined): GoalCurrencyCode | null {
    const normalized = String(currency || '')
        .trim()
        .toUpperCase()

    return /^[A-Z]{3}$/.test(normalized) ? normalized : null
}

function parseDate(value: string | Date | null | undefined): Date | null {
    if (value == null || value === '') {
        return new Date(`${DEFAULT_START_DATE}T00:00:00.000Z`)
    }

    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)

    if (Number.isNaN(date.getTime())) return null

    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10)
}

function addUtcMonths(date: Date, months: number): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
}

function annualToMonthlyRate(annualRate: number | null): number {
    if (annualRate == null) return 0
    if (annualRate <= -1) return -1

    return Math.pow(1 + annualRate, 1 / 12) - 1
}

function calculateProgressPercent(projectedValue: number, targetAmount: number): number {
    if (targetAmount <= 0) return 0

    return roundProjectionNumber(Math.min(Math.max((projectedValue / targetAmount) * 100, 0), 100), 4)
}

function resolveMonthlyContribution(input: MonthlyProjectionInput): number | null {
    const raw = input.monthlyContribution ?? input.monthlySurplus ?? 0
    return toFiniteNumber(raw)
}

function validateProjectionInput(input: MonthlyProjectionInput) {
    const errors: MonthlyProjectionError[] = []
    const initialValue = toFiniteNumber(input.initialValue)
    const targetAmount = toFiniteNumber(input.targetAmount)
    const monthlyContribution = resolveMonthlyContribution(input)
    const horizonMonths = toFiniteNumber(input.horizonMonths)
    const annualGrowthRate = input.annualGrowthRate == null ? null : toFiniteNumber(input.annualGrowthRate)
    const annualInflationRate = input.annualInflationRate == null ? null : toFiniteNumber(input.annualInflationRate)
    const currency = normalizeCurrency(input.currency)
    const startDate = parseDate(input.startDate)

    if (initialValue == null || initialValue < 0) {
        errors.push(createMonthlyProjectionError(
            'invalidTargetAmount',
            'La valeur initiale doit être positive ou nulle.',
            'initialValue',
        ))
    }

    if (targetAmount == null || targetAmount <= 0) {
        errors.push(createMonthlyProjectionError(
            'invalidTargetAmount',
            'Le montant cible doit être strictement positif.',
            'targetAmount',
        ))
    }

    if (monthlyContribution == null || monthlyContribution < 0) {
        errors.push(createMonthlyProjectionError(
            'invalidMonthlySurplus',
            'La contribution mensuelle doit être positive ou nulle.',
            input.monthlyContribution == null ? 'monthlySurplus' : 'monthlyContribution',
        ))
    }

    if (horizonMonths == null || !Number.isInteger(horizonMonths) || horizonMonths <= 0 || horizonMonths > 1200) {
        errors.push(createMonthlyProjectionError(
            'invalidHorizon',
            'L’horizon doit être un nombre de mois positif et inférieur ou égal à 1200.',
            'horizonMonths',
        ))
    }

    if (annualGrowthRate != null && (annualGrowthRate < -1 || annualGrowthRate > 1)) {
        errors.push(createMonthlyProjectionError(
            'invalidRate',
            'Le taux de croissance annuel doit être compris entre -100% et 100%.',
            'annualGrowthRate',
        ))
    }

    if (annualInflationRate != null && (annualInflationRate < -1 || annualInflationRate > 1)) {
        errors.push(createMonthlyProjectionError(
            'invalidRate',
            'Le taux d’inflation annuel doit être compris entre -100% et 100%.',
            'annualInflationRate',
        ))
    }

    if (!currency) {
        errors.push(createMonthlyProjectionError(
            'invalidCurrency',
            'La devise doit être un code ISO à 3 lettres.',
            'currency',
        ))
    }

    if (!startDate) {
        errors.push(createMonthlyProjectionError(
            'invalidHorizon',
            'La date de départ est invalide.',
            'startDate',
        ))
    }

    return {
        annualGrowthRate,
        annualInflationRate,
        currency: currency || 'CAD',
        errors,
        horizonMonths: Number.isInteger(horizonMonths) ? Number(horizonMonths) : 0,
        initialValue: initialValue ?? 0,
        monthlyContribution: monthlyContribution ?? 0,
        startDate: startDate || new Date(`${DEFAULT_START_DATE}T00:00:00.000Z`),
        targetAmount: targetAmount ?? 0,
    }
}

function buildProgress(
    input: {
        calculatedAt: string
        currency: GoalCurrencyCode
        currentAmount: number
        targetAmount: number
    },
): GoalProgress {
    const remainingAmount = Math.max(0, input.targetAmount - input.currentAmount)

    return {
        goalId: null,
        currentAmount: roundProjectionNumber(input.currentAmount),
        targetAmount: roundProjectionNumber(input.targetAmount),
        remainingAmount: roundProjectionNumber(remainingAmount),
        progressPercent: calculateProgressPercent(input.currentAmount, input.targetAmount),
        currency: input.currency,
        status: remainingAmount <= 0 ? 'completed' : 'active',
        calculatedAt: input.calculatedAt,
    }
}

function buildAttainmentEstimate(input: {
    currency: GoalCurrencyCode
    estimatedReachDate: string | null
    estimatedMonthsToReach: number | null
    finalProjectedValue: number
    status: ProjectionResultStatus
    targetAmount: number
}): GoalAttainmentEstimate {
    return {
        status: input.status,
        estimatedReachDate: input.estimatedReachDate,
        estimatedMonthsToReach: input.estimatedMonthsToReach,
        withinHorizon: input.status === REACHABLE_STATUS || input.status === ALREADY_REACHED_STATUS,
        finalProjectedValue: roundProjectionNumber(input.finalProjectedValue),
        shortfallAmount: roundProjectionNumber(Math.max(0, input.targetAmount - input.finalProjectedValue)),
        currency: input.currency,
    }
}

function buildInvalidProjectionResult(input: MonthlyProjectionInput, errors: MonthlyProjectionError[]): MonthlyProjectionResult {
    const currency = normalizeCurrency(input.currency) || 'CAD'
    const startDate = parseDate(input.startDate) || new Date(`${DEFAULT_START_DATE}T00:00:00.000Z`)
    const targetAmount = Math.max(0, toFiniteNumber(input.targetAmount) ?? 0)
    const initialValue = Math.max(0, toFiniteNumber(input.initialValue) ?? 0)
    const generatedAt = `${formatDate(startDate)}T00:00:00.000Z`

    return {
        scenarioId: input.scenarioId ?? null,
        scenarioKind: input.scenarioKind ?? DEFAULT_SCENARIO_KIND,
        status: INVALID_STATUS,
        currency,
        startDate: formatDate(startDate),
        targetAmount,
        initialValue,
        monthlyContribution: Math.max(0, resolveMonthlyContribution(input) ?? 0),
        horizonMonths: Math.max(0, toFiniteNumber(input.horizonMonths) ?? 0),
        annualGrowthRate: input.annualGrowthRate == null ? null : toFiniteNumber(input.annualGrowthRate),
        annualInflationRate: input.annualInflationRate == null ? null : toFiniteNumber(input.annualInflationRate),
        months: [],
        progress: buildProgress({
            calculatedAt: generatedAt,
            currency,
            currentAmount: initialValue,
            targetAmount,
        }),
        attainmentEstimate: buildAttainmentEstimate({
            currency,
            estimatedReachDate: null,
            estimatedMonthsToReach: null,
            finalProjectedValue: initialValue,
            status: INVALID_STATUS,
            targetAmount,
        }),
        errors,
        generatedAt,
    }
}

export function buildMonthlyProjection(input: MonthlyProjectionInput): MonthlyProjectionResult {
    const normalized = validateProjectionInput(input)

    if (normalized.errors.length > 0) {
        return buildInvalidProjectionResult(input, normalized.errors)
    }

    const startDate = normalized.startDate
    const generatedAt = `${formatDate(startDate)}T00:00:00.000Z`
    const currency = normalized.currency
    const targetAmount = normalized.targetAmount
    const initialValue = normalized.initialValue
    const monthlyContribution = normalized.monthlyContribution
    const monthlyGrowthRate = annualToMonthlyRate(normalized.annualGrowthRate)
    const monthlyInflationRate = annualToMonthlyRate(normalized.annualInflationRate)

    if (initialValue >= targetAmount) {
        return {
            scenarioId: input.scenarioId ?? null,
            scenarioKind: input.scenarioKind ?? DEFAULT_SCENARIO_KIND,
            status: ALREADY_REACHED_STATUS,
            currency,
            startDate: formatDate(startDate),
            targetAmount: roundProjectionNumber(targetAmount),
            initialValue: roundProjectionNumber(initialValue),
            monthlyContribution: roundProjectionNumber(monthlyContribution),
            horizonMonths: normalized.horizonMonths,
            annualGrowthRate: normalized.annualGrowthRate,
            annualInflationRate: normalized.annualInflationRate,
            months: [],
            progress: buildProgress({calculatedAt: generatedAt, currency, currentAmount: initialValue, targetAmount}),
            attainmentEstimate: buildAttainmentEstimate({
                currency,
                estimatedReachDate: formatDate(startDate),
                estimatedMonthsToReach: 0,
                finalProjectedValue: initialValue,
                status: ALREADY_REACHED_STATUS,
                targetAmount,
            }),
            errors: [],
            generatedAt,
        }
    }

    const months: ProjectionMonth[] = []
    let currentValue = initialValue
    let estimatedReachDate: string | null = null
    let estimatedMonthsToReach: number | null = null

    for (let monthIndex = 1; monthIndex <= normalized.horizonMonths; monthIndex += 1) {
        const valueAfterContribution = currentValue + monthlyContribution
        const growthAmount = valueAfterContribution * monthlyGrowthRate
        const valueAfterGrowth = valueAfterContribution + growthAmount
        const inflationImpactAmount = valueAfterGrowth * monthlyInflationRate
        const projectedValue = Math.max(0, valueAfterGrowth - inflationImpactAmount)
        const remainingAmount = Math.max(0, targetAmount - projectedValue)
        const month = formatDate(addUtcMonths(startDate, monthIndex))

        currentValue = projectedValue

        months.push({
            monthIndex,
            month,
            projectedValue: roundProjectionNumber(projectedValue),
            contributionAmount: roundProjectionNumber(monthlyContribution),
            growthAmount: roundProjectionNumber(growthAmount),
            inflationImpactAmount: roundProjectionNumber(inflationImpactAmount),
            remainingAmount: roundProjectionNumber(remainingAmount),
            progressPercent: calculateProgressPercent(projectedValue, targetAmount),
            currency,
        })

        if (estimatedReachDate == null && projectedValue >= targetAmount) {
            estimatedReachDate = month
            estimatedMonthsToReach = monthIndex
        }
    }

    const finalProjectedValue = months.at(-1)?.projectedValue ?? initialValue
    const status = estimatedReachDate ? REACHABLE_STATUS : UNREACHABLE_STATUS

    return {
        scenarioId: input.scenarioId ?? null,
        scenarioKind: input.scenarioKind ?? DEFAULT_SCENARIO_KIND,
        status,
        currency,
        startDate: formatDate(startDate),
        targetAmount: roundProjectionNumber(targetAmount),
        initialValue: roundProjectionNumber(initialValue),
        monthlyContribution: roundProjectionNumber(monthlyContribution),
        horizonMonths: normalized.horizonMonths,
        annualGrowthRate: normalized.annualGrowthRate,
        annualInflationRate: normalized.annualInflationRate,
        months,
        progress: buildProgress({
            calculatedAt: generatedAt,
            currency,
            currentAmount: finalProjectedValue,
            targetAmount,
        }),
        attainmentEstimate: buildAttainmentEstimate({
            currency,
            estimatedReachDate,
            estimatedMonthsToReach,
            finalProjectedValue,
            status,
            targetAmount,
        }),
        errors: [],
        generatedAt,
    }
}

export const calculateMonthlyProjection = buildMonthlyProjection
export const runMonthlyProjection = buildMonthlyProjection
