<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  LIABILITY_TYPE_LABELS,
  PORTFOLIO_TYPE_LABELS,
  WEALTH_ASSET_TYPE_LABELS,
  type WealthAsset,
  type WealthLiability,
  type WealthPortfolio,
} from '../types/wealth'

const props = withDefaults(defineProps<{
  summaryCurrency?: string
}>(), {
  summaryCurrency: 'CAD',
})

const assets = ref<WealthAsset[]>([])
const portfolios = ref<WealthPortfolio[]>([])
const liabilities = ref<WealthLiability[]>([])
const loading = ref(false)
const errorMessage = ref<string | null>(null)

function formatMoney(amount: number, currency = props.summaryCurrency) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount || 0)
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, {dateStyle: 'medium'}).format(new Date(value))
}

const activeAssets = computed(() => assets.value.filter((asset) => asset.status !== 'ARCHIVED'))
const activePortfolios = computed(() => portfolios.value.filter((portfolio) => portfolio.status !== 'ARCHIVED'))
const activeLiabilities = computed(() => liabilities.value.filter((liability) => liability.status !== 'ARCHIVED'))

const standaloneAssetTotal = computed(() => activeAssets.value.reduce((sum, asset) => sum + Number(asset.currentValue || 0), 0))
const portfolioTotal = computed(() => activePortfolios.value.reduce((sum, portfolio) => sum + Number(portfolio.currentValue || 0), 0))
const assetTotal = computed(() => standaloneAssetTotal.value + portfolioTotal.value)
const liabilityTotal = computed(() => activeLiabilities.value.reduce((sum, liability) => sum + Number(liability.currentBalance || 0), 0))
const netWorth = computed(() => assetTotal.value - liabilityTotal.value)
const hasWealthData = computed(() => activeAssets.value.length > 0 || activePortfolios.value.length > 0 || activeLiabilities.value.length > 0)

const latestValuationDate = computed(() => {
  const dates = [
    ...activeAssets.value.map((asset) => asset.valueAsOf),
    ...activePortfolios.value.map((portfolio) => portfolio.valueAsOf),
    ...activeLiabilities.value.map((liability) => liability.balanceAsOf),
  ].filter(Boolean) as string[]

  if (dates.length === 0) return null
  return dates.sort((a, b) => b.localeCompare(a))[0]
})

const allocationRows = computed(() => [
  {
    label: 'Assets',
    value: assetTotal.value,
    count: activeAssets.value.length,
  },
  {
    label: 'Liabilities',
    value: liabilityTotal.value,
    count: activeLiabilities.value.length,
  },
  {
    label: 'Net worth',
    value: netWorth.value,
    count: activePortfolios.value.length,
  },
])

async function loadWealth() {
  const wealthApi = window.wealth
  if (!wealthApi) {
    errorMessage.value = 'Wealth IPC is not available yet. Apply issue #16 before enabling this page.'
    return
  }

  loading.value = true
  errorMessage.value = null

  try {
    const [assetRows, portfolioRows, liabilityRows] = await Promise.all([
      wealthApi.listAssets(),
      wealthApi.listPortfolios(),
      wealthApi.listLiabilities(),
    ])

    assets.value = assetRows
    portfolios.value = portfolioRows
    liabilities.value = liabilityRows
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load wealth data.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadWealth()
})
</script>

