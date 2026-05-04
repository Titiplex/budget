<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import type {Account} from '../types/budget'
import type {ImportEntityId, ImportMappingTemplate} from '../types/imports'

type WizardStep = 'file' | 'mapping' | 'preview' | 'reconciliation' | 'confirm' | 'summary'
type WizardState = 'empty' | 'parsing' | 'preview' | 'reconciling' | 'applying' | 'applied' | 'failed'
type PreviewFilter = 'all' | 'valid' | 'errors' | 'warnings' | 'duplicates' | 'needsReview'
type ReconciliationDecisionKind = 'importAsNew' | 'linkToExisting' | 'updateExisting' | 'skip' | 'markAsDuplicate' | 'needsManualReview'

interface DuplicateCandidate {
  confidence: number
  reason?: string | null
  entityId?: ImportEntityId | null
  entityType?: string | null
  candidateSnapshot?: Record<string, unknown> | null
  matchFields?: string[]
}

interface ImportPreviewRow {
  rowNumber: number
  rowId?: ImportEntityId | null
  status: string
  action: string
  targetEntityType?: string | null
  targetEntityId?: ImportEntityId | null
  reviewRequired: boolean
  reasons: string[]
  missingFields: string[]
  warnings: Array<{message: string; field?: string | null; code?: string}>
  errors: Array<{message: string; field?: string | null; code?: string}>
  duplicateCandidates: DuplicateCandidate[]
  conflicts: Array<{message: string; field?: string | null; code?: string}>
  normalizedData: Record<string, unknown>
}

interface ReconciliationDecisionDraft {
  id: string
  normalizedRowId: ImportEntityId | null
  rowNumber: number
  kind: ReconciliationDecisionKind
  targetEntityType: string | null
  targetEntityId: ImportEntityId | null
  reason: string
  reasonSource: 'automatic' | 'user'
  decidedBy: string
  payload: Record<string, unknown>
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
  {key: 'reconciliation', label: 'Réconciliation'},
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

const decisionOptions: Array<{value: ReconciliationDecisionKind; label: string}> = [
  {value: 'importAsNew', label: 'Importer comme nouveau'},
  {value: 'linkToExisting', label: 'Lier à l’existant'},
  {value: 'updateExisting', label: 'Mettre à jour l’existant'},
  {value: 'skip', label: 'Ignorer'},
  {value: 'markAsDuplicate', label: 'Marquer comme doublon'},
  {value: 'needsManualReview', label: 'Garder en revue manuelle'},
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
const decisionByRow = ref<Record<string, ReconciliationDecisionDraft>>({})
const reconciliationFilter = ref<'all' | 'review' | 'safe'>('all')

const selectedTemplate = computed(() => mappingTemplates.value.find((template) => String(template.id) === selectedTemplateId.value) || null)
const busy = computed(() => state.value === 'parsing' || state.value === 'applying')
const canParse = computed(() => Boolean(rawText.value && importType.value && !busy.value))
const previewRows = computed<ImportPreviewRow[]>(() => preview.value?.rows || [])
const previewStats = computed(() => preview.value?.stats || null)
const finalSummary = computed(() => applyResult.value?.batch || null)
const decisions = computed(() => Object.values(decisionByRow.value))

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

const reconciliationRows = computed(() => previewRows.value.filter((row) => row.action !== 'skip' || row.errors.length || row.duplicateCandidates.length || row.reviewRequired || row.conflicts.length || row.missingFields.length))
const riskyRows = computed(() => reconciliationRows.value.filter((row) => isAmbiguousRow(row)))
const unresolvedRows = computed(() => reconciliationRows.value.filter((row) => decisionRequiresManualResolution(row, getDecision(row))))
const safeBulkRows = computed(() => reconciliationRows.value.filter((row) => !isAmbiguousRow(row) && ['createTransaction', 'updateTransaction', 'createAssetOperation', 'skip'].includes(row.action)))

const filteredReconciliationRows = computed(() => reconciliationRows.value.filter((row) => {
  if (reconciliationFilter.value === 'review') return isAmbiguousRow(row)
  if (reconciliationFilter.value === 'safe') return !isAmbiguousRow(row)
  return true
}))

const reconciliationSummary = computed(() => {
  const entries = decisions.value
  return {
    importAsNew: entries.filter((decision) => decision.kind === 'importAsNew').length,
    linkToExisting: entries.filter((decision) => decision.kind === 'linkToExisting').length,
    updateExisting: entries.filter((decision) => decision.kind === 'updateExisting').length,
    skip: entries.filter((decision) => decision.kind === 'skip').length,
    markAsDuplicate: entries.filter((decision) => decision.kind === 'markAsDuplicate').length,
    needsManualReview: entries.filter((decision) => decision.kind === 'needsManualReview').length,
  }
})

const canProceedToConfirm = computed(() => Boolean(batchId.value && decisions.value.length && unresolvedRows.value.length === 0 && !busy.value))
const canApply = computed(() => Boolean(preview.value?.canApply && confirmChecked.value && canProceedToConfirm.value && !busy.value))

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
  reconciliationFilter.value = 'all'
  confirmChecked.value = false
  templateName.value = 'Template import CSV'
  decisionByRow.value = {}
}

function normalizeIpcError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as {message?: unknown}).message || 'Erreur inconnue')
  return 'Erreur inconnue pendant l’import.'
}

