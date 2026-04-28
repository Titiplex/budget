<script setup lang="ts">
import {computed, onMounted, reactive, ref, watch} from 'vue'

import {
  DEFAULT_WEALTH_ASSET_FORM,
  DEFAULT_WEALTH_LIABILITY_FORM,
  DEFAULT_WEALTH_PORTFOLIO_FORM,
  LIABILITY_PAYMENT_FREQUENCY_LABELS,
  LIABILITY_RATE_TYPE_LABELS,
  LIABILITY_TYPE_LABELS,
  PORTFOLIO_TAX_WRAPPER_LABELS,
  PORTFOLIO_TYPE_LABELS,
  WEALTH_ASSET_TYPE_LABELS,
  type CreateWealthAssetInput,
  type CreateWealthLiabilityInput,
  type CreateWealthPortfolioInput,
  type LiabilityPaymentFrequency,
  type LiabilityRateType,
  type NetWorthSnapshot,
  type WealthAsset,
  type WealthLiability,
  type WealthOverview,
  type WealthPortfolio,
} from '../types/wealth'

const props = withDefaults(
    defineProps<{
      summaryCurrency?: string
    }>(),
    {
      summaryCurrency: 'CAD',
    },
)

type WealthTab = 'asset' | 'portfolio' | 'liability'
type EditingState = { type: WealthTab; id: number } | null

const overview = ref<WealthOverview | null>(null)
const assets = ref<WealthAsset[]>([])
const portfolios = ref<WealthPortfolio[]>([])
const liabilities = ref<WealthLiability[]>([])
const snapshots = ref<NetWorthSnapshot[]>([])

const loading = ref(false)
const saving = ref(false)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)

const activeTab = ref<WealthTab>('asset')
const editing = ref<EditingState>(null)

const assetForm = reactive<CreateWealthAssetInput>(freshAssetForm())
const portfolioForm = reactive<CreateWealthPortfolioInput>(freshPortfolioForm())
const liabilityForm = reactive<CreateWealthLiabilityInput>(freshLiabilityForm())

function todayInputDate() {
  return new Date().toISOString().slice(0, 10)
}

function freshAssetForm(): CreateWealthAssetInput {
  return {
    ...DEFAULT_WEALTH_ASSET_FORM,
    currency: props.summaryCurrency,
    valueAsOf: todayInputDate(),
  }
}

function freshPortfolioForm(): CreateWealthPortfolioInput {
  return {
    ...DEFAULT_WEALTH_PORTFOLIO_FORM,
    currency: props.summaryCurrency,
    valueAsOf: todayInputDate(),
  }
}

function freshLiabilityForm(): CreateWealthLiabilityInput {
  return {
    ...DEFAULT_WEALTH_LIABILITY_FORM,
    currency: props.summaryCurrency,
    balanceAsOf: todayInputDate(),
  }
}

function assignForm<TTarget extends object, TSource extends object>(target: TTarget, source: TSource) {
  Object.assign(target, source)
}

function resetAssetForm() {
  assignForm(assetForm, freshAssetForm())
}

function resetPortfolioForm() {
  assignForm(portfolioForm, freshPortfolioForm())
}

function resetLiabilityForm() {
  assignForm(liabilityForm, freshLiabilityForm())
}

function resetActiveForm() {
  editing.value = null

  if (activeTab.value === 'asset') resetAssetForm()
  if (activeTab.value === 'portfolio') resetPortfolioForm()
  if (activeTab.value === 'liability') resetLiabilityForm()
}

function setTab(tab: WealthTab) {
  activeTab.value = tab
  resetActiveForm()
}

function activeAndIncluded<T extends { status: string; includeInNetWorth?: boolean }>(rows: T[]) {
  return rows.filter((row) => row.status !== 'ARCHIVED' && row.includeInNetWorth !== false)
}

const activeAssets = computed(() => activeAndIncluded(assets.value))
const activePortfolios = computed(() => activeAndIncluded(portfolios.value))
const activeLiabilities = computed(() => activeAndIncluded(liabilities.value))

const overviewCurrency = computed(() => overview.value?.currency || props.summaryCurrency)

