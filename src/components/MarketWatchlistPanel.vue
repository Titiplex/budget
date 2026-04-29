<script setup lang="ts">
import {computed, onMounted, reactive, ref} from 'vue'

import type {
  MarketDataRefreshResult,
  MarketDataRendererApi,
  MarketWatchlistForm,
  MarketWatchlistItem,
} from '../types/marketDataRenderer'

const props = withDefaults(
    defineProps<{
      summaryCurrency?: string
    }>(),
    {
      summaryCurrency: 'CAD',
    },
)

const rows = ref<MarketWatchlistItem[]>([])
const loading = ref(false)
const saving = ref(false)
const refreshing = ref(false)
const errorMessage = ref<string | null>(null)
const refreshMessage = ref<string | null>(null)
const lastRefresh = ref<MarketDataRefreshResult | null>(null)

const form = reactive<MarketWatchlistForm>({
  symbol: '',
  name: '',
  currency: props.summaryCurrency,
  exchange: '',
  provider: 'local',
  instrumentType: 'OTHER',
})

const hasProviderFailures = computed(() => Boolean(lastRefresh.value?.errors.length))
const activeRows = computed(() => rows.value.filter((row) => row.instrument?.isActive !== false))

function resetForm() {
  form.symbol = ''
  form.name = ''
  form.currency = props.summaryCurrency
  form.exchange = ''
  form.provider = 'local'
  form.instrumentType = 'OTHER'
}

function marketDataApi(): MarketDataRendererApi | null {
  return (window as unknown as { marketData?: MarketDataRendererApi }).marketData || null
}

function normalizeIpcError(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

function unwrapIpcResult<T>(result: unknown, fallback: string): T {
  if (result && typeof result === 'object' && 'ok' in result) {
    const typed = result as { ok: boolean; data: T | null; error?: unknown }
    if (!typed.ok) throw new Error(normalizeIpcError(typed.error, fallback))
    return typed.data as T
  }
  return result as T
}

function normalizeError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

function priceLabel(item: MarketWatchlistItem) {
  const snapshot = item.lastSnapshot
  if (!snapshot) return '—'
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: snapshot.currency || item.targetCurrency || props.summaryCurrency,
    maximumFractionDigits: 4,
  }).format(snapshot.unitPrice)
}

