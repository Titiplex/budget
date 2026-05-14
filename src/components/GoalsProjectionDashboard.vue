<script setup lang="ts">
import {computed, onMounted, reactive, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'

const props = withDefaults(defineProps<{summaryCurrency?: string}>(), {summaryCurrency: 'CAD'})
const {t} = useI18n()

type GoalTypeDto = 'SAVINGS' | 'EMERGENCY_FUND' | 'DEBT_PAYOFF' | 'PURCHASE' | 'INVESTMENT' | 'RETIREMENT' | 'NET_WORTH' | 'OTHER'
type GoalStatusDto = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
type ScenarioKindDto = 'PESSIMISTIC' | 'BASE' | 'OPTIMISTIC' | 'CUSTOM'
type SurplusSource = 'automaticFromBudget' | 'automaticFromRecurring' | 'manualOverride' | 'unavailable'

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
  isDefault: boolean
  isActive: boolean
}

type MonthlySurplusEstimate = {
  source: SurplusSource
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

const goalTypes: GoalTypeDto[] = ['SAVINGS', 'EMERGENCY_FUND', 'DEBT_PAYOFF', 'PURCHASE', 'INVESTMENT', 'RETIREMENT', 'NET_WORTH', 'OTHER']
const scenarioKinds: ScenarioKindDto[] = ['PESSIMISTIC', 'BASE', 'OPTIMISTIC']
const goals = ref<FinancialGoalRow[]>([])
const scenarios = ref<ProjectionScenarioRow[]>([])
const surplusEstimate = ref<MonthlySurplusEstimate | null>(null)
const selectedGoalId = ref<number | null>(null)
const selectedScenarioId = ref<number | null>(null)
const editingGoalId = ref<number | null>(null)
const detailsOpen = ref(false)
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)

