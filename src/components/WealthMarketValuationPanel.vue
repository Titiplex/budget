<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'

import type {WealthAsset, WealthPortfolio} from '../types/wealth'

import {
  createPortfolioManualValuationRow,
  createWealthAssetValuationRow,
  getAssetMarketInstrumentId,
  summarizeWealthMarketValuations,
  type MarketDataErrorLite,
  type MarketInstrumentLite,
  type MarketSnapshotLite,
  type WealthAssetWithMarketInstrument,
  type WealthMarketFreshnessStatus,
  type WealthMarketValuationRow,
} from '../utils/wealthMarketValuation'

const props = withDefaults(
    defineProps<{
      assets?: WealthAsset[]
      portfolios?: WealthPortfolio[]
      summaryCurrency?: string
    }>(),
    {
      assets: () => [],
      portfolios: () => [],
      summaryCurrency: 'CAD',
    },
)

const emit = defineEmits<{
  (event: 'refresh'): void
}>()

type IpcResponse<T> = T | { ok: boolean; data: T | null; error: MarketDataErrorLite | null }

type MarketDataRendererApi = {
  listInstruments?: (filters?: Record<string, unknown>) => Promise<IpcResponse<MarketInstrumentLite[]>>
  getLatestSnapshot?: (options: Record<string, unknown>) => Promise<IpcResponse<MarketSnapshotLite>>
}

const rows = ref<WealthMarketValuationRow[]>([])
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const summary = computed(() => summarizeWealthMarketValuations(rows.value, props.summaryCurrency))

const sortedRows = computed(() => {
  const order = {
    ERROR: 0,
    UNAVAILABLE: 1,
    STALE: 2,
    UNKNOWN: 3,
    FRESH: 4,
  } satisfies Record<WealthMarketFreshnessStatus, number>

  return [...rows.value].sort((a, b) => {
    const byStatus = order[a.status] - order[b.status]

    if (byStatus !== 0) return byStatus

    return a.label.localeCompare(b.label)
  })
})

function unwrapIpc<T>(
    response: IpcResponse<T> | null | undefined,
): {
  data: T | null
  error: MarketDataErrorLite | null
} {
  if (!response) {
    return {
      data: null,
      error: {
        code: 'NO_RESPONSE',
        message: 'Aucune réponse IPC.',
      },
    }
  }

  if (typeof response === 'object' && 'ok' in response) {
    return response.ok ? {data: response.data, error: null} : {data: null, error: response.error}
  }

  return {data: response as T, error: null}
}

function getMarketDataApi(): MarketDataRendererApi | null {
  return ((window as unknown as { marketData?: MarketDataRendererApi }).marketData) || null
}

function activeRecords<T extends { status?: string; includeInNetWorth?: boolean }>(records: T[]) {
  return records.filter((record) => record.status !== 'ARCHIVED' && record.includeInNetWorth !== false)
}

async function loadMarketValuations() {
  loading.value = true
  errorMessage.value = null

  try {
    const marketDataApi = getMarketDataApi()
    const instrumentRows = await loadInstruments(marketDataApi)
    const instrumentsById = new Map(instrumentRows.map((instrument) => [instrument.id, instrument]))
    const nextRows: WealthMarketValuationRow[] = []

    for (const asset of activeRecords(props.assets) as WealthAssetWithMarketInstrument[]) {
      const instrumentId = getAssetMarketInstrumentId(asset)
      const instrument = instrumentId ? instrumentsById.get(instrumentId) || asset.marketInstrument || null : null

      const snapshotResult = instrumentId
          ? await loadLatestSnapshot(marketDataApi, instrumentId)
          : {
            snapshot: null,
            error: null,
          }

      nextRows.push(
          createWealthAssetValuationRow({
            asset,
            snapshot: snapshotResult.snapshot,
            instrument,
            error: snapshotResult.error,
            summaryCurrency: props.summaryCurrency,
          }),
      )
    }

    for (const portfolio of activeRecords(props.portfolios)) {
      nextRows.push(createPortfolioManualValuationRow(portfolio))
    }

    rows.value = nextRows
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Impossible de charger les valorisations de marché.'

    rows.value = [
      ...activeRecords(props.assets).map((asset) =>
          createWealthAssetValuationRow({
            asset,
            summaryCurrency: props.summaryCurrency,
          }),
      ),
      ...activeRecords(props.portfolios).map((portfolio) => createPortfolioManualValuationRow(portfolio)),
    ]
  } finally {
    loading.value = false
  }
}

