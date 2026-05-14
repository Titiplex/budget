<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {Account} from '../types/budget'

type WizardStep = 'file' | 'mapping' | 'preview' | 'reconciliation' | 'confirm' | 'summary'
type WizardState = 'empty' | 'parsing' | 'preview' | 'reconciling' | 'applying' | 'applied' | 'failed'
type PreviewFilter = 'all' | 'valid' | 'errors' | 'warnings' | 'duplicates' | 'needsReview'
type DecisionKind = 'importAsNew' | 'linkToExisting' | 'updateExisting' | 'skip' | 'markAsDuplicate' | 'needsManualReview'

const props = defineProps<{
  open: boolean
  accounts: Account[]
}>()

const emit = defineEmits<{
  close: []
  applied: []
}>()

const {t} = useI18n()

const steps: WizardStep[] = ['file', 'mapping', 'preview', 'reconciliation', 'confirm', 'summary']
const importTypes = ['transactions', 'investments', 'assets', 'mixed']
const filters: PreviewFilter[] = ['all', 'valid', 'errors', 'warnings', 'duplicates', 'needsReview']
const decisionKinds: DecisionKind[] = ['importAsNew', 'linkToExisting', 'updateExisting', 'skip', 'markAsDuplicate', 'needsManualReview']

const currentStep = ref<WizardStep>('file')
const state = ref<WizardState>('empty')
const errorMessage = ref<string | null>(null)
const warningMessage = ref<string | null>(null)
const fileName = ref('')
const filePath = ref('')
const rawText = ref('')
const detectedColumns = ref<string[]>([])
const batchId = ref<number | string | null>(null)
const importType = ref('transactions')
const defaultCurrency = ref('CAD')
const selectedTemplateId = ref('')
const targetAccountId = ref('')
const templateName = ref('')
const mappingTemplates = ref<any[]>([])
const preview = ref<any | null>(null)
const applyResult = ref<any | null>(null)
const previewFilter = ref<PreviewFilter>('all')
const reconciliationFilter = ref<'all' | 'review' | 'safe'>('all')
const confirmChecked = ref(false)
const creatingTemplate = ref(false)
const decisionsByRow = ref<Record<string, {kind: DecisionKind; targetEntityId: unknown; targetEntityType: string | null; reason: string}>>({})

const busy = computed(() => state.value === 'parsing' || state.value === 'applying')
const previewRows = computed<any[]>(() => preview.value?.rows || [])
const previewStats = computed(() => preview.value?.stats || {})
const riskyRows = computed(() => previewRows.value.filter((row) => isAmbiguousRow(row)))
const safeRows = computed(() => previewRows.value.filter((row) => !isAmbiguousRow(row)))
const unresolvedRows = computed(() => riskyRows.value.filter((row) => decisionRequiresManualResolution(row)))
const canProceedToConfirm = computed(() => Boolean(batchId.value && previewRows.value.length && unresolvedRows.value.length === 0 && !busy.value))
const canApply = computed(() => Boolean(confirmChecked.value && canProceedToConfirm.value && !busy.value))

const filteredPreviewRows = computed(() => previewRows.value.filter((row) => {
  if (previewFilter.value === 'valid') return row.action !== 'skip' && !row.reviewRequired
  if (previewFilter.value === 'errors') return (row.errors || []).length > 0 || row.action === 'skip'
  if (previewFilter.value === 'warnings') return (row.warnings || []).length > 0
  if (previewFilter.value === 'duplicates') return (row.duplicateCandidates || []).length > 0
  if (previewFilter.value === 'needsReview') return row.reviewRequired || row.action === 'needsReview'
  return true
}))

const reconciliationRows = computed(() => previewRows.value.filter((row) => {
  if (reconciliationFilter.value === 'review') return isAmbiguousRow(row)
  if (reconciliationFilter.value === 'safe') return !isAmbiguousRow(row)
  return true
}))

function importsApi() {
  return (window as unknown as {imports?: any}).imports
}

function fileApi() {
  return (window as unknown as {file?: any}).file
}

function resetWizard() {
  currentStep.value = 'file'
  state.value = 'empty'
  errorMessage.value = null
  warningMessage.value = null
  fileName.value = ''
  filePath.value = ''
  rawText.value = ''
  detectedColumns.value = []
  batchId.value = null
  importType.value = 'transactions'
  defaultCurrency.value = 'CAD'
  selectedTemplateId.value = ''
  targetAccountId.value = ''
  templateName.value = ''
  preview.value = null
  applyResult.value = null
  previewFilter.value = 'all'
  reconciliationFilter.value = 'all'
  confirmChecked.value = false
  decisionsByRow.value = {}
}

