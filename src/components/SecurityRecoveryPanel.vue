<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import RecoverySnapshotsPanel from './RecoverySnapshotsPanel.vue'

type NoticeType = 'success' | 'error'
type IpcResult<T> = {ok: boolean; data: T | null; error?: {message?: string} | null}
type AuditRow = {eventType: string; domain: string; severity: string; status: string; summary: string; timestamp?: string | null; createdAt?: string | null}
type IntegrityReport = {ok: boolean; generatedAt: string; summary: string; totals: {info: number; warning: number; error: number; critical: number}; issueCount: number}

const emit = defineEmits<{ notice: [type: NoticeType, text: string] }>()
const loading = ref(false)
const checking = ref(false)
const auditRows = ref<AuditRow[]>([])
const snapshotCount = ref(0)
const secureItemCount = ref(0)
const secureStoreReady = ref(false)
const integrityReport = ref<IntegrityReport | null>(null)

function unwrap<T>(result: IpcResult<T> | T, fallback: string): T {
  if (result && typeof result === 'object' && 'ok' in result) {
    const ipc = result as IpcResult<T>
    if (ipc.ok && ipc.data != null) return ipc.data
    throw new Error(ipc.error?.message || fallback)
  }
  return result as T
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('fr-CA', {dateStyle: 'medium', timeStyle: 'short'}).format(date)
}

const lastBackup = computed(() => auditRows.value.find((row) => row.eventType.toLowerCase().includes('backup')) || null)
const lastIntegrity = computed(() => integrityReport.value || auditRows.value.find((row) => row.domain === 'integrity') || null)
const criticalRows = computed(() => auditRows.value.filter((row) => ['CRITICAL', 'ERROR', 'WARNING'].includes(row.severity)).slice(0, 3))

function runMenu(command: string) {
  ;(window.appShell as unknown as {sendMenuCommand?: (command: string) => void})?.sendMenuCommand?.(command)
}

async function refreshStatus() {
  loading.value = true
  try {
    const [auditResult, snapshotResult, storageResult, secureRows] = await Promise.all([
      window.auditLog?.list?.({limit: 25}) ?? [],
      window.recoverySnapshots?.list?.() ?? {ok: true, data: [], error: null},
      window.secrets?.getStorageInfo?.() ?? {ok: true, data: null, error: null},
      window.secrets?.listSecretMetadata?.({}) ?? {ok: true, data: [], error: null},
    ])
    auditRows.value = unwrap<AuditRow[]>(auditResult, 'Audit log indisponible.')
    snapshotCount.value = unwrap<unknown[]>(snapshotResult, 'Snapshots indisponibles.').length
    secureStoreReady.value = Boolean(unwrap<Record<string, unknown> | null>(storageResult, 'Stockage sécurisé indisponible.'))
    secureItemCount.value = unwrap<unknown[]>(secureRows, 'Métadonnées sécurisées indisponibles.').length
  } catch (error) {
    emit('notice', 'error', error instanceof Error ? error.message : 'Impossible de charger le statut sécurité.')
  } finally {
    loading.value = false
  }
}

async function runIntegrityCheck() {
  if (!window.integrityCheck?.run) {
    emit('notice', 'error', 'Module d’intégrité indisponible.')
    return
  }
  checking.value = true
  try {
    const report = unwrap<IntegrityReport>(await window.integrityCheck.run({source: 'security-settings-panel', reason: 'manual-settings-check'}), 'Contrôle impossible.')
    integrityReport.value = report
    emit('notice', report.ok ? 'success' : 'error', report.summary)
    await refreshStatus()
  } catch (error) {
    emit('notice', 'error', error instanceof Error ? error.message : 'Contrôle impossible.')
  } finally {
    checking.value = false
  }
}

async function exportAudit() {
  try {
    const content = unwrap<string>(await window.auditLog.exportMarkdown({limit: 200}), 'Export audit impossible.')
    const result = await window.file.saveText({title: 'Exporter audit', defaultPath: 'budget-audit.md', content, filters: [{name: 'Markdown', extensions: ['md']}]})
    if (!result?.canceled) emit('notice', 'success', 'Audit exporté.')
  } catch (error) {
    emit('notice', 'error', error instanceof Error ? error.message : 'Export audit impossible.')
  }
}

onMounted(refreshStatus)
</script>

