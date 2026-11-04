<script setup lang="ts">
import {currentLocaleCode} from '../i18n'
import {useI18n} from 'vue-i18n'
import {computed, onMounted, reactive, ref, watch} from 'vue'

import {buildMonthlyProjection, type MonthlyProjectionResult} from '../utils/monthlyProjectionEngine'
import type {ProjectionScenarioKind} from '../types/goals'

const {t} = useI18n()

const props = withDefaults(
    defineProps<{
      summaryCurrency?: string
    }>(),
    {
      summaryCurrency: 'CAD',
    },
)

type GoalTypeDto =
    | 'SAVINGS'
    | 'EMERGENCY_FUND'
    | 'DEBT_PAYOFF'
    | 'PURCHASE'
    | 'INVESTMENT'
    | 'RETIREMENT'
    | 'NET_WORTH'
    | 'OTHER'

type GoalStatusDto = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
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

type MonthlySurplusEstimate = {
  source: 'automaticFromBudget' | 'automaticFromRecurring' | 'manualOverride' | 'unavailable'
  currency: string
  monthlyContributionUsed: number
  manualMonthlyContribution: number | null
  estimatedMonthlySurplus: number
  estimatedMonthlyIncome: number
  estimatedMonthlyExpense: number
  netMonthlyEstimate: number
  warnings: string[]
}

type GoalForm = {
  name: string
  type: GoalTypeDto
  targetAmount: number | null
  currency: string
  targetDate: string
  startingAmount: number | null
  priority: number | null
  notes: string
}

type ProjectionConfig = {
  scenarioId: number | null
  manualMonthlyContribution: number | null
  horizonMonths: number | null
}

const goalTypes: GoalTypeDto[] = ['SAVINGS', 'EMERGENCY_FUND', 'DEBT_PAYOFF', 'PURCHASE', 'INVESTMENT', 'RETIREMENT', 'NET_WORTH', 'OTHER']

const goals = ref<FinancialGoalRow[]>([])
const scenarios = ref<ProjectionScenarioRow[]>([])
const surplusEstimate = ref<MonthlySurplusEstimate | null>(null)
const selectedGoalId = ref<number | null>(null)
const editingGoalId = ref<number | null>(null)
const loading = ref(false)
const saving = ref(false)
const projecting = ref(false)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)

const projectionConfig = reactive<ProjectionConfig>({
  scenarioId: null,
  manualMonthlyContribution: null,
  horizonMonths: null,
})

const goalForm = reactive<GoalForm>(freshGoalForm())

function freshGoalForm(): GoalForm {
  return {
    name: '',
    type: 'SAVINGS',
    targetAmount: null,
    currency: props.summaryCurrency,
    targetDate: '',
    startingAmount: 0,
    priority: null,
    notes: '',
  }
}

function assignForm(source: GoalForm) {
  Object.assign(goalForm, source)
}

function resetForm() {
  editingGoalId.value = null
  assignForm(freshGoalForm())
}

function normalizeCurrency(value: string | null | undefined) {
  return (value || props.summaryCurrency || 'CAD').trim().toUpperCase()
}

