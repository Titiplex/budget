<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'

import {buildMonthlyProjection, type MonthlyProjectionResult} from '../utils/monthlyProjectionEngine'
import type {ProjectionScenarioKind} from '../types/goals'

const props = withDefaults(
    defineProps<{
      currentNetWorth?: number | null
      summaryCurrency?: string
    }>(),
    {
      currentNetWorth: 0,
      summaryCurrency: 'CAD',
    },
)

type GoalStatusDto = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
type GoalTypeDto =
    | 'SAVINGS'
    | 'EMERGENCY_FUND'
    | 'DEBT_PAYOFF'
    | 'PURCHASE'
    | 'INVESTMENT'
    | 'RETIREMENT'
    | 'NET_WORTH'
    | 'OTHER'
type ScenarioKindDto = 'PESSIMISTIC' | 'BASE' | 'OPTIMISTIC' | 'CUSTOM'

type FinancialGoalRow = {
  id: number
  name: string
  type: GoalTypeDto
  targetAmount: number
  currency: string
  targetDate: string | null
  startingAmount: number | null
  status: GoalStatusDto
  priority: number | null
  notes: string | null
}

type ProjectionScenarioRow = {
  id: number
  name: string
  kind: ScenarioKindDto
  monthlySurplus: number
  annualGrowthRate: number | null
  annualInflationRate: number | null
  horizonMonths: number
  currency: string
  isActive: boolean
}

type MonthlySurplusEstimate = {
  source: 'automaticFromBudget' | 'automaticFromRecurring' | 'manualOverride' | 'unavailable'
  currency: string
  monthlyContributionUsed: number
  estimatedMonthlySurplus: number
  estimatedMonthlyIncome: number
  estimatedMonthlyExpense: number
  netMonthlyEstimate: number
  warnings: string[]
}

type GoalProjectionRow = {
  goal: FinancialGoalRow
  projection: MonthlyProjectionResult | null
  currentValueUsed: number
  projectedValue: number
  variation: number
  progressPercent: number
  estimatedReachDate: string | null
  error: string | null
}

const goals = ref<FinancialGoalRow[]>([])
const scenarios = ref<ProjectionScenarioRow[]>([])
const surplusEstimate = ref<MonthlySurplusEstimate | null>(null)
const loading = ref(false)
const warningMessage = ref<string | null>(null)

function normalizeCurrency(value: string | null | undefined) {
  return (value || props.summaryCurrency || 'CAD').trim().toUpperCase()
}

function formatMoney(amount: number | null | undefined, currency = props.summaryCurrency) {
  if (amount == null || Number.isNaN(Number(amount))) return '—'

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: normalizeCurrency(currency),
    maximumFractionDigits: 0,
  }).format(Number(amount || 0))
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'

  return new Intl.DateTimeFormat(undefined, {dateStyle: 'medium'}).format(new Date(value))
}

function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return '—'

  return new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(Number(value) / 100)
}

function formatRate(value: number | null | undefined) {
  if (value == null) return '—'

  return new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(Number(value))
}

function unwrapResult<T>(result: {ok: boolean; data: T | null; error?: {message?: string} | null}, fallback: string): T {
  if (result.ok && result.data != null) return result.data
  throw new Error(result.error?.message || fallback)
}

function mapScenarioKind(kind: ScenarioKindDto | null | undefined): ProjectionScenarioKind {
  if (kind === 'PESSIMISTIC') return 'pessimistic'
  if (kind === 'BASE') return 'base'
  if (kind === 'OPTIMISTIC') return 'optimistic'
  return 'custom'
}

function isNetWorthGoal(goal: FinancialGoalRow) {
  return goal.type === 'NET_WORTH'
}

function currentValueForGoal(goal: FinancialGoalRow) {
  if (isNetWorthGoal(goal)) return Math.max(0, Number(props.currentNetWorth || 0))
  return Math.max(0, Number(goal.startingAmount || 0))
}

function isGoalReached(goal: FinancialGoalRow) {
  if (goal.status === 'COMPLETED') return true
  return currentValueForGoal(goal) >= Number(goal.targetAmount || 0)
}

function isGoalOverdue(goal: FinancialGoalRow) {
  if (!goal.targetDate || isGoalReached(goal)) return false

  const today = new Date().toISOString().slice(0, 10)
  return goal.targetDate.slice(0, 10) < today
}

