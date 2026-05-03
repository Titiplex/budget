<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import type {Account} from '../types/budget'
import type {ImportEntityId, ImportMappingTemplate} from '../types/imports'

type WizardStep = 'file' | 'mapping' | 'preview' | 'confirm' | 'summary'
type WizardState = 'empty' | 'parsing' | 'preview' | 'applying' | 'applied' | 'failed'
type PreviewFilter = 'all' | 'valid' | 'errors' | 'warnings' | 'duplicates' | 'needsReview'

interface ImportPreviewRow {
  rowNumber: number
  rowId?: ImportEntityId | null
  status: string
  action: string
  reviewRequired: boolean
  reasons: string[]
  missingFields: string[]
  warnings: Array<{message: string; field?: string | null; code?: string}>
  errors: Array<{message: string; field?: string | null; code?: string}>
  duplicateCandidates: Array<{confidence: number; reason?: string | null; entityId?: ImportEntityId | null}>
  conflicts: Array<{message: string; field?: string | null; code?: string}>
  normalizedData: Record<string, unknown>
}

const props = defineProps<{
  open: boolean
  accounts: Account[]
}>()

const emit = defineEmits<{
  close: []
  applied: []
}>()

const steps: Array<{key: WizardStep; label: string}> = [
  {key: 'file', label: 'Fichier'},
  {key: 'mapping', label: 'Mapping'},
  {key: 'preview', label: 'Preview'},
  {key: 'confirm', label: 'Confirmation'},
  {key: 'summary', label: 'Résumé'},
]

const importTypes = [
  {value: 'transactions', label: 'Transactions'},
  {value: 'investments', label: 'Investissements'},
  {value: 'assets', label: 'Actifs'},
  {value: 'mixed', label: 'Mixte'},
]

const filters: Array<{key: PreviewFilter; label: string}> = [
  {key: 'all', label: 'Tout'},
  {key: 'valid', label: 'Valides'},
  {key: 'errors', label: 'Erreurs'},
  {key: 'warnings', label: 'Warnings'},
  {key: 'duplicates', label: 'Doublons'},
  {key: 'needsReview', label: 'À revoir'},
]

const currentStep = ref<WizardStep>('file')
const state = ref<WizardState>('empty')
const errorMessage = ref<string | null>(null)
const warningMessage = ref<string | null>(null)
const fileName = ref('')
const filePath = ref('')
const rawText = ref('')
const batchId = ref<ImportEntityId | null>(null)
const importType = ref('transactions')
const defaultCurrency = ref('CAD')
const selectedTemplateId = ref<string>('')
const mappingTemplates = ref<ImportMappingTemplate[]>([])
const targetAccountId = ref<string>('')
const detectedColumns = ref<string[]>([])
const preview = ref<any | null>(null)
const parseResult = ref<any | null>(null)
const applyResult = ref<any | null>(null)
const previewFilter = ref<PreviewFilter>('all')
const confirmChecked = ref(false)
const creatingTemplate = ref(false)
const templateName = ref('Template import CSV')

const selectedTemplate = computed(() => mappingTemplates.value.find((template) => String(template.id) === selectedTemplateId.value) || null)
const busy = computed(() => state.value === 'parsing' || state.value === 'applying')
const canParse = computed(() => Boolean(rawText.value && importType.value && !busy.value))
const canApply = computed(() => Boolean(preview.value?.canApply && confirmChecked.value && !busy.value))
const previewRows = computed<ImportPreviewRow[]>(() => preview.value?.rows || [])
const previewStats = computed(() => preview.value?.stats || null)
const finalSummary = computed(() => applyResult.value?.batch || null)

const filteredPreviewRows = computed(() => {
  return previewRows.value.filter((row) => {
    if (previewFilter.value === 'valid') return row.action !== 'skip' && !row.reviewRequired
    if (previewFilter.value === 'errors') return row.errors.length > 0 || row.action === 'skip'
    if (previewFilter.value === 'warnings') return row.warnings.length > 0
    if (previewFilter.value === 'duplicates') return row.duplicateCandidates.length > 0
    if (previewFilter.value === 'needsReview') return row.reviewRequired || row.action === 'needsReview'
    return true
  })
})

function resetWizard() {
  currentStep.value = 'file'
  state.value = 'empty'
  errorMessage.value = null
  warningMessage.value = null
  fileName.value = ''
  filePath.value = ''
  rawText.value = ''
  batchId.value = null
  importType.value = 'transactions'
  defaultCurrency.value = 'CAD'
  selectedTemplateId.value = ''
  targetAccountId.value = ''
  detectedColumns.value = []
  preview.value = null
  parseResult.value = null
  applyResult.value = null
  previewFilter.value = 'all'
  confirmChecked.value = false
  templateName.value = 'Template import CSV'
}

