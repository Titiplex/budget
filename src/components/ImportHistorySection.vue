<script setup lang="ts">
import {currentLocaleCode} from '../i18n'
import {useI18n} from 'vue-i18n'
import {computed, onMounted, ref} from 'vue'
import FreshnessBadge from './provenance/FreshnessBadge.vue'
import ProvenanceBadge from './provenance/ProvenanceBadge.vue'
import DataOriginTooltip from './provenance/DataOriginTooltip.vue'
import type {ImportEntityId} from '../types/imports'
import {provenanceFromImportBatch, withFreshness} from '../utils/provenance'

const {t, te} = useI18n()

interface ImportHistoryItem {
  id: ImportEntityId
  status: string
  importType: string
  provider?: string | null
  source?: string | null
  fileName?: string | null
  rowCount: number
  appliedRowCount?: number
  errorCount: number
  warningCount?: number
  duplicateCount: number
  decisionCount?: number
  createdCount?: number
  linkedCount?: number
  updatedCount?: number
  skippedCount?: number
  importedAt?: string | null
  parsedAt?: string | null
  previewedAt?: string | null
  appliedAt?: string | null
  cancelledAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

interface ImportAuditDetail extends ImportHistoryItem {
  rawRows: Array<{rowNumber?: number; rawText?: string; rawJson?: Record<string, unknown>; status?: string}>
  normalizedRows: Array<{id?: ImportEntityId; rowNumber?: number; status?: string; normalizedData?: Record<string, unknown>; validationErrors?: Array<{severity?: string; code?: string; message: string; field?: string | null}>}>
  errors: Array<{rowNumber?: number; severity?: string; code?: string; message: string; field?: string | null}>
  warnings: Array<{rowNumber?: number; severity?: string; code?: string; message: string; field?: string | null}>
  duplicateCandidates: Array<{normalizedRowId?: ImportEntityId; confidence?: number; reason?: string; entityId?: ImportEntityId}>
  decisions: Array<{id?: ImportEntityId; rowNumber?: number; normalizedRowId?: ImportEntityId; kind?: string; status?: string; reason?: string; reasonSource?: string; history?: unknown[]}>
  appliedLinks: Array<{normalizedRowId?: ImportEntityId; entityType?: string; operation?: string; transactionId?: ImportEntityId; assetId?: ImportEntityId; appliedAt?: string}>
}

const emit = defineEmits<{ notice: [type: 'success' | 'error', text: string] }>()

const loading = ref(false)
const detailLoading = ref(false)
const deleting = ref(false)
const exporting = ref(false)
const history = ref<ImportHistoryItem[]>([])
const sources = ref<string[]>([])
const selected = ref<ImportAuditDetail | null>(null)
const statusFilter = ref('')
const sourceFilter = ref('')
const importTypeFilter = ref('')
const fromFilter = ref('')
const toFilter = ref('')
const search = ref('')
const detailTabs = ['overview', 'raw', 'normalized', 'messages', 'decisions', 'links'] as const
const activeDetailTab = ref<(typeof detailTabs)[number]>('overview')
const deleteConfirmation = ref('')

const statusOptions = ['draft', 'parsed', 'previewed', 'applied', 'partiallyApplied', 'cancelled']
const importTypeOptions = ['transactions', 'investments', 'assets', 'mixed']

function importLabel(value: string) {
  const key = `importLabels.${value}`
  return te(key) ? t(key) : value
}

const filters = computed(() => ({
  status: statusFilter.value || undefined,
  source: sourceFilter.value || undefined,
  importType: importTypeFilter.value || undefined,
  from: fromFilter.value || undefined,
  to: toFilter.value || undefined,
  search: search.value || undefined,
}))

const totalRows = computed(() => history.value.reduce((sum, item) => sum + (item.rowCount || 0), 0))
const totalApplied = computed(() => history.value.reduce((sum, item) => sum + (item.appliedRowCount || 0), 0))
const totalErrors = computed(() => history.value.reduce((sum, item) => sum + (item.errorCount || 0), 0))
const totalDuplicates = computed(() => history.value.reduce((sum, item) => sum + (item.duplicateCount || 0), 0))
const canDeleteSelected = computed(() => Boolean(selected.value && deleteConfirmation.value === selected.value.id))

function normalizeIpcError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as {message?: unknown}).message || t('interfaceText.importHistorySection.unknownError'))
  return t('interfaceText.importHistorySection.couldNotReadImportHistory')
}