const activeGoals = computed(() => goals.value.filter((goal) => goal.status !== 'ARCHIVED'))
const baseScenario = computed(() => {
  return scenarios.value.find((scenario) => scenario.isActive !== false && scenario.kind === 'BASE')
      || scenarios.value.find((scenario) => scenario.isActive !== false)
      || null
})

const projectionRows = computed<GoalProjectionRow[]>(() => {
  const scenario = baseScenario.value
  const contribution = surplusEstimate.value?.monthlyContributionUsed ?? scenario?.monthlySurplus ?? 0

  return activeGoals.value.map((goal) => {
    const currentValueUsed = currentValueForGoal(goal)

    if (!scenario) {
      return {
        goal,
        projection: null,
        currentValueUsed,
        projectedValue: currentValueUsed,
        variation: 0,
        progressPercent: Number(goal.targetAmount || 0) > 0 ? Math.min((currentValueUsed / Number(goal.targetAmount)) * 100, 100) : 0,
        estimatedReachDate: null,
        error: 'Aucun scénario actif disponible.',
      }
    }

    try {
      const projection = buildMonthlyProjection({
        initialValue: currentValueUsed,
        targetAmount: Number(goal.targetAmount || 0),
        monthlyContribution: contribution,
        horizonMonths: scenario.horizonMonths || 12,
        annualGrowthRate: scenario.annualGrowthRate,
        annualInflationRate: scenario.annualInflationRate,
        currency: goal.currency || props.summaryCurrency,
        scenarioId: scenario.id,
        scenarioKind: mapScenarioKind(scenario.kind),
        startDate: new Date().toISOString().slice(0, 10),
      })
      const projectedValue = projection.attainmentEstimate.finalProjectedValue

      return {
        goal,
        projection,
        currentValueUsed,
        projectedValue,
        variation: projectedValue - currentValueUsed,
        progressPercent: projection.progress.progressPercent,
        estimatedReachDate: projection.attainmentEstimate.estimatedReachDate,
        error: projection.status === 'invalidInput' ? projection.errors.map((error) => error.message).join(' ') : null,
      }
    } catch (error) {
      return {
        goal,
        projection: null,
        currentValueUsed,
        projectedValue: currentValueUsed,
        variation: 0,
        progressPercent: Number(goal.targetAmount || 0) > 0 ? Math.min((currentValueUsed / Number(goal.targetAmount)) * 100, 100) : 0,
        estimatedReachDate: null,
        error: error instanceof Error ? error.message : 'Projection indisponible.',
      }
    }
  })
})

const nextReachDate = computed(() => {
  return projectionRows.value
      .map((row) => row.estimatedReachDate)
      .filter(Boolean)
      .sort((left, right) => String(left).localeCompare(String(right)))[0] || null
})

const globalProgress = computed(() => {
  const targetTotal = activeGoals.value.reduce((sum, goal) => sum + Math.max(0, Number(goal.targetAmount || 0)), 0)
  if (targetTotal <= 0) return 0

  const currentTotal = activeGoals.value.reduce((sum, goal) => {
    return sum + Math.min(currentValueForGoal(goal), Math.max(0, Number(goal.targetAmount || 0)))
  }, 0)

  return Math.min((currentTotal / targetTotal) * 100, 100)
})

const reachedGoalCount = computed(() => activeGoals.value.filter(isGoalReached).length)
const overdueGoalCount = computed(() => activeGoals.value.filter(isGoalOverdue).length)
const selectedTrajectory = computed(() => projectionRows.value.find((row) => row.goal.type === 'NET_WORTH') || projectionRows.value[0] || null)
const hypothesisSummary = computed(() => ({
  scenarioName: baseScenario.value?.name || '—',
  horizonMonths: baseScenario.value?.horizonMonths || 0,
  contribution: surplusEstimate.value?.monthlyContributionUsed ?? baseScenario.value?.monthlySurplus ?? 0,
  annualGrowthRate: baseScenario.value?.annualGrowthRate ?? null,
  annualInflationRate: baseScenario.value?.annualInflationRate ?? null,
}))

