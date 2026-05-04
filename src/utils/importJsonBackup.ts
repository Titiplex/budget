import {BUDGET_BACKUP_KIND, BudgetBackupParseError} from './jsonBackup'
import {
    GOALS_BACKUP_FORMAT_VERSION,
    parseBudgetBackupWithGoals,
    type BudgetBackupWithGoalsSnapshot,
} from './goalsJsonBackup'
import type {ImportEntityId, ImportMappingTemplate} from '../types/imports'

export const IMPORT_BACKUP_FORMAT_VERSION = 6
export const SUPPORTED_IMPORT_BACKUP_VERSIONS = [2, 3, 4, 5, 6] as const

export interface BudgetBackupImportDocumentation {
    included: string[]
    excluded: string[]
    notes: string[]
}

export interface BudgetBackupImportBatch {
    id: ImportEntityId
    status: string
    importType: string
    provider?: string | null
    source?: string | null
    fileName?: string | null
    fileHash?: string | null
    defaultCurrency?: string | null
    rowCount: number
    errorCount: number
    warningCount?: number
    duplicateCount: number
    importedAt?: string | null
    parsedAt?: string | null
    previewedAt?: string | null
    appliedAt?: string | null
    cancelledAt?: string | null
    rawRows: unknown[]
    normalizedRows: unknown[]
    errors: unknown[]
    warnings: unknown[]
    duplicateCandidates: unknown[]
    decisions: unknown[]
    appliedLinks: unknown[]
    preview?: unknown | null
    fileMetadata?: unknown | null
    template?: unknown | null
}

export interface BudgetBackupImportData {
    schemaVersion: 1
    documentation: BudgetBackupImportDocumentation
    mappingTemplates: ImportMappingTemplate[]
    importSources: string[]
    importHistory: BudgetBackupImportBatch[]
    metadata: {
        exportedAt: string
        auditOnlyRestore: true
        financialDataNotRestoredFromImportHistory: true
    }
}

export type BudgetBackupWithImportDataSnapshot = Omit<BudgetBackupWithGoalsSnapshot, 'version' | 'data'> & {
    version: typeof IMPORT_BACKUP_FORMAT_VERSION
    data: BudgetBackupWithGoalsSnapshot['data'] & {
        importBackup: BudgetBackupImportData
    }
}

const EMPTY_IMPORT_BACKUP: BudgetBackupImportData = {
    schemaVersion: 1,
    documentation: {
        included: [
            'Templates de mapping utilisateur',
            'Sources d’import connues',
            'Historique d’import audit-only',
            'Décisions de réconciliation associées aux imports',
            'Métadonnées utiles: fichier, hash, statut, compteurs, erreurs, warnings et doublons',
        ],
        excluded: [
            'Templates système fournis par l’application',
            'Connecteurs API réels ou secrets d’authentification',
            'Rollback complet des imports',
            'Transactions/assets recréés depuis l’historique d’import',
        ],
        notes: [
            'La restauration de l’historique d’import est audit-only.',
            'Les transactions et assets financiers sont restaurés uniquement depuis les sections financières principales du backup.',
            'Les conflits d’identifiants d’import sont résolus en renommant les ids restaurés si nécessaire.',
        ],
    },
    mappingTemplates: [],
    importSources: [],
    importHistory: [],
    metadata: {
        exportedAt: new Date(0).toISOString(),
        auditOnlyRestore: true,
        financialDataNotRestoredFromImportHistory: true,
    },
}

function fail(message: string): never {
    throw new BudgetBackupParseError(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
    if (!isRecord(value)) fail(`${path} doit être un objet.`)
    return value
}

function requireArray(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) fail(`${path} doit être un tableau.`)
    return value
}

function requireString(value: unknown, path: string): string {
    if (typeof value !== 'string') fail(`${path} doit être une chaîne de caractères.`)
    return value
}

function requireNonEmptyString(value: unknown, path: string): string {
    const normalized = requireString(value, path).trim()
    if (!normalized) fail(`${path} ne peut pas être vide.`)
    return normalized
}

