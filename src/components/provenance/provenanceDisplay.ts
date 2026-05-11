import type {DataFreshnessStatus, DataOrigin, DataProvenance} from '../../types/provenance'

export const ORIGIN_LABELS: Record<DataOrigin, string> = {
    manual: 'Saisie manuelle',
    csvImport: 'Importé',
    backupRestore: 'Restauré',
    generatedFromRecurring: 'Récurrence',
    calculated: 'Calculé',
    marketDataProvider: 'Provider externe',
    connectorReadOnly: 'Connecteur',
    migration: 'Migration',
}

export const FRESHNESS_LABELS: Record<DataFreshnessStatus, string> = {
    fresh: 'Frais',
    stale: 'Obsolète',
    unknown: 'Inconnu',
    userProvided: 'Utilisateur',
    unavailable: 'Indisponible',
}

export function freshnessTone(status: DataFreshnessStatus) {
    if (status === 'fresh') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
    if (status === 'stale') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'
    if (status === 'unavailable') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200'
    if (status === 'userProvided') return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200'
    return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
}

export function originTone(origin: DataOrigin) {
    if (origin === 'csvImport') return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200'
    if (origin === 'backupRestore') return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-200'
    if (origin === 'calculated' || origin === 'generatedFromRecurring') return 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900/60 dark:bg-fuchsia-950/40 dark:text-fuchsia-200'
    if (origin === 'marketDataProvider' || origin === 'connectorReadOnly') return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-200'
    if (origin === 'migration') return 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
    return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200'
}

export function formatProvenanceDate(value: string | null | undefined) {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat('fr-CA', {dateStyle: 'medium', timeStyle: 'short'}).format(date)
}

export function freshnessReason(status: DataFreshnessStatus, provenance?: DataProvenance | null) {
    if (status === 'stale') {
        return `Donnée considérée obsolète${provenance?.staleAfter ? ` après ${provenance.staleAfter}` : ''}.`
    }
    if (status === 'fresh') return 'Donnée encore dans sa fenêtre de fraîcheur.'
    if (status === 'userProvided') return 'Donnée fournie ou confirmée manuellement par l’utilisateur.'
    if (status === 'unavailable') return 'Aucune donnée exploitable n’est disponible.'
    return 'Fraîcheur impossible à déterminer avec les métadonnées actuelles.'
}

export function provenanceTooltip(provenance: DataProvenance | null | undefined, freshnessStatus?: DataFreshnessStatus | null) {
    if (!provenance) return freshnessStatus ? freshnessReason(freshnessStatus) : 'Aucune provenance disponible.'
    const lines = [
        `Origine: ${ORIGIN_LABELS[provenance.origin] || provenance.origin}`,
        `Source: ${provenance.sourceLabel || provenance.provider || provenance.sourceType}`,
        provenance.provider ? `Provider: ${provenance.provider}` : null,
        provenance.importBatchId != null ? `Batch import: ${provenance.importBatchId}` : null,
        `Observé le: ${formatProvenanceDate(provenance.observedAt)}`,
        `Mis à jour le: ${formatProvenanceDate(provenance.updatedAt)}`,
        freshnessStatus ? `Statut: ${FRESHNESS_LABELS[freshnessStatus] || freshnessStatus}` : null,
        freshnessStatus ? freshnessReason(freshnessStatus, provenance) : null,
    ].filter(Boolean)

    return lines.join('\n')
}