function ensureOk<T>(result: {ok: boolean; data: T; error: unknown}) {
  if (!result.ok) throw new Error(normalizeIpcError(result.error))
  return result.data
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(currentLocaleCode(), {dateStyle: 'medium', timeStyle: 'short'}).format(date)
}

function statusClass(status: string) {
  if (status === 'applied') return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-900'
  if (status === 'partiallyApplied' || status === 'previewed') return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-900'
  if (status === 'cancelled') return 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
  return 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/30 dark:text-sky-200 dark:ring-sky-900'
}

function importProvenance(item: ImportHistoryItem) {
  return provenanceFromImportBatch({
    id: item.id,
    provider: item.provider || item.source || null,
    fileName: item.fileName || null,
    importedAt: item.importedAt || null,
    appliedAt: item.appliedAt || null,
    createdAt: item.createdAt || item.importedAt || null,
    updatedAt: item.updatedAt || item.appliedAt || item.importedAt || null,
  })
}

function importFreshness(item: ImportHistoryItem) {
  return withFreshness(importProvenance(item)).freshnessStatus
}

async function loadHistory() {
  loading.value = true
  try {
    history.value = ensureOk(await window.imports.listHistory(filters.value)) as ImportHistoryItem[]
    sources.value = ensureOk(await window.imports.listSources()) as string[]
  } catch (error) {
    emit('notice', 'error', normalizeIpcError(error))
  } finally {
    loading.value = false
  }
}

async function openDetail(batchId: ImportEntityId) {
  detailLoading.value = true
  deleteConfirmation.value = ''
  try {
    selected.value = ensureOk(await window.imports.getDetail(batchId)) as ImportAuditDetail
    activeDetailTab.value = 'overview'
  } catch (error) {
    emit('notice', 'error', normalizeIpcError(error))
  } finally {
    detailLoading.value = false
  }
}

async function deleteSelectedHistory() {
  if (!selected.value || !canDeleteSelected.value) return
  deleting.value = true
  try {
    const id = selected.value.id
    await window.imports.deleteHistory(id, {preserveFinancialData: true})
    selected.value = null
    deleteConfirmation.value = ''
    await loadHistory()
    emit('notice', 'success', t('interfaceText.importHistorySection.historyDeletedImportedTransactionsAndAssetsWere'))
  } catch (error) {
    emit('notice', 'error', normalizeIpcError(error))
  } finally {
    deleting.value = false
  }
}

async function exportSelected(format: 'markdown' | 'csv') {
  if (!selected.value) return
  exporting.value = true
  try {
    const report = ensureOk(await window.imports.exportReport(selected.value.id, {format})) as {fileName: string; content: string}
    const saved = await window.file.saveText({defaultPath: report.fileName, content: report.content})
    if (!saved?.canceled) emit('notice', 'success', t('importLabels.exported', {format: format === 'csv' ? 'CSV' : 'Markdown'}))
  } catch (error) {
    emit('notice', 'error', normalizeIpcError(error))
  } finally {
    exporting.value = false
  }
}

function rowLabel(row: ImportAuditDetail['normalizedRows'][number]) {
  return row.normalizedData?.label || row.normalizedData?.symbol || '—'
}

function rowAmount(row: ImportAuditDetail['normalizedRows'][number]) {
  return row.normalizedData?.amount ?? row.normalizedData?.quantity ?? '—'
}

onMounted(loadHistory)
</script>