async function loadInstruments(marketDataApi: MarketDataRendererApi | null) {
  if (!marketDataApi?.listInstruments) return []

  const response = unwrapIpc(await marketDataApi.listInstruments({activeOnly: false}))

  if (response.error) {
    errorMessage.value = response.error.message || 'Impossible de lire les instruments de marché.'
    return []
  }

  return response.data || []
}

async function loadLatestSnapshot(marketDataApi: MarketDataRendererApi | null, instrumentId: number) {
  if (!marketDataApi?.getLatestSnapshot) {
    return {
      snapshot: null,
      error: {
        code: 'PROVIDER_UNAVAILABLE',
        message: 'API market data indisponible.',
      },
    }
  }

  try {
    const response = unwrapIpc(await marketDataApi.getLatestSnapshot({instrumentId}))

    return {
      snapshot: response.data,
      error: response.error,
    }
  } catch (error) {
    return {
      snapshot: null,
      error: {
        code: 'RENDERER_ERROR',
        message: error instanceof Error ? error.message : 'Erreur renderer pendant la lecture du snapshot.',
      },
    }
  }
}

function formatMoney(amount: number | null | undefined, currency = props.summaryCurrency) {
  if (amount == null) return '—'

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0))
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'

  return new Intl.DateTimeFormat(undefined, {dateStyle: 'medium'}).format(new Date(value))
}

function statusClass(status: WealthMarketFreshnessStatus) {
  if (status === 'FRESH') return 'border-emerald-800 bg-emerald-950/50 text-emerald-200'
  if (status === 'STALE') return 'border-amber-800 bg-amber-950/50 text-amber-200'
  if (status === 'ERROR') return 'border-red-800 bg-red-950/50 text-red-200'
  if (status === 'UNAVAILABLE') return 'border-slate-700 bg-slate-900 text-slate-300'

  return 'border-slate-700 bg-slate-950 text-slate-400'
}

function sourceLabel(row: WealthMarketValuationRow) {
  if (row.source === 'MARKET') return 'Automatique marché'
  if (row.source === 'MANUAL_FALLBACK') return 'Fallback manuel'

  return 'Indisponible'
}

function refreshValuations() {
  void loadMarketValuations()
  emit('refresh')
}

watch(
    () => [props.assets, props.portfolios, props.summaryCurrency],
    () => {
      void loadMarketValuations()
    },
    {deep: true},
)

onMounted(() => {
  void loadMarketValuations()
})
</script>