function normalizeIpcError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as {message?: unknown}).message || 'Erreur inconnue')
  return 'Erreur inconnue pendant l’import.'
}

function ensureOk<T>(result: {ok: boolean; data: T; error: unknown}): T {
  if (!result.ok) throw new Error(normalizeIpcError(result.error))
  return result.data
}

function detectColumnsFromRawText(content: string) {
  const firstLine = content.replace(/^\uFEFF/, '').split(/\r?\n/).find((line) => line.trim()) || ''
  const delimiter = [',', ';', '\t']
      .map((candidate) => ({candidate, score: firstLine.split(candidate).length}))
      .sort((left, right) => right.score - left.score)[0]?.candidate || ','
  return firstLine
      .split(delimiter)
      .map((value) => value.replace(/^"|"$/g, '').trim())
      .filter(Boolean)
}

async function loadTemplates() {
  if (!window.imports?.mappingTemplate) return
  const result = await window.imports.mappingTemplate.list({includeInactive: false})
  mappingTemplates.value = ensureOk(result) as ImportMappingTemplate[]
}

async function chooseFile() {
  errorMessage.value = null
  const result = await window.file.openText({
    title: 'Choisir un fichier CSV à importer',
    filters: [{name: 'CSV', extensions: ['csv', 'txt']}],
  })

  if (!result || result.canceled || !result.content) return
  rawText.value = result.content
  filePath.value = result.filePath || ''
  fileName.value = result.filePath?.split(/[\\/]/).pop() || 'import.csv'
  detectedColumns.value = detectColumnsFromRawText(result.content)
  templateName.value = `Template ${fileName.value}`
  currentStep.value = 'mapping'
}

function guessTargetField(column: string) {
  const normalized = column.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (normalized.includes('date')) return 'date'
  if (normalized.includes('description') || normalized.includes('libelle') || normalized.includes('label')) return 'label'
  if (normalized.includes('amount') || normalized.includes('montant') || normalized.includes('total')) return 'amount'
  if (normalized.includes('currency') || normalized.includes('devise')) return 'currency'
  if (normalized.includes('quantity') || normalized.includes('qty') || normalized.includes('quantite')) return 'quantity'
  if (normalized.includes('price') || normalized.includes('prix')) return 'unitPrice'
  if (normalized.includes('fee') || normalized.includes('frais')) return 'fees'
  if (normalized.includes('tax')) return 'taxes'
  if (normalized.includes('symbol') || normalized.includes('ticker')) return 'symbol'
  if (normalized.includes('type') || normalized.includes('action')) return 'operationType'
  if (normalized.includes('account') || normalized.includes('compte')) return 'accountName'
  if (normalized.includes('source') || normalized.includes('broker') || normalized.includes('courtier')) return 'sourceName'
  return null
}

function fieldTypeFor(targetField: string) {
  if (targetField === 'date') return 'date'
  if (targetField === 'amount' || targetField === 'quantity' || targetField === 'unitPrice' || targetField === 'fees' || targetField === 'taxes') return 'number'
  if (targetField === 'currency') return 'currency'
  return 'string'
}

async function createTemplateFromColumns() {
  errorMessage.value = null
  creatingTemplate.value = true
  try {
    const columnMappings = detectedColumns.value
        .map((column) => ({column, targetField: guessTargetField(column)}))
        .filter((entry): entry is {column: string; targetField: string} => Boolean(entry.targetField))
        .map((entry) => ({
          sourceColumn: entry.column,
          targetField: entry.targetField,
          fieldType: fieldTypeFor(entry.targetField),
          required: ['date', 'amount'].includes(entry.targetField),
        }))

    const result = await window.imports.mappingTemplate.create({
      name: templateName.value || `Template ${fileName.value || 'CSV'}`,
      sourceType: 'csvFile' as any,
      importType: importType.value as any,
      provider: 'user',
      delimiter: null,
      hasHeader: true,
      columnMappings: columnMappings as any,
      deduplicationStrategy: 'strict' as any,
      defaultValues: {},
      metadata: {createdFromWizard: true, fileName: fileName.value},
    })
    const created = ensureOk(result) as ImportMappingTemplate
    await loadTemplates()
    selectedTemplateId.value = String(created.id)
    warningMessage.value = 'Template créé depuis les colonnes détectées. Vérifie la preview avant d’appliquer.'
  } catch (error) {
    errorMessage.value = normalizeIpcError(error)
  } finally {
    creatingTemplate.value = false
  }
}

