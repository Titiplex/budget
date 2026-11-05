<script setup lang="ts">
import { currentLocaleCode } from '../i18n'
import { useI18n } from 'vue-i18n'
import { onMounted, ref } from 'vue'

const { t } = useI18n()

interface IpcResult<T> {
  ok: boolean
  data: T | null
  error: { message?: string; code?: string } | null
}

interface RecoverySnapshotRow {
  id: string
  fileName: string
  filePath: string
  createdAt: string
  operationType: string
  reason: string
  source: string
  sizeBytes: number
}

interface RecoverySnapshotPolicy {
  maxSnapshots: number
  maxBytes: number
  directory: string
}

const emit = defineEmits<{
  notice: [type: 'success' | 'error', text: string]
}>()

const loading = ref(false)
const exporting = ref<string | null>(null)
const deleting = ref<string | null>(null)
const snapshots = ref<RecoverySnapshotRow[]>([])
const policy = ref<RecoverySnapshotPolicy | null>(null)

function unwrap<T>(result: IpcResult<T> | T, fallback: string): T {
  if (result && typeof result === 'object' && 'ok' in result) {
    const ipc = result as IpcResult<T>
    if (ipc.ok && ipc.data != null) return ipc.data
    throw new Error(ipc.error?.message || fallback)
  }
  return result as T
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(currentLocaleCode(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatBytes(value: number | null | undefined) {
  const bytes = Number(value || 0)
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${Math.round(bytes / 1024 / 1024)} Mo`
}

async function loadSnapshots() {
  const api = window.recoverySnapshots
  if (!api) return
  loading.value = true
  try {
    snapshots.value = unwrap(await api.list(), t('operationText.loadSnapshots'))
    policy.value = unwrap(await api.getPolicy(), t('operationText.loadPolicy'))
  } catch (error) {
    emit(
      'notice',
      'error',
      error instanceof Error ? error.message : t('operationText.loadSnapshots'),
    )
  } finally {
    loading.value = false
  }
}

async function exportSnapshot(row: RecoverySnapshotRow) {
  const api = window.recoverySnapshots
  if (!api) return
  exporting.value = row.id
  try {
    const snapshot = unwrap(
      await api.read(row.id),
      t('operationText.readSnapshot'),
    ) as { metadata: RecoverySnapshotRow; content: string }
    const result = await window.file.saveText({
      title: t('operationText.exportSnapshot'),
      defaultPath: row.fileName,
      content: snapshot.content,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (!result?.canceled)
      emit('notice', 'success', t('operationText.snapshotExported'))
  } catch (error) {
    emit(
      'notice',
      'error',
      error instanceof Error
        ? error.message
        : t('operationText.snapshotExportFailed'),
    )
  } finally {
    exporting.value = null
  }
}

async function markRestored(row: RecoverySnapshotRow) {
  const api = window.recoverySnapshots
  if (!api) return
  try {
    unwrap(
      await api.markRestored({
        id: row.id,
        filePath: row.filePath,
        source: 'recovery-snapshots-panel',
      }),
      t('operationText.auditSnapshotFailed'),
    )
    emit('notice', 'success', t('operationText.snapshotLogged'))
  } catch (error) {
    emit(
      'notice',
      'error',
      error instanceof Error
        ? error.message
        : t('operationText.auditSnapshotFailed'),
    )
  }
}

async function deleteSnapshot(row: RecoverySnapshotRow) {
  const api = window.recoverySnapshots
  if (!api) return
  const accepted = window.confirm(
    t('operationText.confirmSnapshot', { name: row.fileName }),
  )
  if (!accepted) return
  deleting.value = row.id
  try {
    unwrap(await api.delete(row.id), t('operationText.deleteSnapshotFailed'))
    await loadSnapshots()
    emit('notice', 'success', t('operationText.snapshotDeleted'))
  } catch (error) {
    emit(
      'notice',
      'error',
      error instanceof Error
        ? error.message
        : t('operationText.deleteSnapshotFailed'),
    )
  } finally {
    deleting.value = null
  }
}

onMounted(loadSnapshots)
</script>

<template>
  <section
    class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60"
  >
    <div
      class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div>
        <p
          class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400"
        >
          {{ t('interfaceText.recoverySnapshotsPanel.localRecovery') }}
        </p>
        <h4 class="mt-1 text-sm font-bold text-slate-900 dark:text-white">
          {{ t('interfaceText.recoverySnapshotsPanel.recoverySnapshots') }}
        </h4>
        <p class="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {{
            t(
              'interfaceText.recoverySnapshotsPanel.aLocalJSONCopyIsSavedBefore',
            )
          }}
        </p>
        <p v-if="policy" class="mt-1 text-[11px] text-slate-400">
          {{ t('interfaceText.recoverySnapshotsPanel.retention') }}
          {{ policy.maxSnapshots }}
          {{ t('interfaceText.recoverySnapshotsPanel.snapshots') }}
          {{ formatBytes(policy.maxBytes) }}
          {{ t('interfaceText.recoverySnapshotsPanel.max') }}
          {{ policy.directory }}
        </p>
      </div>
      <button
        class="ghost-btn !px-3 !py-2 text-xs"
        :disabled="loading"
        @click="loadSnapshots"
      >
        {{ loading ? t('common.loading') : t('common.refresh') }}
      </button>
    </div>

    <div v-if="snapshots.length" class="mt-4 space-y-2">
      <article
        v-for="snapshot in snapshots"
        :key="snapshot.id"
        class="rounded-2xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-950/60"
      >
        <div
          class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
        >
          <div class="min-w-0">
            <p class="truncate font-bold text-slate-900 dark:text-white">
              {{ snapshot.fileName }}
            </p>
            <p class="mt-1 text-slate-500 dark:text-slate-400">
              {{ snapshot.operationType }} ·
              {{ formatDate(snapshot.createdAt) }} ·
              {{ formatBytes(snapshot.sizeBytes) }}
            </p>
            <p class="mt-1 text-slate-500 dark:text-slate-400">
              {{ snapshot.reason }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              class="mini-action-btn"
              :disabled="exporting === snapshot.id"
              @click="exportSnapshot(snapshot)"
            >
              {{
                exporting === snapshot.id
                  ? t('interfaceText.recoverySnapshotsPanel.exporting')
                  : t('interfaceText.recoverySnapshotsPanel.export')
              }}
            </button>
            <button class="mini-action-btn" @click="markRestored(snapshot)">
              {{ t('interfaceText.recoverySnapshotsPanel.reviewRestore') }}
            </button>
            <button
              class="mini-danger-btn"
              :disabled="deleting === snapshot.id"
              @click="deleteSnapshot(snapshot)"
            >
              {{
                deleting === snapshot.id
                  ? t('interfaceText.importHistorySection.deleting')
                  : t('common.delete')
              }}
            </button>
          </div>
        </div>
      </article>
    </div>

    <p
      v-else
      class="mt-4 rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
    >
      {{ t('interfaceText.recoverySnapshotsPanel.noRecoverySnapshotsYet') }}
    </p>
  </section>
</template>