const projectionSettings = reactive({
  manualMonthlyContribution: null as number | null,
  horizonMonths: null as number | null,
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

function goalsApi() {
  return (window as unknown as {goals?: any}).goals
}

function resetGoalForm() {
  editingGoalId.value = null
  Object.assign(goalForm, freshGoalForm())
}

function normalizeCurrency(value?: string | null) {
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
  return new Intl.NumberFormat(undefined, {style: 'percent', maximumFractionDigits: 1}).format(Number(value) / 100)
}

function formatRate(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat(undefined, {style: 'percent', maximumFractionDigits: 2}).format(Number(value))
}

function unwrapResult<T>(result: {ok: boolean; data: T | null; error?: {message?: string} | null}, fallback: string): T {
  if (result?.ok && result.data != null) return result.data
  throw new Error(result?.error?.message || fallback)
}

function normalizeError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

function optionalNumber(value: number | string | null | undefined) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function trGoalType(type: GoalTypeDto) {
  return t(`goalsDashboard.goalType.${type}`)
}

function trGoalStatus(status: GoalStatusDto) {
  return t(`goalsDashboard.goalStatus.${status}`)
}

function trScenario(kind: ScenarioKindDto) {
  return t(`goalsDashboard.scenario.${kind}`)
}

function trSource(source: SurplusSource) {
  return t(`goalsDashboard.source.${source}`)
}

function projectionStatusLabel(status: ProjectionStatus) {
  return t(`goalsDashboard.projectionStatus.${status}`)
}

const activeGoals = computed(() => goals.value.filter((goal) => goal.status !== 'ARCHIVED'))
const activeScenarios = computed(() => scenarios.value.filter((scenario) => scenario.isActive !== false))
const selectedGoal = computed(() => activeGoals.value.find((goal) => goal.id === selectedGoalId.value) || activeGoals.value[0] || null)
const selectedScenario = computed(() => activeScenarios.value.find((scenario) => scenario.id === selectedScenarioId.value)
    || activeScenarios.value.find((scenario) => scenario.kind === 'BASE')
    || activeScenarios.value[0]
    || null)
const hasGoals = computed(() => activeGoals.value.length > 0)
const horizonMonths = computed(() => Number(projectionSettings.horizonMonths || selectedScenario.value?.horizonMonths || 12))
const contributionUsed = computed(() => {
  if (projectionSettings.manualMonthlyContribution != null) return Number(projectionSettings.manualMonthlyContribution || 0)
  return surplusEstimate.value?.monthlyContributionUsed ?? selectedScenario.value?.monthlySurplus ?? 0
})

type ProjectionStatus = 'alreadyReached' | 'reachable' | 'unreachableWithinHorizon' | 'invalidInput' | 'missing'

type ProjectionMonth = {
  monthIndex: number
  projectedValue: number
  contribution: number
  growth: number
  inflation: number
}

type ProjectionResult = {
  status: ProjectionStatus
  progressPercent: number
  remainingAmount: number
  estimatedReachDate: string | null
  finalProjectedValue: number
  months: ProjectionMonth[]
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function buildProjection(goal: FinancialGoalRow | null, scenario: ProjectionScenarioRow | null): ProjectionResult {
  if (!goal || !scenario) {
    return {status: 'missing', progressPercent: 0, remainingAmount: 0, estimatedReachDate: null, finalProjectedValue: 0, months: []}
  }

  const targetAmount = Number(goal.targetAmount || 0)
  const initialValue = Number(goal.startingAmount || 0)
  const monthlyContribution = Number(contributionUsed.value || 0)
  const monthsCount = Math.max(1, Number(horizonMonths.value || 1))
  const monthlyGrowth = Number(scenario.annualGrowthRate || 0) / 12
  const monthlyInflation = Number(scenario.annualInflationRate || 0) / 12

  if (targetAmount <= 0 || monthsCount <= 0) {
    return {status: 'invalidInput', progressPercent: 0, remainingAmount: targetAmount, estimatedReachDate: null, finalProjectedValue: initialValue, months: []}
  }

  let value = initialValue
  let estimatedReachDate: string | null = initialValue >= targetAmount ? new Date().toISOString().slice(0, 10) : null
  const months: ProjectionMonth[] = []

  for (let index = 1; index <= monthsCount; index += 1) {
    const growth = value * monthlyGrowth
    const inflation = value * monthlyInflation
    value = value + monthlyContribution + growth - inflation
    months.push({monthIndex: index, projectedValue: value, contribution: monthlyContribution, growth, inflation})
    if (!estimatedReachDate && value >= targetAmount) {
      estimatedReachDate = addMonths(new Date(), index).toISOString().slice(0, 10)
    }
  }

  const remainingAmount = Math.max(targetAmount - value, 0)
  return {
    status: initialValue >= targetAmount ? 'alreadyReached' : estimatedReachDate ? 'reachable' : 'unreachableWithinHorizon',
    progressPercent: Math.min((Math.max(value, 0) / targetAmount) * 100, 100),
    remainingAmount,
    estimatedReachDate,
    finalProjectedValue: value,
    months,
  }
}

const projection = computed(() => buildProjection(selectedGoal.value, selectedScenario.value))
const summary = computed(() => {
  const totalTarget = activeGoals.value.reduce((sum, goal) => sum + Number(goal.targetAmount || 0), 0)
  const completed = activeGoals.value.filter((goal) => Number(goal.startingAmount || 0) >= Number(goal.targetAmount || 0) || goal.status === 'COMPLETED').length
  return {
    totalTarget,
    activeCount: activeGoals.value.length,
    completed,
    nextReachDate: projection.value.estimatedReachDate,
  }
})

const comparedScenarios = computed(() => scenarioKinds.map((kind) => {
  const scenario = activeScenarios.value.find((entry) => entry.kind === kind) || null
  const result = buildProjection(selectedGoal.value, scenario)
  return {kind, scenario, result}
}))

const chartValues = computed(() => {
  const values = comparedScenarios.value.flatMap((entry) => entry.result.months.map((month) => month.projectedValue))
  values.push(Number(selectedGoal.value?.targetAmount || 0), Number(selectedGoal.value?.startingAmount || 0))
  return {min: Math.min(0, ...values), max: Math.max(1, ...values), target: Number(selectedGoal.value?.targetAmount || 0)}
})

function yForValue(value: number) {
  const {min, max} = chartValues.value
  const ratio = max === min ? 0 : (value - min) / (max - min)
  return 220 - ratio * 180
}

function xForIndex(index: number, total: number) {
  if (total <= 1) return 44
  return 44 + (index / (total - 1)) * 552
}

function pointsFor(entry: {result: ProjectionResult}) {
  const values = [Number(selectedGoal.value?.startingAmount || 0), ...entry.result.months.map((month) => month.projectedValue)]
  return values.map((value, index) => `${xForIndex(index, values.length)},${yForValue(value)}`).join(' ')
}

function scenarioStroke(kind: ScenarioKindDto) {
  if (kind === 'PESSIMISTIC') return '#f59e0b'
  if (kind === 'OPTIMISTIC') return '#10b981'
  return '#8b5cf6'
}

function scenarioBadgeClass(kind: ScenarioKindDto) {
  if (kind === 'PESSIMISTIC') return 'border-amber-700 bg-amber-950/40 text-amber-100'
  if (kind === 'OPTIMISTIC') return 'border-emerald-700 bg-emerald-950/40 text-emerald-100'
  return 'border-violet-700 bg-violet-950/40 text-violet-100'
}

function statusClass(status: ProjectionStatus) {
  if (status === 'alreadyReached' || status === 'reachable') return 'border-emerald-800 bg-emerald-950/50 text-emerald-100'
  if (status === 'unreachableWithinHorizon') return 'border-amber-800 bg-amber-950/50 text-amber-100'
  return 'border-slate-800 bg-slate-900 text-slate-300'
}

async function refreshMonthlySurplus() {
  const api = goalsApi()
  if (!api) return

  try {
    surplusEstimate.value = unwrapResult(await api.estimateMonthlySurplus({
      currency: selectedGoal.value?.currency || props.summaryCurrency,
      manualMonthlyContribution: projectionSettings.manualMonthlyContribution,
      referenceDate: new Date().toISOString().slice(0, 10),
    }), t('goalsDashboard.notices.monthlySurplusFailed')) as MonthlySurplusEstimate
  } catch (error) {
    surplusEstimate.value = null
    errorMessage.value = normalizeError(error, t('goalsDashboard.notices.monthlySurplusFailed'))
  }
}

async function loadGoals() {
  const api = goalsApi()
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
    selectedGoalId.value = selectedGoalId.value || activeGoals.value[0]?.id || null
    selectedScenarioId.value = selectedScenarioId.value || selectedScenario.value?.id || null
    await refreshMonthlySurplus()
  } catch (error) {
    errorMessage.value = normalizeError(error, t('goalsDashboard.notices.goalsLoadFailed'))
  } finally {
    loading.value = false
  }
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
    notes: goalForm.notes.trim() || null,
    status: 'ACTIVE' as GoalStatusDto,
  }
}

async function saveGoal() {
  const api = goalsApi()
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
    const result = editingGoalId.value ? await api.updateFinancialGoal(editingGoalId.value, payload) : await api.createFinancialGoal(payload)
    const saved = unwrapResult(result, t('goalsDashboard.notices.saveFailed')) as FinancialGoalRow
    successMessage.value = editingGoalId.value ? t('goalsDashboard.notices.updated') : t('goalsDashboard.notices.created')
    selectedGoalId.value = saved.id
    resetGoalForm()
    await loadGoals()
  } catch (error) {
    errorMessage.value = normalizeError(error, t('goalsDashboard.notices.saveFailed'))
  } finally {
    saving.value = false
  }
}