function normalizeIpcError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as {message?: unknown}).message || t('importWizard.messages.unknownError'))
  return t('importWizard.messages.unknownError')
}

function ensureOk<T>(result: {ok: boolean; data: T; error: unknown}): T {
  if (!result.ok) throw new Error(normalizeIpcError(result.error))
  return result.data
}

function rowKey(row: any) {
  return String(row.rowId ?? row.rowNumber)
}

function bestCandidate(row: any) {
  return [...(row.duplicateCandidates || [])].sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0))[0] || null
}

function isAmbiguousRow(row: any) {
  const candidate = bestCandidate(row)
  return row.reviewRequired || row.action === 'needsReview' || (row.conflicts || []).length > 0 || (row.missingFields || []).length > 0 || Boolean(candidate && Number(candidate.confidence || 0) < 0.98)
}

function defaultDecisionKind(row: any): DecisionKind {
  const candidate = bestCandidate(row)
  if (row.action === 'skip') return 'skip'
  if (row.action === 'updateTransaction' && candidate?.entityId && Number(candidate.confidence || 0) >= 0.98) return 'updateExisting'
  if (row.action === 'createTransaction' || row.action === 'createAssetOperation') return 'importAsNew'
  return 'needsManualReview'
}

function buildDecision(row: any, kind: DecisionKind = defaultDecisionKind(row)) {
  const candidate = bestCandidate(row)
  const requiresExisting = ['linkToExisting', 'updateExisting', 'markAsDuplicate'].includes(kind)
  return {
    kind,
    targetEntityId: requiresExisting ? candidate?.entityId ?? row.targetEntityId ?? null : null,
    targetEntityType: requiresExisting ? candidate?.entityType || row.targetEntityType || 'transaction' : row.targetEntityType || null,
    reason: row.reasons?.[0] || candidate?.reason || actionLabel(row.action),
  }
}

function initializeDecisions() {
  const next: Record<string, {kind: DecisionKind; targetEntityId: unknown; targetEntityType: string | null; reason: string}> = {}
  for (const row of previewRows.value) next[rowKey(row)] = buildDecision(row)
  decisionsByRow.value = next
  reconciliationFilter.value = riskyRows.value.length ? 'review' : 'all'
}

function decisionRequiresManualResolution(row: any) {
  const decision = decisionsByRow.value[rowKey(row)]
  if (!decision) return true
  if (!isAmbiguousRow(row)) return false
  if (decision.kind === 'needsManualReview') return true
  if (['linkToExisting', 'updateExisting', 'markAsDuplicate'].includes(decision.kind) && !decision.targetEntityId) return true
  return false
}

function updateDecision(row: any, kind: DecisionKind) {
  decisionsByRow.value = {...decisionsByRow.value, [rowKey(row)]: buildDecision(row, kind)}
}

function applySafeBulkDecision() {
  const next = {...decisionsByRow.value}
  for (const row of safeRows.value) next[rowKey(row)] = buildDecision(row)
  decisionsByRow.value = next
  warningMessage.value = t('importWizard.messages.safeRowsPrepared', {count: safeRows.value.length})
}

function detectColumnsFromRawText(content: string) {
  const firstLine = content.replace(/^\uFEFF/, '').split(/\r?\n/).find((line) => line.trim()) || ''
  const delimiter = [',', ';', '\t'].map((candidate) => ({candidate, score: firstLine.split(candidate).length})).sort((left, right) => right.score - left.score)[0]?.candidate || ','
  return firstLine.split(delimiter).map((value) => value.replace(/^"|"$/g, '').trim()).filter(Boolean)
}

async function loadTemplates() {
  const api = importsApi()
  if (!api?.mappingTemplate) return
  try {
    mappingTemplates.value = ensureOk(await api.mappingTemplate.list({includeInactive: false})) as any[]
  } catch {
    mappingTemplates.value = []
  }
}