async function parseAndPreview() {
  errorMessage.value = null
  warningMessage.value = null
  state.value = 'parsing'
  try {
    const createdBatch = ensureOk(await window.imports.createBatch({
      importType: importType.value as any,
      defaultCurrency: defaultCurrency.value,
      fileMetadata: {
        fileName: fileName.value || 'import.csv',
        provider: selectedTemplate.value?.provider || 'manual',
        sourceType: 'csvFile' as any,
      },
      mappingTemplateId: selectedTemplate.value?.id || null,
      options: {preserveRawRows: true},
    } as any)) as any

    batchId.value = createdBatch.id

    const parsed = ensureOk(await window.imports.parseFile({
      batchId: createdBatch.id,
      rawText: rawText.value,
      mappingTemplateId: selectedTemplate.value?.id || null,
      options: {preserveRawRows: true},
      fileMetadata: {
        fileName: fileName.value || 'import.csv',
        provider: selectedTemplate.value?.provider || 'manual',
      },
      mappingTemplate: selectedTemplate.value || undefined,
      defaultCurrency: defaultCurrency.value,
    } as any)) as any

    parseResult.value = parsed
    detectedColumns.value = parsed.parsed?.headers?.length ? parsed.parsed.headers : detectedColumns.value

    const previewResult = ensureOk(await window.imports.preview({
      batchId: createdBatch.id,
      mappingTemplateId: selectedTemplate.value?.id || null,
      options: {preserveRawRows: true},
      targetAccountId: targetAccountId.value ? Number(targetAccountId.value) : null,
      defaultCurrency: defaultCurrency.value,
    } as any)) as any

    preview.value = previewResult
    currentStep.value = 'preview'
    state.value = 'preview'
    confirmChecked.value = false
  } catch (error) {
    state.value = 'failed'
    errorMessage.value = normalizeIpcError(error)
  }
}

function goToConfirm() {
  confirmChecked.value = false
  currentStep.value = 'confirm'
}

async function applyImport() {
  if (!batchId.value || !confirmChecked.value) return
  errorMessage.value = null
  state.value = 'applying'
  try {
    const result = ensureOk(await window.imports.apply({batchId: batchId.value} as any)) as any
    applyResult.value = result
    state.value = 'applied'
    currentStep.value = 'summary'
    emit('applied')
  } catch (error) {
    state.value = 'failed'
    errorMessage.value = normalizeIpcError(error)
  }
}

async function cancelImport() {
  if (batchId.value) {
    try {
      await window.imports.cancel(batchId.value, 'Cancelled from import wizard')
    } catch {
      // The user is leaving the wizard; cancellation errors should not trap the UI.
    }
  }
  emit('close')
}

function actionLabel(action: string) {
  if (action === 'createTransaction') return 'Créer transaction'
  if (action === 'updateTransaction') return 'Mettre à jour'
  if (action === 'createAssetOperation') return 'Créer opération actif'
  if (action === 'needsReview') return 'À revoir'
  if (action === 'skip') return 'Ignorer'
  return action
}

function actionClass(action: string) {
  if (action === 'skip') return 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-200 dark:ring-rose-900'
  if (action === 'needsReview') return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-900'
  if (action === 'updateTransaction') return 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/30 dark:text-sky-200 dark:ring-sky-900'
  return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-900'
}

