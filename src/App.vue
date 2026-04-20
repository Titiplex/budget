<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import AccountsSection from './components/AccountsSection.vue'
import AnalyticsToolbar from './components/AnalyticsToolbar.vue'
import CategoriesSection from './components/CategoriesSection.vue'
import DeleteDialog from './components/DeleteDialog.vue'
import EntityDrawer from './components/EntityDrawer.vue'
import OverviewSection from './components/OverviewSection.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import TransactionsSection from './components/TransactionsSection.vue'
import {useBudgetData} from './composables/useBudgetData'
import {useCsvImportExport} from './composables/useCsvImportExport'
import {useJsonBackup} from './composables/useJsonBackup'
import {useSettings} from './composables/useSettings'
import type {CreateTabKey, SectionKey} from './types/budget'

const notice = ref<{ type: 'success' | 'error'; text: string } | null>(null)

function showNotice(type: 'success' | 'error', text: string) {
  notice.value = {type, text}
  window.setTimeout(() => {
    if (notice.value?.text === text) {
      notice.value = null
    }
  }, 3600)
}

const {t} = useI18n()
const settings = useSettings()
const budget = useBudgetData(showNotice)

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

const jsonBackup = useJsonBackup({
  accounts: budget.accounts,
  categories: budget.categories,
  transactions: budget.transactions,
  refreshData: budget.refreshData,
  showNotice,
})

const navigation = computed(() => [
  {key: 'overview' as SectionKey, label: t('nav.overview'), marker: 'OV'},
  {key: 'transactions' as SectionKey, label: t('nav.transactions'), marker: 'TX'},
  {key: 'accounts' as SectionKey, label: t('nav.accounts'), marker: 'AC'},
  {key: 'categories' as SectionKey, label: t('nav.categories'), marker: 'CA'},
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
}))

const viewTitle = computed(() => sectionMeta.value[budget.activeSection.value].title)
const viewDescription = computed(() => sectionMeta.value[budget.activeSection.value].description)

function setCreateTab(tab: CreateTabKey) {
  budget.createTab.value = tab
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
    case 'import-csv':
      void csv.importCurrentCsv()
      break
    case 'export-csv':
      void csv.exportCurrentCsv()
      break
    case 'export-json':
      void jsonBackup.exportBackupJson()
      break
    case 'restore-json':
      void jsonBackup.restoreBackupJson()
      break
    case 'refresh-data':
      void budget.refreshData()
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

onMounted(async () => {
  settings.initSettings()
  window.versions.on('app:menu-command', handleMenuCommand)
  await budget.refreshData()
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
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header
            class="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
          <div class="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
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
          </div>
        </header>

        <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div v-if="notice" class="mb-6">
            <div class="notice" :class="notice.type === 'success' ? 'notice-success' : 'notice-error'">
              {{ notice.text }}
            </div>
          </div>

          <AnalyticsToolbar
              :loading="budget.loading.value"
              :summary-currency="budget.summaryCurrency.value"
              :net-flow="budget.netFlow.value"
              :total-income="budget.totalIncome.value"
              :total-expense="budget.totalExpense.value"
              :transaction-count="budget.transactions.value.length"
              :account-count="budget.accounts.value.length"
              :category-count="budget.categories.value.length"
              :current-csv-entity="csv.currentCsvEntity.value"
              @refresh="budget.refreshData"
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
              v-else
              :category-summaries="budget.categorySummaries.value"
              :summary-currency="budget.summaryCurrency.value"
              @create-category="budget.openCreatePanel('category')"
              @edit-category="budget.openEditCategory"
              @delete-category="budget.openDeleteDialog('category', $event)"
          />
        </main>
      </div>
    </div>

    <EntityDrawer
        :open="budget.createPanelOpen.value"
        :mode="budget.panelMode.value"
        :current-tab="budget.createTab.value"
        :editing-target="budget.editingTarget.value"
        :saving="budget.saving.value"
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
    />

    <DeleteDialog
        :open="budget.deleteDialog.open"
        :busy="budget.deleteDialog.busy"
        :type="budget.deleteDialog.type"
        :label="budget.deleteDialog.label"
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
  </div>
</template>