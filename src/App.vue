<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import AccountsSection from './components/AccountsSection.vue'
import AnalyticsToolbar from './components/AnalyticsToolbar.vue'
import BudgetsSection from './components/BudgetsSection.vue'
import CategoriesSection from './components/CategoriesSection.vue'
import DeleteDialog from './components/DeleteDialog.vue'
import EntityDrawer from './components/EntityDrawer.vue'
import ImportReviewDialog from './components/ImportReviewDialog.vue'
import OverviewSection from './components/OverviewSection.vue'
import RecurringSection from './components/RecurringSection.vue'
import ReportsSection from './components/ReportsSection.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import TaxReportPanel from './components/TaxReportPanel.vue'
import TransactionsSection from './components/TransactionsSection.vue'
import {useBudgetData} from './composables/useBudgetData'
import {useBudgetTargets} from './composables/useBudgetTargets'
import {useCsvImportExport} from './composables/useCsvImportExport'
import {useJsonBackup} from './composables/useJsonBackup'
import {useRecurringTemplates} from './composables/useRecurringTemplates'
import {useReports} from './composables/useReports'
import {useSettings} from './composables/useSettings'
import {formatMoney} from './utils/budgetFormat'
import type {CreateTabKey, ReportPreset, SectionKey, TaxProfile} from './types/budget'

const notice = ref<{ type: 'success' | 'error'; text: string } | null>(null)
const appVersion = ref('')
const taxProfiles = ref<TaxProfile[]>([])
const analyticsPanelOpen = ref(false)

function showNotice(type: 'success' | 'error', text: string) {
  notice.value = {type, text}
  window.setTimeout(() => {
    if (notice.value?.text === text) {
      notice.value = null
    }
  }, 3600)
}

function normalizeError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return t('notices.unknownError')
}

const {t} = useI18n()
const settings = useSettings()
const budget = useBudgetData(showNotice)

const budgetTargets = useBudgetTargets({
  categories: budget.categories,
  transactions: budget.transactions,
  showNotice,
})

const recurring = useRecurringTemplates({
  accounts: budget.accounts,
  categories: budget.categories,
  showNotice,
  refreshTransactions: budget.refreshData,
})

const csv = useCsvImportExport({
  activeSection: budget.activeSection,
  accounts: budget.accounts,
  categories: budget.categories,
  transactions: budget.transactions,
  accountTypeOptions: budget.accountTypeOptions,
  transactionKindOptions: budget.transactionKindOptions,
  refreshData: budget.refreshData,
  showNotice,
})

const reports = useReports({
  accounts: budget.accounts,
  categories: budget.categories,
  transactions: budget.transactions,
  showNotice,
})

async function refreshTaxProfiles() {
  try {
    taxProfiles.value = await window.db.taxProfile.list()
  } catch (error) {
    showNotice('error', normalizeError(error))
  }
}

function refreshEverything() {
  return Promise.all([
    budget.refreshData(),
    budgetTargets.refreshBudgets(),
    recurring.refreshRecurringTemplates(),
    refreshTaxProfiles(),
  ])
}

const jsonBackup = useJsonBackup({
  accounts: budget.accounts,
  categories: budget.categories,
  budgetTargets: budgetTargets.budgets,
  recurringTemplates: recurring.recurringTemplates,
  transactions: budget.transactions,
  taxProfiles,
  refreshAllData: refreshEverything,
  showNotice,
})

const navigation = computed(() => [
  {key: 'overview' as SectionKey, label: t('nav.overview'), marker: 'OV'},
  {key: 'transactions' as SectionKey, label: t('nav.transactions'), marker: 'TX'},
  {key: 'accounts' as SectionKey, label: t('nav.accounts'), marker: 'AC'},
  {key: 'categories' as SectionKey, label: t('nav.categories'), marker: 'CA'},
  {key: 'budgets' as SectionKey, label: t('nav.budgets'), marker: 'BG'},
  {key: 'recurring' as SectionKey, label: t('nav.recurring'), marker: 'RC'},
  {key: 'reports' as SectionKey, label: t('nav.reports'), marker: 'RP'},
])