function editGoal(goal: FinancialGoalRow) {
  editingGoalId.value = goal.id
  Object.assign(goalForm, {
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
  const api = goalsApi()
  if (!api) return
  if (!window.confirm(t('goalsDashboard.notices.confirmDelete', {name: goal.name}))) return

  saving.value = true
  errorMessage.value = null
  successMessage.value = null

  try {
    unwrapResult(await api.deleteFinancialGoal(goal.id), t('goalsDashboard.notices.deleteFailed'))
    successMessage.value = t('goalsDashboard.notices.deleted')
    if (selectedGoalId.value === goal.id) selectedGoalId.value = null
    resetGoalForm()
    await loadGoals()
  } catch (error) {
    errorMessage.value = normalizeError(error, t('goalsDashboard.notices.deleteFailed'))
  } finally {
    saving.value = false
  }
}

watch(selectedGoalId, () => void refreshMonthlySurplus())
watch(() => projectionSettings.manualMonthlyContribution, () => void refreshMonthlySurplus())
watch(() => props.summaryCurrency, () => {
  goalForm.currency = props.summaryCurrency
  void loadGoals()
})

onMounted(() => void loadGoals())
</script>

<template>
  <section class="space-y-6">
    <div class="overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 shadow-sm">
      <div class="border-b border-slate-800 px-6 py-5">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">{{ t('goalsDashboard.eyebrow') }}</p>
            <h2 class="mt-2 text-2xl font-semibold text-white">{{ t('goalsDashboard.title') }}</h2>
            <p class="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{{ t('goalsDashboard.description') }}</p>
          </div>
          <button type="button" class="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60" :disabled="loading" @click="loadGoals">
            {{ loading ? t('goalsDashboard.loading') : t('goalsDashboard.refresh') }}
          </button>
        </div>
      </div>

      <div class="grid gap-px bg-slate-800 md:grid-cols-4">
        <article class="bg-slate-950 px-6 py-5">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{{ t('goalsDashboard.activeGoals') }}</p>
          <p class="mt-3 text-3xl font-semibold text-white">{{ summary.activeCount }}</p>
          <p class="mt-1 text-sm text-slate-400">{{ t('goalsDashboard.completedCount', {count: summary.completed}) }}</p>
        </article>
        <article class="bg-slate-950 px-6 py-5">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{{ t('goalsDashboard.cumulativeTarget') }}</p>
          <p class="mt-3 text-3xl font-semibold text-white">{{ formatMoney(summary.totalTarget, props.summaryCurrency) }}</p>
          <p class="mt-1 text-sm text-slate-400">{{ t('goalsDashboard.cumulativeTargetHint') }}</p>
        </article>
        <article class="bg-gradient-to-br from-violet-950 to-slate-950 px-6 py-5">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">{{ t('goalsDashboard.contributionUsed') }}</p>
          <p class="mt-3 text-3xl font-semibold text-white">{{ formatMoney(contributionUsed, selectedGoal?.currency || props.summaryCurrency) }}</p>
          <p class="mt-1 text-sm text-violet-200/80">{{ surplusEstimate ? trSource(surplusEstimate.source) : t('goalsDashboard.notCalculated') }}</p>
        </article>
        <article class="bg-slate-950 px-6 py-5">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{{ t('goalsDashboard.estimatedDate') }}</p>
          <p class="mt-3 text-3xl font-semibold text-white">{{ formatDate(summary.nextReachDate) }}</p>
          <p class="mt-1 text-sm text-slate-400">{{ t('goalsDashboard.selectedScenarioHint') }}</p>
        </article>
      </div>
    </div>

    <div v-if="errorMessage" class="rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">{{ errorMessage }}</div>
    <div v-if="successMessage" class="rounded-2xl border border-emerald-900/60 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">{{ successMessage }}</div>

    <div class="grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">
      <div class="space-y-6">
        <article class="rounded-[2rem] border border-slate-800 bg-slate-950 p-5 shadow-sm">
          <div class="mb-5">
            <h3 class="text-lg font-semibold text-white">{{ editingGoalId ? t('goalsDashboard.editGoal') : t('goalsDashboard.createGoal') }}</h3>
            <p class="mt-1 text-sm text-slate-400">{{ t('goalsDashboard.formDescription') }}</p>
          </div>

          <form class="space-y-4" @submit.prevent="saveGoal">
            <div>
              <label class="text-sm font-medium text-slate-300">{{ t('goalsDashboard.name') }}</label>
              <input v-model="goalForm.name" required class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500" :placeholder="t('goalsDashboard.placeholders.name')" />
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-300">{{ t('goalsDashboard.type') }}</label>
                <select v-model="goalForm.type" class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500">
                  <option v-for="type in goalTypes" :key="type" :value="type">{{ trGoalType(type) }}</option>
                </select>
              </div>
              <div>
                <label class="text-sm font-medium text-slate-300">{{ t('goalsDashboard.currency') }}</label>
                <input v-model="goalForm.currency" class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm uppercase text-white outline-none focus:border-violet-500" />
              </div>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-300">{{ t('goalsDashboard.targetAmount') }}</label>
                <input v-model.number="goalForm.targetAmount" type="number" min="0" step="0.01" required class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
              </div>
              <div>
                <label class="text-sm font-medium text-slate-300">{{ t('goalsDashboard.startingAmount') }}</label>
                <input v-model.number="goalForm.startingAmount" type="number" min="0" step="0.01" class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
              </div>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-300">{{ t('goalsDashboard.optionalTargetDate') }}</label>
                <input v-model="goalForm.targetDate" type="date" class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
              </div>
              <div>
                <label class="text-sm font-medium text-slate-300">{{ t('goalsDashboard.optionalPriority') }}</label>
                <input v-model.number="goalForm.priority" type="number" min="0" step="1" class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
              </div>
            </div>
            <div>
              <label class="text-sm font-medium text-slate-300">{{ t('goalsDashboard.notes') }}</label>
              <textarea v-model="goalForm.notes" rows="3" class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
            </div>
            <div class="flex flex-wrap gap-2 pt-2">
              <button type="submit" class="inline-flex items-center justify-center rounded-2xl border border-violet-700 bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60" :disabled="saving">
                {{ saving ? t('goalsDashboard.saving') : editingGoalId ? t('goalsDashboard.update') : t('goalsDashboard.create') }}
              </button>
              <button type="button" class="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800" @click="resetGoalForm">
                {{ t('goalsDashboard.reset') }}
              </button>
            </div>
          </form>
        </article>

        <article class="rounded-[2rem] border border-slate-800 bg-slate-950 p-5 shadow-sm">
          <h3 class="text-lg font-semibold text-white">{{ t('goalsDashboard.goalsListTitle') }}</h3>
          <p class="mt-1 text-sm text-slate-400">{{ t('goalsDashboard.goalsListDescription') }}</p>
          <div v-if="loading" class="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-5 text-sm text-slate-300">{{ t('goalsDashboard.loadingGoals') }}</div>
          <div v-else-if="!hasGoals" class="mt-4 rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 px-4 py-8 text-center">
            <p class="text-sm font-semibold text-white">{{ t('goalsDashboard.noGoalTitle') }}</p>
            <p class="mt-1 text-sm text-slate-400">{{ t('goalsDashboard.noGoalDescription') }}</p>
          </div>
          <div v-else class="mt-4 space-y-3">
            <button v-for="goal in activeGoals" :key="goal.id" type="button" class="w-full rounded-2xl border p-4 text-left transition" :class="selectedGoal?.id === goal.id ? 'border-violet-600 bg-violet-950/40' : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'" @click="selectedGoalId = goal.id">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-white">{{ goal.name }}</p>
                  <p class="mt-1 text-xs text-slate-400">{{ trGoalType(goal.type) }} · {{ trGoalStatus(goal.status) }}</p>
                </div>
                <span class="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">{{ goal.priority == null ? '—' : t('goalsDashboard.priorityShort', {value: goal.priority}) }}</span>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <button type="button" class="rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800" @click.stop="editGoal(goal)">{{ t('goalsDashboard.modify') }}</button>
                <button type="button" class="rounded-xl border border-red-900/70 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-950/40" @click.stop="removeGoal(goal)">{{ t('goalsDashboard.delete') }}</button>
              </div>
            </button>
          </div>
        </article>
      </div>

      <div class="space-y-6">
        <article class="rounded-[2rem] border border-slate-800 bg-slate-950 p-5 shadow-sm">
          <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 class="text-lg font-semibold text-white">{{ t('goalsDashboard.scenarioComparison') }}</h3>
              <p class="mt-1 text-sm text-slate-400">{{ t('goalsDashboard.scenarioComparisonDescription') }}</p>
            </div>
            <span class="inline-flex rounded-full border px-3 py-1 text-xs font-semibold" :class="statusClass(projection.status)">{{ projectionStatusLabel(projection.status) }}</span>
          </div>

          <div v-if="!selectedGoal" class="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 px-4 py-8 text-center text-sm text-slate-400">{{ t('goalsDashboard.noSelectedGoal') }}</div>
          <div v-else class="space-y-5">
            <div class="grid gap-3 lg:grid-cols-3">
              <label class="text-sm font-medium text-slate-300">
                {{ t('goalsDashboard.detailedScenario') }}
                <select v-model.number="selectedScenarioId" class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500">
                  <option v-for="scenario in activeScenarios" :key="scenario.id" :value="scenario.id">{{ scenario.name || trScenario(scenario.kind) }}</option>
                </select>
              </label>
              <label class="text-sm font-medium text-slate-300">
                {{ t('goalsDashboard.manualMonthlyContribution') }}
                <input v-model.number="projectionSettings.manualMonthlyContribution" type="number" step="0.01" class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
              </label>
              <label class="text-sm font-medium text-slate-300">
                {{ t('goalsDashboard.horizonMonths') }}
                <input v-model.number="projectionSettings.horizonMonths" type="number" min="1" step="1" class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
              </label>
            </div>

            <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><p class="text-xs text-slate-500">{{ t('goalsDashboard.current') }}</p><p class="mt-2 text-lg font-semibold text-white">{{ formatMoney(selectedGoal.startingAmount, selectedGoal.currency) }}</p></div>
              <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><p class="text-xs text-slate-500">{{ t('goalsDashboard.target') }}</p><p class="mt-2 text-lg font-semibold text-white">{{ formatMoney(selectedGoal.targetAmount, selectedGoal.currency) }}</p></div>
              <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><p class="text-xs text-slate-500">{{ t('goalsDashboard.progress') }}</p><p class="mt-2 text-lg font-semibold text-white">{{ formatPercent(projection.progressPercent) }}</p></div>
              <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><p class="text-xs text-slate-500">{{ t('goalsDashboard.remaining') }}</p><p class="mt-2 text-lg font-semibold text-white">{{ formatMoney(projection.remainingAmount, selectedGoal.currency) }}</p></div>
              <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><p class="text-xs text-slate-500">{{ t('goalsDashboard.reachDate') }}</p><p class="mt-2 text-lg font-semibold text-white">{{ formatDate(projection.estimatedReachDate) }}</p></div>
              <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><p class="text-xs text-slate-500">{{ t('goalsDashboard.finalValue') }}</p><p class="mt-2 text-lg font-semibold text-white">{{ formatMoney(projection.finalProjectedValue, selectedGoal.currency) }}</p></div>
            </div>

            <div class="overflow-hidden rounded-2xl border border-slate-800">
              <svg viewBox="0 0 640 260" class="h-72 w-full bg-slate-950" role="img" :aria-label="t('goalsDashboard.chartAria')">
                <line x1="44" :y1="yForValue(chartValues.target)" x2="604" :y2="yForValue(chartValues.target)" stroke="#94a3b8" stroke-dasharray="6 6" />
                <text x="50" :y="yForValue(chartValues.target) - 8" fill="#cbd5e1" font-size="12">{{ t('goalsDashboard.targetLine') }}</text>
                <polyline v-for="entry in comparedScenarios" :key="entry.kind" :points="pointsFor(entry)" fill="none" :stroke="scenarioStroke(entry.kind)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>

            <div class="grid gap-3 md:grid-cols-3">
              <article v-for="entry in comparedScenarios" :key="entry.kind" class="rounded-2xl border p-4" :class="scenarioBadgeClass(entry.kind)">
                <p class="text-sm font-semibold">{{ trScenario(entry.kind) }}</p>
                <p class="mt-2 text-lg font-bold">{{ formatMoney(entry.result.finalProjectedValue, selectedGoal.currency) }}</p>
                <p class="mt-1 text-xs">{{ projectionStatusLabel(entry.result.status) }}</p>
              </article>
            </div>

            <button type="button" class="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800" @click="detailsOpen = !detailsOpen">
              {{ detailsOpen ? t('goalsDashboard.hideDetails') : t('goalsDashboard.showDetails') }}
            </button>

            <div v-if="detailsOpen" class="overflow-hidden rounded-2xl border border-slate-800">
              <table class="min-w-full divide-y divide-slate-800 text-sm">
                <thead class="bg-slate-900 text-xs uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th class="px-4 py-3 text-left">{{ t('goalsDashboard.month') }}</th>
                  <th class="px-4 py-3 text-right">{{ t('goalsDashboard.projectedValue') }}</th>
                  <th class="px-4 py-3 text-right">{{ t('goalsDashboard.contribution') }}</th>
                  <th class="px-4 py-3 text-right">{{ t('goalsDashboard.growth') }}</th>
                  <th class="px-4 py-3 text-right">{{ t('goalsDashboard.inflation') }}</th>
                </tr>
                </thead>
                <tbody class="divide-y divide-slate-800 bg-slate-950">
                <tr v-for="month in projection.months" :key="month.monthIndex">
                  <td class="px-4 py-3 text-slate-300">{{ month.monthIndex }}</td>
                  <td class="px-4 py-3 text-right text-slate-300">{{ formatMoney(month.projectedValue, selectedGoal.currency) }}</td>
                  <td class="px-4 py-3 text-right text-slate-300">{{ formatMoney(month.contribution, selectedGoal.currency) }}</td>
                  <td class="px-4 py-3 text-right text-slate-300">{{ formatMoney(month.growth, selectedGoal.currency) }}</td>
                  <td class="px-4 py-3 text-right text-slate-300">{{ formatMoney(month.inflation, selectedGoal.currency) }}</td>
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