async function loadGoalSummary() {
  const api = window.goals
  if (!api) {
    warningMessage.value = 'API Objectifs indisponible.'
    return
  }

  loading.value = true
  warningMessage.value = null

  try {
    await api.ensureDefaultProjectionScenarios()
    const [goalRows, scenarioRows, surplusRows] = await Promise.all([
      api.listFinancialGoals({status: 'ALL'}),
      api.listProjectionScenarios({isActive: true}),
      api.estimateMonthlySurplus({
        currency: props.summaryCurrency,
        referenceDate: new Date().toISOString().slice(0, 10),
      }),
    ])

    goals.value = unwrapResult(goalRows, 'Objectifs indisponibles.') as FinancialGoalRow[]
    scenarios.value = unwrapResult(scenarioRows, 'Scénarios indisponibles.') as ProjectionScenarioRow[]
    surplusEstimate.value = unwrapResult(surplusRows, 'Surplus indisponible.') as MonthlySurplusEstimate
  } catch (error) {
    warningMessage.value = error instanceof Error ? error.message : 'Résumé objectifs indisponible.'
    goals.value = []
    scenarios.value = []
    surplusEstimate.value = null
  } finally {
    loading.value = false
  }
}

function openGoalDetails(goalId?: number) {
  window.dispatchEvent(new CustomEvent('budget:open-goals', {detail: {goalId: goalId || selectedTrajectory.value?.goal.id || null}}))
}

watch(
    () => [props.currentNetWorth, props.summaryCurrency],
    () => {
      void loadGoalSummary()
    },
)

onMounted(() => {
  void loadGoalSummary()
})
</script>

