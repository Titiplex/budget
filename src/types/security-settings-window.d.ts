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

declare global {
    interface Window {
        appShell: Window['appShell'] & {
            sendMenuCommand?: (command: string) => void
        }
        integrityCheck?: {
            run: (input?: {
                source?: string
                reason?: string
                auditCritical?: boolean
            }) => Promise<SecuritySettingsIpcResultDto<IntegrityCheckReportDto>>
        }
    }
}
