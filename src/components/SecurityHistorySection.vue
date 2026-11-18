<script setup lang="ts">
import { currentLocaleCode } from '../i18n'
import { useI18n } from 'vue-i18n'
import { computed, onMounted, ref } from 'vue'
import {
  AUDIT_EVENT_DOMAINS,
  AUDIT_EVENT_SEVERITIES,
  AUDIT_EVENT_TYPES,
  type AuditEventDomain,
  type AuditEventListFilters,
  type AuditEventRecord,
  type AuditEventSeverity,
  type AuditEventStatus,
  type AuditEventType,
} from '../types/audit'

const { t } = useI18n()

const emit = defineEmits<{
  (event: 'notice', type: 'success' | 'error', text: string): void
}>()

interface SecurityHistoryFilters {
  from: string
  to: string
  eventType: AuditEventType | ''
  severity: AuditEventSeverity | ''
  domain: AuditEventDomain | ''
}

const events = ref<AuditEventRecord[]>([])
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const selected = ref<AuditEventRecord | null>(null)
const filters = ref<SecurityHistoryFilters>({
  from: '',
  to: '',
  eventType: '',
  severity: '',
  domain: '',
})

const eventTypeOptions = AUDIT_EVENT_TYPES
const severityOptions = AUDIT_EVENT_SEVERITIES
const domainOptions = AUDIT_EVENT_DOMAINS

const hasFilters = computed(() => Object.values(filters.value).some(Boolean))
const failureCount = computed(
  () =>
    events.value.filter(
      (event) =>
        event.status === 'FAILED' ||
        event.status === 'BLOCKED' ||
        event.severity === 'ERROR' ||
        event.severity === 'CRITICAL',
    ).length,
)
const successCount = computed(
  () => events.value.filter((event) => event.status === 'SUCCESS').length,
)

function unwrapIpcResult<T>(result: any, fallback: string): T {
  if (result && typeof result === 'object' && 'ok' in result) {
    if (result.ok) return result.data as T
    throw new Error(result.error?.message || fallback)
  }
  return result as T
}

function queryPayload(): AuditEventListFilters {
  const payload: AuditEventListFilters = { limit: 300 }

  if (filters.value.from) payload.from = `${filters.value.from}T00:00:00.000Z`
  if (filters.value.to) payload.to = `${filters.value.to}T23:59:59.999Z`
  if (filters.value.eventType) payload.eventType = filters.value.eventType
  if (filters.value.severity) payload.severity = filters.value.severity
  if (filters.value.domain) payload.domain = filters.value.domain

  return payload
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(currentLocaleCode(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function severityClass(severity: AuditEventSeverity | string) {
  switch (severity) {
    case 'CRITICAL':
      return 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200'
    case 'ERROR':
      return 'border-red-300 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200'
    case 'WARNING':
      return 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200'
    default:
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
  }
}

function statusClass(status: AuditEventStatus | string) {
  switch (status) {
    case 'FAILED':
      return 'text-red-600 dark:text-red-300'
    case 'BLOCKED':
      return 'text-amber-600 dark:text-amber-300'
    case 'CANCELLED':
      return 'text-slate-500 dark:text-slate-400'
    default:
      return 'text-emerald-600 dark:text-emerald-300'
  }
}

function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]'
  if (value == null || typeof value === 'number' || typeof value === 'boolean')
    return value
  if (typeof value === 'string') {
    if (
      /secret|password|token|api[_-]?key|authorization|bearer|private key/i.test(
        value,
      )
    )
      return '[redacted]'
    return value.length > 240 ? `${value.slice(0, 240)}…` : value
  }
  if (Array.isArray(value))
    return value.slice(0, 30).map((item) => redactValue(item, depth + 1))
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 30)
        .map(([key, entry]) => {
          if (
            /secret|password|token|api[_-]?key|authorization|credential|raw|accountRows|transactionRows|bank|iban|card/i.test(
              key,
            )
          ) {
            return [key, '[redacted]']
          }
          return [key, redactValue(entry, depth + 1)]
        }),
    )
  }
  return String(value)
}

const selectedMetadata = computed(() => {
  if (!selected.value?.metadata) return '{}'
  return JSON.stringify(redactValue(selected.value.metadata), null, 2)
})

