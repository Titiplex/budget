<script setup lang="ts">
import {computed, onMounted, reactive, ref} from 'vue'
import {
  DEFAULT_WEALTH_ASSET_FORM,
  DEFAULT_WEALTH_LIABILITY_FORM,
  DEFAULT_WEALTH_PORTFOLIO_FORM,
  LIABILITY_TYPE_LABELS,
  PORTFOLIO_TAX_WRAPPER_LABELS,
  PORTFOLIO_TYPE_LABELS,
  WEALTH_ASSET_TYPE_LABELS,
  type CreateWealthAssetInput,
  type CreateWealthLiabilityInput,
  type CreateWealthPortfolioInput,
  type WealthAsset,
  type WealthLiability,
  type WealthPortfolio,
} from '../types/wealth'

const props = withDefaults(defineProps<{
  summaryCurrency?: string
}>(), {
  summaryCurrency: 'CAD',
})

type WealthTab = 'asset' | 'portfolio' | 'liability'
type EditingState = { type: WealthTab; id: number } | null

const assets = ref<WealthAsset[]>([])
const portfolios = ref<WealthPortfolio[]>([])
const liabilities = ref<WealthLiability[]>([])

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

function assignForm(target: object, source: object) {
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

function formatMoney(amount: number, currency = props.summaryCurrency) {
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

function parseDateInput(value: string | null | undefined) {
  if (!value) return null
  return value.slice(0, 10)
}

function optionalText(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeAssetPayload(): CreateWealthAssetInput {
  return {
    ...assetForm,
    name: assetForm.name.trim(),
    currency: assetForm.currency.trim().toUpperCase() || props.summaryCurrency,
    currentValue: Number(assetForm.currentValue || 0),
    acquisitionValue: assetForm.acquisitionValue == null ? null : Number(assetForm.acquisitionValue),
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
    currency: portfolioForm.currency.trim().toUpperCase() || props.summaryCurrency,
    currentValue: Number(portfolioForm.currentValue || 0),
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
    currency: liabilityForm.currency.trim().toUpperCase() || props.summaryCurrency,
    currentBalance: Number(liabilityForm.currentBalance || 0),
    initialAmount: liabilityForm.initialAmount == null ? null : Number(liabilityForm.initialAmount),
    interestRate: liabilityForm.interestRate == null ? null : Number(liabilityForm.interestRate),
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

const activeAssets = computed(() => assets.value.filter((asset) => asset.status !== 'ARCHIVED'))
const activePortfolios = computed(() => portfolios.value.filter((portfolio) => portfolio.status !== 'ARCHIVED'))
const activeLiabilities = computed(() => liabilities.value.filter((liability) => liability.status !== 'ARCHIVED'))

const standaloneAssetTotal = computed(() =>
    activeAssets.value.reduce((sum, asset) => sum + Number(asset.currentValue || 0), 0),
)

const portfolioTotal = computed(() =>
    activePortfolios.value.reduce((sum, portfolio) => sum + Number(portfolio.currentValue || 0), 0),
)

const assetTotal = computed(() => standaloneAssetTotal.value + portfolioTotal.value)

const liabilityTotal = computed(() =>
    activeLiabilities.value.reduce((sum, liability) => sum + Number(liability.currentBalance || 0), 0),
)

const netWorth = computed(() => assetTotal.value - liabilityTotal.value)

const hasWealthData = computed(
    () => activeAssets.value.length > 0 || activePortfolios.value.length > 0 || activeLiabilities.value.length > 0,
)

const latestValuationDate = computed(() => {
  const dates = [
    ...activeAssets.value.map((asset) => asset.valueAsOf),
    ...activePortfolios.value.map((portfolio) => portfolio.valueAsOf),
    ...activeLiabilities.value.map((liability) => liability.balanceAsOf),
  ].filter(Boolean) as string[]

  return dates.sort((a, b) => b.localeCompare(a))[0] || null
})

const tabs = computed(() => [
  {key: 'asset' as const, label: 'Actif', count: activeAssets.value.length},
  {key: 'portfolio' as const, label: 'Portefeuille', count: activePortfolios.value.length},
  {key: 'liability' as const, label: 'Dette', count: activeLiabilities.value.length},
])

async function loadWealth() {
  const wealthApi = window.wealth

  if (!wealthApi) {
    errorMessage.value = 'Wealth IPC is not available.'
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

function editAsset(asset: WealthAsset) {
  activeTab.value = 'asset'
  editing.value = {type: 'asset', id: asset.id}

  assignForm(assetForm, {
    ...asset,
    acquiredAt: parseDateInput(asset.acquiredAt),
    valueAsOf: parseDateInput(asset.valueAsOf),
  })
}

function editPortfolio(portfolio: WealthPortfolio) {
  activeTab.value = 'portfolio'
  editing.value = {type: 'portfolio', id: portfolio.id}

  assignForm(portfolioForm, {
    ...portfolio,
    valueAsOf: parseDateInput(portfolio.valueAsOf),
    accountId: portfolio.accountId ?? null,
  })
}

function editLiability(liability: WealthLiability) {
  activeTab.value = 'liability'
  editing.value = {type: 'liability', id: liability.id}

  assignForm(liabilityForm, {
    ...liability,
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
              Suivi manuel des actifs, portefeuilles et dettes. Les flux budget restent séparés.
            </p>
          </div>

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

      <div class="grid gap-px bg-slate-800/80 md:grid-cols-3">
        <article class="bg-slate-950 px-6 py-5">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Actifs
          </p>
          <p class="mt-3 text-3xl font-semibold text-white">
            {{ formatMoney(assetTotal) }}
          </p>
          <p class="mt-1 text-sm text-slate-400">
            {{ activeAssets.length }} actif(s) · {{ activePortfolios.length }} portefeuille(s)
          </p>
        </article>

        <article class="bg-slate-950 px-6 py-5">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Dettes
          </p>
          <p class="mt-3 text-3xl font-semibold text-white">
            {{ formatMoney(liabilityTotal) }}
          </p>
          <p class="mt-1 text-sm text-slate-400">
            {{ activeLiabilities.length }} dette(s)
          </p>
        </article>

        <article class="bg-gradient-to-br from-violet-950 to-slate-950 px-6 py-5">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">
            Valeur nette
          </p>
          <p class="mt-3 text-3xl font-semibold text-white">
            {{ formatMoney(netWorth) }}
          </p>
          <p class="mt-1 text-sm text-violet-200/80">
            Dernière valorisation : {{ formatDate(latestValuationDate) }}
          </p>
        </article>
      </div>
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
              :class="activeTab === tab.key
              ? 'bg-white text-slate-950 shadow-sm'
              : 'text-slate-400 hover:text-white'"
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
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition focus:border-violet-500"
                >
                  <option v-for="(label, key) in WEALTH_ASSET_TYPE_LABELS" :key="key" :value="key">
                    {{ label }}
                  </option>
                </select>
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Devise</label>
                <input
                    v-model="assetForm.currency"
                    maxlength="3"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm uppercase text-white outline-none transition focus:border-violet-500"
                />
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-300">Valeur actuelle</label>
                <input
                    v-model.number="assetForm.currentValue"
                    required
                    min="0"
                    step="0.01"
                    type="number"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition focus:border-violet-500"
                />
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Valorisé le</label>
                <input
                    v-model="assetForm.valueAsOf"
                    type="date"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition focus:border-violet-500"
                />
              </div>
            </div>

            <div>
              <label class="text-sm font-medium text-slate-300">Note</label>
              <textarea
                  v-model="assetForm.note"
                  rows="3"
                  class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-violet-500"
                  placeholder="Optionnel"
              />
            </div>
          </template>

          <template v-if="activeTab === 'portfolio'">
            <div>
              <label class="text-sm font-medium text-slate-300">Nom</label>
              <input
                  v-model="portfolioForm.name"
                  required
                  class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-violet-500"
                  placeholder="Broker, REER, CELI, PEA…"
              />
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-300">Type</label>
                <select
                    v-model="portfolioForm.type"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition focus:border-violet-500"
                >
                  <option v-for="(label, key) in PORTFOLIO_TYPE_LABELS" :key="key" :value="key">
                    {{ label }}
                  </option>
                </select>
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Enveloppe fiscale</label>
                <select
                    v-model="portfolioForm.taxWrapper"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition focus:border-violet-500"
                >
                  <option v-for="(label, key) in PORTFOLIO_TAX_WRAPPER_LABELS" :key="key" :value="key">
                    {{ label }}
                  </option>
                </select>
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-3">
              <div>
                <label class="text-sm font-medium text-slate-300">Valeur</label>
                <input
                    v-model.number="portfolioForm.currentValue"
                    required
                    min="0"
                    step="0.01"
                    type="number"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition focus:border-violet-500"
                />
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Cash</label>
                <input
                    v-model.number="portfolioForm.cashBalance"
                    min="0"
                    step="0.01"
                    type="number"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition focus:border-violet-500"
                />
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Devise</label>
                <input
                    v-model="portfolioForm.currency"
                    maxlength="3"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm uppercase text-white outline-none transition focus:border-violet-500"
                />
              </div>
            </div>

            <div>
              <label class="text-sm font-medium text-slate-300">Valorisé le</label>
              <input
                  v-model="portfolioForm.valueAsOf"
                  type="date"
                  class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition focus:border-violet-500"
              />
            </div>
          </template>

          <template v-if="activeTab === 'liability'">
            <div>
              <label class="text-sm font-medium text-slate-300">Nom</label>
              <input
                  v-model="liabilityForm.name"
                  required
                  class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-violet-500"
                  placeholder="Hypothèque, prêt auto, carte…"
              />
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-300">Type</label>
                <select
                    v-model="liabilityForm.type"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition focus:border-violet-500"
                >
                  <option v-for="(label, key) in LIABILITY_TYPE_LABELS" :key="key" :value="key">
                    {{ label }}
                  </option>
                </select>
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Devise</label>
                <input
                    v-model="liabilityForm.currency"
                    maxlength="3"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm uppercase text-white outline-none transition focus:border-violet-500"
                />
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-3">
              <div>
                <label class="text-sm font-medium text-slate-300">Solde</label>
                <input
                    v-model.number="liabilityForm.currentBalance"
                    required
                    min="0"
                    step="0.01"
                    type="number"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition focus:border-violet-500"
                />
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Montant initial</label>
                <input
                    v-model.number="liabilityForm.initialAmount"
                    min="0"
                    step="0.01"
                    type="number"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition focus:border-violet-500"
                />
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Taux %</label>
                <input
                    v-model.number="liabilityForm.interestRate"
                    min="0"
                    step="0.01"
                    type="number"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition focus:border-violet-500"
                />
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-300">Prêteur</label>
                <input
                    v-model="liabilityForm.lenderName"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition focus:border-violet-500"
                />
              </div>

              <div>
                <label class="text-sm font-medium text-slate-300">Solde au</label>
                <input
                    v-model="liabilityForm.balanceAsOf"
                    type="date"
                    class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition focus:border-violet-500"
                />
              </div>
            </div>
          </template>

          <div class="flex flex-wrap gap-3 pt-2">
            <button
                type="submit"
                class="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="saving"
            >
              {{ saving ? 'Sauvegarde…' : editing ? 'Mettre à jour' : 'Ajouter' }}
            </button>

            <button
                type="button"
                class="inline-flex items-center justify-center rounded-2xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-900"
                @click="resetActiveForm"
            >
              Réinitialiser
            </button>
          </div>
        </form>
      </article>

      <article class="rounded-[2rem] border border-slate-800 bg-slate-950 p-5 shadow-sm">
        <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 class="text-lg font-semibold text-white">
              {{
                activeTab === 'asset'
                    ? 'Actifs'
                    : activeTab === 'portfolio'
                        ? 'Portefeuilles'
                        : 'Dettes'
              }}
            </h3>
            <p class="mt-1 text-sm text-slate-400">
              {{
                activeTab === 'asset'
                    ? 'Actifs indépendants des comptes budget.'
                    : activeTab === 'portfolio'
                        ? 'Comptes d’investissement suivis manuellement.'
                        : 'Soldes de dettes à déduire du patrimoine.'
              }}
            </p>
          </div>

          <div class="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200">
            {{
              activeTab === 'asset'
                  ? formatMoney(standaloneAssetTotal)
                  : activeTab === 'portfolio'
                      ? formatMoney(portfolioTotal)
                      : formatMoney(liabilityTotal)
            }}
          </div>
        </div>

        <div v-if="activeTab === 'asset'" class="space-y-3">
          <div
              v-for="asset in activeAssets"
              :key="asset.id"
              class="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 transition hover:border-slate-700"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="font-semibold text-white">{{ asset.name }}</p>
                <p class="mt-1 text-sm text-slate-400">
                  {{ WEALTH_ASSET_TYPE_LABELS[asset.type] ?? asset.type }} · {{ asset.currency }} ·
                  {{ formatDate(asset.valueAsOf) }}
                </p>
              </div>

              <div class="text-left sm:text-right">
                <p class="font-semibold text-white">{{ formatMoney(asset.currentValue, asset.currency) }}</p>
                <div class="mt-2 flex gap-3 sm:justify-end">
                  <button type="button" class="text-sm font-semibold text-violet-300 hover:text-violet-200"
                          @click="editAsset(asset)">
                    Modifier
                  </button>
                  <button type="button" class="text-sm font-semibold text-red-300 hover:text-red-200"
                          @click="removeAsset(asset)">
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div
              v-if="activeAssets.length === 0"
              class="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-8 text-center"
          >
            <p class="font-semibold text-white">Aucun actif enregistré</p>
            <p class="mt-1 text-sm text-slate-400">Ajoute ton premier actif avec le formulaire.</p>
          </div>
        </div>

        <div v-if="activeTab === 'portfolio'" class="space-y-3">
          <div
              v-for="portfolio in activePortfolios"
              :key="portfolio.id"
              class="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 transition hover:border-slate-700"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="font-semibold text-white">{{ portfolio.name }}</p>
                <p class="mt-1 text-sm text-slate-400">
                  {{ PORTFOLIO_TYPE_LABELS[portfolio.type] ?? portfolio.type }} ·
                  {{ PORTFOLIO_TAX_WRAPPER_LABELS[portfolio.taxWrapper] ?? portfolio.taxWrapper }} ·
                  {{ portfolio.currency }}
                </p>
                <p class="mt-1 text-xs text-slate-500">
                  Cash : {{ formatMoney(portfolio.cashBalance, portfolio.currency) }} ·
                  {{ formatDate(portfolio.valueAsOf) }}
                </p>
              </div>

              <div class="text-left sm:text-right">
                <p class="font-semibold text-white">{{ formatMoney(portfolio.currentValue, portfolio.currency) }}</p>
                <div class="mt-2 flex gap-3 sm:justify-end">
                  <button type="button" class="text-sm font-semibold text-violet-300 hover:text-violet-200"
                          @click="editPortfolio(portfolio)">
                    Modifier
                  </button>
                  <button type="button" class="text-sm font-semibold text-red-300 hover:text-red-200"
                          @click="removePortfolio(portfolio)">
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div
              v-if="activePortfolios.length === 0"
              class="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-8 text-center"
          >
            <p class="font-semibold text-white">Aucun portefeuille enregistré</p>
            <p class="mt-1 text-sm text-slate-400">Ajoute un compte-titres, REER, CELI, PEA ou équivalent.</p>
          </div>
        </div>

        <div v-if="activeTab === 'liability'" class="space-y-3">
          <div
              v-for="liability in activeLiabilities"
              :key="liability.id"
              class="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 transition hover:border-slate-700"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="font-semibold text-white">{{ liability.name }}</p>
                <p class="mt-1 text-sm text-slate-400">
                  {{ LIABILITY_TYPE_LABELS[liability.type] ?? liability.type }} · {{ liability.currency }} ·
                  {{ formatDate(liability.balanceAsOf) }}
                </p>
                <p v-if="liability.lenderName" class="mt-1 text-xs text-slate-500">
                  Prêteur : {{ liability.lenderName }}
                </p>
              </div>

              <div class="text-left sm:text-right">
                <p class="font-semibold text-white">{{ formatMoney(liability.currentBalance, liability.currency) }}</p>
                <div class="mt-2 flex gap-3 sm:justify-end">
                  <button type="button" class="text-sm font-semibold text-violet-300 hover:text-violet-200"
                          @click="editLiability(liability)">
                    Modifier
                  </button>
                  <button type="button" class="text-sm font-semibold text-red-300 hover:text-red-200"
                          @click="removeLiability(liability)">
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div
              v-if="activeLiabilities.length === 0"
              class="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-8 text-center"
          >
            <p class="font-semibold text-white">Aucune dette enregistrée</p>
            <p class="mt-1 text-sm text-slate-400">Ajoute une hypothèque, un prêt ou une carte à rembourser.</p>
          </div>
        </div>
      </article>
    </div>

    <div
        v-if="!loading && !hasWealthData"
        class="rounded-[2rem] border border-dashed border-slate-800 bg-slate-950/70 p-8 text-center"
    >
      <p class="text-lg font-semibold text-white">Ton patrimoine est vide pour l’instant.</p>
      <p class="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-400">
        Ajoute une première entrée. Le calcul de valeur nette se mettra à jour automatiquement.
      </p>
    </div>
  </section>
</template>