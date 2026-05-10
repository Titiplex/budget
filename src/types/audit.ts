export const AUDIT_EVENT_TYPES = [
    'importApplied',
    'importCancelled',
    'importFailed',
    'backupExported',
    'encryptedBackupExported',
    'restoreDryRun',
    'restoreApplied',
    'restoreFailed',
    'criticalDelete',
    'bulkDelete',
    'credentialCreated',
    'credentialDeleted',
    'integrityCheckFailed',
    'migrationApplied',
] as const

export type AuditEventType = typeof AUDIT_EVENT_TYPES[number]

export const AUDIT_EVENT_SEVERITIES = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const
export type AuditEventSeverity = typeof AUDIT_EVENT_SEVERITIES[number]

export const AUDIT_EVENT_STATUSES = ['SUCCESS', 'FAILED', 'CANCELLED', 'BLOCKED'] as const
export type AuditEventStatus = typeof AUDIT_EVENT_STATUSES[number]

export const AUDIT_EVENT_DOMAINS = [
    'import',
    'backup',
    'restore',
    'transaction',
    'account',
    'category',
    'budget',
    'recurring',
    'wealth',
    'credential',
    'integrity',
    'migration',
    'system',
] as const

export type AuditEventDomain = typeof AUDIT_EVENT_DOMAINS[number]

export interface AuditEntityRef {
    type: string
    id: string | number
}

export type AuditMetadataValue = string | number | boolean | null | AuditMetadataValue[] | {[key: string]: AuditMetadataValue}
export type AuditMetadata = Record<string, AuditMetadataValue>

export interface AuditEventRecord {
    id: number
    eventType: AuditEventType
    timestamp: string
    domain: AuditEventDomain | string
    action: string
    severity: AuditEventSeverity
    summary: string
    entityIds: AuditEntityRef[]
    metadata: AuditMetadata | null
    source: string
    status: AuditEventStatus
}

export interface CreateAuditEventInput {
    eventType: AuditEventType
    domain: AuditEventDomain | string
    action: string
    severity?: AuditEventSeverity
    summary: string
    entityIds?: AuditEntityRef[]
    metadata?: AuditMetadata | null
    source?: string
    status?: AuditEventStatus
    timestamp?: string | Date
}

export interface AuditEventListFilters {
    eventType?: AuditEventType
    domain?: AuditEventDomain | string
    severity?: AuditEventSeverity
    status?: AuditEventStatus
    from?: string | Date
    to?: string | Date
    limit?: number
}
