export {}

type IntegrityLevelDto = 'info' | 'warning' | 'error' | 'critical'

interface IntegrityIssueDto {
    level: IntegrityLevelDto
    code: string
    message: string
    entityType: string
    entityId: string | number | null
    details: Record<string, unknown>
}

interface IntegrityCheckReportDto {
    ok: boolean
    generatedAt: string
    source: string
    reason: string | null
    totals: Record<IntegrityLevelDto, number>
    issueCount: number
    issues: IntegrityIssueDto[]
    summary: string
}

interface IntegrityCheckIpcResultDto<T> {
    ok: boolean
    data: T | null
    error: {code: string; message: string} | null
}

declare global {
    interface Window {
        integrityCheck?: {
            run: (input?: {
                source?: string
                reason?: string
                auditCritical?: boolean
            }) => Promise<IntegrityCheckIpcResultDto<IntegrityCheckReportDto>>
        }
    }
}