function dateLabel(value: string | null | undefined) {
  if (!value) return 'Aucun snapshot local'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date inconnue'
  return new Intl.DateTimeFormat('fr-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function freshnessLabel(status: string | null | undefined) {
  switch (status) {
    case 'FRESH':
      return 'frais'
    case 'STALE':
      return 'stale'
    case 'UNAVAILABLE':
    case 'MISSING':
      return 'absent'
    case 'ERROR':
      return 'erreur'
    default:
      return 'inconnu'
  }
}

function freshnessClass(status: string | null | undefined) {
  switch (status) {
    case 'FRESH':
      return 'border-emerald-700/70 bg-emerald-950/40 text-emerald-200'
    case 'STALE':
      return 'border-amber-700/70 bg-amber-950/40 text-amber-200'
    case 'ERROR':
      return 'border-red-700/70 bg-red-950/40 text-red-200'
    default:
      return 'border-slate-700 bg-slate-900 text-slate-300'
  }
}

async function loadWatchlist() {
  const api = marketDataApi()
  if (!api) {
    errorMessage.value = 'Market data IPC indisponible.'
    return
  }

  loading.value = true
  errorMessage.value = null
  try {
    rows.value = unwrapIpcResult<MarketWatchlistItem[]>(await api.listWatchlist(), 'Impossible de charger la watchlist.')
  } catch (error) {
    errorMessage.value = normalizeError(error, 'Impossible de charger la watchlist.')
  } finally {
    loading.value = false
  }
}

async function addInstrument() {
  const api = marketDataApi()
  if (!api) return

  saving.value = true
  errorMessage.value = null
  refreshMessage.value = null
  try {
    unwrapIpcResult<MarketWatchlistItem>(await api.addWatchlistInstrument({
      symbol: form.symbol,
      name: form.name || null,
      currency: form.currency || props.summaryCurrency,
      exchange: form.exchange || null,
      provider: form.provider || 'local',
      instrumentType: form.instrumentType || 'OTHER',
    }), "Impossible d'ajouter l'instrument.")
    resetForm()
    await loadWatchlist()
  } catch (error) {
    errorMessage.value = normalizeError(error, "Impossible d'ajouter l'instrument.")
  } finally {
    saving.value = false
  }
}

async function removeInstrument(item: MarketWatchlistItem) {
  const api = marketDataApi()
  if (!api) return
  const symbol = item.instrument?.symbol || 'cet instrument'
  if (!window.confirm(`Retirer ${symbol} de la watchlist ?`)) return

  saving.value = true
  errorMessage.value = null
  try {
    unwrapIpcResult<{
      ok: boolean;
      id: number
    }>(await api.removeWatchlistInstrument(item.instrumentId), "Impossible de retirer l'instrument.")
    await loadWatchlist()
  } catch (error) {
    errorMessage.value = normalizeError(error, "Impossible de retirer l'instrument.")
  } finally {
    saving.value = false
  }
}

async function refreshPrices(instrumentId?: number) {
  const api = marketDataApi()
  if (!api) return

  refreshing.value = true
  errorMessage.value = null
  refreshMessage.value = null
  try {
    lastRefresh.value = unwrapIpcResult<MarketDataRefreshResult>(
        await api.refreshWatchlist(instrumentId ? {instrumentIds: [instrumentId]} : undefined),
        'Refresh manuel impossible.',
    )
    const summary = lastRefresh.value.summary
    refreshMessage.value = `${summary.succeeded}/${summary.requested} prix rafraîchis. Les snapshots locaux restent affichés si le provider échoue.`
    await loadWatchlist()
  } catch (error) {
    errorMessage.value = normalizeError(error, 'Refresh manuel impossible. Les derniers snapshots locaux restent affichés.')
  } finally {
    refreshing.value = false
  }
}

onMounted(() => {
  void loadWatchlist()
})
</script>

<template>
  <section class="rounded-[2rem] border border-slate-800 bg-slate-950 p-5 shadow-sm">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">Marché</p>
        <h3 class="mt-2 text-xl font-semibold text-white">Watchlist</h3>
        <p class="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
          Vue locale des instruments suivis. Les prix sont des derniers snapshots connus, pas du temps réel.
        </p>
      </div>
      <button
          type="button"
          class="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="loading || refreshing || activeRows.length === 0"
          @click="refreshPrices()"
      >
        {{ refreshing ? 'Refresh…' : 'Refresh manuel' }}
      </button>
    </div>

    <form
        class="mt-5 grid gap-3 rounded-3xl border border-slate-800 bg-slate-900/60 p-4 lg:grid-cols-[1fr_1.5fr_0.8fr_0.8fr_0.9fr_0.9fr_auto]"
        @submit.prevent="addInstrument">
      <label class="space-y-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Symbole
        <input
            v-model.trim="form.symbol"
            required
            class="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none transition focus:border-sky-500"
            placeholder="AAPL"
        />
      </label>
      <label class="space-y-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Nom optionnel
        <input
            v-model.trim="form.name"
            class="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none transition focus:border-sky-500"
            placeholder="Apple Inc."
        />
      </label>
      <label class="space-y-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Devise
        <input
            v-model.trim="form.currency"
            required
            maxlength="3"
            class="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none transition focus:border-sky-500"
            placeholder="CAD"
        />
      </label>
      <label class="space-y-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Marché
        <input
            v-model.trim="form.exchange"
            class="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none transition focus:border-sky-500"
            placeholder="NASDAQ"
        />
      </label>
      <label class="space-y-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Type
        <select
            v-model="form.instrumentType"
            class="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none transition focus:border-sky-500"
        >
          <option value="EQUITY">Action</option>
          <option value="ETF">ETF</option>
          <option value="MUTUAL_FUND">Fonds</option>
          <option value="BOND">Obligation</option>
          <option value="CRYPTO">Crypto</option>
          <option value="FOREX">Forex</option>
          <option value="INDEX">Indice</option>
          <option value="OTHER">Autre</option>
        </select>
      </label>
      <label class="space-y-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Provider
        <input
            v-model.trim="form.provider"
            class="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none transition focus:border-sky-500"
            placeholder="local"
        />
      </label>
      <div class="flex items-end">
        <button
            type="submit"
            class="w-full rounded-2xl border border-sky-700/70 bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="saving || loading"
        >
          Ajouter
        </button>
      </div>
    </form>

    <div v-if="errorMessage"
         class="mt-4 rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
      {{ errorMessage }}
    </div>
    <div v-if="refreshMessage"
         class="mt-4 rounded-2xl border border-sky-900/60 bg-sky-950/40 px-4 py-3 text-sm text-sky-100">
      {{ refreshMessage }}
    </div>
    <div v-if="hasProviderFailures"
         class="mt-4 rounded-2xl border border-amber-900/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
      Provider indisponible pour certains symboles. L'UI conserve le dernier snapshot local quand il existe.
    </div>

    <div v-if="loading"
         class="mt-5 rounded-3xl border border-slate-800 bg-slate-900/50 px-4 py-6 text-sm text-slate-400">
      Chargement de la watchlist…
    </div>

    <div v-else-if="activeRows.length === 0"
         class="mt-5 rounded-3xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-8 text-center">
      <p class="text-sm font-semibold text-slate-200">Aucun instrument suivi</p>
      <p class="mt-1 text-sm text-slate-500">Ajoute un symbole pour commencer. Le provider <code>local</code> permet de
        tester sans réseau.</p>
    </div>

    <div v-else class="mt-5 overflow-hidden rounded-3xl border border-slate-800">
      <div
          class="hidden grid-cols-[1.1fr_1fr_0.9fr_1fr_0.9fr_auto] gap-3 border-b border-slate-800 bg-slate-900/80 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 lg:grid">
        <span>Instrument</span>
        <span>Prix local</span>
        <span>Freshness</span>
        <span>Snapshot</span>
        <span>Provider</span>
        <span class="text-right">Actions</span>
      </div>
      <article
          v-for="item in activeRows"
          :key="item.id"
          class="grid gap-3 border-b border-slate-800 bg-slate-950 px-4 py-4 last:border-b-0 lg:grid-cols-[1.1fr_1fr_0.9fr_1fr_0.9fr_auto] lg:items-center"
      >
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <p class="font-semibold text-white">{{ item.instrument?.symbol }}</p>
            <span v-if="item.instrument?.exchange"
                  class="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
              {{ item.instrument.exchange }}
            </span>
          </div>
          <p class="mt-1 text-sm text-slate-500">{{
              item.instrument?.name || item.instrument?.type || 'Instrument'
            }}</p>
        </div>
        <div>
          <p class="text-sm font-semibold text-slate-100">{{ priceLabel(item) }}</p>
          <p class="text-xs text-slate-500">{{ item.lastSnapshot?.currency || item.targetCurrency }}</p>
        </div>
        <div>
          <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold"
                :class="freshnessClass(item.freshnessStatus)">
            {{ freshnessLabel(item.freshnessStatus) }}
          </span>
        </div>
        <div class="text-sm text-slate-400">
          {{ dateLabel(item.lastSnapshot?.pricedAt) }}
        </div>
        <div class="text-sm text-slate-400">
          {{ item.lastSnapshot?.providerId || item.instrument?.provider || 'local' }}
        </div>
        <div class="flex flex-wrap justify-start gap-2 lg:justify-end">
          <button
              type="button"
              class="rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="refreshing || saving"
              @click="refreshPrices(item.instrumentId)"
          >
            Refresh
          </button>
          <button
              type="button"
              class="rounded-2xl border border-red-900/70 bg-red-950/50 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-900/60 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="saving || refreshing"
              @click="removeInstrument(item)"
          >
            Retirer
          </button>
        </div>
      </article>
    </div>
  </section>
</template>