async function chooseFile() {
  errorMessage.value = null
  const api = fileApi()
  if (!api) return
  const result = await api.openText({
    title: t('importWizard.chooseFileDialogTitle'),
    filters: [{name: t('importWizard.csvFileFilter'), extensions: ['csv', 'txt']}],
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
  if (normalized.includes('account') || normalized.includes('compte')) return 'accountName'
  return null
}

async function createTemplateFromColumns() {
  const api = importsApi()
  if (!api?.mappingTemplate) return
  errorMessage.value = null
  creatingTemplate.value = true
  try {
    const columnMappings = detectedColumns.value
      .map((column) => ({column, targetField: guessTargetField(column)}))
      .filter((entry) => Boolean(entry.targetField))
      .map((entry) => ({sourceColumn: entry.column, targetField: entry.targetField, fieldType: entry.targetField === 'amount' ? 'number' : 'string', required: ['date', 'amount'].includes(String(entry.targetField))}))
    const created = ensureOk(await api.mappingTemplate.create({
      name: templateName.value || `Template ${fileName.value || 'CSV'}`,
      sourceType: 'csvFile',
      importType: importType.value,
      provider: 'user',
      delimiter: null,
      hasHeader: true,
      columnMappings,
      deduplicationStrategy: 'strict',
      defaultValues: {},
      metadata: {createdFromWizard: true, fileName: fileName.value},
    })) as any
    await loadTemplates()
    selectedTemplateId.value = String(created.id)
    warningMessage.value = t('importWizard.messages.templateCreated')
  } catch (error) {
    errorMessage.value = normalizeIpcError(error)
  } finally {
    creatingTemplate.value = false
  }
}

async function parseAndPreview() {
  const api = importsApi()
  if (!api) return
  errorMessage.value = null
  warningMessage.value = null
  state.value = 'parsing'
  try {
    const selectedTemplate = mappingTemplates.value.find((template) => String(template.id) === selectedTemplateId.value) || null
    const createdBatch = ensureOk(await api.createBatch({
      importType: importType.value,
      defaultCurrency: defaultCurrency.value,
      fileMetadata: {fileName: fileName.value || 'import.csv', provider: selectedTemplate?.provider || 'manual', sourceType: 'csvFile'},
      mappingTemplateId: selectedTemplate?.id || null,
      options: {preserveRawRows: true},
    })) as any
    batchId.value = createdBatch.id
    const parsed = ensureOk(await api.parseFile({
      batchId: createdBatch.id,
      rawText: rawText.value,
      mappingTemplateId: selectedTemplate?.id || null,
      options: {preserveRawRows: true},
      fileMetadata: {fileName: fileName.value || 'import.csv', provider: selectedTemplate?.provider || 'manual'},
      mappingTemplate: selectedTemplate || undefined,
      defaultCurrency: defaultCurrency.value,
    })) as any
    detectedColumns.value = parsed.parsed?.headers?.length ? parsed.parsed.headers : detectedColumns.value
    preview.value = ensureOk(await api.preview({
      batchId: createdBatch.id,
      mappingTemplateId: selectedTemplate?.id || null,
      options: {preserveRawRows: true},
      targetAccountId: targetAccountId.value ? Number(targetAccountId.value) : null,
      defaultCurrency: defaultCurrency.value,
    }))
    initializeDecisions()
    currentStep.value = 'preview'
    state.value = 'preview'
  } catch (error) {
    state.value = 'failed'
    errorMessage.value = normalizeIpcError(error)
  }
}

function goToReconciliation() {
  initializeDecisions()
  currentStep.value = 'reconciliation'
  state.value = 'reconciling'
  if (unresolvedRows.value.length) warningMessage.value = t('importWizard.unresolvedWarning', {count: unresolvedRows.value.length})
}

function goToConfirm() {
  if (!canProceedToConfirm.value) {
    warningMessage.value = t('importWizard.messages.resolveBeforeConfirm')
    return
  }
  confirmChecked.value = false
  currentStep.value = 'confirm'
}

function decisionPayloads() {
  const timestamp = new Date().toISOString()
  return Object.entries(decisionsByRow.value).map(([key, decision]) => ({
    id: `decision-${key}`,
    normalizedRowId: Number.isFinite(Number(key)) ? Number(key) : key,
    rowNumber: Number.isFinite(Number(key)) ? Number(key) : null,
    kind: decision.kind,
    targetEntityType: decision.targetEntityType,
    targetEntityId: decision.targetEntityId,
    reason: decision.reason,
    reasonSource: decision.kind === 'needsManualReview' ? 'user' : 'automatic',
    decidedBy: decision.kind === 'needsManualReview' ? 'user' : 'system',
    batchId: batchId.value,
    status: 'pending',
    decidedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    payload: {},
    history: [{at: timestamp, actor: 'user', status: 'pending', message: decision.reason, metadata: {}}],
  }))
}

async function applyImport() {
  const api = importsApi()
  if (!api || !batchId.value || !canApply.value) return
  errorMessage.value = null
  state.value = 'applying'
  try {
    applyResult.value = ensureOk(await api.applyReconciliationDecisions({batchId: batchId.value, decisions: decisionPayloads()}))
    state.value = 'applied'
    currentStep.value = 'summary'
    emit('applied')
  } catch (error) {
    state.value = 'failed'
    errorMessage.value = normalizeIpcError(error)
  }
}

async function cancelImport() {
  const api = importsApi()
  if (batchId.value && api?.cancel) {
    try {
      await api.cancel(batchId.value, t('importWizard.messages.cancelledReason'))
    } catch {
      // Ignore cancellation failures while closing the wizard.
    }
  }
  emit('close')
}

function actionLabel(action: string) {
  const key = `importWizard.previewAction.${action}`
  const translated = t(key)
  return translated === key ? t('importWizard.previewAction.unknown', {value: action}) : translated
}

function decisionLabel(kind: DecisionKind) {
  return t(`importWizard.decisionOptions.${kind}`)
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
    <Transition enter-active-class="transition duration-200 ease-out" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition duration-150 ease-in" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="open" class="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
        <div class="mx-auto flex min-h-full w-full max-w-7xl items-start justify-center">
          <section class="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <header class="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{{ t('importWizard.eyebrow') }}</p>
                <h2 class="mt-1 text-2xl font-bold text-slate-950 dark:text-white">{{ t('importWizard.title') }}</h2>
                <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ t('importWizard.description') }}</p>
              </div>
              <button class="ghost-btn" :disabled="busy" @click="cancelImport">{{ t('importWizard.close') }}</button>
            </header>

            <div class="grid gap-0 lg:grid-cols-[15rem_1fr]">
              <aside class="border-b border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40 lg:border-b-0 lg:border-r">
                <ol class="space-y-2">
                  <li v-for="(step, index) in steps" :key="step" class="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm" :class="currentStep === step ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'">
                    <span class="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-white/20 text-xs font-bold ring-1 ring-inset ring-current/20">{{ index + 1 }}</span>
                    <span class="font-semibold">{{ t(`importWizard.steps.${step}`) }}</span>
                  </li>
                </ol>
                <div class="mt-5 rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  <p class="font-semibold text-slate-700 dark:text-slate-200">{{ t('importWizard.status') }}</p>
                  <p class="mt-1">{{ t(`importWizard.state.${state}`) }}</p>
                  <p v-if="fileName" class="mt-3 break-all">{{ fileName }}</p>
                  <p v-if="currentStep === 'reconciliation'" class="mt-3 text-amber-600 dark:text-amber-300">{{ t('importWizard.casesToResolve', {count: unresolvedRows.length}) }}</p>
                </div>
              </aside>

              <main class="min-h-[34rem] p-5">
                <div v-if="errorMessage" class="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{{ errorMessage }}</div>
                <div v-if="warningMessage" class="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{{ warningMessage }}</div>

                <section v-if="currentStep === 'file'" class="space-y-5">
                  <div class="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-950/40">
                    <p class="text-lg font-bold text-slate-900 dark:text-white">{{ t('importWizard.chooseCsv') }}</p>
                    <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">{{ t('importWizard.chooseCsvDescription') }}</p>
                    <button class="primary-btn mt-5" @click="chooseFile">{{ t('importWizard.selectFile') }}</button>
                  </div>
                  <div class="grid gap-3 sm:grid-cols-3">
                    <div class="panel p-4"><p class="text-sm font-semibold">{{ t('importWizard.fileSafetyTitle') }}</p><p class="mt-1 text-xs text-slate-500">{{ t('importWizard.fileSafetyDescription') }}</p></div>
                    <div class="panel p-4"><p class="text-sm font-semibold">{{ t('importWizard.previewSafetyTitle') }}</p><p class="mt-1 text-xs text-slate-500">{{ t('importWizard.previewSafetyDescription') }}</p></div>
                    <div class="panel p-4"><p class="text-sm font-semibold">{{ t('importWizard.reconciliationSafetyTitle') }}</p><p class="mt-1 text-xs text-slate-500">{{ t('importWizard.reconciliationSafetyDescription') }}</p></div>
                  </div>
                </section>

                <section v-else-if="currentStep === 'mapping'" class="space-y-5">
                  <div class="grid gap-4 lg:grid-cols-2">
                    <label class="space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {{ t('importWizard.importType') }}
                      <select v-model="importType" class="form-input">
                        <option v-for="item in importTypes" :key="item" :value="item">{{ t(`importWizard.importTypeOptions.${item}`) }}</option>
                      </select>
                    </label>
                    <label class="space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {{ t('importWizard.defaultCurrency') }}
                      <input v-model="defaultCurrency" maxlength="3" class="form-input uppercase" />
                    </label>
                    <label class="space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {{ t('importWizard.mappingTemplate') }}
                      <select v-model="selectedTemplateId" class="form-input">
                        <option value="">{{ t('importWizard.automaticDetection') }}</option>
                        <option v-for="template in mappingTemplates" :key="String(template.id || template.name)" :value="String(template.id)">{{ template.name }}</option>
                      </select>
                    </label>
                    <label class="space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {{ t('importWizard.optionalTargetAccount') }}
                      <select v-model="targetAccountId" class="form-input">
                        <option value="">{{ t('importWizard.csvDrivenAccount') }}</option>
                        <option v-for="account in accounts" :key="account.id" :value="String(account.id)">{{ account.name }} · {{ account.currency }}</option>
                      </select>
                    </label>
                  </div>
                  <div class="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <label class="min-w-0 flex-1 space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {{ t('importWizard.createTemplateFromColumns') }}
                        <input v-model="templateName" class="form-input" />
                      </label>
                      <button class="secondary-btn" :disabled="creatingTemplate || !detectedColumns.length" @click="createTemplateFromColumns">
                        {{ creatingTemplate ? t('importWizard.creatingTemplate') : t('importWizard.createTemplate') }}
                      </button>
                    </div>
                    <p class="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{{ t('importWizard.detectedColumns') }}</p>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <span v-for="column in detectedColumns" :key="column" class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{{ column }}</span>
                    </div>
                  </div>
                  <div class="flex justify-between gap-3">
                    <button class="ghost-btn" @click="currentStep = 'file'">{{ t('importWizard.back') }}</button>
                    <button class="primary-btn" :disabled="!rawText || busy" @click="parseAndPreview">{{ state === 'parsing' ? t('importWizard.parsing') : t('importWizard.parseAndPreview') }}</button>
                  </div>
                </section>

                <section v-else-if="currentStep === 'preview'" class="space-y-4">
                  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <div class="panel p-3"><p class="text-xs text-slate-500">{{ t('importWizard.total') }}</p><p class="text-xl font-bold">{{ previewStats.totalRows || previewRows.length }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">{{ t('importWizard.created') }}</p><p class="text-xl font-bold">{{ previewStats.createTransactionRows || 0 }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">{{ t('importWizard.updated') }}</p><p class="text-xl font-bold">{{ previewStats.updateTransactionRows || 0 }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">{{ t('importWizard.skipped') }}</p><p class="text-xl font-bold">{{ previewStats.skippedRows || 0 }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">{{ t('importWizard.review') }}</p><p class="text-xl font-bold">{{ riskyRows.length }}</p></div>
                    <div class="panel p-3"><p class="text-xs text-slate-500">{{ t('importWizard.errors') }}</p><p class="text-xl font-bold">{{ previewStats.errorRows || 0 }}</p></div>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button v-for="filter in filters" :key="filter" class="tab-btn" :class="previewFilter === filter ? 'tab-btn-active' : ''" @click="previewFilter = filter">{{ t(`importWizard.${filter}`) }}</button>
                  </div>
                  <div class="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                    <table class="min-w-full text-sm">
                      <thead class="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-950/70"><tr><th class="px-4 py-3 text-left">{{ t('importWizard.row') }}</th><th class="px-4 py-3 text-left">{{ t('importWizard.action') }}</th><th class="px-4 py-3 text-left">{{ t('importWizard.reasons') }}</th><th class="px-4 py-3 text-left">{{ t('importWizard.missingFields') }}</th></tr></thead>
                      <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                      <tr v-for="row in filteredPreviewRows" :key="rowKey(row)"><td class="px-4 py-3">{{ row.rowNumber }}</td><td class="px-4 py-3">{{ actionLabel(row.action) }}</td><td class="px-4 py-3">{{ (row.reasons || []).join(' · ') || '—' }}</td><td class="px-4 py-3">{{ (row.missingFields || []).join(' · ') || '—' }}</td></tr>
                      <tr v-if="!filteredPreviewRows.length"><td colspan="4" class="px-4 py-8 text-center text-slate-500">{{ t('importWizard.noPreviewRows') }}</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div class="flex justify-between gap-3"><button class="ghost-btn" @click="currentStep = 'mapping'">{{ t('importWizard.back') }}</button><button class="primary-btn" :disabled="!previewRows.length" @click="goToReconciliation">{{ t('importWizard.continueToReconciliation') }}</button></div>
                </section>

                <section v-else-if="currentStep === 'reconciliation'" class="space-y-4">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="flex flex-wrap gap-2">
                      <button class="tab-btn" :class="reconciliationFilter === 'all' ? 'tab-btn-active' : ''" @click="reconciliationFilter = 'all'">{{ t('importWizard.all') }}</button>
                      <button class="tab-btn" :class="reconciliationFilter === 'review' ? 'tab-btn-active' : ''" @click="reconciliationFilter = 'review'">{{ t('importWizard.ambiguousRows') }}</button>
                      <button class="tab-btn" :class="reconciliationFilter === 'safe' ? 'tab-btn-active' : ''" @click="reconciliationFilter = 'safe'">{{ t('importWizard.safeRows') }}</button>
                    </div>
                    <button class="ghost-btn" @click="applySafeBulkDecision">{{ t('importWizard.prepareSafeRows') }}</button>
                  </div>
                  <div class="space-y-3">
                    <article v-for="row in reconciliationRows" :key="rowKey(row)" class="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div><p class="text-sm font-semibold">{{ t('importWizard.row') }} {{ row.rowNumber }} · {{ actionLabel(row.action) }}</p><p class="mt-1 text-xs text-slate-500">{{ (row.reasons || []).join(' · ') || '—' }}</p></div>
                        <label class="min-w-[16rem] text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {{ t('importWizard.decision') }}
                          <select class="form-input mt-1" :value="decisionsByRow[rowKey(row)]?.kind" @change="updateDecision(row, ($event.target as HTMLSelectElement).value as DecisionKind)">
                            <option v-for="kind in decisionKinds" :key="kind" :value="kind">{{ decisionLabel(kind) }}</option>
                          </select>
                        </label>
                      </div>
                    </article>
                  </div>
                  <div class="flex justify-between gap-3"><button class="ghost-btn" @click="currentStep = 'preview'">{{ t('importWizard.back') }}</button><button class="primary-btn" :disabled="!canProceedToConfirm" @click="goToConfirm">{{ t('importWizard.continueToConfirm') }}</button></div>
                </section>

                <section v-else-if="currentStep === 'confirm'" class="space-y-4">
                  <div class="rounded-3xl border border-slate-200 p-5 dark:border-slate-800">
                    <h3 class="text-lg font-bold text-slate-900 dark:text-white">{{ t('importWizard.confirmTitle') }}</h3>
                    <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">{{ t('importWizard.confirmDescription') }}</p>
                    <label class="mt-5 flex items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200"><input v-model="confirmChecked" type="checkbox" class="h-4 w-4" />{{ t('importWizard.confirmCheckbox') }}</label>
                  </div>
                  <div class="flex justify-between gap-3"><button class="ghost-btn" @click="currentStep = 'reconciliation'">{{ t('importWizard.back') }}</button><button class="primary-btn" :disabled="!canApply" @click="applyImport">{{ state === 'applying' ? t('importWizard.applying') : t('importWizard.applyImport') }}</button></div>
                </section>

                <section v-else class="space-y-4">
                  <div class="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                    <h3 class="text-lg font-bold">{{ t('importWizard.summaryTitle') }}</h3>
                    <p class="mt-2 text-sm">{{ t('importWizard.summaryDescription') }}</p>
                    <pre v-if="applyResult" class="mt-4 max-h-64 overflow-auto rounded-2xl bg-white/70 p-4 text-xs dark:bg-slate-950/60">{{ JSON.stringify(applyResult, null, 2) }}</pre>
                  </div>
                  <div class="flex justify-end"><button class="primary-btn" @click="emit('close')">{{ t('importWizard.done') }}</button></div>
                </section>
              </main>
            </div>
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