<template>
  <section class="space-y-6">
    <div class="rounded-[2rem] border border-slate-200/80 bg-white/90 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
      <div class="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div class="space-y-3">
          <p class="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500 dark:text-slate-400">
            Wealth / Patrimoine
          </p>
          <div>
            <h2 class="text-3xl font-semibold text-slate-950 dark:text-slate-50">
              Patrimoine net
            </h2>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Cette section prépare le cockpit patrimoine sans mélanger les flux de budget. Les actifs,
              portefeuilles et dettes sont chargés via les handlers IPC wealth ajoutés précédemment.
            </p>
          </div>
        </div>

        <button
          type="button"
          class="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
          :disabled="loading"
          @click="loadWealth"
        >
          {{ loading ? 'Chargement…' : 'Rafraîchir' }}
        </button>
      </div>

      <div v-if="errorMessage" class="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
        {{ errorMessage }}
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      <article class="rounded-[1.5rem] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <p class="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Net worth</p>
        <p class="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">{{ formatMoney(netWorth) }}</p>
        <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Actifs moins dettes, dans la devise de synthèse.</p>
      </article>

      <article class="rounded-[1.5rem] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <p class="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Assets</p>
        <p class="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">{{ formatMoney(assetTotal) }}</p>
        <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">{{ activeAssets.length }} actif(s) suivis.</p>
      </article>

      <article class="rounded-[1.5rem] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <p class="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Dernière valorisation</p>
        <p class="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">{{ formatDate(latestValuationDate) }}</p>
        <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Aucun crash même si la base wealth est vide.</p>
      </article>
    </div>

    <div v-if="!loading && !hasWealthData" class="rounded-[2rem] border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
      <p class="text-lg font-semibold text-slate-900 dark:text-slate-50">Aucune donnée patrimoine pour le moment.</p>
      <p class="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
        Les prochains tickets pourront brancher les formulaires et l’import de valorisations. Pour l’instant,
        cette page valide la navigation et la frontière entre budget courant et patrimoine statique.
      </p>
    </div>

    <div class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-[1.5rem] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold text-slate-950 dark:text-slate-50">Assets</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">Immobilier, cash long terme, objets, crypto, autres.</p>
          </div>
          <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">{{ activeAssets.length }}</span>
        </div>

        <div class="mt-5 space-y-3">
          <div v-for="asset in activeAssets.slice(0, 5)" :key="asset.id" class="rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-semibold text-slate-900 dark:text-slate-50">{{ asset.name }}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400">{{ WEALTH_ASSET_TYPE_LABELS[asset.type] ?? asset.type }}</p>
              </div>
              <p class="text-sm font-semibold text-slate-900 dark:text-slate-50">{{ formatMoney(asset.currentValue, asset.currency) }}</p>
            </div>
          </div>
          <p v-if="activeAssets.length === 0" class="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">Aucun actif enregistré.</p>
        </div>
      </article>

      <article class="rounded-[1.5rem] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold text-slate-950 dark:text-slate-50">Portfolios</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">Comptes titres, retraite, crypto, wrappers fiscaux.</p>
          </div>
          <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">{{ activePortfolios.length }}</span>
        </div>

        <div class="mt-5 space-y-3">
          <div v-for="portfolio in activePortfolios.slice(0, 5)" :key="portfolio.id" class="rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
            <p class="font-semibold text-slate-900 dark:text-slate-50">{{ portfolio.name }}</p>
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {{ PORTFOLIO_TYPE_LABELS[portfolio.type] ?? portfolio.type }} · {{ portfolio.currency }}
            </p>
          </div>
          <p v-if="activePortfolios.length === 0" class="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">Aucun portefeuille enregistré.</p>
        </div>
      </article>

      <article class="rounded-[1.5rem] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold text-slate-950 dark:text-slate-50">Net worth</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">Synthèse actifs, dettes et valeur nette.</p>
          </div>
          <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">{{ props.summaryCurrency }}</span>
        </div>

        <div class="mt-5 space-y-3">
          <div v-for="row in allocationRows" :key="row.label" class="rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="font-semibold text-slate-900 dark:text-slate-50">{{ row.label }}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400">{{ row.count }} élément(s)</p>
              </div>
              <p class="text-sm font-semibold text-slate-900 dark:text-slate-50">{{ formatMoney(row.value) }}</p>
            </div>
          </div>
          <div v-for="liability in activeLiabilities.slice(0, 3)" :key="liability.id" class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="font-semibold text-slate-900 dark:text-slate-50">{{ liability.name }}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400">{{ LIABILITY_TYPE_LABELS[liability.type] ?? liability.type }}</p>
              </div>
              <p class="text-sm font-semibold text-slate-900 dark:text-slate-50">{{ formatMoney(liability.currentBalance, liability.currency) }}</p>
            </div>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