const sectionMeta = computed<Record<SectionKey, { title: string; description: string }>>(() => ({
  overview: {
    title: t('sections.overview.title'),
    description: t('sections.overview.description'),
  },
  transactions: {
    title: t('sections.transactions.title'),
    description: t('sections.transactions.description'),
  },
  accounts: {
    title: t('sections.accounts.title'),
    description: t('sections.accounts.description'),
  },
  categories: {
    title: t('sections.categories.title'),
    description: t('sections.categories.description'),
  },
  budgets: {
    title: t('sections.budgets.title'),
    description: t('sections.budgets.description'),
  },
  recurring: {
    title: t('sections.recurring.title'),
    description: t('sections.recurring.description'),
  },
  reports: {
    title: t('sections.reports.title'),
    description: t('sections.reports.description'),
  },
}))

const viewTitle = computed(() => sectionMeta.value[budget.activeSection.value].title)
const viewDescription = computed(() => sectionMeta.value[budget.activeSection.value].description)
const showExpandedAnalytics = computed(() => budget.activeSection.value === 'overview')
const showCollapsedAnalytics = computed(() => budget.activeSection.value !== 'overview')
const compactAnalyticsSummary = computed(() => formatMoney(budget.netFlow.value, budget.summaryCurrency.value))

const csvPreviewLines = computed(() => {
  const summary = csv.importPreviewSummary.value
  if (!summary) return []

  return [
    t('importReview.file', {value: csv.pendingImportPath.value || '—'}),
    t('importReview.totalRows', {value: summary.totalRows}),
    t('importReview.validRows', {value: summary.validRows}),
    t('importReview.invalidRows', {value: summary.invalidRows}),
  ]
})

const restorePreviewLines = computed(() => {
  const validation = jsonBackup.restorePreviewValidation.value
  if (!validation) return []

  return [
    t('importReview.file', {value: jsonBackup.restorePreviewPath.value || '—'}),
    t('importReview.accounts', {value: validation.counts.accounts}),
    t('importReview.categories', {value: validation.counts.categories}),
    t('importReview.budgets', {value: validation.counts.budgetTargets}),
    t('importReview.recurring', {value: validation.counts.recurringTemplates}),
    t('importReview.transactions', {value: validation.counts.transactions}),
  ]
})

function setCreateTab(tab: CreateTabKey) {
  budget.createTab.value = tab
}

function closeCompactAnalyticsAfterAction() {
  analyticsPanelOpen.value = false
}

function handleMenuCommand(rawCommand: unknown) {
  const command = typeof rawCommand === 'string' ? rawCommand : ''

  switch (command) {
    case 'create-transaction':
      budget.openCreatePanel('transaction')
      break
    case 'create-account':
      budget.openCreatePanel('account')
      break
    case 'create-category':
      budget.openCreatePanel('category')
      break
    case 'open-budgets':
      budget.selectSection('budgets')
      break
    case 'open-recurring':
      budget.selectSection('recurring')
      break
    case 'generate-due-recurring':
      budget.selectSection('recurring')
      void recurring.generateDueRecurring()
      break
    case 'open-reports':
      budget.selectSection('reports')
      break
    case 'export-period-report':
      budget.selectSection('reports')
      void reports.exportPeriodReport()
      break
    case 'import-csv':
      void csv.beginImportCurrentCsv()
      break
    case 'export-csv':
      void csv.exportCurrentCsv()
      break
    case 'export-json':
      void jsonBackup.exportBackupJson()
      break
    case 'restore-json':
      void jsonBackup.beginRestoreBackupJson()
      break
    case 'refresh-data':
      void refreshEverything()
      break
    case 'toggle-theme':
      settings.toggleTheme()
      break
    case 'open-settings':
      settings.openSettings()
      break
    case 'set-theme-light':
      settings.setTheme('light')
      break
    case 'set-theme-dark':
      settings.setTheme('dark')
      break
    case 'set-locale-fr':
      settings.setLocale('fr')
      break
    case 'set-locale-en':
      settings.setLocale('en')
      break
    default:
      break
  }
}

watch(() => budget.activeSection.value, () => {
  analyticsPanelOpen.value = false
})