<template>
  <section class="space-y-5">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h2 class="mt-1 text-2xl font-bold text-slate-950 dark:text-white">{{ t('appShell.importHistoryTitle') }}</h2>
      </div>
      <button class="primary-btn" :disabled="loading" @click="loadHistory">{{ loading ? t('common.loading') : t('common.refresh') }}</button>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div class="panel p-4"><p class="text-xs text-slate-500">{{ t('appShell.imports') }}</p><p class="text-2xl font-bold">{{ history.length }}</p></div>
      <div class="panel p-4"><p class="text-xs text-slate-500">{{ t('interfaceText.importHistorySection.rows') }}</p><p class="text-2xl font-bold">{{ totalRows }}</p></div>
      <div class="panel p-4"><p class="text-xs text-slate-500">{{ t('interfaceText.importHistorySection.applied') }}</p><p class="text-2xl font-bold">{{ totalApplied }}</p></div>
      <div class="panel p-4"><p class="text-xs text-slate-500">{{ t('interfaceText.importHistorySection.errorsDuplicates') }}</p><p class="text-2xl font-bold">{{ totalErrors }} / {{ totalDuplicates }}</p></div>
    </div>

    <div class="panel p-4">
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <label class="space-y-1 text-xs font-bold uppercase tracking-wide text-slate-500">{{ t('common.search') }}<input v-model="search" class="form-input" :placeholder="t('interfaceText.importHistorySection.fileIDOrSource')" /></label>
        <label class="space-y-1 text-xs font-bold uppercase tracking-wide text-slate-500">{{ t('budgets.statusLabel') }}<select v-model="statusFilter" class="form-input"><option value="">{{ t('common.all') }}</option><option v-for="status in statusOptions" :key="status" :value="status">{{ importLabel(status) }}</option></select></label>
        <label class="space-y-1 text-xs font-bold uppercase tracking-wide text-slate-500">{{ t('interfaceText.goalsSection.source') }}<select v-model="sourceFilter" class="form-input"><option value="">{{ t('common.allFeminine') }}</option><option v-for="source in sources" :key="source" :value="source">{{ source }}</option></select></label>
        <label class="space-y-1 text-xs font-bold uppercase tracking-wide text-slate-500">{{ t('forms.fields.type') }}<select v-model="importTypeFilter" class="form-input"><option value="">{{ t('common.all') }}</option><option v-for="type in importTypeOptions" :key="type" :value="type">{{ importLabel(type) }}</option></select></label>
        <label class="space-y-1 text-xs font-bold uppercase tracking-wide text-slate-500">{{ t('interfaceText.importHistorySection.from') }}<input v-model="fromFilter" type="date" class="form-input" /></label>
        <label class="space-y-1 text-xs font-bold uppercase tracking-wide text-slate-500">{{ t('interfaceText.importHistorySection.to') }}<input v-model="toFilter" type="date" class="form-input" /></label>
      </div>
      <div class="mt-4 flex justify-end"><button class="secondary-btn" :disabled="loading" @click="loadHistory">{{ t('interfaceText.importHistorySection.applyFilters') }}</button></div>
    </div>

    <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(28rem,0.9fr)]">
      <div class="min-w-0 overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
            <tr><th class="px-3 py-2">{{ t('forms.fields.date') }}</th><th class="px-3 py-2">{{ t('importWizard.steps.file') }}</th><th class="px-3 py-2">{{ t('interfaceText.goalsSection.source') }}</th><th class="px-3 py-2">{{ t('budgets.statusLabel') }}</th><th class="px-3 py-2">{{ t('interfaceText.importHistorySection.rows') }}</th><th class="px-3 py-2">{{ t('interfaceText.importHistorySection.audit') }}</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="item in history" :key="String(item.id)" class="cursor-pointer align-top hover:bg-slate-50 dark:hover:bg-slate-950/40" @click="openDetail(item.id)">
              <td class="px-3 py-3 text-xs text-slate-500">{{ formatDate(item.importedAt) }}</td>
              <td class="px-3 py-3"><button class="font-semibold underline-offset-2 hover:underline" @click.stop="openDetail(item.id)">{{ item.fileName || item.id }}</button><p class="text-xs text-slate-400">{{ importLabel(item.importType) }}</p></td>
              <td class="px-3 py-3 text-xs">
                <div class="flex flex-wrap items-center gap-1.5">
                  <ProvenanceBadge :provenance="importProvenance(item)" compact />
                  <DataOriginTooltip :provenance="importProvenance(item)" :freshness-status="importFreshness(item)" />
                </div>
                <p class="mt-1 text-slate-500">{{ item.source || item.provider || 'manual' }}</p>
              </td>
              <td class="px-3 py-3"><span class="rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset" :class="statusClass(item.status)">{{ importLabel(item.status) }}</span></td>
              <td class="px-3 py-3 text-xs">{{ t('importLabels.rowCount', item.rowCount) }}<br />{{ t('importLabels.appliedCount', item.appliedRowCount || 0) }}</td>
              <td class="px-3 py-3 text-xs">{{ t('importLabels.errorCount', item.errorCount) }}<br />{{ t('importLabels.duplicateCount', item.duplicateCount) }}</td>
            </tr>
            <tr v-if="!loading && !history.length"><td colspan="6" class="px-3 py-10 text-center text-sm text-slate-500">{{ t('interfaceText.importHistorySection.noImportsMatchTheseFilters') }}</td></tr>
          </tbody>
        </table>
      </div>

      <aside class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div v-if="detailLoading" class="py-10 text-center text-sm text-slate-500">{{ t('interfaceText.importHistorySection.loadingDetails') }}</div>
        <div v-else-if="!selected" class="py-10 text-center text-sm text-slate-500">{{ t('interfaceText.importHistorySection.selectAnImportToViewItsDetails') }}</div>
        <div v-else class="space-y-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 class="text-lg font-bold text-slate-950 dark:text-white">{{ selected.fileName || selected.id }}</h3>
              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                <ProvenanceBadge :provenance="importProvenance(selected)" />
                <FreshnessBadge :status="importFreshness(selected)" :provenance="importProvenance(selected)" />
                <DataOriginTooltip :provenance="importProvenance(selected)" :freshness-status="importFreshness(selected)" />
              </div>
              <p class="mt-1 text-xs text-slate-500">{{ selected.source }} · {{ importLabel(selected.importType) }} · {{ formatDate(selected.importedAt) }}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button class="secondary-btn !px-3 !py-2 text-xs" :disabled="exporting" @click="exportSelected('markdown')">{{ t('interfaceText.importHistorySection.exportMarkdown') }}</button>
              <button class="secondary-btn !px-3 !py-2 text-xs" :disabled="exporting" @click="exportSelected('csv')">{{ t('interfaceText.importHistorySection.exportCSV') }}</button>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <button v-for="tab in detailTabs" :aria-pressed="activeDetailTab === tab" :key="tab" class="rounded-xl px-3 py-2 text-xs font-bold ring-1 ring-inset" :class="activeDetailTab === tab ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'" @click="activeDetailTab = tab">{{ importLabel(tab) }}</button>
          </div>

          <div v-if="activeDetailTab === 'overview'" class="grid gap-3 sm:grid-cols-2">
            <div class="panel p-3"><p class="text-xs text-slate-500">{{ t('interfaceText.importHistorySection.rows') }}</p><p class="text-xl font-bold">{{ selected.rowCount }}</p></div>
            <div class="panel p-3"><p class="text-xs text-slate-500">{{ t('interfaceText.importHistorySection.applied') }}</p><p class="text-xl font-bold">{{ selected.appliedRowCount || 0 }}</p></div>
            <div class="panel p-3"><p class="text-xs text-slate-500">{{ t('importWizard.errors') }}</p><p class="text-xl font-bold">{{ selected.errorCount }}</p></div>
            <div class="panel p-3"><p class="text-xs text-slate-500">{{ t('interfaceText.importHistorySection.decisions') }}</p><p class="text-xl font-bold">{{ selected.decisionCount || selected.decisions.length }}</p></div>
          </div>

          <div v-else-if="activeDetailTab === 'raw'" class="max-h-96 overflow-auto rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950/50"><pre v-for="row in selected.rawRows" :key="String(row.rowNumber)">{{ t('interfaceText.importHistorySection.l') }}{{ row.rowNumber }} · {{ row.rawText || JSON.stringify(row.rawJson) }}</pre></div>

          <div v-else-if="activeDetailTab === 'normalized'" class="max-h-96 overflow-auto space-y-2">
            <div v-for="row in selected.normalizedRows" :key="String(row.id || row.rowNumber)" class="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800"><p class="font-bold">{{ t('importWizard.row') }} {{ row.rowNumber }} · {{ row.status }}</p><p class="mt-1">{{ rowLabel(row) }} · {{ rowAmount(row) }} {{ row.normalizedData?.currency || '' }}</p><pre class="mt-2 overflow-auto text-[11px] text-slate-500">{{ JSON.stringify(row.normalizedData, null, 2) }}</pre></div>
          </div>

          <div v-else-if="activeDetailTab === 'messages'" class="max-h-96 overflow-auto space-y-2">
            <div v-for="message in [...selected.errors, ...selected.warnings]" :key="`${message.rowNumber}-${message.code}-${message.message}`" class="rounded-xl border p-3 text-xs" :class="message.severity === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'">{{ t('importWizard.row') }} {{ message.rowNumber || '—' }} · {{ message.code }} · {{ message.message }}</div>
            <p v-if="![...selected.errors, ...selected.warnings].length" class="text-sm text-slate-500">{{ t('interfaceText.importHistorySection.noMessages') }}</p>
          </div>

          <div v-else-if="activeDetailTab === 'decisions'" class="max-h-96 overflow-auto space-y-2">
            <div v-for="decision in selected.decisions" :key="String(decision.id)" class="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800"><p class="font-bold">{{ t('importWizard.row') }} {{ decision.rowNumber }} · {{ decision.kind }} · {{ decision.status }}</p><p class="mt-1 text-slate-500">{{ decision.reason }}</p><p class="mt-1 text-slate-400">{{ decision.reasonSource }} · {{ decision.history?.length || 0 }} {{ t('interfaceText.importHistorySection.events') }}</p></div>
            <p v-if="!selected.decisions.length" class="text-sm text-slate-500">{{ t('interfaceText.importHistorySection.noDecisions') }}</p>
          </div>

          <div v-else class="max-h-96 overflow-auto space-y-2">
            <div v-for="link in selected.appliedLinks" :key="`${link.normalizedRowId}-${link.operation}`" class="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800"><p class="font-bold">{{ link.operation }} · {{ link.entityType }}</p><p class="mt-1 text-slate-500">{{ t('importWizard.row') }} {{ link.normalizedRowId }} → {{ link.transactionId || link.assetId || '—' }}</p><p class="mt-1 text-slate-400">{{ formatDate(link.appliedAt) }}</p></div>
            <p v-if="!selected.appliedLinks.length" class="text-sm text-slate-500">{{ t('interfaceText.importHistorySection.noRecordsCreatedOrLinked') }}</p>
          </div>

          <div class="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">
            <p class="font-bold">{{ t('interfaceText.importHistorySection.deleteImportHistory') }}</p>
            <p class="mt-1">{{ t('interfaceText.importHistorySection.enterTheBatchIDToConfirmImported') }}</p>
            <input v-model="deleteConfirmation" class="form-input mt-2" :placeholder="String(selected.id)" />
            <button class="mt-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50" :disabled="!canDeleteSelected || deleting" @click="deleteSelectedHistory">{{ deleting ? t('interfaceText.importHistorySection.deleting') : t('interfaceText.importHistorySection.deleteHistory') }}</button>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>
