<script setup lang="ts">
import {currentLocaleCode} from '../i18n'
import {useI18n} from 'vue-i18n'
import {computed, onMounted, ref, watch} from 'vue'

const {t} = useI18n()

type AllocationGroup = {
  key: string
  label: string
  marketValue: number
  allocationPercent: number
  positionsCount: number
  completenessStatus: 'complete' | 'partial' | 'missing' | string
}

type PortfolioHistoryPoint = {
  id: number
  snapshotDate: string
  totalMarketValue: number
  totalInvestedCost: number
  totalUnrealizedGain: number
  currency: string
  completenessStatus: string
}

type PortfolioDashboard = {
  baseCurrency: string
  asOf: string
  isEmpty: boolean
  hasNoPrice: boolean
  hasHistory: boolean
  kpis: {
    totalMarketValue: number
    totalInvestedCost: number
    totalUnrealizedGain: number
    totalUnrealizedGainPercent: number | null
    periodIncome: number
    periodFees: number
    netIncome: number
    grossReturnSimple: number | null
  }
  allocationBlocks: Record<'asset' | 'assetClass' | 'sector' | 'geography' | 'currency', AllocationGroup[]>
  dataStatus: {fresh: number; stale: number; missing: number; manual: number; error: number; total: number}
  history: PortfolioHistoryPoint[]
  warnings: {positionId: number | null; warning: string}[]
}

type PortfolioAnalyticsRendererApi = {
  getPortfolioAnalyticsDashboard?: (options?: Record<string, unknown>) => Promise<PortfolioDashboard>
}

const props = withDefaults(defineProps<{summaryCurrency?: string}>(), {summaryCurrency: 'CAD'})
const emit = defineEmits<{(event: 'create-asset'): void; (event: 'create-movement'): void}>()

const dashboard = ref<PortfolioDashboard | null>(null)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const allocationTabs = computed(() => [
  {key: 'asset' as const, label: t('wealth.summary.assets')},
  {key: 'assetClass' as const, label: t('interfaceText.portfolioAnalyticsDashboard.assetClasses')},
  {key: 'sector' as const, label: t('interfaceText.portfolioAnalyticsDashboard.sectors')},
  {key: 'geography' as const, label: t('interfaceText.portfolioAnalyticsDashboard.regions')},
  {key: 'currency' as const, label: t('reports.currencies')},
])

const activeAllocation = ref<(typeof allocationTabs.value)[number]['key']>('asset')

function portfolioAnalyticsApi(): PortfolioAnalyticsRendererApi | null {
  return (window as unknown as {wealth?: PortfolioAnalyticsRendererApi}).wealth || null
}

