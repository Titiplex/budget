import { currentLocaleCode, tr } from '../../i18n'
import type {
  DataFreshnessStatus,
  DataOrigin,
  DataProvenance,
} from '../../types/provenance'

export function originLabel(value: DataOrigin) {
  return tr(`dataOrigin.${value}`)
}

export function freshnessLabel(value: DataFreshnessStatus) {
  return tr(`dataOrigin.${value}`)
}

export function freshnessTone(status: DataFreshnessStatus) {
  if (status === 'fresh')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
  if (status === 'stale')
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'
  if (status === 'unavailable')
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200'
  if (status === 'userProvided')
    return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200'
  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
}

export function originTone(origin: DataOrigin) {
  if (origin === 'csvImport')
    return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200'
  if (origin === 'backupRestore')
    return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-200'
  if (origin === 'calculated' || origin === 'generatedFromRecurring')
    return 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900/60 dark:bg-fuchsia-950/40 dark:text-fuchsia-200'
  if (origin === 'marketDataProvider' || origin === 'connectorReadOnly')
    return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-200'
  if (origin === 'migration')
    return 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
  return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200'
}

export function formatProvenanceDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(currentLocaleCode(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function freshnessReason(
  status: DataFreshnessStatus,
  provenance?: DataProvenance | null,
) {
  if (status === 'stale' && provenance?.staleAfter) {
    return tr('dataOrigin.staleAfter', { age: provenance.staleAfter })
  }
  return tr(`dataOrigin.reason_${status}`)
}

export function provenanceTooltip(
  provenance: DataProvenance | null | undefined,
  freshnessStatus?: DataFreshnessStatus | null,
) {
  if (!provenance)
    return freshnessStatus
      ? freshnessReason(freshnessStatus)
      : tr('dataOrigin.none')
  const lines = [
    tr('dataOrigin.originLine', {
      value: originLabel(provenance.origin) || provenance.origin,
    }),
    tr('dataOrigin.sourceLine', {
      value:
        provenance.sourceLabel || provenance.provider || provenance.sourceType,
    }),
    provenance.provider
      ? tr('dataOrigin.providerLine', { value: provenance.provider })
      : null,
    provenance.importBatchId != null
      ? tr('dataOrigin.importbatchLine', { value: provenance.importBatchId })
      : null,
    tr('dataOrigin.observedLine', {
      value: formatProvenanceDate(provenance.observedAt),
    }),
    tr('dataOrigin.updatedLine', {
      value: formatProvenanceDate(provenance.updatedAt),
    }),
    freshnessStatus
      ? tr('dataOrigin.statusLine', {
          value: freshnessLabel(freshnessStatus) || freshnessStatus,
        })
      : null,
    freshnessStatus ? freshnessReason(freshnessStatus, provenance) : null,
  ].filter(Boolean)

  return lines.join('\n')
}