function requireFiniteNumber(value: unknown, path: string) {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${path} doit être un nombre fini.`)
    return value
}

function optionalNullableString(record: Record<string, unknown>, key: string, path: string): string | null {
    if (!(key in record) || record[key] == null) return null
    return requireString(record[key], `${path}.${key}`)
}

function optionalIso(record: Record<string, unknown>, key: string, path: string): string | null {
    const value = optionalNullableString(record, key, path)
    if (!value) return null
    if (Number.isNaN(Date.parse(value))) fail(`${path}.${key} doit être une date valide.`)
    return value
}

function requireBoolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') fail(`${path} doit être un booléen.`)
    return value
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value))
}

function isUserMappingTemplate(template: unknown): template is ImportMappingTemplate {
    if (!isRecord(template)) return false
    const id = typeof template.id === 'string' ? template.id : ''
    return !id.startsWith('system:') && template.isSystem !== true && template.isPreset !== true
}

function normalizeTemplate(value: unknown, index: number): ImportMappingTemplate {
    const path = `data.importBackup.mappingTemplates[${index}]`
    const template = requireRecord(value, path)
    const id = requireNonEmptyString(template.id, `${path}.id`)
    if (id.startsWith('system:')) fail(`${path}.id ne doit pas référencer un template système.`)
    const columnMappings = requireArray(template.columnMappings, `${path}.columnMappings`)
    if (!columnMappings.length) fail(`${path}.columnMappings doit contenir au moins un mapping.`)

    return clone({
        ...template,
        id,
        name: requireNonEmptyString(template.name, `${path}.name`),
        sourceType: requireNonEmptyString(template.sourceType, `${path}.sourceType`),
        importType: requireNonEmptyString(template.importType, `${path}.importType`),
        provider: typeof template.provider === 'string' ? template.provider : null,
        columnMappings,
        isSystem: false,
        isPreset: false,
    } as unknown as ImportMappingTemplate)
}

function normalizeBatch(value: unknown, index: number): BudgetBackupImportBatch {
    const path = `data.importBackup.importHistory[${index}]`
    const batch = requireRecord(value, path)
    const id = requireNonEmptyString(batch.id, `${path}.id`)
    const rowCount = requireFiniteNumber(batch.rowCount, `${path}.rowCount`)
    const errorCount = requireFiniteNumber(batch.errorCount, `${path}.errorCount`)
    const duplicateCount = requireFiniteNumber(batch.duplicateCount, `${path}.duplicateCount`)
    if (rowCount < 0 || errorCount < 0 || duplicateCount < 0) fail(`${path} contient des compteurs négatifs.`)

    return {
        id,
        status: requireNonEmptyString(batch.status, `${path}.status`),
        importType: requireNonEmptyString(batch.importType, `${path}.importType`),
        provider: optionalNullableString(batch, 'provider', path),
        source: optionalNullableString(batch, 'source', path),
        fileName: optionalNullableString(batch, 'fileName', path),
        fileHash: optionalNullableString(batch, 'fileHash', path),
        defaultCurrency: optionalNullableString(batch, 'defaultCurrency', path),
        rowCount,
        errorCount,
        warningCount: typeof batch.warningCount === 'number' ? batch.warningCount : 0,
        duplicateCount,
        importedAt: optionalIso(batch, 'importedAt', path),
        parsedAt: optionalIso(batch, 'parsedAt', path),
        previewedAt: optionalIso(batch, 'previewedAt', path),
        appliedAt: optionalIso(batch, 'appliedAt', path),
        cancelledAt: optionalIso(batch, 'cancelledAt', path),
        rawRows: requireArray(batch.rawRows ?? [], `${path}.rawRows`),
        normalizedRows: requireArray(batch.normalizedRows ?? [], `${path}.normalizedRows`),
        errors: requireArray(batch.errors ?? [], `${path}.errors`),
        warnings: requireArray(batch.warnings ?? [], `${path}.warnings`),
        duplicateCandidates: requireArray(batch.duplicateCandidates ?? [], `${path}.duplicateCandidates`),
        decisions: requireArray(batch.decisions ?? [], `${path}.decisions`),
        appliedLinks: requireArray(batch.appliedLinks ?? [], `${path}.appliedLinks`),
        preview: batch.preview ?? null,
        fileMetadata: batch.fileMetadata ?? null,
        template: batch.template ?? null,
    }
}

function normalizeImportBackup(value: unknown): BudgetBackupImportData {
    if (value == null) return clone(EMPTY_IMPORT_BACKUP)
    const root = requireRecord(value, 'data.importBackup')
    const metadata = requireRecord(root.metadata ?? {}, 'data.importBackup.metadata')
    const documentation = requireRecord(root.documentation ?? EMPTY_IMPORT_BACKUP.documentation, 'data.importBackup.documentation')

    if (root.schemaVersion !== 1) fail('data.importBackup.schemaVersion doit valoir 1.')
    if (metadata.auditOnlyRestore != null && requireBoolean(metadata.auditOnlyRestore, 'data.importBackup.metadata.auditOnlyRestore') !== true) {
        fail('data.importBackup.metadata.auditOnlyRestore doit rester true.')
    }
    if (metadata.financialDataNotRestoredFromImportHistory != null && requireBoolean(metadata.financialDataNotRestoredFromImportHistory, 'data.importBackup.metadata.financialDataNotRestoredFromImportHistory') !== true) {
        fail('data.importBackup.metadata.financialDataNotRestoredFromImportHistory doit rester true.')
    }

    const mappingTemplates = requireArray(root.mappingTemplates ?? [], 'data.importBackup.mappingTemplates').map(normalizeTemplate)
    const importHistory = requireArray(root.importHistory ?? [], 'data.importBackup.importHistory').map(normalizeBatch)
    const templateIds = new Set<string>()
    for (const template of mappingTemplates) {
        if (templateIds.has(String(template.id))) fail(`data.importBackup.mappingTemplates contient un id dupliqué (${template.id}).`)
        templateIds.add(String(template.id))
    }
    const batchIds = new Set<string>()
    for (const batch of importHistory) {
        if (batchIds.has(String(batch.id))) fail(`data.importBackup.importHistory contient un id dupliqué (${batch.id}).`)
        batchIds.add(String(batch.id))
    }

    return {
        schemaVersion: 1,
        documentation: {
            included: requireArray(documentation.included ?? EMPTY_IMPORT_BACKUP.documentation.included, 'data.importBackup.documentation.included').map((item, index) => requireString(item, `data.importBackup.documentation.included[${index}]`)),
            excluded: requireArray(documentation.excluded ?? EMPTY_IMPORT_BACKUP.documentation.excluded, 'data.importBackup.documentation.excluded').map((item, index) => requireString(item, `data.importBackup.documentation.excluded[${index}]`)),
            notes: requireArray(documentation.notes ?? EMPTY_IMPORT_BACKUP.documentation.notes, 'data.importBackup.documentation.notes').map((item, index) => requireString(item, `data.importBackup.documentation.notes[${index}]`)),
        },
        mappingTemplates,
        importSources: requireArray(root.importSources ?? [], 'data.importBackup.importSources').map((item, index) => requireString(item, `data.importBackup.importSources[${index}]`)),
        importHistory,
        metadata: {
            exportedAt: optionalIso(metadata, 'exportedAt', 'data.importBackup.metadata') || new Date(0).toISOString(),
            auditOnlyRestore: true,
            financialDataNotRestoredFromImportHistory: true,
        },
    }
}

function parseRoot(content: string) {
    let parsed: unknown
    try {
        parsed = JSON.parse(content)
    } catch (_error) {
        fail('Le fichier JSON est invalide ou corrompu.')
    }
    const root = requireRecord(parsed, 'backup')
    if (root.kind !== BUDGET_BACKUP_KIND) fail('Le fichier JSON ne correspond pas à un backup budget valide.')
    const version = requireFiniteNumber(root.version, 'version')
    if (!Number.isInteger(version) || !(SUPPORTED_IMPORT_BACKUP_VERSIONS as readonly number[]).includes(version)) {
        fail(`Version de backup JSON non supportée (${version}). Versions supportées : ${SUPPORTED_IMPORT_BACKUP_VERSIONS.join(', ')}.`)
    }
    return {root, version}
}

function goalsCompatibleContent(root: Record<string, unknown>, version: number) {
    const data = requireRecord(root.data, 'data')
    const {importBackup: _importBackup, ...goalsData} = data
    return JSON.stringify({
        ...root,
        version: Math.min(version, GOALS_BACKUP_FORMAT_VERSION),
        data: goalsData,
    })
}

export function createBudgetBackupSnapshotWithImportData(
    snapshot: BudgetBackupWithGoalsSnapshot,
    importBackup: Partial<BudgetBackupImportData> = {},
): BudgetBackupWithImportDataSnapshot {
    const userMappingTemplates = (importBackup.mappingTemplates || []).filter(isUserMappingTemplate)
    const normalizedImportBackup: BudgetBackupImportData = {
        ...clone(EMPTY_IMPORT_BACKUP),
        ...importBackup,
        documentation: {
            ...EMPTY_IMPORT_BACKUP.documentation,
            ...(importBackup.documentation || {}),
        },
        mappingTemplates: clone(userMappingTemplates),
        importSources: [...new Set(importBackup.importSources || [])].sort(),
        importHistory: clone(importBackup.importHistory || []),
        metadata: {
            exportedAt: new Date().toISOString(),
            auditOnlyRestore: true,
            financialDataNotRestoredFromImportHistory: true,
        },
    }

    return {
        ...snapshot,
        version: IMPORT_BACKUP_FORMAT_VERSION,
        data: {
            ...snapshot.data,
            importBackup: normalizedImportBackup,
        },
    }
}

export function serializeBudgetBackupWithImportData(snapshot: BudgetBackupWithImportDataSnapshot) {
    return `${JSON.stringify(snapshot, null, 2)}\n`
}

export function parseBudgetBackupWithImportData(content: string): BudgetBackupWithImportDataSnapshot {
    const {root, version} = parseRoot(content)
    const goalsSnapshot = parseBudgetBackupWithGoals(goalsCompatibleContent(root, version))
    const data = requireRecord(root.data, 'data')
    const importBackup = version >= IMPORT_BACKUP_FORMAT_VERSION ? normalizeImportBackup(data.importBackup) : clone(EMPTY_IMPORT_BACKUP)

    return {
        ...goalsSnapshot,
        version: IMPORT_BACKUP_FORMAT_VERSION,
        data: {
            ...goalsSnapshot.data,
            importBackup,
        },
    }
}

export function backupImportDocumentationMarkdown(data: BudgetBackupImportData) {
    return [
        '# Backup import',
        '',
        '## Inclus',
        ...data.documentation.included.map((item) => `- ${item}`),
        '',
        '## Exclus',
        ...data.documentation.excluded.map((item) => `- ${item}`),
        '',
        '## Notes',
        ...data.documentation.notes.map((item) => `- ${item}`),
        '',
    ].join('\n')
}