<template>
  <article class="rounded-[2rem] border border-slate-800 bg-slate-950 p-5 shadow-sm">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Valorisation marché</p>

        <h3 class="mt-2 text-lg font-semibold text-white">Prix locaux, fallback manuel et fraîcheur</h3>

        <p class="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
          Les montants ci-dessous viennent du dernier snapshot local quand il existe. Sinon, l’écran retombe sur la
          valeur manuelle et continue de contribuer à la valeur nette.
        </p>
      </div>

      <button
          type="button"
          class="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="loading"
          @click="refreshValuations"
      >
        {{ loading ? 'Lecture…' : 'Rafraîchir valorisation' }}
      </button>
    </div>

    <div class="mt-5 grid gap-3 md:grid-cols-4">
      <div class="rounded-2xl border border-emerald-900/70 bg-emerald-950/30 p-4">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Marché</p>

        <p class="mt-2 text-2xl font-semibold text-white">
          {{ formatMoney(summary.totalMarketValue, summary.currency) }}
        </p>

        <p class="mt-1 text-xs text-emerald-100/70">Snapshots locaux exploitables</p>
      </div>

      <div class="rounded-2xl border border-sky-900/70 bg-sky-950/30 p-4">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Fallback manuel</p>

        <p class="mt-2 text-2xl font-semibold text-white">
          {{ formatMoney(summary.totalManualFallbackValue, summary.currency) }}
        </p>

        <p class="mt-1 text-xs text-sky-100/70">Valeur saisie par l’utilisateur</p>
      </div>

      <div class="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Indisponible</p>

        <p class="mt-2 text-2xl font-semibold text-white">{{ summary.totalUnavailableCount }}</p>

        <p class="mt-1 text-xs text-slate-500">Actif(s) sans prix ni fallback</p>
      </div>

      <div
          class="rounded-2xl border p-4"
          :class="
          summary.totalErrorCount > 0
            ? 'border-red-900/60 bg-red-950/30'
            : 'border-slate-800 bg-slate-900/50'
        "
      >
        <p
            class="text-xs font-semibold uppercase tracking-[0.18em]"
            :class="summary.totalErrorCount > 0 ? 'text-red-300' : 'text-slate-400'"
        >
          Provider
        </p>

        <p class="mt-2 text-2xl font-semibold text-white">{{ summary.totalErrorCount }}</p>

        <p
            class="mt-1 text-xs"
            :class="summary.totalErrorCount > 0 ? 'text-red-100/70' : 'text-slate-500'"
        >
          {{ summary.totalErrorCount > 0 ? 'Erreur(s) sans blocage écran' : 'Aucune erreur provider' }}
        </p>
      </div>
    </div>

    <p v-if="summary.ignoredCurrencyCount" class="mt-3 text-xs text-amber-300">
      {{ summary.ignoredCurrencyCount }} ligne(s) dans une autre devise ne sont pas additionnées au résumé
      {{ summary.currency }}.
    </p>

    <p
        v-if="errorMessage"
        class="mt-3 rounded-2xl border border-amber-900/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-100"
    >
      {{ errorMessage }} Les fallbacks manuels restent affichés.
    </p>

    <div v-if="sortedRows.length" class="mt-5 overflow-hidden rounded-2xl border border-slate-800">
      <div
          class="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-slate-800 bg-slate-900/70 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"
      >
        <span>Actif</span>
        <span>Valeur utilisée</span>
        <span>Prix / snapshot</span>
        <span>Statut</span>
      </div>

      <div
          v-for="row in sortedRows"
          :key="row.key"
          class="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-slate-800 px-4 py-4 text-sm last:border-b-0"
      >
        <div>
          <p class="font-semibold text-white">{{ row.label }}</p>

          <p class="mt-1 text-xs text-slate-500">
            {{ row.entityType === 'asset' ? 'Actif autonome' : 'Portefeuille' }}
            <template v-if="row.symbol"> · {{ row.symbol }}</template>
          </p>
        </div>

        <div>
          <p class="font-semibold text-white">{{ formatMoney(row.valueUsed, row.displayCurrency) }}</p>

          <p class="mt-1 text-xs text-slate-500">{{ sourceLabel(row) }}</p>
        </div>

        <div>
          <p class="font-medium text-slate-200">
            <template v-if="row.unitPrice != null">
              {{ formatMoney(row.unitPrice, row.quoteCurrency || row.displayCurrency) }} / unité
            </template>

            <template v-else>Prix absent</template>
          </p>

          <p class="mt-1 text-xs text-slate-500">
            {{ formatDate(row.pricedAt) }}

            <template v-if="row.quoteCurrency && row.quoteCurrency !== row.displayCurrency">
              · coté {{ row.quoteCurrency }}, affiché {{ row.displayCurrency }}
            </template>
          </p>
        </div>

        <div>
          <span
              class="inline-flex rounded-full border px-3 py-1 text-xs font-semibold"
              :class="statusClass(row.status)"
          >
            {{ row.statusLabel }}
          </span>

          <p v-if="row.errorMessage" class="mt-2 text-xs text-slate-500">{{ row.errorMessage }}</p>
        </div>
      </div>
    </div>

    <div
        v-else
        class="mt-5 rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 px-4 py-6 text-sm text-slate-400"
    >
      Aucun actif patrimonial valorisable pour le moment.
    </div>
  </article>
</template>