const fallbackTotals = computed(() => {
  const totalStandaloneAssets = activeAssets.value.reduce((sum, asset) => {
    return sum + Number(asset.currentValue || 0) * Math.max(0, Math.min(100, Number(asset.ownershipPercent ?? 100))) / 100
  }, 0)

  const totalPortfolios = activePortfolios.value.reduce((sum, portfolio) => {
    return sum + Number(portfolio.currentValue || 0) * Math.max(0, Math.min(100, Number(portfolio.ownershipPercent ?? 100))) / 100
  }, 0)

  const totalLiabilities = activeLiabilities.value.reduce((sum, liability) => {
    return sum + Number(liability.currentBalance || 0)
  }, 0)

  const totalAssets = totalStandaloneAssets + totalPortfolios

  return {
    totalStandaloneAssets,
    totalPortfolios,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    assetCount: activeAssets.value.length,
    portfolioCount: activePortfolios.value.length,
    liabilityCount: activeLiabilities.value.length,
  }
})

const totals = computed(() => ({
  ...fallbackTotals.value,
  ...(overview.value?.totals || {}),
}))

const hasWealthData = computed(() => {
  return totals.value.assetCount > 0 || totals.value.portfolioCount > 0 || totals.value.liabilityCount > 0
})

const hasMultiCurrencyWarning = computed(() => {
  return Boolean(overview.value && !overview.value.canConsolidate)
})

const latestValuationDate = computed(() => {
  const snapshotDate = overview.value?.totals.snapshotDate || overview.value?.latestSnapshot?.snapshotDate
  if (snapshotDate) return snapshotDate

  const dates = [
    ...activeAssets.value.map((asset) => asset.valueAsOf),
    ...activePortfolios.value.map((portfolio) => portfolio.valueAsOf),
    ...activeLiabilities.value.map((liability) => liability.balanceAsOf),
  ].filter(Boolean) as string[]

  return dates.sort((a, b) => b.localeCompare(a))[0] || null
})

const dataQualityScore = computed(() => {
  const records = [...activeAssets.value, ...activePortfolios.value, ...activeLiabilities.value]
  if (records.length === 0) return 0

  const points = records.reduce((score, record) => {
    const date = 'valueAsOf' in record ? record.valueAsOf : record.balanceAsOf
    const institution =
        'institutionName' in record
            ? record.institutionName
            : 'lenderName' in record
                ? record.lenderName
                : null

    return score + (record.currency ? 1 : 0) + (date ? 1 : 0) + (institution ? 1 : 0)
  }, 0)

  return Math.round((points / (records.length * 3)) * 100)
})

const tabs = computed(() => [
  {key: 'asset' as const, label: 'Actif', count: totals.value.assetCount},
  {key: 'portfolio' as const, label: 'Portefeuille', count: totals.value.portfolioCount},
  {key: 'liability' as const, label: 'Dette', count: totals.value.liabilityCount},
])

function formatMoney(amount: number | null | undefined, currency = overviewCurrency.value) {
  if (amount == null) return '—'

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0))
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'

  return new Intl.DateTimeFormat(undefined, {dateStyle: 'medium'}).format(new Date(value))
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return '—'

  return new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value)
}

function parseDateInput(value: string | null | undefined) {
  if (!value) return null

  return value.slice(0, 10)
}

