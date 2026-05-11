export {}

interface SecuritySettingsIpcResultDto<T> {
    ok: boolean
    data: T | null
    error: {code?: string; message?: string} | null
}

interface IntegrityCheckReportDto {
    ok: boolean
    generatedAt: string
    source: string
    reason: string | null
    issueCount: number
    summary: string
    totals: {
        info: number
        warning: number
        error: number
        critical: number
    }
    issues: Array<{
        level: string
        code: string
        message: string
        entityType: string
        entityId: string | number | null
        details?: Record<string, unknown>
    }>
}

interface SecretStorageInfoDto {
    backend?: string
    available?: boolean
    service?: string
    [key: string]: unknown
}

interface SecretMetadataDto {
    key?: string
    namespace?: string
    label?: string | null
    createdAt?: string | null
    updatedAt?: string | null
    [key: string]: unknown
}

declare global {
    interface Window {
        integrityCheck?: {
            run: (input?: {
                source?: string
                reason?: string
                auditCritical?: boolean
            }) => Promise<SecuritySettingsIpcResultDto<IntegrityCheckReportDto>>
        }
        secrets?: {
            getStorageInfo: () => Promise<SecuritySettingsIpcResultDto<SecretStorageInfoDto>>
            listSecretMetadata: (filters?: Record<string, unknown>) => Promise<SecuritySettingsIpcResultDto<SecretMetadataDto[]>>
        }
    }
}
