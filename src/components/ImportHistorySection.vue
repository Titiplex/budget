<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import type {ImportEntityId} from '../types/imports'

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
const activeDetailTab = ref<'overview' | 'raw' | 'normalized' | 'messages' | 'decisions' | 'links'>('overview')
const deleteConfirmation = ref('')

const statusOptions = ['draft', 'parsed', 'previewed', 'applied', 'partiallyApplied', 'cancelled']
const importTypeOptions = ['transactions', 'investments', 'assets', 'mixed']

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
  if (error && typeof error === 'object' && 'message' in error) return String((error as {message?: unknown}).message || 'Erreur inconnue')
  return 'Erreur inconnue pendant la lecture de l’historique d’import.'
}

function ensureOk<T>(result: {ok: boolean; data: T; error: unknown}) {
  if (!result.ok) throw new Error(normalizeIpcError(result.error))
  return result.data
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('fr-CA', {dateStyle: 'medium', timeStyle: 'short'}).format(date)
}

function statusClass(status: string) {
  if (status === 'applied') return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-900'
  if (status === 'partiallyApplied' || status === 'previewed') return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-900'
  if (status === 'cancelled') return 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
  return 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/30 dark:text-sky-200 dark:ring-sky-900'
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
    emit('notice', 'success', 'Historique supprimé. Les transactions/assets créés ne sont pas supprimés.')
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
    await window.file.saveText({defaultPath: report.fileName, content: report.content})
    emit('notice', 'success', `Rapport ${format === 'csv' ? 'CSV' : 'Markdown'} exporté.`)
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
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">Audit import</p>
        <h2 class="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Historique d’import</h2>
        <p class="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Consulte les imports passés, les lignes normalisées, les erreurs, les décisions de réconciliation et les éléments créés ou liés. Supprimer l’historique ne supprime jamais silencieusement les données financières.</p>
      </div>
      <button class="primary-btn" :disabled="loading" @click="loadHistory">{{ loading ? 'Chargement…' : 'Rafraîchir' }}</button>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div class="panel p-4"><p class="text-xs text-slate-500">Imports</p><p class="text-2xl font-bold">{{ history.length }}</p></div>
      <div class="panel p-4"><p class="text-xs text-slate-500">Lignes</p><p class="text-2xl font-bold">{{ totalRows }}</p></div>
      <div class="panel p-4"><p class="text-xs text-slate-500">Appliquées</p><p class="text-2xl font-bold">{{ totalApplied }}</p></div>
      <div class="panel p-4"><p class="text-xs text-slate-500">Erreurs / doublons</p><p class="text-2xl font-bold">{{ totalErrors }} / {{ totalDuplicates }}</p></div>
    </div>

    <div class="panel p-4">
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <label class="space-y-1 text-xs font-bold uppercase tracking-wide text-slate-500">Recherche<input v-model="search" class="form-input" placeholder="fichier, id, source…" /></label>
        <label class="space-y-1 text-xs font-bold uppercase tracking-wide text-slate-500">Statut<select v-model="statusFilter" class="form-input"><option value="">Tous</option><option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option></select></label>
        <label class="space-y-1 text-xs font-bold uppercase tracking-wide text-slate-500">Source<select v-model="sourceFilter" class="form-input"><option value="">Toutes</option><option v-for="source in sources" :key="source" :value="source">{{ source }}</option></select></label>
        <label class="space-y-1 text-xs font-bold uppercase tracking-wide text-slate-500">Type<select v-model="importTypeFilter" class="form-input"><option value="">Tous</option><option v-for="type in importTypeOptions" :key="type" :value="type">{{ type }}</option></select></label>
        <label class="space-y-1 text-xs font-bold uppercase tracking-wide text-slate-500">Depuis<input v-model="fromFilter" type="date" class="form-input" /></label>
        <label class="space-y-1 text-xs font-bold uppercase tracking-wide text-slate-500">Jusqu’à<input v-model="toFilter" type="date" class="form-input" /></label>
      </div>
      <div class="mt-4 flex justify-end"><button class="secondary-btn" :disabled="loading" @click="loadHistory">Appliquer les filtres</button></div>
    </div>

    <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(28rem,0.9fr)]">
      <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
            <tr><th class="px-3 py-2">Date</th><th class="px-3 py-2">Fichier</th><th class="px-3 py-2">Source</th><th class="px-3 py-2">Statut</th><th class="px-3 py-2">Lignes</th><th class="px-3 py-2">Audit</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="item in history" :key="String(item.id)" class="cursor-pointer align-top hover:bg-slate-50 dark:hover:bg-slate-950/40" @click="openDetail(item.id)">
              <td class="px-3 py-3 text-xs text-slate-500">{{ formatDate(item.importedAt) }}</td>
              <td class="px-3 py-3"><p class="font-semibold">{{ item.fileName || '—' }}</p><p class="text-xs text-slate-400">{{ item.importType }}</p></td>
              <td class="px-3 py-3 text-xs">{{ item.source || item.provider || 'manual' }}</td>
              <td class="px-3 py-3"><span class="rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset" :class="statusClass(item.status)">{{ item.status }}</span></td>
              <td class="px-3 py-3 text-xs">{{ item.rowCount }} lignes<br />{{ item.appliedRowCount || 0 }} appliquées</td>
              <td class="px-3 py-3 text-xs">{{ item.errorCount }} erreurs<br />{{ item.duplicateCount }} doublons</td>
            </tr>
            <tr v-if="!history.length"><td colspan="6" class="px-3 py-10 text-center text-sm text-slate-500">Aucun historique pour ces filtres.</td></tr>
          </tbody>
        </table>
      </div>

      <aside class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div v-if="detailLoading" class="py-10 text-center text-sm text-slate-500">Chargement du détail…</div>
        <div v-else-if="!selected" class="py-10 text-center text-sm text-slate-500">Sélectionne un import pour voir le détail.</div>
        <div v-else class="space-y-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 class="text-lg font-bold text-slate-950 dark:text-white">{{ selected.fileName || selected.id }}</h3>
              <p class="mt-1 text-xs text-slate-500">{{ selected.source }} · {{ selected.importType }} · {{ formatDate(selected.importedAt) }}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button class="secondary-btn !px-3 !py-2 text-xs" :disabled="exporting" @click="exportSelected('markdown')">Export MD</button>
              <button class="secondary-btn !px-3 !py-2 text-xs" :disabled="exporting" @click="exportSelected('csv')">Export CSV</button>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <button v-for="tab in ['overview','raw','normalized','messages','decisions','links']" :key="tab" class="rounded-xl px-3 py-2 text-xs font-bold ring-1 ring-inset" :class="activeDetailTab === tab ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'" @click="activeDetailTab = tab as any">{{ tab }}</button>
          </div>

          <div v-if="activeDetailTab === 'overview'" class="grid gap-3 sm:grid-cols-2">
            <div class="panel p-3"><p class="text-xs text-slate-500">Lignes</p><p class="text-xl font-bold">{{ selected.rowCount }}</p></div>
            <div class="panel p-3"><p class="text-xs text-slate-500">Appliquées</p><p class="text-xl font-bold">{{ selected.appliedRowCount || 0 }}</p></div>
            <div class="panel p-3"><p class="text-xs text-slate-500">Erreurs</p><p class="text-xl font-bold">{{ selected.errorCount }}</p></div>
            <div class="panel p-3"><p class="text-xs text-slate-500">Décisions</p><p class="text-xl font-bold">{{ selected.decisionCount || selected.decisions.length }}</p></div>
          </div>

          <div v-else-if="activeDetailTab === 'raw'" class="max-h-96 overflow-auto rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950/50"><pre v-for="row in selected.rawRows" :key="String(row.rowNumber)">L{{ row.rowNumber }} · {{ row.rawText || JSON.stringify(row.rawJson) }}</pre></div>

          <div v-else-if="activeDetailTab === 'normalized'" class="max-h-96 overflow-auto space-y-2">
            <div v-for="row in selected.normalizedRows" :key="String(row.id || row.rowNumber)" class="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800"><p class="font-bold">Ligne {{ row.rowNumber }} · {{ row.status }}</p><p class="mt-1">{{ rowLabel(row) }} · {{ rowAmount(row) }} {{ row.normalizedData?.currency || '' }}</p><pre class="mt-2 overflow-auto text-[11px] text-slate-500">{{ JSON.stringify(row.normalizedData, null, 2) }}</pre></div>
          </div>

          <div v-else-if="activeDetailTab === 'messages'" class="max-h-96 overflow-auto space-y-2">
            <div v-for="message in [...selected.errors, ...selected.warnings]" :key="`${message.rowNumber}-${message.code}-${message.message}`" class="rounded-xl border p-3 text-xs" :class="message.severity === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'">Ligne {{ message.rowNumber || '—' }} · {{ message.code }} · {{ message.message }}</div>
            <p v-if="![...selected.errors, ...selected.warnings].length" class="text-sm text-slate-500">Aucun message.</p>
          </div>

          <div v-else-if="activeDetailTab === 'decisions'" class="max-h-96 overflow-auto space-y-2">
            <div v-for="decision in selected.decisions" :key="String(decision.id)" class="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800"><p class="font-bold">Ligne {{ decision.rowNumber }} · {{ decision.kind }} · {{ decision.status }}</p><p class="mt-1 text-slate-500">{{ decision.reason }}</p><p class="mt-1 text-slate-400">{{ decision.reasonSource }} · {{ decision.history?.length || 0 }} évènement(s)</p></div>
            <p v-if="!selected.decisions.length" class="text-sm text-slate-500">Aucune décision.</p>
          </div>

          <div v-else class="max-h-96 overflow-auto space-y-2">
            <div v-for="link in selected.appliedLinks" :key="`${link.normalizedRowId}-${link.operation}`" class="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800"><p class="font-bold">{{ link.operation }} · {{ link.entityType }}</p><p class="mt-1 text-slate-500">Ligne {{ link.normalizedRowId }} → {{ link.transactionId || link.assetId || '—' }}</p><p class="mt-1 text-slate-400">{{ formatDate(link.appliedAt) }}</p></div>
            <p v-if="!selected.appliedLinks.length" class="text-sm text-slate-500">Aucun élément créé ou lié.</p>
          </div>

          <div class="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">
            <p class="font-bold">Supprimer seulement l’historique</p>
            <p class="mt-1">Cette action ne supprime pas les transactions/assets créés. Tape l’ID du batch pour confirmer.</p>
            <input v-model="deleteConfirmation" class="form-input mt-2" :placeholder="String(selected.id)" />
            <button class="mt-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50" :disabled="!canDeleteSelected || deleting" @click="deleteSelectedHistory">{{ deleting ? 'Suppression…' : 'Supprimer l’historique' }}</button>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>
