import type {AuditEventListFilters, AuditEventRecord} from './audit'

type AuditIpcResult<T> = {
    ok: boolean
    data: T | null
    error: {code: string; message: string} | null
}

declare global {
    interface Window {
        auditLog: {
            list: (filters?: AuditEventListFilters) => Promise<AuditIpcResult<AuditEventRecord[]>>
            exportMarkdown: (filters?: AuditEventListFilters) => Promise<AuditIpcResult<string>>
            exportCsv: (filters?: AuditEventListFilters) => Promise<AuditIpcResult<string>>
            logBackupExported: (input: Record<string, unknown>) => Promise<AuditIpcResult<AuditEventRecord | null>>
            logRestoreDryRun: (input: Record<string, unknown>) => Promise<AuditIpcResult<AuditEventRecord | null>>
            logRestoreApplied: (input: Record<string, unknown>) => Promise<AuditIpcResult<AuditEventRecord | null>>
            logRestoreFailed: (input: Record<string, unknown>) => Promise<AuditIpcResult<AuditEventRecord | null>>
            getRetentionPolicy: () => Promise<AuditIpcResult<{mode: string; purgeSupported: boolean; description: string}>>
        }
    }
}

export {}