function optionalText(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function optionalNumber(value: number | string | null | undefined) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatMoney(amount: number | null | undefined, currency = props.summaryCurrency) {
  if (amount == null || Number.isNaN(Number(amount))) return '—'

  return new Intl.NumberFormat(currentLocaleCode(), {
    style: 'currency',
    currency: normalizeCurrency(currency),
    maximumFractionDigits: 0,
  }).format(Number(amount || 0))
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'

  return new Intl.DateTimeFormat(currentLocaleCode(), {dateStyle: 'medium'}).format(new Date(value))
}

function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return '—'

  return new Intl.NumberFormat(currentLocaleCode(), {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(Number(value) / 100)
}

function formatRate(value: number | null | undefined) {
  if (value == null) return '—'

  return new Intl.NumberFormat(currentLocaleCode(), {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(Number(value))
}

function normalizeError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

function unwrapResult<T>(result: {ok: boolean; data: T | null; error?: {message?: string} | null}, fallback: string): T {
  if (result.ok && result.data != null) return result.data
  throw new Error(result.error?.message || fallback)
}

const activeGoals = computed(() => goals.value.filter((goal) => goal.status !== 'ARCHIVED'))
const selectedGoal = computed(() => {
  return activeGoals.value.find((goal) => goal.id === selectedGoalId.value) || activeGoals.value[0] || null
})
const activeScenarios = computed(() => scenarios.value.filter((scenario) => scenario.isActive !== false))
const selectedScenario = computed(() => {
  return activeScenarios.value.find((scenario) => scenario.id === projectionConfig.scenarioId)
      || activeScenarios.value.find((scenario) => scenario.kind === 'BASE')
      || activeScenarios.value[0]
      || null
})

const projection = computed<MonthlyProjectionResult | null>(() => {
  const goal = selectedGoal.value
  if (!goal) return null

  const scenario = selectedScenario.value
  const horizonMonths = projectionConfig.horizonMonths || scenario?.horizonMonths || 12
  const contribution = projectionConfig.manualMonthlyContribution != null
      ? projectionConfig.manualMonthlyContribution
      : surplusEstimate.value?.monthlyContributionUsed ?? scenario?.monthlySurplus ?? 0

  return buildMonthlyProjection({
    initialValue: Number(goal.startingAmount || 0),
    targetAmount: Number(goal.targetAmount || 0),
    monthlyContribution: contribution,
    horizonMonths,
    annualGrowthRate: scenario?.annualGrowthRate ?? null,
    annualInflationRate: scenario?.annualInflationRate ?? null,
    currency: goal.currency || props.summaryCurrency,
    scenarioId: scenario?.id ?? null,
    scenarioKind: mapScenarioKind(scenario?.kind),
    startDate: new Date().toISOString().slice(0, 10),
  })
})

const selectedGoalProgress = computed(() => projection.value?.progress || null)
const selectedGoalRemaining = computed(() => projection.value?.progress.remainingAmount ?? null)
const hasGoals = computed(() => activeGoals.value.length > 0)

const summary = computed(() => {
  const totalTarget = activeGoals.value.reduce((sum, goal) => sum + Number(goal.targetAmount || 0), 0)
  const completed = activeGoals.value.filter((goal) => {
    if (goal.status === 'COMPLETED') return true
    const start = Number(goal.startingAmount || 0)
    return start >= Number(goal.targetAmount || 0)
  }).length

  return {
    totalTarget,
    activeCount: activeGoals.value.length,
    completed,
    nextReachDate: projection.value?.attainmentEstimate.estimatedReachDate || null,
  }
})

function mapScenarioKind(kind: ScenarioKindDto | null | undefined): ProjectionScenarioKind {
  if (kind === 'PESSIMISTIC') return 'pessimistic'
  if (kind === 'BASE') return 'base'
  if (kind === 'OPTIMISTIC') return 'optimistic'
  return 'custom'
}

function projectionStatusLabel(status: MonthlyProjectionResult['status'] | undefined) {
  return status ? t(`goalsDashboard.projectionStatus.${status}`) : '—'
}

function projectionStatusClass(status: MonthlyProjectionResult['status'] | undefined) {
  if (status === 'alreadyReached' || status === 'reachable') return 'border-emerald-800 bg-emerald-950/50 text-emerald-100'
  if (status === 'unreachableWithinHorizon') return 'border-amber-800 bg-amber-950/50 text-amber-100'
  return 'border-slate-800 bg-slate-900 text-slate-300'
}

function buildGoalPayload() {
  return {
    name: goalForm.name.trim(),
    type: goalForm.type,
    targetAmount: Number(goalForm.targetAmount || 0),
    currency: normalizeCurrency(goalForm.currency),
    targetDate: goalForm.targetDate || null,
    startingAmount: optionalNumber(goalForm.startingAmount),
    priority: optionalNumber(goalForm.priority),
    notes: optionalText(goalForm.notes),
    status: 'ACTIVE' as GoalStatusDto,
  }
}

async function loadGoals() {
  const api = window.goals
  if (!api) {
    errorMessage.value = t('goalsDashboard.notices.apiUnavailable')
    return
  }

  loading.value = true
  errorMessage.value = null

  try {
    await api.ensureDefaultProjectionScenarios()
    const [goalRows, scenarioRows] = await Promise.all([
      api.listFinancialGoals({status: 'ALL'}),
      api.listProjectionScenarios({isActive: true}),
    ])

    goals.value = unwrapResult(goalRows, t('goalsDashboard.notices.goalsLoadFailed')) as FinancialGoalRow[]
    scenarios.value = unwrapResult(scenarioRows, t('goalsDashboard.notices.scenariosLoadFailed')) as ProjectionScenarioRow[]

    if (!selectedGoalId.value && activeGoals.value.length > 0) {
      selectedGoalId.value = activeGoals.value[0].id
    }

    if (!projectionConfig.scenarioId && activeScenarios.value.length > 0) {
      projectionConfig.scenarioId = selectedScenario.value?.id ?? activeScenarios.value[0].id
    }

    await refreshMonthlySurplus()
  } catch (error) {
    errorMessage.value = normalizeError(error, t('goalsDashboard.notices.goalsLoadFailed'))
  } finally {
    loading.value = false
  }
}

async function refreshMonthlySurplus() {
  const api = window.goals
  if (!api) return

  projecting.value = true

  try {
    const result = await api.estimateMonthlySurplus({
      currency: selectedGoal.value?.currency || props.summaryCurrency,
      manualMonthlyContribution: projectionConfig.manualMonthlyContribution,
      referenceDate: new Date().toISOString().slice(0, 10),
    })

    surplusEstimate.value = unwrapResult(result, t('goalsDashboard.notices.monthlySurplusFailed')) as MonthlySurplusEstimate
  } catch (error) {
    surplusEstimate.value = null
    errorMessage.value = normalizeError(error, t('goalsDashboard.notices.monthlySurplusFailed'))
  } finally {
    projecting.value = false
  }
}

async function saveGoal() {
  const api = window.goals
  if (!api) return

  saving.value = true
  errorMessage.value = null
  successMessage.value = null

  try {
    const payload = buildGoalPayload()
    if (!payload.name) throw new Error(t('goalsDashboard.notices.nameRequired'))
    if (!Number.isFinite(payload.targetAmount) || payload.targetAmount <= 0) {
      throw new Error(t('goalsDashboard.notices.positiveTargetRequired'))
    }

    const result = editingGoalId.value
        ? await api.updateFinancialGoal(editingGoalId.value, payload)
        : await api.createFinancialGoal(payload)
    const saved = unwrapResult(result, t('goalsDashboard.notices.saveFailed')) as FinancialGoalRow

    successMessage.value = editingGoalId.value ? t('goalsDashboard.notices.updated') : t('goalsDashboard.notices.created')
    selectedGoalId.value = saved.id
    resetForm()
    await loadGoals()
  } catch (error) {
    errorMessage.value = normalizeError(error, t('goalsDashboard.notices.saveFailed'))
  } finally {
    saving.value = false
  }
}

function editGoal(goal: FinancialGoalRow) {
  editingGoalId.value = goal.id
  assignForm({
    name: goal.name,
    type: goal.type,
    targetAmount: goal.targetAmount,
    currency: goal.currency,
    targetDate: goal.targetDate?.slice(0, 10) || '',
    startingAmount: goal.startingAmount ?? 0,
    priority: goal.priority,
    notes: goal.notes || '',
  })
}

async function removeGoal(goal: FinancialGoalRow) {
  const api = window.goals
  if (!api) return
  if (!window.confirm(t('goalsDashboard.notices.confirmDelete', {name: goal.name}))) return

  saving.value = true
  errorMessage.value = null
  successMessage.value = null

  try {
    unwrapResult(await api.deleteFinancialGoal(goal.id), t('goalsDashboard.notices.deleteFailed'))
    successMessage.value = t('goalsDashboard.notices.deleted')

    if (selectedGoalId.value === goal.id) {
      selectedGoalId.value = null
    }

    resetForm()
    await loadGoals()
  } catch (error) {
    errorMessage.value = normalizeError(error, t('goalsDashboard.notices.deleteFailed'))
  } finally {
    saving.value = false
  }
}

watch(selectedGoalId, () => {
  void refreshMonthlySurplus()
})

watch(
    () => projectionConfig.manualMonthlyContribution,
    () => {
      void refreshMonthlySurplus()
    },
)

watch(
    () => props.summaryCurrency,
    () => {
      goalForm.currency = props.summaryCurrency
      void loadGoals()
    },
)

onMounted(() => {
  void loadGoals()
})
</script>

<template>
  <section class="space-y-6">
    <div class="overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 shadow-sm">
      <div class="border-b border-slate-800 px-6 py-5">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">{{ t('goals.modalEyebrow') }}</p>
            <h2 class="mt-2 text-2xl font-semibold text-white">{{ t('goalsDashboard.title') }}</h2>
            <p class="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
              {{ t('interfaceText.goalsSection.modelMonthlyProgressUsingYourAssumptionsProjections') }}
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
                type="button"
                class="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="loading"
                @click="loadGoals"
            >
              {{ loading ? t('common.loading') : t('common.refresh') }}
            </button>
          </div>
        </div>
      </div>

      <div class="grid gap-px bg-slate-800 md:grid-cols-4">
        <article class="bg-slate-950 px-6 py-5">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{{ t('goalsDashboard.activeGoals') }}</p>
          <p class="mt-3 text-3xl font-semibold text-white">{{ summary.activeCount }}</p>
          <p class="mt-1 text-sm text-slate-400">{{ summary.completed }} {{ t('interfaceText.goalsSection.completed') }}</p>
        </article>

        <article class="bg-slate-950 px-6 py-5">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{{ t('goalsDashboard.cumulativeTarget') }}</p>
          <p class="mt-3 text-3xl font-semibold text-white">{{ formatMoney(summary.totalTarget, props.summaryCurrency) }}</p>
          <p class="mt-1 text-sm text-slate-400">{{ t('interfaceText.goalsSection.eachGoalIsShownInItsOwn') }}</p>
        </article>

        <article class="bg-gradient-to-br from-violet-950 to-slate-950 px-6 py-5">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">{{ t('goalsDashboard.contributionUsed') }}</p>
          <p class="mt-3 text-3xl font-semibold text-white">
            {{ formatMoney(projection?.monthlyContribution ?? 0, selectedGoal?.currency || props.summaryCurrency) }}
          </p>
          <p class="mt-1 text-sm text-violet-200/80">
            {{ surplusEstimate ? t(`goalsDashboard.source.${surplusEstimate.source}`) : t('goalsDashboard.notCalculated') }}
          </p>
        </article>

        <article class="bg-slate-950 px-6 py-5">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{{ t('goalsDashboard.estimatedDate') }}</p>
          <p class="mt-3 text-3xl font-semibold text-white">{{ formatDate(projection?.attainmentEstimate.estimatedReachDate) }}</p>
          <p class="mt-1 text-sm text-slate-400">{{ t('interfaceText.goalsSection.shownWhenAnEstimateIsAvailable') }}</p>
        </article>
      </div>
    </div>

    <div v-if="errorMessage" class="rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
      {{ errorMessage }}
    </div>
    <div v-if="successMessage" class="rounded-2xl border border-emerald-900/60 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
      {{ successMessage }}
    </div>

    <div class="grid gap-6 xl:grid-cols-[430px_minmax(0,1fr)]">
      <article class="rounded-[2rem] border border-slate-800 bg-slate-950 p-5 shadow-sm">
        <div class="mb-5">
          <h3 class="text-lg font-semibold text-white">
            {{ editingGoalId ? t('goalsDashboard.editGoal') : t('goalsDashboard.createGoal') }}
          </h3>
          <p class="mt-1 text-sm text-slate-400">
            {{ t('interfaceText.goalsSection.setTheTargetAndStartingAssumptions') }}
          </p>
        </div>

        <form class="space-y-4" @submit.prevent="saveGoal">
          <div>
            <label class="text-sm font-medium text-slate-300">{{ t('forms.fields.name') }}</label>
            <input
                v-model="goalForm.name"
                required
                class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-violet-500"
                :placeholder="t('goalsDashboard.placeholders.name')"
            />
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="text-sm font-medium text-slate-300">{{ t('forms.fields.type') }}</label>
              <select
                  v-model="goalForm.type"
                  class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
              >
                <option v-for="value in goalTypes" :key="value" :value="value">{{ t(`goalsDashboard.goalType.${value}`) }}</option>
              </select>
            </div>

            <div>
              <label class="text-sm font-medium text-slate-300">{{ t('forms.fields.currency') }}</label>
              <input
                  v-model="goalForm.currency"
                  class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm uppercase text-white outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="text-sm font-medium text-slate-300">{{ t('goalsDashboard.targetAmount') }}</label>
              <input
                  v-model.number="goalForm.targetAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label class="text-sm font-medium text-slate-300">{{ t('goalsDashboard.startingAmount') }}</label>
              <input
                  v-model.number="goalForm.startingAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="text-sm font-medium text-slate-300">{{ t('goalsDashboard.optionalTargetDate') }}</label>
              <input
                  v-model="goalForm.targetDate"
                  type="date"
                  class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label class="text-sm font-medium text-slate-300">{{ t('goalsDashboard.optionalPriority') }}</label>
              <input
                  v-model.number="goalForm.priority"
                  type="number"
                  min="0"
                  step="1"
                  class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div>
            <label class="text-sm font-medium text-slate-300">{{ t('goalsDashboard.notes') }}</label>
            <textarea
                v-model="goalForm.notes"
                rows="3"
                class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                :placeholder="t('interfaceText.goalsSection.assumptionsOrReminders')"
            />
          </div>

          <div class="flex flex-wrap gap-2 pt-2">
            <button
                type="submit"
                class="inline-flex items-center justify-center rounded-2xl border border-violet-700 bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="saving"
            >
              {{ saving ? t('wealth.form.saving') : editingGoalId ? t('common.update') : t('common.create') }}
            </button>
            <button
                type="button"
                class="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
                @click="resetForm"
            >
              {{ t('common.reset') }}
            </button>
          </div>
        </form>
      </article>

      <div class="space-y-6">
        <article class="rounded-[2rem] border border-slate-800 bg-slate-950 p-5 shadow-sm">
          <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 class="text-lg font-semibold text-white">{{ t('interfaceText.goalsSection.goals') }}</h3>
              <p class="mt-1 text-sm text-slate-400">{{ t('interfaceText.goalsSection.selectAGoalToViewItsProjection') }}</p>
            </div>
          </div>

          <div v-if="loading" class="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-5 text-sm text-slate-300">
            {{ t('goalsDashboard.loadingGoals') }}
          </div>

          <div v-else-if="!hasGoals" class="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 px-4 py-8 text-center">
            <p class="text-sm font-semibold text-white">{{ t('goalsDashboard.noGoalTitle') }}</p>
            <p class="mt-1 text-sm text-slate-400">{{ t('interfaceText.goalsSection.createAGoalToSeeItsProjected') }}</p>
          </div>

          <div v-else class="grid gap-3 lg:grid-cols-2">
            <button
                v-for="goal in activeGoals"
                :key="goal.id"
                type="button"
                class="rounded-2xl border p-4 text-left transition"
                :class="selectedGoal?.id === goal.id ? 'border-violet-600 bg-violet-950/40' : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'"
                @click="selectedGoalId = goal.id"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-white">{{ goal.name }}</p>
                  <p class="mt-1 text-xs text-slate-400">{{ t(`goalsDashboard.goalType.${goal.type}`) }} · {{ t(`goalsDashboard.goalStatus.${goal.status}`) }}</p>
                </div>
                <span class="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">
                  {{ goal.priority == null ? '—' : `P${goal.priority}` }}
                </span>
              </div>

              <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p class="text-xs text-slate-500">{{ t('budgets.target') }}</p>
                  <p class="font-semibold text-white">{{ formatMoney(goal.targetAmount, goal.currency) }}</p>
                </div>
                <div>
                  <p class="text-xs text-slate-500">{{ t('interfaceText.goalsSection.startingBalance') }}</p>
                  <p class="font-semibold text-white">{{ formatMoney(goal.startingAmount || 0, goal.currency) }}</p>
                </div>
              </div>

              <div class="mt-4 flex flex-wrap gap-2">
                <button
                    type="button"
                    class="rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                    @click.stop="editGoal(goal)"
                >
                  {{ t('common.modify') }}
                </button>
                <button
                    type="button"
                    class="rounded-xl border border-red-900/70 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-950/40"
                    @click.stop="removeGoal(goal)"
                >
                  {{ t('common.delete') }}
                </button>
              </div>
            </button>
          </div>
        </article>

        <article class="rounded-[2rem] border border-slate-800 bg-slate-950 p-5 shadow-sm">
          <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 class="text-lg font-semibold text-white">{{ t('interfaceText.goalsSection.monthlyProjection') }}</h3>
              <p class="mt-1 text-sm text-slate-400">{{ t('interfaceText.goalsSection.basedOnTheAssumptionsBelow') }}</p>
            </div>
            <span
                class="inline-flex rounded-full border px-3 py-1 text-xs font-semibold"
                :class="projectionStatusClass(projection?.status)"
            >
              {{ projectionStatusLabel(projection?.status) }}
            </span>
          </div>

          <div v-if="!selectedGoal" class="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 px-4 py-8 text-center text-sm text-slate-400">
            {{ t('goalsDashboard.noSelectedGoal') }}
          </div>

          <div v-else class="space-y-5">
            <div class="grid gap-3 lg:grid-cols-3">
              <div>
                <label class="text-sm font-medium text-slate-300">{{ t('wealthGoalsSummary.scenario') }}</label>
                <select
                    v-model.number="projectionConfig.scenarioId"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                >
                  <option v-for="scenario in activeScenarios" :key="scenario.id" :value="scenario.id">
                    {{ scenario.name }} · {{ t(`goalsDashboard.scenario.${scenario.kind}`) }}
                  </option>
                </select>
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">{{ t('interfaceText.goalsSection.manualContribution') }}</label>
                <input
                    v-model.number="projectionConfig.manualMonthlyContribution"
                    type="number"
                    min="0"
                    step="0.01"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                    :placeholder="t('interfaceText.goalsSection.automatic')"
                />
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">{{ t('interfaceText.goalsSection.horizonMonths') }}</label>
                <input
                    v-model.number="projectionConfig.horizonMonths"
                    type="number"
                    min="1"
                    step="1"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                    :placeholder="String(selectedScenario?.horizonMonths || 12)"
                />
              </div>
            </div>

            <div class="grid gap-3 md:grid-cols-4">
              <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <p class="text-xs uppercase tracking-[0.18em] text-slate-500">{{ t('goalsDashboard.progress') }}</p>
                <p class="mt-2 text-2xl font-semibold text-white">{{ formatPercent(selectedGoalProgress?.progressPercent) }}</p>
                <p class="mt-1 text-xs text-slate-400">{{ formatMoney(selectedGoalProgress?.currentAmount, selectedGoal.currency) }} / {{ formatMoney(selectedGoal.targetAmount, selectedGoal.currency) }}</p>
              </div>

              <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <p class="text-xs uppercase tracking-[0.18em] text-slate-500">{{ t('budgets.remaining') }}</p>
                <p class="mt-2 text-2xl font-semibold text-white">{{ formatMoney(selectedGoalRemaining, selectedGoal.currency) }}</p>
                <p class="mt-1 text-xs text-slate-400">{{ t('interfaceText.goalsSection.estimatedAmountRemaining') }}</p>
              </div>

              <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <p class="text-xs uppercase tracking-[0.18em] text-slate-500">{{ t('interfaceText.goalsSection.targetReached') }}</p>
                <p class="mt-2 text-2xl font-semibold text-white">{{ formatDate(projection?.attainmentEstimate.estimatedReachDate) }}</p>
                <p class="mt-1 text-xs text-slate-400">{{ projection?.attainmentEstimate.estimatedMonthsToReach ?? '—' }} {{ t('interfaceText.goalsSection.months') }}</p>
              </div>

              <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <p class="text-xs uppercase tracking-[0.18em] text-slate-500">{{ t('interfaceText.goalsSection.source') }}</p>
                <p class="mt-2 text-lg font-semibold text-white">{{ surplusEstimate ? t(`goalsDashboard.source.${surplusEstimate.source}`) : '—' }}</p>
                <p class="mt-1 text-xs text-slate-400">{{ projecting ? t('interfaceText.goalsSection.calculating') : t('interfaceText.goalsSection.amountUsedForContributions') }}</p>
              </div>
            </div>

            <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div class="grid gap-3 md:grid-cols-4">
                <div>
                  <p class="text-xs text-slate-500">{{ t('interfaceText.goalsSection.estimatedSurplus') }}</p>
                  <p class="mt-1 font-semibold text-white">{{ formatMoney(surplusEstimate?.estimatedMonthlySurplus, selectedGoal.currency) }}</p>
                </div>
                <div>
                  <p class="text-xs text-slate-500">{{ t('interfaceText.goalsSection.estimatedIncome') }}</p>
                  <p class="mt-1 font-semibold text-white">{{ formatMoney(surplusEstimate?.estimatedMonthlyIncome, selectedGoal.currency) }}</p>
                </div>
                <div>
                  <p class="text-xs text-slate-500">{{ t('interfaceText.goalsSection.estimatedExpenses') }}</p>
                  <p class="mt-1 font-semibold text-white">{{ formatMoney(surplusEstimate?.estimatedMonthlyExpense, selectedGoal.currency) }}</p>
                </div>
                <div>
                  <p class="text-xs text-slate-500">{{ t('interfaceText.goalsSection.growthInflation') }}</p>
                  <p class="mt-1 font-semibold text-white">{{ formatRate(selectedScenario?.annualGrowthRate) }} / {{ formatRate(selectedScenario?.annualInflationRate) }}</p>
                </div>
              </div>
              <p class="mt-3 text-xs leading-5 text-slate-500">
                {{ t('interfaceText.goalsSection.resultsDependOnTheAssumptionsSelected') }}
              </p>
            </div>

            <div v-if="projection?.status === 'unreachableWithinHorizon'" class="rounded-2xl border border-amber-900/70 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
              {{ t('interfaceText.goalsSection.theTargetIsBeyondTheSelectedHorizon') }}
            </div>

            <div v-if="projection?.status === 'alreadyReached'" class="rounded-2xl border border-emerald-900/70 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-100">
              {{ t('interfaceText.goalsSection.theStartingBalanceAlreadyMeetsTheTarget') }}
            </div>

            <div class="overflow-hidden rounded-2xl border border-slate-800">
              <table class="min-w-full divide-y divide-slate-800 text-sm">
                <thead class="bg-slate-900 text-xs uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th class="px-4 py-3 text-left">{{ t('goalsDashboard.month') }}</th>
                  <th class="px-4 py-3 text-right">{{ t('goalsDashboard.contribution') }}</th>
                  <th class="px-4 py-3 text-right">{{ t('wealthGoalsSummary.growth') }}</th>
                  <th class="px-4 py-3 text-right">{{ t('interfaceText.goalsSection.value') }}</th>
                  <th class="px-4 py-3 text-right">{{ t('budgets.remaining') }}</th>
                </tr>
                </thead>
                <tbody class="divide-y divide-slate-800 bg-slate-950">
                <tr v-for="month in projection?.months.slice(0, 12) || []" :key="month.month">
                  <td class="px-4 py-3 text-slate-300">{{ formatDate(month.month) }}</td>
                  <td class="px-4 py-3 text-right text-slate-300">{{ formatMoney(month.contributionAmount, month.currency) }}</td>
                  <td class="px-4 py-3 text-right text-slate-300">{{ formatMoney(month.growthAmount, month.currency) }}</td>
                  <td class="px-4 py-3 text-right font-semibold text-white">{{ formatMoney(month.projectedValue, month.currency) }}</td>
                  <td class="px-4 py-3 text-right text-slate-300">{{ formatMoney(month.remainingAmount, month.currency) }}</td>
                </tr>
                <tr v-if="!projection || projection.months.length === 0">
                  <td colspan="5" class="px-4 py-6 text-center text-slate-500">
                    {{ t('interfaceText.goalsSection.noMonthlyFiguresAvailable') }}
                  </td>
                </tr>
                </tbody>
              </table>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