function ensureOk<T>(result: {ok: boolean; data: T; error: unknown}): T {
  if (!result.ok) throw new Error(normalizeIpcError(result.error))
  return result.data
}

function rowKey(row: ImportPreviewRow) {
  return String(row.rowId ?? row.rowNumber)
}

function getDecision(row: ImportPreviewRow) {
  return decisionByRow.value[rowKey(row)]
}

function bestCandidate(row: ImportPreviewRow) {
  return [...(row.duplicateCandidates || [])].sort((left, right) => right.confidence - left.confidence)[0] || null
}

function candidateScore(candidate: DuplicateCandidate | null) {
  if (!candidate) return '—'
  return `${Math.round(candidate.confidence * 100)} %`
}

function isAmbiguousRow(row: ImportPreviewRow) {
  const candidate = bestCandidate(row)
  return row.reviewRequired || row.action === 'needsReview' || row.conflicts.length > 0 || row.missingFields.length > 0 || Boolean(candidate && candidate.confidence < 0.98)
}

function decisionRequiresManualResolution(row: ImportPreviewRow, decision?: ReconciliationDecisionDraft) {
  if (!decision) return true
  if (!isAmbiguousRow(row)) return false
  if (decision.kind === 'needsManualReview') return true
  if (['linkToExisting', 'updateExisting', 'markAsDuplicate'].includes(decision.kind) && !decision.targetEntityId) return true
  return false
}

function defaultDecisionKindForRow(row: ImportPreviewRow): ReconciliationDecisionKind {
  const candidate = bestCandidate(row)
  if (row.action === 'skip') return 'skip'
  if (row.action === 'updateTransaction' && candidate?.entityId && candidate.confidence >= 0.98) return 'updateExisting'
  if (row.action === 'createTransaction' || row.action === 'createAssetOperation') return 'importAsNew'
  return 'needsManualReview'
}

function buildDecisionForRow(row: ImportPreviewRow, kind: ReconciliationDecisionKind = defaultDecisionKindForRow(row)): ReconciliationDecisionDraft {
  const candidate = bestCandidate(row)
  const requiresExisting = ['linkToExisting', 'updateExisting', 'markAsDuplicate'].includes(kind)
  return {
    id: `decision-${rowKey(row)}`,
    normalizedRowId: row.rowId ?? row.rowNumber,
    rowNumber: row.rowNumber,
    kind,
    targetEntityType: requiresExisting ? (candidate?.entityType || row.targetEntityType || 'transaction') : row.targetEntityType || null,
    targetEntityId: requiresExisting ? candidate?.entityId ?? row.targetEntityId ?? null : null,
    reason: row.reasons[0] || candidate?.reason || 'Décision construite depuis la preview.',
    reasonSource: isAmbiguousRow(row) ? 'user' : 'automatic',
    decidedBy: isAmbiguousRow(row) ? 'user' : 'system',
    payload: {
      previewAction: row.action,
      missingFields: row.missingFields,
      conflicts: row.conflicts,
      candidateConfidence: candidate?.confidence ?? null,
    },
  }
}