watch(() => props.open, async (open) => {
  if (open) {
    resetWizard()
    await loadTemplates()
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
        <div class="mx-auto flex min-h-full w-full max-w-6xl items-center justify-center">
          <section class="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <header class="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">Import guidé</p>
                <h2 class="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Importer un CSV sans surprise</h2>
                <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Choisis le fichier, vérifie le mapping, lis la preview, puis confirme explicitement l’écriture.</p>
              </div>
              <button class="ghost-btn" :disabled="busy" @click="cancelImport">Fermer</button>
            </header>

            <div class="grid gap-0 lg:grid-cols-[15rem_1fr]">
              <aside class="border-b border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40 lg:border-b-0 lg:border-r">
                <ol class="space-y-2">
                  <li v-for="(step, index) in steps" :key="step.key" class="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm" :class="currentStep === step.key ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'">
                    <span class="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-white/20 text-xs font-bold ring-1 ring-inset ring-current/20">{{ index + 1 }}</span>
                    <span class="font-semibold">{{ step.label }}</span>
                  </li>
                </ol>

                <div class="mt-5 rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  <p class="font-semibold text-slate-700 dark:text-slate-200">État</p>
                  <p class="mt-1">{{ state }}</p>
                  <p v-if="fileName" class="mt-3 break-all">{{ fileName }}</p>
                </div>
              </aside>

              <main class="min-h-[34rem] p-5">
                <div v-if="errorMessage" class="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                  {{ errorMessage }}
                </div>
                <div v-if="warningMessage" class="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  {{ warningMessage }}
                </div>

                <section v-if="currentStep === 'file'" class="space-y-5">
                  <div class="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-950/40">
                    <p class="text-lg font-bold text-slate-900 dark:text-white">Choisis un fichier CSV</p>
                    <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Le fichier sera lu par l’API contrôlée `window.file`, puis traité par les IPC d’import.</p>
                    <button class="primary-btn mt-5" @click="chooseFile">Sélectionner un fichier</button>
                  </div>
                  <div class="grid gap-3 sm:grid-cols-3">
                    <div class="panel p-4"><p class="text-sm font-semibold">1. Fichier</p><p class="mt-1 text-xs text-slate-500">Aucune écriture.</p></div>
                    <div class="panel p-4"><p class="text-sm font-semibold">2. Preview</p><p class="mt-1 text-xs text-slate-500">Doublons et erreurs visibles.</p></div>
                    <div class="panel p-4"><p class="text-sm font-semibold">3. Confirmation</p><p class="mt-1 text-xs text-slate-500">Application explicite seulement.</p></div>
                  </div>
                </section>

                <section v-else-if="currentStep === 'mapping'" class="space-y-5">
                  <div class="grid gap-4 lg:grid-cols-2">
                    <label class="space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Type d’import
                      <select v-model="importType" class="form-input">
                        <option v-for="item in importTypes" :key="item.value" :value="item.value">{{ item.label }}</option>
                      </select>
                    </label>
                    <label class="space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Devise par défaut
                      <input v-model="defaultCurrency" maxlength="3" class="form-input uppercase" />
                    </label>
                    <label class="space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Mapping template
                      <select v-model="selectedTemplateId" class="form-input">
                        <option value="">Détection automatique</option>
                        <option v-for="template in mappingTemplates" :key="String(template.id || template.name)" :value="String(template.id)">{{ template.name }}</option>
                      </select>
                    </label>
                    <label class="space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Compte cible optionnel
                      <select v-model="targetAccountId" class="form-input">
                        <option value="">Selon le CSV / à revoir</option>
                        <option v-for="account in accounts" :key="account.id" :value="String(account.id)">{{ account.name }} · {{ account.currency }}</option>
                      </select>
                    </label>
                  </div>

                  <div class="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <label class="min-w-0 flex-1 space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Créer un template depuis les colonnes détectées
                        <input v-model="templateName" class="form-input" />
                      </label>
                      <button class="secondary-btn" :disabled="creatingTemplate || !detectedColumns.length" @click="createTemplateFromColumns">
                        {{ creatingTemplate ? 'Création…' : 'Créer template' }}
                      </button>
                    </div>
                    <div class="mt-4 flex flex-wrap gap-2">
                      <span v-for="column in detectedColumns" :key="column" class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{{ column }}</span>
                    </div>
                  </div>

                  <div class="flex justify-between gap-3">
                    <button class="ghost-btn" @click="currentStep = 'file'">Retour</button>
                    <button class="primary-btn" :disabled="!canParse" @click="parseAndPreview">{{ state === 'parsing' ? 'Parsing…' : 'Parser et prévisualiser' }}</button>
                  </div>
                </section>

                <section v-else-if="currentStep === 'preview'" class="space-y-4">
                  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <div class="panel p-3"><p class="text-xs text-slate-500">Total</p><p class="text-xl font-bold">{{ previewStats?.totalRows || 0 }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">Créées</p><p class="text-xl font-bold">{{ previewStats?.createTransactionRows || 0 }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">MAJ</p><p class="text-xl font-bold">{{ previewStats?.updateTransactionRows || 0 }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">À revoir</p><p class="text-xl font-bold">{{ previewStats?.needsReviewRows || 0 }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">Erreurs</p><p class="text-xl font-bold">{{ previewStats?.errorCount || 0 }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">Doublons</p><p class="text-xl font-bold">{{ previewStats?.duplicateCount || 0 }}</p></div>
                  </div>

                  <div class="flex flex-wrap gap-2">
                    <button v-for="filter in filters" :key="filter.key" class="rounded-xl px-3 py-2 text-xs font-bold ring-1 ring-inset" :class="previewFilter === filter.key ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'" @click="previewFilter = filter.key">
                      {{ filter.label }}
                    </button>
                  </div>

                  <div class="max-h-[24rem] overflow-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                    <table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                      <thead class="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                        <tr>
                          <th class="px-3 py-2">Ligne</th>
                          <th class="px-3 py-2">Action</th>
                          <th class="px-3 py-2">Données</th>
                          <th class="px-3 py-2">Raisons</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                        <tr v-for="row in filteredPreviewRows" :key="`${row.rowNumber}-${row.action}`" class="align-top">
                          <td class="px-3 py-3 font-semibold">{{ row.rowNumber }}</td>
                          <td class="px-3 py-3"><span class="rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset" :class="actionClass(row.action)">{{ actionLabel(row.action) }}</span></td>
                          <td class="px-3 py-3 text-xs text-slate-600 dark:text-slate-300">
                            <div>{{ row.normalizedData.label || row.normalizedData.symbol || '—' }}</div>
                            <div class="mt-1 text-slate-400">{{ row.normalizedData.date ? String(row.normalizedData.date).slice(0, 10) : 'date ?' }} · {{ row.normalizedData.amount ?? row.normalizedData.quantity ?? 'montant ?' }} {{ row.normalizedData.currency || '' }}</div>
                          </td>
                          <td class="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
                            <ul class="space-y-1">
                              <li v-for="reason in row.reasons" :key="reason">{{ reason }}</li>
                              <li v-if="row.duplicateCandidates.length" class="font-semibold text-amber-600 dark:text-amber-300">{{ row.duplicateCandidates.length }} doublon(s) probable(s)</li>
                            </ul>
                          </td>
                        </tr>
                        <tr v-if="!filteredPreviewRows.length">
                          <td colspan="4" class="px-3 py-8 text-center text-sm text-slate-500">Aucune ligne pour ce filtre.</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div class="flex justify-between gap-3">
                    <button class="ghost-btn" @click="currentStep = 'mapping'">Retour mapping</button>
                    <button class="primary-btn" :disabled="!preview?.canApply" @click="goToConfirm">Continuer vers confirmation</button>
                  </div>
                </section>

                <section v-else-if="currentStep === 'confirm'" class="space-y-5">
                  <div class="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                    <h3 class="text-lg font-bold">Confirmation explicite requise</h3>
                    <p class="mt-2 text-sm">Cette étape va appliquer les lignes prêtes. Les lignes ignorées et les doublons resteront visibles dans l’historique d’import.</p>
                    <label class="mt-4 flex items-start gap-3 text-sm font-semibold">
                      <input v-model="confirmChecked" type="checkbox" class="mt-1 h-4 w-4 rounded border-amber-300" />
                      <span>J’ai vérifié la preview, les erreurs et les doublons probables.</span>
                    </label>
                  </div>
                  <div class="flex justify-between gap-3">
                    <button class="ghost-btn" :disabled="busy" @click="currentStep = 'preview'">Retour preview</button>
                    <button class="primary-btn" :disabled="!canApply" @click="applyImport">{{ state === 'applying' ? 'Application…' : 'Appliquer l’import' }}</button>
                  </div>
                </section>

                <section v-else class="space-y-5">
                  <div class="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                    <h3 class="text-xl font-bold">Import terminé</h3>
                    <p class="mt-2 text-sm">Le batch est maintenant dans l’historique d’import.</p>
                  </div>
                  <div class="grid gap-3 sm:grid-cols-4">
                    <div class="panel p-4"><p class="text-xs text-slate-500">Statut</p><p class="text-lg font-bold">{{ finalSummary?.status || 'applied' }}</p></div>
                    <div class="panel p-4"><p class="text-xs text-slate-500">Lignes</p><p class="text-lg font-bold">{{ finalSummary?.rowCount || 0 }}</p></div>
                    <div class="panel p-4"><p class="text-xs text-slate-500">Erreurs</p><p class="text-lg font-bold">{{ finalSummary?.errorCount || 0 }}</p></div>
                    <div class="panel p-4"><p class="text-xs text-slate-500">Liens</p><p class="text-lg font-bold">{{ applyResult?.appliedLinks?.length || 0 }}</p></div>
                  </div>
                  <div class="flex justify-end">
                    <button class="primary-btn" @click="emit('close')">Fermer</button>
                  </div>
                </section>
              </main>
            </div>
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