<template>
  <section class="rounded-[2rem] border border-slate-800 bg-slate-950 p-5 shadow-sm">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">Objectifs projetés</p>
        <h3 class="mt-2 text-xl font-semibold text-white">Où je vais</h3>
        <p class="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
          Résumé descriptif des objectifs et de leur trajectoire. Les projections dépendent des hypothèses visibles et ne constituent pas une promesse.
        </p>
      </div>
      <button
          type="button"
          class="inline-flex items-center justify-center rounded-2xl border border-violet-700 bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
          @click="openGoalDetails()"
      >
        Ouvrir le détail
      </button>
    </div>

    <div v-if="warningMessage" class="mt-4 rounded-2xl border border-amber-900/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
      Les objectifs n’ont pas pu être projetés pour le moment. Le dashboard patrimoine reste disponible. {{ warningMessage }}
    </div>

    <div v-if="loading" class="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-5 text-sm text-slate-300">
      Chargement du résumé des objectifs…
    </div>

    <div v-else-if="!warningMessage && activeGoals.length === 0" class="mt-4 rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 px-4 py-8 text-center">
      <p class="text-sm font-semibold text-white">Aucun objectif actif.</p>
      <p class="mt-1 text-sm text-slate-400">Ajoute un objectif pour voir sa trajectoire dans le dashboard patrimoine.</p>
    </div>

    <div v-else-if="!warningMessage" class="mt-5 space-y-5">
      <div class="grid gap-3 md:grid-cols-5">
        <article class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p class="text-xs uppercase tracking-[0.18em] text-slate-500">Actifs</p>
          <p class="mt-2 text-2xl font-semibold text-white">{{ activeGoals.length }}</p>
        </article>
        <article class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p class="text-xs uppercase tracking-[0.18em] text-slate-500">Atteints</p>
          <p class="mt-2 text-2xl font-semibold text-white">{{ reachedGoalCount }}</p>
        </article>
        <article class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p class="text-xs uppercase tracking-[0.18em] text-slate-500">En retard</p>
          <p class="mt-2 text-2xl font-semibold text-white">{{ overdueGoalCount }}</p>
        </article>
        <article class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p class="text-xs uppercase tracking-[0.18em] text-slate-500">Prochaine atteinte</p>
          <p class="mt-2 text-lg font-semibold text-white">{{ formatDate(nextReachDate) }}</p>
        </article>
        <article class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p class="text-xs uppercase tracking-[0.18em] text-slate-500">Progression globale</p>
          <p class="mt-2 text-2xl font-semibold text-white">{{ formatPercent(globalProgress) }}</p>
        </article>
      </div>

      <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <article class="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Carte où je vais</p>
              <h4 class="mt-2 text-lg font-semibold text-white">{{ selectedTrajectory?.goal.name || 'Trajectoire objectif' }}</h4>
              <p class="mt-1 text-sm text-slate-400">
                Valeur actuelle utilisée, valeur projetée à horizon et variation estimée.
              </p>
            </div>
            <span class="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300">
              {{ selectedTrajectory?.projection?.status || '—' }}
            </span>
          </div>

          <div class="mt-5 grid gap-3 md:grid-cols-3">
            <div class="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <p class="text-xs text-slate-500">Valeur actuelle utilisée</p>
              <p class="mt-2 text-2xl font-semibold text-white">{{ formatMoney(selectedTrajectory?.currentValueUsed, selectedTrajectory?.goal.currency || props.summaryCurrency) }}</p>
            </div>
            <div class="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <p class="text-xs text-slate-500">Valeur projetée</p>
              <p class="mt-2 text-2xl font-semibold text-white">{{ formatMoney(selectedTrajectory?.projectedValue, selectedTrajectory?.goal.currency || props.summaryCurrency) }}</p>
            </div>
            <div class="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <p class="text-xs text-slate-500">Variation projetée</p>
              <p class="mt-2 text-2xl font-semibold text-white">{{ formatMoney(selectedTrajectory?.variation, selectedTrajectory?.goal.currency || props.summaryCurrency) }}</p>
            </div>
          </div>

          <div v-if="selectedTrajectory?.projection?.months.length" class="mt-5 overflow-hidden rounded-2xl border border-slate-800">
            <svg viewBox="0 0 620 150" class="h-40 w-full bg-slate-950/70" role="img" aria-label="Trajectoire projetée objectif patrimoine">
              <polyline
                  :points="selectedTrajectory.projection.months.map((month, index) => `${32 + index * (556 / Math.max(1, selectedTrajectory!.projection!.months.length - 1))},${130 - Math.min(1, month.projectedValue / Math.max(1, selectedTrajectory!.goal.targetAmount)) * 100}`).join(' ')"
                  fill="none"
                  stroke="#8b5cf6"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
              />
              <line x1="32" y1="30" x2="588" y2="30" stroke="#94a3b8" stroke-dasharray="6 6" />
              <text x="38" y="24" fill="#cbd5e1" font-size="12">Cible</text>
            </svg>
          </div>
        </article>

        <article class="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
          <h4 class="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Hypothèses principales</h4>
          <dl class="mt-4 space-y-3 text-sm">
            <div class="flex justify-between gap-3">
              <dt class="text-slate-500">Scénario</dt>
              <dd class="font-semibold text-white">{{ hypothesisSummary.scenarioName }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-slate-500">Contribution mensuelle</dt>
              <dd class="font-semibold text-white">{{ formatMoney(hypothesisSummary.contribution, props.summaryCurrency) }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-slate-500">Horizon</dt>
              <dd class="font-semibold text-white">{{ hypothesisSummary.horizonMonths }} mois</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-slate-500">Croissance</dt>
              <dd class="font-semibold text-white">{{ formatRate(hypothesisSummary.annualGrowthRate) }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-slate-500">Inflation</dt>
              <dd class="font-semibold text-white">{{ formatRate(hypothesisSummary.annualInflationRate) }}</dd>
            </div>
          </dl>
        </article>
      </div>

      <div class="overflow-hidden rounded-2xl border border-slate-800">
        <table class="min-w-full divide-y divide-slate-800 text-sm">
          <thead class="bg-slate-900 text-xs uppercase tracking-[0.16em] text-slate-500">
          <tr>
            <th class="px-4 py-3 text-left">Objectif</th>
            <th class="px-4 py-3 text-right">Valeur utilisée</th>
            <th class="px-4 py-3 text-right">Projection</th>
            <th class="px-4 py-3 text-right">Atteinte estimée</th>
            <th class="px-4 py-3 text-right">Progression</th>
            <th class="px-4 py-3 text-right">Action</th>
          </tr>
          </thead>
          <tbody class="divide-y divide-slate-800 bg-slate-950">
          <tr v-for="row in projectionRows" :key="row.goal.id">
            <td class="px-4 py-3 text-slate-200">
              <div class="font-semibold text-white">{{ row.goal.name }}</div>
              <div v-if="row.error" class="mt-1 text-xs text-amber-300">Projection partielle : {{ row.error }}</div>
            </td>
            <td class="px-4 py-3 text-right text-slate-300">{{ formatMoney(row.currentValueUsed, row.goal.currency) }}</td>
            <td class="px-4 py-3 text-right text-slate-300">{{ formatMoney(row.projectedValue, row.goal.currency) }}</td>
            <td class="px-4 py-3 text-right text-slate-300">{{ formatDate(row.estimatedReachDate) }}</td>
            <td class="px-4 py-3 text-right text-slate-300">{{ formatPercent(row.progressPercent) }}</td>
            <td class="px-4 py-3 text-right">
              <button type="button" class="rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800" @click="openGoalDetails(row.goal.id)">
                Détail
              </button>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
