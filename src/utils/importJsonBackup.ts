import {BUDGET_BACKUP_KIND, BudgetBackupParseError} from './jsonBackup'
import {
    GOALS_BACKUP_FORMAT_VERSION,
    parseBudgetBackupWithGoals,
    type BudgetBackupWithGoalsSnapshot,
} from './goalsJsonBackup'
import {
    verifyBackupIntegrityManifest,
    withBackupIntegrityManifest,
    type BackupIntegrityManifest,
    type BackupIntegrityVerification,
} from './backupIntegrity'
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
    integrity?: BackupIntegrityManifest
    integrityVerification?: BackupIntegrityVerification
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

function stringArray(value: unknown, path: string): string[] {
    return requireArray(value ?? [], path).map((item, index) => {
        if (typeof item !== 'string') fail(`${path}[${index}] doit être une chaîne de caractères.`)
        return item
    })
}

function requireString(value: unknown, path: string): string {
    if (typeof value !== 'string') fail(`${path} doit être une chaîne de caractères.`)
    return value
}

function nonEmptyString(value: unknown, path: string): string {
    const normalized = requireString(value, path).trim()
    if (!normalized) fail(`${path} ne peut pas être vide.`)
    return normalized
}

function finiteNumber(value: unknown, path: string) {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${path} doit être un nombre fini.`)
    return value
}

function optionalString(record: Record<string, unknown>, key: string): string | null {
    const value = record[key]
    if (value == null) return null
    return requireString(value, key)
}

function optionalIso(record: Record<string, unknown>, key: string, path: string): string | null {
    const value = optionalString(record, key)
    if (!value) return null
    if (Number.isNaN(Date.parse(value))) fail(`${path}.${key} doit être une date valide.`)
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
    const id = nonEmptyString(template.id, `${path}.id`)
    if (id.startsWith('system:')) fail(`${path}.id ne doit pas référencer un template système.`)
    const columnMappings = requireArray(template.columnMappings, `${path}.columnMappings`)
    if (!columnMappings.length) fail(`${path}.columnMappings doit contenir au moins un mapping.`)

    return clone({
        ...template,
        id,
        name: nonEmptyString(template.name, `${path}.name`),
        sourceType: nonEmptyString(template.sourceType, `${path}.sourceType`),
        importType: nonEmptyString(template.importType, `${path}.importType`),
        provider: typeof template.provider === 'string' ? template.provider : null,
        columnMappings,
        isSystem: false,
        isPreset: false,
    } as unknown as ImportMappingTemplate)
}

function normalizeBatch(value: unknown, index: number): BudgetBackupImportBatch {
    const path = `data.importBackup.importHistory[${index}]`
    const batch = requireRecord(value, path)
    const rowCount = finiteNumber(batch.rowCount, `${path}.rowCount`)
    const errorCount = finiteNumber(batch.errorCount, `${path}.errorCount`)
    const duplicateCount = finiteNumber(batch.duplicateCount, `${path}.duplicateCount`)
    if (rowCount < 0 || errorCount < 0 || duplicateCount < 0) fail(`${path} contient des compteurs négatifs.`)

    return {
        id: nonEmptyString(batch.id, `${path}.id`),
        status: nonEmptyString(batch.status, `${path}.status`),
        importType: nonEmptyString(batch.importType, `${path}.importType`),
        provider: optionalString(batch, 'provider'),
        source: optionalString(batch, 'source'),
        fileName: optionalString(batch, 'fileName'),
        fileHash: optionalString(batch, 'fileHash'),
        defaultCurrency: optionalString(batch, 'defaultCurrency'),
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
    if (metadata.auditOnlyRestore != null && metadata.auditOnlyRestore !== true) fail('data.importBackup.metadata.auditOnlyRestore doit rester true.')
    if (metadata.financialDataNotRestoredFromImportHistory != null && metadata.financialDataNotRestoredFromImportHistory !== true) fail('data.importBackup.metadata.financialDataNotRestoredFromImportHistory doit rester true.')

    const mappingTemplates = requireArray(root.mappingTemplates ?? [], 'data.importBackup.mappingTemplates').map(normalizeTemplate)
    const importHistory = requireArray(root.importHistory ?? [], 'data.importBackup.importHistory').map(normalizeBatch)

    return {
        schemaVersion: 1,
        documentation: {
            included: stringArray(documentation.included ?? EMPTY_IMPORT_BACKUP.documentation.included, 'data.importBackup.documentation.included'),
            excluded: stringArray(documentation.excluded ?? EMPTY_IMPORT_BACKUP.documentation.excluded, 'data.importBackup.documentation.excluded'),
            notes: stringArray(documentation.notes ?? EMPTY_IMPORT_BACKUP.documentation.notes, 'data.importBackup.documentation.notes'),
        },
        mappingTemplates,
        importSources: stringArray(root.importSources ?? [], 'data.importBackup.importSources'),
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
    const version = finiteNumber(root.version, 'version')
    if (!Number.isInteger(version) || !(SUPPORTED_IMPORT_BACKUP_VERSIONS as readonly number[]).includes(version)) {
        fail(`Version de backup JSON non supportée (${version}). Versions supportées : ${SUPPORTED_IMPORT_BACKUP_VERSIONS.join(', ')}.`)
    }
    const integrityVerification = verifyBackupIntegrityManifest(root)
    return {root, version, integrityVerification}
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
    return `${JSON.stringify(withBackupIntegrityManifest(snapshot as unknown as Record<string, unknown>), null, 2)}\n`
}

export function parseBudgetBackupWithImportData(content: string): BudgetBackupWithImportDataSnapshot {
    const {root, version, integrityVerification} = parseRoot(content)
    const goalsSnapshot = parseBudgetBackupWithGoals(goalsCompatibleContent(root, version))
    const data = requireRecord(root.data, 'data')
    const importBackup = version >= IMPORT_BACKUP_FORMAT_VERSION ? normalizeImportBackup(data.importBackup) : clone(EMPTY_IMPORT_BACKUP)

    return {
        ...goalsSnapshot,
        version: IMPORT_BACKUP_FORMAT_VERSION,
        integrity: isRecord(root.integrity) ? root.integrity as unknown as BackupIntegrityManifest : undefined,
        integrityVerification,
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