function initializeDecisions() {
  const next: Record<string, ReconciliationDecisionDraft> = {}
  for (const row of previewRows.value) {
    next[rowKey(row)] = buildDecisionForRow(row)
  }
  decisionByRow.value = next
  reconciliationFilter.value = riskyRows.value.length ? 'review' : 'all'
}

function updateDecision(row: ImportPreviewRow, kind: ReconciliationDecisionKind) {
  decisionByRow.value = {
    ...decisionByRow.value,
    [rowKey(row)]: buildDecisionForRow(row, kind),
  }
}

function applySafeBulkDecision() {
  const next = {...decisionByRow.value}
  for (const row of safeBulkRows.value) {
    next[rowKey(row)] = buildDecisionForRow(row)
  }
  decisionByRow.value = next
  warningMessage.value = `${safeBulkRows.value.length} ligne(s) sûre(s) préparée(s) pour application en masse. Les cas ambigus restent bloqués.`
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
    initializeDecisions()
    currentStep.value = 'preview'
    state.value = 'preview'
    confirmChecked.value = false
  } catch (error) {
    state.value = 'failed'
    errorMessage.value = normalizeIpcError(error)
  }
}

function goToReconciliation() {
  initializeDecisions()
  currentStep.value = 'reconciliation'
  state.value = 'reconciling'
  if (unresolvedRows.value.length) {
    warningMessage.value = `${unresolvedRows.value.length} ligne(s) ambiguë(s) doivent être résolues avant confirmation.`
  }
}

function goToConfirm() {
  if (!canProceedToConfirm.value) {
    warningMessage.value = 'Résous les lignes ambiguës avant de confirmer l’import.'
    return
  }
  confirmChecked.value = false
  currentStep.value = 'confirm'
}

function decisionPayloads() {
  const timestamp = new Date().toISOString()
  return decisions.value.map((decision) => ({
    ...decision,
    batchId: batchId.value,
    status: 'pending',
    decidedAt: decision.reasonSource === 'user' ? timestamp : null,
    createdAt: timestamp,
    updatedAt: timestamp,
    history: [{
      at: timestamp,
      actor: decision.decidedBy,
      status: 'pending',
      message: decision.reason,
      metadata: {reasonSource: decision.reasonSource},
    }],
  }))
}