onMounted(async () => {
  settings.initSettings()
  window.versions.on('app:menu-command', handleMenuCommand)
  if (window.appShell) {
    appVersion.value = await window.appShell.getVersion()
  }
  await refreshEverything()
  reports.applyPreset('THIS_MONTH')
})
</script>

<template>
  <div class="min-h-screen bg-slate-100 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
    <div class="flex min-h-screen">
      <div
          v-if="budget.sidebarOpen.value"
          class="fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-sm lg:hidden"
          @click="budget.sidebarOpen.value = false"
      />

      <aside
          class="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white px-3 py-4 shadow-xl transition-transform dark:border-slate-800 dark:bg-slate-900 lg:static lg:translate-x-0 lg:shadow-none"
          :class="budget.sidebarOpen.value ? 'translate-x-0' : '-translate-x-full'"
      >
        <div class="mb-6 flex items-center justify-between">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-500">
              {{ t('app.brand') }}
            </p>
            <h2 class="mt-1 text-lg font-bold text-slate-900 dark:text-white">
              {{ t('app.cockpit') }}
            </h2>
          </div>

          <button
              class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-white lg:hidden"
              @click="budget.sidebarOpen.value = false"
          >
            ✕
          </button>
        </div>

        <div class="panel px-3 py-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
            {{ t('app.status') }}
          </p>
          <p class="mt-2 text-sm font-medium text-slate-800 dark:text-slate-100">
            {{ budget.lastSyncLabel.value }}
          </p>
          <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {{ budget.transactions.value.length }} tx · {{ budget.accounts.value.length }} cpt ·
            {{ budget.categories.value.length }} cat
          </p>
        </div>

        <nav class="mt-5 space-y-1.5">
          <button
              v-for="item in navigation"
              :key="item.key"
              class="nav-item !gap-2.5 !rounded-xl !px-2.5 !py-2.5"
              :class="{ 'nav-item-active': budget.activeSection.value === item.key }"
              @click="budget.selectSection(item.key)"
          >
            <span class="nav-marker !h-9 !w-9 !rounded-xl">
              {{ item.marker }}
            </span>

            <span class="min-w-0 flex-1 text-left">
              <span class="block truncate text-sm font-semibold">
                {{ item.label }}
              </span>
            </span>
          </button>
        </nav>

        <div class="mt-5 space-y-2">
          <button class="quick-create-btn !py-2.5 text-sm" @click="budget.openCreatePanel('transaction')">
            + {{ t('entities.singular.transaction') }}
          </button>
          <button class="quick-create-btn-secondary !py-2.5 text-sm" @click="budget.openCreatePanel('account')">
            + {{ t('entities.singular.account') }}
          </button>
          <button class="quick-create-btn-secondary !py-2.5 text-sm" @click="budget.openCreatePanel('category')">
            + {{ t('entities.singular.category') }}
          </button>
        </div>
        <div class="mt-auto px-2 pt-6">
          <div
              class="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
            <p class="font-semibold text-slate-700 dark:text-slate-200">
              Budget
            </p>
            <p class="mt-1">
              v{{ appVersion || '0.9.0' }}
            </p>
          </div>
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header
            class="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
          <div class="relative mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <div class="flex min-w-0 items-center gap-3">
              <button
                  class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-white lg:hidden"
                  @click="budget.sidebarOpen.value = true"
              >
                ☰
              </button>

              <div class="min-w-0">
                <div class="flex min-w-0 items-center gap-3">
                  <p class="hidden text-xs font-semibold uppercase tracking-[0.22em] text-violet-500 sm:block">
                    {{ t('app.localFinance') }}
                  </p>
                  <h1 class="truncate text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
                    {{ viewTitle }}
                  </h1>
                </div>
                <p class="mt-1 hidden truncate text-sm text-slate-500 dark:text-slate-400 lg:block">
                  {{ viewDescription }}
                </p>
              </div>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <button
                  v-if="showCollapsedAnalytics"
                  class="group inline-flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-left text-sm font-semibold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-100 dark:border-violet-900/60 dark:bg-violet-950/45 dark:text-violet-200 dark:hover:border-violet-800 dark:hover:bg-violet-950/70"
                  :aria-expanded="analyticsPanelOpen"
                  @click="analyticsPanelOpen = !analyticsPanelOpen"
              >
                <span class="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-violet-600 text-xs font-bold text-white shadow-sm shadow-violet-950/30">
                  OV
                </span>
                <span class="hidden min-w-0 flex-col leading-tight sm:flex">
                  <span>{{ t('nav.overview') }}</span>
                  <span class="text-xs font-medium text-violet-500 dark:text-violet-300/80">
                    {{ compactAnalyticsSummary }} · {{ budget.transactions.value.length }} tx
                  </span>
                </span>
                <span class="text-lg transition-transform duration-200" :class="analyticsPanelOpen ? 'rotate-180' : ''">
                  ⌄
                </span>
              </button>

              <button class="ghost-btn" @click="settings.openSettings">
                {{ t('common.settings') }}
              </button>
              <button class="ghost-btn" @click="settings.toggleTheme">
                {{ settings.darkMode.value ? t('common.lightMode') : t('common.darkMode') }}
              </button>
              <button class="primary-btn" @click="budget.openCreatePanel('transaction')">
                {{ t('common.add') }}
              </button>
            </div>

            <Transition
                enter-active-class="transition duration-200 ease-out"
                enter-from-class="translate-y-2 opacity-0 scale-95"
                enter-to-class="translate-y-0 opacity-100 scale-100"
                leave-active-class="transition duration-150 ease-in"
                leave-from-class="translate-y-0 opacity-100 scale-100"
                leave-to-class="translate-y-2 opacity-0 scale-95"
            >
              <div
                  v-if="showCollapsedAnalytics && analyticsPanelOpen"
                  class="absolute right-4 top-[calc(100%+0.75rem)] z-50 w-[min(44rem,calc(100vw-2rem))] origin-top-right sm:right-6 lg:right-8"
              >
                <AnalyticsToolbar
                    compact
                    :loading="budget.loading.value"
                    :summary-currency="budget.summaryCurrency.value"
                    :net-flow="budget.netFlow.value"
                    :total-income="budget.totalIncome.value"
                    :total-expense="budget.totalExpense.value"
                    :transaction-count="budget.transactions.value.length"
                    :account-count="budget.accounts.value.length"
                    :category-count="budget.categories.value.length"
                    :current-csv-entity="csv.currentCsvEntity.value"
                    @refresh="refreshEverything"
                    @create-transaction="budget.openCreatePanel('transaction'); closeCompactAnalyticsAfterAction()"
                    @create-account="budget.openCreatePanel('account'); closeCompactAnalyticsAfterAction()"
                    @create-category="budget.openCreatePanel('category'); closeCompactAnalyticsAfterAction()"
                />
              </div>
            </Transition>
          </div>
        </header>

        <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div v-if="notice" class="mb-6">
            <div class="notice" :class="notice.type === 'success' ? 'notice-success' : 'notice-error'">
              {{ notice.text }}
            </div>
          </div>

          <AnalyticsToolbar
              v-if="showExpandedAnalytics"
              :loading="budget.loading.value"
              :summary-currency="budget.summaryCurrency.value"
              :net-flow="budget.netFlow.value"
              :total-income="budget.totalIncome.value"
              :total-expense="budget.totalExpense.value"
              :transaction-count="budget.transactions.value.length"
              :account-count="budget.accounts.value.length"
              :category-count="budget.categories.value.length"
              :current-csv-entity="csv.currentCsvEntity.value"
              @refresh="refreshEverything"
              @create-transaction="budget.openCreatePanel('transaction')"
              @create-account="budget.openCreatePanel('account')"
              @create-category="budget.openCreatePanel('category')"
          />

          <OverviewSection
              v-if="budget.activeSection.value === 'overview'"
              :recent-transactions="budget.recentTransactions.value"
              :monthly-trend="budget.monthlyTrend.value"
              :expense-breakdown="budget.expenseCategoryBreakdown.value"
              :total-expense="budget.totalExpense.value"
              :summary-currency="budget.summaryCurrency.value"
              :recurring-preview="recurring.recurringUpcomingPreview.value"
              :recurring-projection="recurring.recurringInsights.value"
              @open-transactions="budget.selectSection('transactions')"
              @edit-transaction="budget.openEditTransaction"
              @delete-transaction="budget.openDeleteDialog('transaction', $event)"
              @create-transaction="budget.openCreatePanel('transaction')"
              @create-account="budget.openCreatePanel('account')"
              @create-category="budget.openCreatePanel('category')"
          />

          <TransactionsSection
              v-else-if="budget.activeSection.value === 'transactions'"
              :accounts="budget.accounts.value"
              :categories="budget.categories.value"
              :filtered-transactions="budget.filteredTransactions.value"
              :search="budget.transactionSearch.value"
              :kind-filter="budget.transactionKindFilter.value"
              :account-filter="budget.transactionAccountFilter.value"
              :category-filter="budget.transactionCategoryFilter.value"
              @update:search="budget.transactionSearch.value = $event"
              @update:kind-filter="budget.transactionKindFilter.value = $event"
              @update:account-filter="budget.transactionAccountFilter.value = $event"
              @update:category-filter="budget.transactionCategoryFilter.value = $event"
              @create-transaction="budget.openCreatePanel('transaction')"
              @edit-transaction="budget.openEditTransaction"
              @delete-transaction="budget.openDeleteDialog('transaction', $event)"
          />

          <AccountsSection
              v-else-if="budget.activeSection.value === 'accounts'"
              :account-summaries="budget.accountSummaries.value"
              @create-account="budget.openCreatePanel('account')"
              @edit-account="budget.openEditAccount"
              @delete-account="budget.openDeleteDialog('account', $event)"
          />

          <CategoriesSection
              v-else-if="budget.activeSection.value === 'categories'"
              :category-summaries="budget.categorySummaries.value"
              :summary-currency="budget.summaryCurrency.value"
              @create-category="budget.openCreatePanel('category')"
              @edit-category="budget.openEditCategory"
              @delete-category="budget.openDeleteDialog('category', $event)"
          />

          <BudgetsSection
              v-else-if="budget.activeSection.value === 'budgets'"
              :categories="budget.categories.value"
              :rows="budgetTargets.budgetProgressRows.value"
              :summary="budgetTargets.budgetGlobalSummary.value"
              :loading="budgetTargets.budgetLoading.value"
              :saving="budgetTargets.budgetSaving.value"
              :dialog-open="budgetTargets.budgetDialogOpen.value"
              :editing-budget-id="budgetTargets.editingBudgetId.value"
              :budget-form="budgetTargets.budgetForm"
              @open-create="budgetTargets.openCreateBudget($event)"
              @open-edit="(row) => budgetTargets.openEditBudget(budgetTargets.budgets.value.find((entry) => entry.id === row.budgetId)!)"
              @delete-budget="budgetTargets.deleteBudget"
              @close-dialog="budgetTargets.closeBudgetDialog"
              @submit-budget="budgetTargets.submitBudget"
          />

          <RecurringSection
              v-else-if="budget.activeSection.value === 'recurring'"
              :accounts="budget.accounts.value"
              :categories="budget.categories.value"
              :rows="recurring.recurringRows.value"
              :summary="recurring.recurringSummary.value"
              :insights="recurring.recurringInsights.value"
              :upcoming="recurring.recurringUpcomingPreview.value"
              :loading="recurring.recurringLoading.value"
              :saving="recurring.recurringSaving.value"
              :generating="recurring.recurringGenerating.value"
              :dialog-open="recurring.recurringDialogOpen.value"
              :editing-recurring-id="recurring.editingRecurringId.value"
              :recurring-form="recurring.recurringForm"
              @open-create="recurring.openCreateRecurring"
              @open-edit="(row) => recurring.openEditRecurring(recurring.recurringTemplates.value.find((entry) => entry.id === row.templateId)!)"
              @delete-template="recurring.deleteRecurring"
              @generate-template="recurring.generateDueRecurring"
              @generate-all="recurring.generateDueRecurring()"
              @close-dialog="recurring.closeRecurringDialog"
              @submit-template="recurring.submitRecurring"
          />

          <template v-else>
            <ReportsSection
                :preset="reports.reportPreset.value"
                :start-date="reports.reportStartDate.value"
                :end-date="reports.reportEndDate.value"
                :summary="reports.reportSummary.value"
                :comparison="reports.reportComparison.value"
                :account-type-rows="reports.accountTypeRows.value"
                :account-rows="reports.accountRows.value"
                :category-rows="reports.categoryRows.value"
                :foreign-currency-rows="reports.foreignCurrencyRows.value"
                :weekday-rows="reports.weekdayRows.value"
                :insights="reports.insights.value"
                @set-preset="reports.applyPreset($event as ReportPreset)"
                @update:start-date="reports.reportStartDate.value = $event"
                @update:end-date="reports.reportEndDate.value = $event"
                @export-report="reports.exportPeriodReport"
            />

            <div class="mt-6">
              <TaxReportPanel
                  :accounts="budget.accounts.value"
                  :transactions="budget.transactions.value"
                  :tax-profiles="taxProfiles"
                  @refresh-tax-profiles="refreshTaxProfiles"
                  @refresh-data="budget.refreshData"
              />
            </div>
          </template>
        </main>
      </div>
    </div>

    <button
        v-if="analyticsPanelOpen"
        class="fixed inset-0 z-10 cursor-default bg-transparent"
        aria-label="Close overview summary"
        @click="analyticsPanelOpen = false"
    />

    <EntityDrawer
        :open="budget.createPanelOpen.value"
        :mode="budget.panelMode.value"
        :current-tab="budget.createTab.value"
        :editing-target="budget.editingTarget.value"
        :saving="budget.saving.value"
        :fx-busy="budget.fxBusy.value"
        :fx-preview="budget.fxPreview.value"
        :panel-title="budget.panelTitle.value"
        :panel-description="budget.panelDescription.value"
        :panel-submit-label="budget.panelSubmitLabel.value"
        :account-type-options="budget.accountTypeOptions"
        :transaction-kind-options="budget.transactionKindOptions"
        :accounts="budget.accounts.value"
        :categories="budget.categories.value"
        :transaction-form-categories="budget.transactionFormCategories.value"
        :account-form="budget.accountForm"
        :category-form="budget.categoryForm"
        :transaction-form="budget.transactionForm"
        @close="budget.closeCreatePanel"
        @set-tab="setCreateTab"
        @submit-transaction="budget.submitTransaction"
        @submit-account="budget.submitAccount"
        @submit-category="budget.submitCategory"
        @reset-transaction="budget.resetTransactionForm"
        @reset-account="budget.resetAccountForm"
        @reset-category="budget.resetCategoryForm"
        @request-delete="budget.requestDeleteCurrentForm"
        @quote-transaction-fx="budget.quoteTransactionFx"
    />

    <DeleteDialog
        :open="budget.deleteDialog.open"
        :busy="budget.deleteDialog.busy"
        :type="budget.deleteDialog.type"
        :label="budget.deleteDialog.label"
        :heading="budget.deleteDialog.heading"
        :message="budget.deleteDialog.message"
        @close="budget.closeDeleteDialog"
        @confirm="budget.confirmDelete"
    />

    <SettingsDialog
        :open="settings.settingsOpen.value"
        :current-locale="settings.locale.value"
        :current-theme="settings.themeMode.value"
        @close="settings.closeSettings"
        @update-locale="settings.setLocale"
        @update-theme="settings.setTheme"
    />

    <ImportReviewDialog
        :open="csv.importPreviewOpen.value"
        :title="t('importReview.csvTitle')"
        :subtitle="t('importReview.csvSubtitle')"
        :lines="csvPreviewLines"
        :warnings="csv.importPreviewSummary.value?.warnings || []"
        :confirm-label="t('importReview.importNow')"
        @close="csv.closeImportPreview"
        @confirm="csv.confirmImportCurrentCsv"
    />

    <ImportReviewDialog
        :open="jsonBackup.restorePreviewOpen.value"
        :title="t('importReview.jsonTitle')"
        :subtitle="t('importReview.jsonSubtitle')"
        :lines="restorePreviewLines"
        :warnings="jsonBackup.restorePreviewValidation.value?.warnings || []"
        :confirm-label="t('importReview.restoreNow')"
        @close="jsonBackup.closeRestorePreview"
        @confirm="jsonBackup.confirmRestoreBackupJson"
    />
  </div>
</template>