async function loadDashboard() {
  const api = portfolioAnalyticsApi()
  if (!api?.getPortfolioAnalyticsDashboard) {
    errorMessage.value = t('interfaceText.portfolioAnalyticsDashboard.portfolioAnalysisIsUnavailable')
    return
  }

  loading.value = true
  errorMessage.value = null

  try {
    dashboard.value = await api.getPortfolioAnalyticsDashboard({
      baseCurrency: props.summaryCurrency,
      incomePeriod: 'currentMonth',
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('interfaceText.portfolioAnalyticsDashboard.couldNotLoadThePortfolio')
  } finally {
    loading.value = false
  }
}

function formatMoney(amount: number | null | undefined, currency = dashboard.value?.baseCurrency || props.summaryCurrency) {
  if (amount == null) return '—'
  return new Intl.NumberFormat(currentLocaleCode(), {style: 'currency', currency, maximumFractionDigits: 0}).format(Number(amount || 0))
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return '—'
  return new Intl.NumberFormat(currentLocaleCode(), {maximumFractionDigits: 1}).format(Number(value)) + '%'
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(currentLocaleCode(), {dateStyle: 'medium'}).format(new Date(value))
}

const kpiCards = computed(() => {
  const kpis = dashboard.value?.kpis
  return [
    {label: t('interfaceText.portfolioAnalyticsDashboard.totalValue'), value: formatMoney(kpis?.totalMarketValue), hint: t('interfaceText.portfolioAnalyticsDashboard.currentMarketValue')},
    {label: t('interfaceText.portfolioAnalyticsDashboard.investedCost'), value: formatMoney(kpis?.totalInvestedCost), hint: t('interfaceText.portfolioAnalyticsDashboard.weightedAverageCost')},
    {label: t('interfaceText.portfolioAnalyticsDashboard.unrealizedGain'), value: formatMoney(kpis?.totalUnrealizedGain), hint: formatPercent(kpis?.totalUnrealizedGainPercent)},
    {label: t('interfaceText.portfolioAnalyticsDashboard.periodIncome'), value: formatMoney(kpis?.periodIncome), hint: t('interfaceText.portfolioAnalyticsDashboard.feesAmount', {amount: formatMoney(kpis?.periodFees)})},
    {label: t('interfaceText.portfolioAnalyticsDashboard.netIncome'), value: formatMoney(kpis?.netIncome), hint: t('interfaceText.portfolioAnalyticsDashboard.incomeLessFees')},
  ]
})

const currentAllocationRows = computed(() => dashboard.value?.allocationBlocks?.[activeAllocation.value] || [])
const topHistory = computed(() => dashboard.value?.history?.slice(-8) || [])
const historyMax = computed(() => Math.max(1, ...topHistory.value.map((point) => Math.max(point.totalMarketValue, point.totalInvestedCost))))

function barWidth(value: number | null | undefined, denominator = 100) {
  if (!value || denominator <= 0) return '0%'
  return `${Math.max(0, Math.min(100, (value / denominator) * 100))}%`
}

function statusTone(status: string) {
  if (status === 'complete' || status === 'COMPLETE') return 'text-emerald-300 bg-emerald-950/50 border-emerald-900/70'
  if (status === 'partial' || status === 'PARTIAL') return 'text-amber-300 bg-amber-950/50 border-amber-900/70'
  return 'text-slate-300 bg-slate-900 border-slate-800'
}

watch(() => props.summaryCurrency, () => void loadDashboard())
onMounted(() => void loadDashboard())
</script>

<template>
  <section class="space-y-5 rounded-[2rem] border border-slate-800 bg-slate-950 p-5 shadow-sm">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h3 class="mt-2 text-2xl font-semibold text-white">{{ t('wealth.tabs.portfolio') }}</h3>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="rounded-2xl border border-violet-700 bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500" @click="emit('create-asset')">
          {{ t('interfaceText.portfolioAnalyticsDashboard.addAsset') }}
        </button>
        <button class="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800" @click="emit('create-movement')">
          {{ t('interfaceText.portfolioAnalyticsDashboard.recordActivity') }}
        </button>
        <button class="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800 disabled:opacity-60" :disabled="loading" @click="loadDashboard">
          {{ loading ? t('common.loading') : t('common.refresh') }}
        </button>
      </div>
    </div>

    <div v-if="errorMessage" class="rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
      {{ errorMessage }}
    </div>

    <div v-if="dashboard?.isEmpty" class="rounded-[1.5rem] border border-dashed border-slate-700 bg-slate-900/60 p-6 text-center">
      <p class="text-lg font-semibold text-white">{{ t('interfaceText.portfolioAnalyticsDashboard.noPortfolioAssetsYet') }}</p>
      <p class="mt-2 text-sm text-slate-400">{{ t('interfaceText.portfolioAnalyticsDashboard.addAPositionOrRecordActivityTo') }}</p>
      <button class="mt-4 rounded-2xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500" @click="emit('create-asset')">
        {{ t('interfaceText.portfolioAnalyticsDashboard.addAsset') }}
      </button>
    </div>

    <template v-else>
      <div class="grid gap-3 md:grid-cols-5">
        <article v-for="card in kpiCards" :key="card.label" class="rounded-[1.5rem] border border-slate-800 bg-slate-900/70 p-4">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{{ card.label }}</p>
          <p class="mt-3 text-2xl font-semibold text-white">{{ card.value }}</p>
          <p class="mt-1 text-sm text-slate-400">{{ card.hint }}</p>
        </article>
      </div>

      <div v-if="dashboard?.hasNoPrice" class="rounded-2xl border border-amber-900/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
        {{ t('interfaceText.portfolioAnalyticsDashboard.pricesAreMissingForTheCurrentPositions') }}
      </div>

      <div class="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
        <article class="rounded-[1.5rem] border border-slate-800 bg-slate-900/50 p-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 class="text-lg font-semibold text-white">{{ t('interfaceText.portfolioAnalyticsDashboard.allocations') }}</h4>
              <p class="text-sm text-slate-400">{{ t('interfaceText.portfolioAnalyticsDashboard.largestExposuresByMarketValue') }}</p>
            </div>
            <div class="flex flex-wrap gap-1 rounded-2xl bg-slate-950 p-1">
              <button v-for="tab in allocationTabs" :key="tab.key" class="rounded-xl px-3 py-1.5 text-xs font-semibold transition" :class="activeAllocation === tab.key ? 'bg-white text-slate-950' : 'text-slate-400 hover:text-white'" @click="activeAllocation = tab.key">
                {{ tab.label }}
              </button>
            </div>
          </div>

          <div class="mt-4 space-y-3">
            <div v-for="row in currentAllocationRows.slice(0, 8)" :key="row.key" class="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-white">{{ row.label }}</p>
                  <p class="text-xs text-slate-500">{{ row.positionsCount }} {{ t('interfaceText.portfolioAnalyticsDashboard.positions') }} {{ formatMoney(row.marketValue) }}</p>
                </div>
                <div class="flex items-center gap-2">
                  <span class="rounded-full border px-2 py-1 text-[11px] font-semibold" :class="statusTone(row.completenessStatus)">{{ row.completenessStatus }}</span>
                  <span class="text-sm font-semibold text-violet-200">{{ formatPercent(row.allocationPercent) }}</span>
                </div>
              </div>
              <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                <div class="h-full rounded-full bg-violet-500" :style="{width: barWidth(row.allocationPercent)}" />
              </div>
            </div>

            <p v-if="currentAllocationRows.length === 0" class="rounded-2xl border border-dashed border-slate-800 px-4 py-6 text-center text-sm text-slate-400">
              {{ t('interfaceText.portfolioAnalyticsDashboard.noAllocationDataAvailable') }}
            </p>
          </div>
        </article>

        <aside class="space-y-5">
          <article class="rounded-[1.5rem] border border-slate-800 bg-slate-900/50 p-4">
            <h4 class="text-lg font-semibold text-white">{{ t('interfaceText.portfolioAnalyticsDashboard.dataQuality') }}</h4>
            <div class="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div class="rounded-2xl border border-emerald-900/60 bg-emerald-950/40 p-3 text-emerald-100">{{ t('interfaceText.portfolioAnalyticsDashboard.currentPrices') }} <strong class="float-right">{{ dashboard?.dataStatus.fresh || 0 }}</strong></div>
              <div class="rounded-2xl border border-amber-900/60 bg-amber-950/40 p-3 text-amber-100">{{ t('interfaceText.portfolioAnalyticsDashboard.stale') }} <strong class="float-right">{{ dashboard?.dataStatus.stale || 0 }}</strong></div>
              <div class="rounded-2xl border border-violet-900/60 bg-violet-950/40 p-3 text-violet-100">{{ t('common.manual') }} <strong class="float-right">{{ dashboard?.dataStatus.manual || 0 }}</strong></div>
              <div class="rounded-2xl border border-slate-800 bg-slate-950 p-3 text-slate-200">{{ t('interfaceText.portfolioAnalyticsDashboard.missing') }} <strong class="float-right">{{ dashboard?.dataStatus.missing || 0 }}</strong></div>
            </div>
          </article>

          <article class="rounded-[1.5rem] border border-slate-800 bg-slate-900/50 p-4">
            <h4 class="text-lg font-semibold text-white">{{ t('interfaceText.portfolioAnalyticsDashboard.history') }}</h4>
            <p class="text-sm text-slate-400">{{ t('interfaceText.portfolioAnalyticsDashboard.valueCostAndUnrealizedGainsFromLocal') }}</p>
            <div v-if="!dashboard?.hasHistory" class="mt-4 rounded-2xl border border-dashed border-slate-800 px-4 py-6 text-center text-sm text-slate-400">
              {{ t('interfaceText.portfolioAnalyticsDashboard.createASnapshotToStartTrackingChanges') }}
            </div>
            <div v-else class="mt-4 space-y-3">
              <div v-for="point in topHistory" :key="point.id" class="space-y-1">
                <div class="flex items-center justify-between text-xs text-slate-400">
                  <span>{{ formatDate(point.snapshotDate) }}</span>
                  <span>{{ formatMoney(point.totalMarketValue, point.currency) }}</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div class="h-full rounded-full bg-emerald-500" :style="{width: barWidth(point.totalMarketValue, historyMax)}" />
                </div>
                <div class="h-1.5 overflow-hidden rounded-full bg-slate-800/80">
                  <div class="h-full rounded-full bg-violet-500" :style="{width: barWidth(point.totalInvestedCost, historyMax)}" />
                </div>
              </div>
            </div>
          </article>
        </aside>
      </div>

      <div v-if="dashboard?.warnings?.length" class="rounded-2xl border border-amber-900/60 bg-amber-950/30 p-4 text-sm text-amber-100">
        <p class="font-semibold">{{ t('interfaceText.portfolioAnalyticsDashboard.partialResults') }}</p>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li v-for="(warning, index) in dashboard.warnings.slice(0, 4)" :key="index">{{ warning.warning }}</li>
        </ul>
      </div>
    </template>
  </section>
</template>