<template>
  <section class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/60">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-rose-500">Sécurité & récupération</p>
        <h4 class="mt-1 text-base font-bold text-slate-950 dark:text-white">Centre local</h4>
        <p class="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">Actions critiques, backups, contrôles, journal local et snapshots sont regroupés ici. Les protections restent locales : pas de compte utilisateur, pas de synchronisation cloud, pas de récupération automatique d’un mot de passe perdu.</p>
      </div>
      <button class="ghost-btn !px-3 !py-2 text-xs" :disabled="loading" @click="refreshStatus">{{ loading ? 'Chargement…' : 'Rafraîchir' }}</button>
    </div>

    <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70"><p class="text-[11px] font-bold uppercase tracking-wide text-slate-400">Dernier backup</p><p class="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{{ lastBackup ? formatDate(lastBackup.timestamp || lastBackup.createdAt) : 'Aucun événement' }}</p><p class="mt-1 line-clamp-2 text-xs text-slate-500">{{ lastBackup?.summary || 'Aucun export audité.' }}</p></div>
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70"><p class="text-[11px] font-bold uppercase tracking-wide text-slate-400">Intégrité</p><p class="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{{ lastIntegrity ? formatDate((lastIntegrity as any).generatedAt || (lastIntegrity as any).timestamp || (lastIntegrity as any).createdAt) : 'Jamais lancé ici' }}</p><p class="mt-1 line-clamp-2 text-xs text-slate-500">{{ (lastIntegrity as any)?.summary || 'Contrôle manuel disponible.' }}</p></div>
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70"><p class="text-[11px] font-bold uppercase tracking-wide text-slate-400">Snapshots</p><p class="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{{ snapshotCount }}</p><p class="mt-1 text-xs text-slate-500">Copies locales avant actions critiques.</p></div>
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70"><p class="text-[11px] font-bold uppercase tracking-wide text-slate-400">Stockage sécurisé</p><p class="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{{ secureItemCount }}</p><p class="mt-1 text-xs text-slate-500">{{ secureStoreReady ? 'Disponible localement.' : 'Statut inconnu.' }}</p></div>
    </div>

    <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <button class="secondary-btn justify-start text-left" @click="runMenu('export-json')"><span><strong>Exporter JSON</strong><br><small>Portable, non chiffré.</small></span></button>
      <button class="secondary-btn justify-start text-left" @click="runMenu('export-encrypted-json')"><span><strong>Exporter chiffré</strong><br><small>Mot de passe nécessaire.</small></span></button>
      <button class="secondary-btn justify-start text-left" @click="runMenu('restore-json')"><span><strong>Restaurer</strong><br><small>Dry-run avant remplacement.</small></span></button>
      <button class="secondary-btn justify-start text-left" :disabled="checking" @click="runIntegrityCheck"><span><strong>{{ checking ? 'Vérification…' : 'Vérifier l’intégrité' }}</strong><br><small>Références, montants et dates.</small></span></button>
      <button class="secondary-btn justify-start text-left" @click="exportAudit"><span><strong>Exporter audit</strong><br><small>Journal local des actions.</small></span></button>
      <button class="secondary-btn justify-start text-left" @click="refreshStatus"><span><strong>Actualiser stockage</strong><br><small>Métadonnées seulement.</small></span></button>
    </div>

    <div class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">Les backups non chiffrés doivent être stockés prudemment. Les snapshots sont locaux et ne remplacent pas une sauvegarde externe.</div>

    <div v-if="criticalRows.length" class="mt-4 space-y-2"><p class="text-xs font-bold uppercase tracking-wide text-slate-400">Derniers événements sensibles</p><article v-for="event in criticalRows" :key="`${event.eventType}-${event.timestamp || event.createdAt}-${event.summary}`" class="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800"><div class="flex flex-wrap items-center justify-between gap-2"><p class="font-bold text-slate-900 dark:text-white">{{ event.eventType }} · {{ event.status }}</p><p class="text-slate-400">{{ formatDate(event.timestamp || event.createdAt) }}</p></div><p class="mt-1 text-slate-500 dark:text-slate-400">{{ event.summary }}</p></article></div>

    <div class="mt-5"><RecoverySnapshotsPanel @notice="(type, text) => emit('notice', type, text)" /></div>
  </section>
</template>