async function loadEvents() {
  loading.value = true
  errorMessage.value = null
  try {
    const result = await window.auditLog.list(queryPayload())
    events.value = unwrapIpcResult<AuditEventRecord[]>(
      result,
      t('operationText.loadHistory'),
    )
    if (selected.value) {
      selected.value =
        events.value.find((event) => event.id === selected.value?.id) ||
        events.value[0] ||
        null
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t('operationText.loadHistory')
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.value = { from: '', to: '', eventType: '', severity: '', domain: '' }
  void loadEvents()
}

async function exportAudit(format: 'markdown' | 'csv') {
  try {
    const contentResult =
      format === 'markdown'
        ? await window.auditLog.exportMarkdown(queryPayload())
        : await window.auditLog.exportCsv(queryPayload())
    const content = unwrapIpcResult<string>(
      contentResult,
      t('operationText.exportFailed'),
    )
    const saved = await window.file.saveText({
      title:
        format === 'markdown'
          ? t('operationText.exportSecurityMd')
          : t('operationText.exportSecurityCsv'),
      defaultPath:
        format === 'markdown' ? 'security-history.md' : 'security-history.csv',
      content,
      filters:
        format === 'markdown'
          ? [{ name: 'Markdown', extensions: ['md'] }]
          : [{ name: 'CSV', extensions: ['csv'] }],
    })
    if (!saved?.canceled)
      emit('notice', 'success', t('operationText.exportedHistory'))
  } catch (error) {
    emit(
      'notice',
      'error',
      error instanceof Error ? error.message : t('operationText.exportFailed'),
    )
  }
}

onMounted(loadEvents)
</script>

<template>
  <section class="space-y-5">
    <div class="grid gap-4 lg:grid-cols-3">
      <div class="panel lg:col-span-2">
        <p class="soft-kicker">
          {{ t('interfaceText.securityHistorySection.securityHistory') }}
        </p>
        <h2 class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
          {{ t('interfaceText.securityHistorySection.sensitiveOperations') }}
        </h2>
        <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {{
            t(
              'interfaceText.securityHistorySection.reviewImportsBackupExportsRestoresCriticalDeletions',
            )
          }}
        </p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="mini-card">
          <p class="text-xs uppercase tracking-[0.16em] text-slate-400">
            {{ t('interfaceText.securityHistorySection.success') }}
          </p>
          <p
            class="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-300"
          >
            {{ successCount }}
          </p>
        </div>
        <div class="mini-card">
          <p class="text-xs uppercase tracking-[0.16em] text-slate-400">
            {{ t('interfaceText.securityHistorySection.needsReview') }}
          </p>
          <p class="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-300">
            {{ failureCount }}
          </p>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="grid gap-3 md:grid-cols-5">
        <label class="field-label">
          {{ t('interfaceText.importHistorySection.from') }}
          <input v-model="filters.from" type="date" class="input mt-1" />
        </label>
        <label class="field-label">
          {{ t('interfaceText.importHistorySection.to') }}
          <input v-model="filters.to" type="date" class="input mt-1" />
        </label>
        <label class="field-label">
          {{ t('forms.fields.type') }}
          <select v-model="filters.eventType" class="input mt-1">
            <option value="">{{ t('common.all') }}</option>
            <option v-for="item in eventTypeOptions" :key="item" :value="item">
              {{ item }}
            </option>
          </select>
        </label>
        <label class="field-label">
          {{ t('interfaceText.securityHistorySection.severity') }}
          <select v-model="filters.severity" class="input mt-1">
            <option value="">{{ t('common.allFeminine') }}</option>
            <option v-for="item in severityOptions" :key="item" :value="item">
              {{ item }}
            </option>
          </select>
        </label>
        <label class="field-label">
          {{ t('interfaceText.securityHistorySection.domain') }}
          <select v-model="filters.domain" class="input mt-1">
            <option value="">{{ t('common.all') }}</option>
            <option v-for="item in domainOptions" :key="item" :value="item">
              {{ item }}
            </option>
          </select>
        </label>
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <button class="primary-btn" :disabled="loading" @click="loadEvents">
          {{ t('interfaceText.securityHistorySection.filter') }}
        </button>
        <button class="ghost-btn" :disabled="!hasFilters" @click="resetFilters">
          {{ t('common.reset') }}
        </button>
        <button class="ghost-btn" @click="exportAudit('markdown')">
          {{ t('interfaceText.securityHistorySection.exportMarkdown') }}
        </button>
        <button class="ghost-btn" @click="exportAudit('csv')">
          {{ t('interfaceText.securityHistorySection.exportCSV') }}
        </button>
      </div>
    </div>

    <div v-if="errorMessage" class="notice notice-error">
      {{ errorMessage }}
    </div>

    <div
      v-else-if="!loading && events.length === 0"
      class="panel py-10 text-center"
    >
      <p class="text-lg font-semibold text-slate-800 dark:text-slate-100">
        {{ t('interfaceText.securityHistorySection.noSecurityEvents') }}
      </p>
      <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {{
          t(
            'interfaceText.securityHistorySection.recordedOperationsWillAppearHere',
          )
        }}
      </p>
    </div>

    <div v-else class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div class="panel overflow-hidden !p-0">
        <div class="max-h-[42rem] overflow-auto">
          <table
            class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
          >
            <thead
              class="sticky top-0 bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-400 dark:bg-slate-900 dark:text-slate-500"
            >
              <tr>
                <th class="px-4 py-3 text-left">
                  {{ t('forms.fields.date') }}
                </th>
                <th class="px-4 py-3 text-left">
                  {{ t('forms.fields.type') }}
                </th>
                <th class="px-4 py-3 text-left">
                  {{ t('interfaceText.securityHistorySection.severity') }}
                </th>
                <th class="px-4 py-3 text-left">
                  {{ t('interfaceText.securityHistorySection.domain') }}
                </th>
                <th class="px-4 py-3 text-left">
                  {{ t('budgets.statusLabel') }}
                </th>
                <th class="px-4 py-3 text-left">
                  {{ t('importWizard.steps.summary') }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
              <tr v-if="loading">
                <td colspan="6" class="px-4 py-8 text-center text-slate-500">
                  {{ t('common.loading') }}
                </td>
              </tr>
              <tr
                v-for="event in events"
                v-else
                :key="event.id"
                class="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-900/70"
                :class="
                  selected?.id === event.id
                    ? 'bg-violet-50/80 dark:bg-violet-950/30'
                    : ''
                "
                @click="selected = event"
              >
                <td
                  class="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400"
                >
                  {{ formatDate(event.timestamp) }}
                </td>
                <td
                  class="px-4 py-3 font-medium text-slate-900 dark:text-slate-100"
                >
                  {{ event.eventType }}
                </td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex rounded-full border px-2 py-1 text-xs font-semibold"
                    :class="severityClass(event.severity)"
                  >
                    {{ event.severity }}
                  </span>
                </td>
                <td class="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {{ event.domain }}
                </td>
                <td
                  class="px-4 py-3 font-semibold"
                  :class="statusClass(event.status)"
                >
                  {{ event.status }}
                </td>
                <td class="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {{ event.summary }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <aside class="panel h-fit xl:sticky xl:top-24">
        <template v-if="selected">
          <p class="soft-kicker">{{ t('wealthGoalsSummary.detail') }}</p>
          <h3 class="mt-2 text-lg font-bold text-slate-900 dark:text-white">
            {{ selected.eventType }}
          </h3>
          <dl class="mt-4 space-y-3 text-sm">
            <div>
              <dt class="field-label">{{ t('forms.fields.date') }}</dt>
              <dd>{{ formatDate(selected.timestamp) }}</dd>
            </div>
            <div>
              <dt class="field-label">{{ t('importWizard.steps.summary') }}</dt>
              <dd>{{ selected.summary }}</dd>
            </div>
            <div>
              <dt class="field-label">
                {{ t('interfaceText.securityHistorySection.domainAction') }}
              </dt>
              <dd>{{ selected.domain }} · {{ selected.action }}</dd>
            </div>
            <div>
              <dt class="field-label">
                {{ t('interfaceText.goalsSection.source') }}
              </dt>
              <dd>{{ selected.source || 'local' }}</dd>
            </div>
            <div>
              <dt class="field-label">
                {{ t('interfaceText.securityHistorySection.records') }}
              </dt>
              <dd>
                {{
                  selected.entityIds?.length
                    ? selected.entityIds
                        .map((item) => `${item.type}:${item.id}`)
                        .join(', ')
                    : '—'
                }}
              </dd>
            </div>
          </dl>
          <div class="mt-4">
            <p class="field-label">
              {{ t('interfaceText.securityHistorySection.redactedMetadata') }}
            </p>
            <pre
              class="mt-2 max-h-80 overflow-auto rounded-2xl border border-slate-200 bg-slate-950 p-3 text-xs text-slate-100 dark:border-slate-800"
              >{{ selectedMetadata }}</pre>
          </div>
        </template>
        <template v-else>
          <p class="text-sm text-slate-500 dark:text-slate-400">
            {{
              t(
                'interfaceText.securityHistorySection.selectAnEventToViewDetails',
              )
            }}
          </p>
        </template>
      </aside>
    </div>
  </section>
</template>