function optionalText(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeCurrency(value: string | null | undefined) {
  return value?.trim().toUpperCase() || props.summaryCurrency
}

function normalizeOptionalNumber(value: number | string | null | undefined) {
  if (value == null || value === '') return null

  return Number(value)
}

function normalizeAssetPayload(): CreateWealthAssetInput {
  return {
    ...assetForm,
    name: assetForm.name.trim(),
    currency: normalizeCurrency(assetForm.currency),
    currentValue: Number(assetForm.currentValue || 0),
    includeInNetWorth: Boolean(assetForm.includeInNetWorth),
    ownershipPercent: Number(assetForm.ownershipPercent ?? 100),
    acquisitionValue: normalizeOptionalNumber(assetForm.acquisitionValue),
    acquiredAt: parseDateInput(assetForm.acquiredAt),
    valueAsOf: parseDateInput(assetForm.valueAsOf),
    institutionName: optionalText(assetForm.institutionName),
    institutionCountry: optionalText(assetForm.institutionCountry)?.toUpperCase() || null,
    institutionRegion: optionalText(assetForm.institutionRegion),
    note: optionalText(assetForm.note),
  }
}

function normalizePortfolioPayload(): CreateWealthPortfolioInput {
  return {
    ...portfolioForm,
    name: portfolioForm.name.trim(),
    currency: normalizeCurrency(portfolioForm.currency),
    currentValue: Number(portfolioForm.currentValue || 0),
    includeInNetWorth: Boolean(portfolioForm.includeInNetWorth),
    ownershipPercent: Number(portfolioForm.ownershipPercent ?? 100),
    cashBalance: Number(portfolioForm.cashBalance || 0),
    valueAsOf: parseDateInput(portfolioForm.valueAsOf),
    accountId: portfolioForm.accountId == null ? null : Number(portfolioForm.accountId),
    institutionName: optionalText(portfolioForm.institutionName),
    institutionCountry: optionalText(portfolioForm.institutionCountry)?.toUpperCase() || null,
    institutionRegion: optionalText(portfolioForm.institutionRegion),
    note: optionalText(portfolioForm.note),
  }
}

function normalizeLiabilityPayload(): CreateWealthLiabilityInput {
  return {
    ...liabilityForm,
    name: liabilityForm.name.trim(),
    currency: normalizeCurrency(liabilityForm.currency),
    currentBalance: Number(liabilityForm.currentBalance || 0),
    includeInNetWorth: Boolean(liabilityForm.includeInNetWorth),
    initialAmount: normalizeOptionalNumber(liabilityForm.initialAmount),
    interestRate: normalizeOptionalNumber(liabilityForm.interestRate),
    minimumPayment: normalizeOptionalNumber(liabilityForm.minimumPayment),
    paymentFrequency: liabilityForm.paymentFrequency || null,
    rateType: liabilityForm.rateType || 'UNKNOWN',
    lenderName: optionalText(liabilityForm.lenderName),
    institutionCountry: optionalText(liabilityForm.institutionCountry)?.toUpperCase() || null,
    institutionRegion: optionalText(liabilityForm.institutionRegion),
    openedAt: parseDateInput(liabilityForm.openedAt),
    dueAt: parseDateInput(liabilityForm.dueAt),
    balanceAsOf: parseDateInput(liabilityForm.balanceAsOf),
    securedAssetId: liabilityForm.securedAssetId == null ? null : Number(liabilityForm.securedAssetId),
    accountId: liabilityForm.accountId == null ? null : Number(liabilityForm.accountId),
    note: optionalText(liabilityForm.note),
  }
}

async function loadWealth() {
  const wealthApi = window.wealth

  if (!wealthApi) {
    errorMessage.value = 'Wealth IPC is not available.'
    return
  }

  loading.value = true
  errorMessage.value = null

  try {
    const [overviewResult, snapshotRows] = await Promise.all([
      wealthApi.getOverview({currency: props.summaryCurrency}),
      wealthApi.listNetWorthSnapshots({currency: props.summaryCurrency}),
    ])

    overview.value = overviewResult
    assets.value = overviewResult.assets || []
    portfolios.value = overviewResult.portfolios || []
    liabilities.value = overviewResult.liabilities || []
    snapshots.value = snapshotRows || []
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load wealth data.'
  } finally {
    loading.value = false
  }
}

async function saveActiveForm() {
  const wealthApi = window.wealth
  if (!wealthApi) return

  saving.value = true
  errorMessage.value = null
  successMessage.value = null

  try {
    if (activeTab.value === 'asset') {
      const payload = normalizeAssetPayload()

      if (editing.value?.type === 'asset') {
        await wealthApi.updateAsset(editing.value.id, payload)
      } else {
        await wealthApi.createAsset(payload)
      }
    }

    if (activeTab.value === 'portfolio') {
      const payload = normalizePortfolioPayload()

      if (editing.value?.type === 'portfolio') {
        await wealthApi.updatePortfolio(editing.value.id, payload)
      } else {
        await wealthApi.createPortfolio(payload)
      }
    }

    if (activeTab.value === 'liability') {
      const payload = normalizeLiabilityPayload()

      if (editing.value?.type === 'liability') {
        await wealthApi.updateLiability(editing.value.id, payload)
      } else {
        await wealthApi.createLiability(payload)
      }
    }

    successMessage.value = editing.value ? 'Entrée mise à jour.' : 'Entrée ajoutée.'
    resetActiveForm()
    await loadWealth()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Impossible de sauvegarder cette entrée patrimoine.'
  } finally {
    saving.value = false
  }
}

async function createSnapshot() {
  const wealthApi = window.wealth
  if (!wealthApi) return

  saving.value = true
  errorMessage.value = null
  successMessage.value = null

  try {
    await wealthApi.createGeneratedNetWorthSnapshot({
      currency: props.summaryCurrency,
      note: 'Snapshot généré depuis la vue patrimoine.',
    })

    successMessage.value = 'Snapshot de valeur nette créé.'
    await loadWealth()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Impossible de créer le snapshot.'
  } finally {
    saving.value = false
  }
}

function editAsset(asset: WealthAsset) {
  activeTab.value = 'asset'
  editing.value = {type: 'asset', id: asset.id}

  assignForm(assetForm, {
    ...asset,
    includeInNetWorth: asset.includeInNetWorth ?? true,
    ownershipPercent: asset.ownershipPercent ?? 100,
    acquiredAt: parseDateInput(asset.acquiredAt),
    valueAsOf: parseDateInput(asset.valueAsOf),
  })
}

function editPortfolio(portfolio: WealthPortfolio) {
  activeTab.value = 'portfolio'
  editing.value = {type: 'portfolio', id: portfolio.id}

  assignForm(portfolioForm, {
    ...portfolio,
    includeInNetWorth: portfolio.includeInNetWorth ?? true,
    ownershipPercent: portfolio.ownershipPercent ?? 100,
    valueAsOf: parseDateInput(portfolio.valueAsOf),
    accountId: portfolio.accountId ?? null,
  })
}

function editLiability(liability: WealthLiability) {
  activeTab.value = 'liability'
  editing.value = {type: 'liability', id: liability.id}

  assignForm(liabilityForm, {
    ...liability,
    includeInNetWorth: liability.includeInNetWorth ?? true,
    minimumPayment: liability.minimumPayment ?? null,
    paymentFrequency: liability.paymentFrequency ?? null,
    rateType: liability.rateType ?? 'UNKNOWN',
    openedAt: parseDateInput(liability.openedAt),
    dueAt: parseDateInput(liability.dueAt),
    balanceAsOf: parseDateInput(liability.balanceAsOf),
    securedAssetId: liability.securedAssetId ?? null,
    accountId: liability.accountId ?? null,
  })
}

async function removeAsset(asset: WealthAsset) {
  if (!window.confirm(`Supprimer l'actif "${asset.name}" ?`)) return
  await runDelete(() => window.wealth.deleteAsset(asset.id))
}

async function removePortfolio(portfolio: WealthPortfolio) {
  if (!window.confirm(`Supprimer le portefeuille "${portfolio.name}" ?`)) return
  await runDelete(() => window.wealth.deletePortfolio(portfolio.id))
}

async function removeLiability(liability: WealthLiability) {
  if (!window.confirm(`Supprimer la dette "${liability.name}" ?`)) return
  await runDelete(() => window.wealth.deleteLiability(liability.id))
}

async function runDelete(callback: () => Promise<unknown>) {
  saving.value = true
  errorMessage.value = null
  successMessage.value = null

  try {
    await callback()
    successMessage.value = 'Entrée supprimée.'
    resetActiveForm()
    await loadWealth()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Impossible de supprimer cette entrée patrimoine.'
  } finally {
    saving.value = false
  }
}

watch(
    () => props.summaryCurrency,
    () => {
      resetActiveForm()
      void loadWealth()
    },
)

onMounted(() => {
  void loadWealth()
})
</script>

<template>
  <section class="space-y-6">
    <div class="overflow-hidden rounded-[2rem] border border-slate-800/80 bg-slate-950/80 shadow-sm">
      <div class="border-b border-slate-800/80 px-6 py-5">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">
              Wealth
            </p>
            <h2 class="mt-2 text-2xl font-semibold text-white">
              Patrimoine
            </h2>
            <p class="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
              Le budget suit les flux. Le patrimoine suit les valeurs à date.
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
                type="button"
                class="inline-flex items-center justify-center rounded-2xl border border-violet-700/70 bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="loading || saving || !hasWealthData"
                @click="createSnapshot"
            >
              Créer snapshot
            </button>
            <button
                type="button"
                class="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="loading"
                @click="loadWealth"
            >
              {{ loading ? 'Chargement…' : 'Rafraîchir' }}
            </button>
          </div>
        </div>
      </div>

      <div class="grid gap-px bg-slate-800/80 md:grid-cols-4">
        <article class="bg-slate-950 px-6 py-5">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Actifs
          </p>
          <p class="mt-3 text-3xl font-semibold text-white">
            {{ formatMoney(totals.totalAssets) }}
          </p>
          <p class="mt-1 text-sm text-slate-400">
            {{ totals.assetCount }} actif(s) · {{ totals.portfolioCount }} portefeuille(s)
          </p>
        </article>

        <article class="bg-slate-950 px-6 py-5">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Dettes
          </p>
          <p class="mt-3 text-3xl font-semibold text-white">
            {{ formatMoney(totals.totalLiabilities) }}
          </p>
          <p class="mt-1 text-sm text-slate-400">
            {{ totals.liabilityCount }} dette(s)
          </p>
        </article>

        <article class="bg-gradient-to-br from-violet-950 to-slate-950 px-6 py-5">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">
            Valeur nette
          </p>
          <p class="mt-3 text-3xl font-semibold text-white">
            {{ formatMoney(totals.netWorth) }}
          </p>
          <p class="mt-1 text-sm text-violet-200/80">
            Dernière valorisation : {{ formatDate(latestValuationDate) }}
          </p>
        </article>

        <article class="bg-slate-950 px-6 py-5">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Qualité données
          </p>
          <p class="mt-3 text-3xl font-semibold text-white">
            {{ dataQualityScore }}%
          </p>
          <p class="mt-1 text-sm text-slate-400">
            Devise, institution, date
          </p>
        </article>
      </div>
    </div>

    <div
        v-if="hasMultiCurrencyWarning"
        class="rounded-2xl border border-amber-900/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-100"
    >
      Plusieurs devises sont présentes. Le total consolidé affiché utilise uniquement {{ props.summaryCurrency }}.
      Les autres devises restent visibles dans le détail.
    </div>

    <div
        v-if="errorMessage"
        class="rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200"
    >
      {{ errorMessage }}
    </div>

    <div
        v-if="successMessage"
        class="rounded-2xl border border-emerald-900/60 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200"
    >
      {{ successMessage }}
    </div>

    <div class="grid gap-6 xl:grid-cols-[430px_minmax(0,1fr)]">
      <article class="rounded-[2rem] border border-slate-800 bg-slate-950 p-5 shadow-sm">
        <div class="mb-5 flex rounded-2xl bg-slate-900 p-1">
          <button
              v-for="tab in tabs"
              :key="tab.key"
              type="button"
              class="flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition"
              :class="activeTab === tab.key ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'"
              @click="setTab(tab.key)"
          >
            {{ tab.label }}
            <span class="ml-1 text-xs opacity-70">{{ tab.count }}</span>
          </button>
        </div>

        <div class="mb-5">
          <h3 class="text-lg font-semibold text-white">
            {{ editing ? 'Modifier une entrée' : 'Ajouter une entrée' }}
          </h3>
          <p class="mt-1 text-sm text-slate-400">
            {{
              activeTab === 'asset'
                  ? 'Un actif détenu hors portefeuille.'
                  : activeTab === 'portfolio'
                      ? 'Un compte ou portefeuille d’investissement.'
                      : 'Une dette ou obligation à rembourser.'
            }}
          </p>
        </div>

        <form class="space-y-4" @submit.prevent="saveActiveForm">
          <template v-if="activeTab === 'asset'">
            <div>
              <label class="text-sm font-medium text-slate-300">Nom</label>
              <input
                  v-model="assetForm.name"
                  required
                  class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-violet-500"
                  placeholder="Maison, voiture, cash long terme…"
              />
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-300">Type</label>
                <select
                    v-model="assetForm.type"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                >
                  <option
                      v-for="(label, value) in WEALTH_ASSET_TYPE_LABELS"
                      :key="value"
                      :value="value"
                  >
                    {{ label }}
                  </option>
                </select>
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Devise</label>
                <input
                    v-model="assetForm.currency"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm uppercase text-white outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-300">Valeur actuelle</label>
                <input
                    v-model.number="assetForm.currentValue"
                    type="number"
                    min="0"
                    step="0.01"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Détention %</label>
                <input
                    v-model.number="assetForm.ownershipPercent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-300">Date valorisation</label>
                <input
                    v-model="assetForm.valueAsOf"
                    type="date"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Institution</label>
                <input
                    v-model="assetForm.institutionName"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <label
                class="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
              <input v-model="assetForm.includeInNetWorth" type="checkbox"
                     class="h-4 w-4 rounded border-slate-600 bg-slate-950"/>
              Inclure dans la valeur nette
            </label>
          </template>

          <template v-if="activeTab === 'portfolio'">
            <div>
              <label class="text-sm font-medium text-slate-300">Nom</label>
              <input
                  v-model="portfolioForm.name"
                  required
                  class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                  placeholder="CELI, PEA, CTO…"
              />
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-300">Type</label>
                <select
                    v-model="portfolioForm.type"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                >
                  <option
                      v-for="(label, value) in PORTFOLIO_TYPE_LABELS"
                      :key="value"
                      :value="value"
                  >
                    {{ label }}
                  </option>
                </select>
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Enveloppe fiscale</label>
                <select
                    v-model="portfolioForm.taxWrapper"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                >
                  <option
                      v-for="(label, value) in PORTFOLIO_TAX_WRAPPER_LABELS"
                      :key="value"
                      :value="value"
                  >
                    {{ label }}
                  </option>
                </select>
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-300">Valeur actuelle</label>
                <input
                    v-model.number="portfolioForm.currentValue"
                    type="number"
                    min="0"
                    step="0.01"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Cash</label>
                <input
                    v-model.number="portfolioForm.cashBalance"
                    type="number"
                    min="0"
                    step="0.01"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-300">Détention %</label>
                <input
                    v-model.number="portfolioForm.ownershipPercent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Devise</label>
                <input
                    v-model="portfolioForm.currency"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm uppercase text-white outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-300">Date valorisation</label>
                <input
                    v-model="portfolioForm.valueAsOf"
                    type="date"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Institution</label>
                <input
                    v-model="portfolioForm.institutionName"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <label
                class="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
              <input v-model="portfolioForm.includeInNetWorth" type="checkbox"
                     class="h-4 w-4 rounded border-slate-600 bg-slate-950"/>
              Inclure dans la valeur nette
            </label>
          </template>

          <template v-if="activeTab === 'liability'">
            <div>
              <label class="text-sm font-medium text-slate-300">Nom</label>
              <input
                  v-model="liabilityForm.name"
                  required
                  class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                  placeholder="Hypothèque, carte de crédit…"
              />
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-300">Type</label>
                <select
                    v-model="liabilityForm.type"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                >
                  <option
                      v-for="(label, value) in LIABILITY_TYPE_LABELS"
                      :key="value"
                      :value="value"
                  >
                    {{ label }}
                  </option>
                </select>
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Devise</label>
                <input
                    v-model="liabilityForm.currency"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm uppercase text-white outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-300">Solde courant</label>
                <input
                    v-model.number="liabilityForm.currentBalance"
                    type="number"
                    min="0"
                    step="0.01"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Taux %</label>
                <input
                    v-model.number="liabilityForm.interestRate"
                    type="number"
                    min="0"
                    step="0.01"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-300">Paiement minimum</label>
                <input
                    v-model.number="liabilityForm.minimumPayment"
                    type="number"
                    min="0"
                    step="0.01"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Fréquence</label>
                <select
                    v-model="liabilityForm.paymentFrequency"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                >
                  <option :value="null">Non renseignée</option>
                  <option
                      v-for="(label, value) in LIABILITY_PAYMENT_FREQUENCY_LABELS"
                      :key="value"
                      :value="value as LiabilityPaymentFrequency"
                  >
                    {{ label }}
                  </option>
                </select>
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-300">Type de taux</label>
                <select
                    v-model="liabilityForm.rateType"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                >
                  <option
                      v-for="(label, value) in LIABILITY_RATE_TYPE_LABELS"
                      :key="value"
                      :value="value as LiabilityRateType"
                  >
                    {{ label }}
                  </option>
                </select>
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Date du solde</label>
                <input
                    v-model="liabilityForm.balanceAsOf"
                    type="date"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div>
              <label class="text-sm font-medium text-slate-300">Prêteur</label>
              <input
                  v-model="liabilityForm.lenderName"
                  class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>

            <label
                class="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
              <input v-model="liabilityForm.includeInNetWorth" type="checkbox"
                     class="h-4 w-4 rounded border-slate-600 bg-slate-950"/>
              Inclure dans la valeur nette
            </label>
          </template>

          <div>
            <label class="text-sm font-medium text-slate-300">Note</label>
            <textarea
                v-if="activeTab === 'asset'"
                v-model="assetForm.note"
                rows="3"
                class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
            />
            <textarea
                v-if="activeTab === 'portfolio'"
                v-model="portfolioForm.note"
                rows="3"
                class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
            />
            <textarea
                v-if="activeTab === 'liability'"
                v-model="liabilityForm.note"
                rows="3"
                class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>

          <div class="flex gap-2 pt-2">
            <button
                type="submit"
                class="flex-1 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="saving"
            >
              {{ saving ? 'Sauvegarde…' : editing ? 'Mettre à jour' : 'Ajouter' }}
            </button>
            <button
                v-if="editing"
                type="button"
                class="rounded-2xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-900"
                @click="resetActiveForm"
            >
              Annuler
            </button>
          </div>
        </form>
      </article>

      <div class="space-y-6">
        <article class="rounded-[2rem] border border-slate-800 bg-slate-950 p-5 shadow-sm">
          <div class="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 class="text-lg font-semibold text-white">
                Vue détaillée
              </h3>
              <p class="mt-1 text-sm text-slate-400">
                Les montants exclus ou archivés ne comptent pas dans la valeur nette.
              </p>
            </div>
          </div>

          <div v-if="!hasWealthData && !loading"
               class="rounded-2xl border border-dashed border-slate-700 p-8 text-center">
            <p class="text-base font-semibold text-white">Aucune donnée patrimoine.</p>
            <p class="mt-2 text-sm text-slate-400">
              Ajoute un actif, un portefeuille ou une dette pour commencer.
            </p>
          </div>

          <div v-else class="space-y-3">
            <template v-if="activeTab === 'asset'">
              <div
                  v-for="asset in assets"
                  :key="asset.id"
                  class="rounded-2xl border border-slate-800 bg-slate-900/50 p-4"
              >
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-semibold text-white">
                      {{ asset.name }}
                    </p>
                    <p class="mt-1 text-sm text-slate-400">
                      {{ WEALTH_ASSET_TYPE_LABELS[asset.type] }} · {{ asset.currency }} ·
                      {{ asset.ownershipPercent ?? 100 }}%
                    </p>
                    <p class="mt-1 text-xs text-slate-500">
                      Valorisation : {{ formatDate(asset.valueAsOf) }}
                      <span v-if="asset.includeInNetWorth === false"> · Exclu valeur nette</span>
                      <span v-if="asset.status === 'ARCHIVED'"> · Archivé</span>
                    </p>
                  </div>
                  <div class="text-left sm:text-right">
                    <p class="text-lg font-semibold text-white">
                      {{ formatMoney(asset.currentValue, asset.currency) }}
                    </p>
                    <div class="mt-2 flex gap-2 sm:justify-end">
                      <button class="text-sm font-semibold text-violet-300 hover:text-violet-200"
                              @click="editAsset(asset)">
                        Modifier
                      </button>
                      <button class="text-sm font-semibold text-red-300 hover:text-red-200" @click="removeAsset(asset)">
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <template v-if="activeTab === 'portfolio'">
              <div
                  v-for="portfolio in portfolios"
                  :key="portfolio.id"
                  class="rounded-2xl border border-slate-800 bg-slate-900/50 p-4"
              >
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-semibold text-white">
                      {{ portfolio.name }}
                    </p>
                    <p class="mt-1 text-sm text-slate-400">
                      {{ PORTFOLIO_TYPE_LABELS[portfolio.type] }} ·
                      {{ PORTFOLIO_TAX_WRAPPER_LABELS[portfolio.taxWrapper] }} · {{ portfolio.currency }}
                    </p>
                    <p class="mt-1 text-xs text-slate-500">
                      Valorisation : {{ formatDate(portfolio.valueAsOf) }}
                      <span v-if="portfolio.includeInNetWorth === false"> · Exclu valeur nette</span>
                      <span v-if="portfolio.status === 'ARCHIVED'"> · Archivé</span>
                    </p>
                  </div>
                  <div class="text-left sm:text-right">
                    <p class="text-lg font-semibold text-white">
                      {{ formatMoney(portfolio.currentValue, portfolio.currency) }}
                    </p>
                    <p class="text-xs text-slate-500">
                      Cash : {{ formatMoney(portfolio.cashBalance, portfolio.currency) }}
                    </p>
                    <div class="mt-2 flex gap-2 sm:justify-end">
                      <button class="text-sm font-semibold text-violet-300 hover:text-violet-200"
                              @click="editPortfolio(portfolio)">
                        Modifier
                      </button>
                      <button class="text-sm font-semibold text-red-300 hover:text-red-200"
                              @click="removePortfolio(portfolio)">
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <template v-if="activeTab === 'liability'">
              <div
                  v-for="liability in liabilities"
                  :key="liability.id"
                  class="rounded-2xl border border-slate-800 bg-slate-900/50 p-4"
              >
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-semibold text-white">
                      {{ liability.name }}
                    </p>
                    <p class="mt-1 text-sm text-slate-400">
                      {{ LIABILITY_TYPE_LABELS[liability.type] }} · {{ liability.currency }}
                      <span v-if="liability.interestRate != null"> · {{ liability.interestRate }}%</span>
                    </p>
                    <p class="mt-1 text-xs text-slate-500">
                      Solde au : {{ formatDate(liability.balanceAsOf) }}
                      <span v-if="liability.minimumPayment != null"> · Min. {{
                          formatMoney(liability.minimumPayment, liability.currency)
                        }}</span>
                      <span v-if="liability.includeInNetWorth === false"> · Exclue valeur nette</span>
                      <span v-if="liability.status === 'ARCHIVED'"> · Archivée</span>
                    </p>
                  </div>
                  <div class="text-left sm:text-right">
                    <p class="text-lg font-semibold text-white">
                      {{ formatMoney(liability.currentBalance, liability.currency) }}
                    </p>
                    <div class="mt-2 flex gap-2 sm:justify-end">
                      <button class="text-sm font-semibold text-violet-300 hover:text-violet-200"
                              @click="editLiability(liability)">
                        Modifier
                      </button>
                      <button class="text-sm font-semibold text-red-300 hover:text-red-200"
                              @click="removeLiability(liability)">
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </article>

        <article class="rounded-[2rem] border border-slate-800 bg-slate-950 p-5 shadow-sm">
          <h3 class="text-lg font-semibold text-white">
            Breakdown valeur nette
          </h3>
          <div class="mt-4 overflow-hidden rounded-2xl border border-slate-800">
            <table class="min-w-full divide-y divide-slate-800 text-sm">
              <thead class="bg-slate-900/70 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th class="px-4 py-3">Élément</th>
                <th class="px-4 py-3">Type</th>
                <th class="px-4 py-3 text-right">Montant</th>
                <th class="px-4 py-3 text-right">Poids</th>
              </tr>
              </thead>
              <tbody class="divide-y divide-slate-800">
              <tr
                  v-for="row in overview?.breakdown || []"
                  :key="row.key"
                  class="text-slate-300"
              >
                <td class="px-4 py-3 font-medium text-white">{{ row.label }}</td>
                <td class="px-4 py-3">{{ row.entityType }}</td>
                <td class="px-4 py-3 text-right">{{ formatMoney(row.amount, row.currency) }}</td>
                <td class="px-4 py-3 text-right">{{ formatPercent(row.percentOfTotal) }}</td>
              </tr>
              <tr v-if="!overview?.breakdown.length">
                <td colspan="4" class="px-4 py-6 text-center text-slate-500">
                  Aucun breakdown disponible.
                </td>
              </tr>
              </tbody>
            </table>
          </div>
        </article>

        <article class="rounded-[2rem] border border-slate-800 bg-slate-950 p-5 shadow-sm">
          <h3 class="text-lg font-semibold text-white">
            Snapshots
          </h3>
          <div class="mt-4 space-y-3">
            <div
                v-for="snapshot in snapshots.slice(0, 5)"
                :key="snapshot.id"
                class="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3"
            >
              <div>
                <p class="font-semibold text-white">
                  {{ formatDate(snapshot.snapshotDate) }}
                </p>
                <p class="text-sm text-slate-400">
                  {{ snapshot.source }} · {{ snapshot.currency }}
                </p>
              </div>
              <p class="text-right font-semibold text-white">
                {{ formatMoney(snapshot.netWorth, snapshot.currency) }}
              </p>
            </div>
            <p v-if="snapshots.length === 0" class="text-sm text-slate-500">
              Aucun snapshot pour l’instant.
            </p>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>