async function applyImport() {
  if (!batchId.value || !confirmChecked.value || !canProceedToConfirm.value) return
  errorMessage.value = null
  state.value = 'applying'
  try {
    const result = ensureOk(await window.imports.applyReconciliationDecisions({
      batchId: batchId.value,
      decisions: decisionPayloads(),
    } as any)) as any
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

function decisionLabel(kind: ReconciliationDecisionKind) {
  return decisionOptions.find((option) => option.value === kind)?.label || kind
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
        <div class="mx-auto flex min-h-full w-full max-w-7xl items-center justify-center">
          <section class="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <header class="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">Import guidé</p>
                <h2 class="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Importer un CSV sans surprise</h2>
                <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Choisis le fichier, vérifie le mapping, résous les doublons, puis confirme explicitement l’écriture.</p>
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
                  <p v-if="currentStep === 'reconciliation'" class="mt-3 text-amber-600 dark:text-amber-300">{{ unresolvedRows.length }} cas à résoudre</p>
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
                    <div class="panel p-4"><p class="text-sm font-semibold">3. Réconciliation</p><p class="mt-1 text-xs text-slate-500">Aucun cas ambigu silencieux.</p></div>
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
                    <button class="primary-btn" :disabled="!preview?.canApply" @click="goToReconciliation">Résoudre les décisions</button>
                  </div>
                </section>

                <section v-else-if="currentStep === 'reconciliation'" class="space-y-4">
                  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <div class="panel p-3"><p class="text-xs text-slate-500">À résoudre</p><p class="text-xl font-bold">{{ unresolvedRows.length }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">Sûres bulk</p><p class="text-xl font-bold">{{ safeBulkRows.length }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">Nouveau</p><p class="text-xl font-bold">{{ reconciliationSummary.importAsNew }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">Lier</p><p class="text-xl font-bold">{{ reconciliationSummary.linkToExisting }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">MAJ</p><p class="text-xl font-bold">{{ reconciliationSummary.updateExisting }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">Ignorer</p><p class="text-xl font-bold">{{ reconciliationSummary.skip + reconciliationSummary.markAsDuplicate }}</p></div>
                  </div>

                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="flex flex-wrap gap-2">
                      <button class="rounded-xl px-3 py-2 text-xs font-bold ring-1 ring-inset" :class="reconciliationFilter === 'all' ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'" @click="reconciliationFilter = 'all'">Toutes</button>
                      <button class="rounded-xl px-3 py-2 text-xs font-bold ring-1 ring-inset" :class="reconciliationFilter === 'review' ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'" @click="reconciliationFilter = 'review'">Ambiguës</button>
                      <button class="rounded-xl px-3 py-2 text-xs font-bold ring-1 ring-inset" :class="reconciliationFilter === 'safe' ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'" @click="reconciliationFilter = 'safe'">Sûres</button>
                    </div>
                    <button class="secondary-btn" :disabled="!safeBulkRows.length" @click="applySafeBulkDecision">Appliquer décisions sûres en masse</button>
                  </div>

                  <div v-if="unresolvedRows.length" class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                    {{ unresolvedRows.length }} ligne(s) restent trop ambiguës. Elles ne seront pas appliquées silencieusement : choisis une décision explicite ou ignore-les.
                  </div>

                  <div class="max-h-[28rem] space-y-3 overflow-auto pr-1">
                    <article v-for="row in filteredReconciliationRows" :key="rowKey(row)" class="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                      <div class="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
                        <div>
                          <div class="flex flex-wrap items-center gap-2">
                            <p class="text-sm font-bold text-slate-900 dark:text-white">Ligne {{ row.rowNumber }}</p>
                            <span class="rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset" :class="actionClass(row.action)">{{ actionLabel(row.action) }}</span>
                            <span v-if="isAmbiguousRow(row)" class="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-900">ambigu</span>
                          </div>
                          <dl class="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div><dt class="text-slate-400">Libellé</dt><dd class="font-semibold">{{ row.normalizedData.label || row.normalizedData.symbol || '—' }}</dd></div>
                            <div><dt class="text-slate-400">Date</dt><dd class="font-semibold">{{ row.normalizedData.date ? String(row.normalizedData.date).slice(0, 10) : '—' }}</dd></div>
                            <div><dt class="text-slate-400">Montant/qté</dt><dd class="font-semibold">{{ row.normalizedData.amount ?? row.normalizedData.quantity ?? '—' }}</dd></div>
                            <div><dt class="text-slate-400">Devise</dt><dd class="font-semibold">{{ row.normalizedData.currency || '—' }}</dd></div>
                          </dl>
                          <ul class="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <li v-for="reason in row.reasons" :key="reason">{{ reason }}</li>
                            <li v-for="conflict in row.conflicts" :key="conflict.message" class="text-rose-600 dark:text-rose-300">{{ conflict.message }}</li>
                          </ul>
                        </div>

                        <div class="rounded-2xl bg-slate-50 p-3 text-xs dark:bg-slate-950/40">
                          <p class="font-bold text-slate-700 dark:text-slate-200">Candidat existant</p>
                          <template v-if="bestCandidate(row)">
                            <p class="mt-2">Score : <strong>{{ candidateScore(bestCandidate(row)) }}</strong></p>
                            <p class="mt-1">ID : <strong>{{ bestCandidate(row)?.entityId || '—' }}</strong></p>
                            <p class="mt-1 text-slate-500 dark:text-slate-400">{{ bestCandidate(row)?.reason || 'Match probable détecté.' }}</p>
                          </template>
                          <p v-else class="mt-2 text-slate-500 dark:text-slate-400">Aucun candidat existant détecté.</p>
                        </div>

                        <div>
                          <label class="space-y-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Décision
                            <select class="form-input" :value="getDecision(row)?.kind" @change="updateDecision(row, ($event.target as HTMLSelectElement).value as ReconciliationDecisionKind)">
                              <option v-for="option in decisionOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                            </select>
                          </label>
                          <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">{{ getDecision(row)?.reason }}</p>
                          <p v-if="decisionRequiresManualResolution(row, getDecision(row))" class="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                            Décision incomplète pour ce cas ambigu.
                          </p>
                        </div>
                      </div>
                    </article>
                    <div v-if="!filteredReconciliationRows.length" class="rounded-2xl border border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-800">Aucune ligne pour ce filtre.</div>
                  </div>

                  <div class="flex justify-between gap-3">
                    <button class="ghost-btn" @click="currentStep = 'preview'">Retour preview</button>
                    <button class="primary-btn" :disabled="!canProceedToConfirm" @click="goToConfirm">Voir le résumé des décisions</button>
                  </div>
                </section>

                <section v-else-if="currentStep === 'confirm'" class="space-y-5">
                  <div class="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                    <h3 class="text-lg font-bold">Confirmation explicite requise</h3>
                    <p class="mt-2 text-sm">Cette étape envoie les décisions visibles ci-dessous au moteur de réconciliation. Aucun cas ambigu non résolu ne sera appliqué.</p>
                    <label class="mt-4 flex items-start gap-3 text-sm font-semibold">
                      <input v-model="confirmChecked" type="checkbox" class="mt-1 h-4 w-4 rounded border-amber-300" />
                      <span>J’ai vérifié la preview, les erreurs, les doublons probables et les décisions de réconciliation.</span>
                    </label>
                  </div>

                  <div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <div class="panel p-3"><p class="text-xs text-slate-500">Nouveau</p><p class="text-xl font-bold">{{ reconciliationSummary.importAsNew }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">Lier</p><p class="text-xl font-bold">{{ reconciliationSummary.linkToExisting }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">Mettre à jour</p><p class="text-xl font-bold">{{ reconciliationSummary.updateExisting }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">Ignorer</p><p class="text-xl font-bold">{{ reconciliationSummary.skip }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">Doublon</p><p class="text-xl font-bold">{{ reconciliationSummary.markAsDuplicate }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">Non résolu</p><p class="text-xl font-bold">{{ unresolvedRows.length }}</p></div>
                  </div>

                  <div class="max-h-56 overflow-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                    <table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                      <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400"><tr><th class="px-3 py-2">Ligne</th><th class="px-3 py-2">Décision</th><th class="px-3 py-2">Raison</th></tr></thead>
                      <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                        <tr v-for="decision in decisions" :key="decision.id"><td class="px-3 py-2 font-semibold">{{ decision.rowNumber }}</td><td class="px-3 py-2">{{ decisionLabel(decision.kind) }}</td><td class="px-3 py-2 text-xs text-slate-500">{{ decision.reason }}</td></tr>
                      </tbody>
                    </table>
                  </div>

                  <div class="flex justify-between gap-3">
                    <button class="ghost-btn" :disabled="busy" @click="currentStep = 'reconciliation'">Retour réconciliation</button>
                    <button class="primary-btn" :disabled="!canApply" @click="applyImport">{{ state === 'applying' ? 'Application…' : 'Appliquer les décisions' }}</button>
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
