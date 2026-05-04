import type {
    ApplyImportInput,
    CreateImportBatchInput,
    CreateMappingTemplateInput,
    ImportContractResult,
    ImportDuplicateCandidate,
    ImportEntityId,
    ImportMappingTemplate,
    ImportPreviewResult,
    ImportRowValidationError,
    ParseImportFileInput,
    PreviewImportInput,
    UpdateMappingTemplateInput,
} from './imports'
import type {ImportReconciliationDecisionRecord} from '../utils/importReconciliationEngine'

export interface ImportIpcError {
    code: string
    message: string
    field?: string | null
    batchId?: ImportEntityId | null
    rowNumber?: number | null
    templateId?: ImportEntityId | null
    details?: unknown
    recoverable: boolean
}

export type ImportIpcResult<T> =
    | {ok: true; data: T; error: null}
    | {ok: false; data: null; error: ImportIpcError}

export interface ImportHistoryItem {
    id: ImportEntityId
    status: string
    importType: string
    provider?: string | null
    source?: string | null
    fileName?: string | null
    fileHash?: string | null
    rowCount: number
    errorCount: number
    warningCount?: number
    duplicateCount: number
    appliedRowCount?: number
    decisionCount?: number
    importedAt: string
    parsedAt?: string | null
    previewedAt?: string | null
    appliedAt?: string | null
    cancelledAt?: string | null
}

export interface ImportBatchDetail {
    id: ImportEntityId
    status: string
    importType: string
    provider?: string | null
    source?: string | null
    fileName?: string | null
    fileHash?: string | null
    defaultCurrency: string
    rowCount: number
    errorCount: number
    warningCount?: number
    duplicateCount: number
    rawRows: unknown[]
    normalizedRows: unknown[]
    errors: ImportRowValidationError[]
    warnings?: ImportRowValidationError[]
    duplicateCandidates: ImportDuplicateCandidate[]
    decisions: ImportReconciliationDecisionRecord[]
    appliedLinks: unknown[]
    preview?: ImportPreviewResult | null
    fileMetadata?: unknown
    template?: unknown
}

export interface ImportParseResult {
    batch: ImportBatchDetail
    parsed: {
        delimiter: string
        hasHeader: boolean
        headers: string[]
        rawRows: unknown[]
        normalizedRows: unknown[]
        errors: ImportRowValidationError[]
    }
}

export interface ImportApplyResult {
    batch: ImportBatchDetail
    appliedLinks: unknown[]
    decisions: ImportReconciliationDecisionRecord[]
}

export interface ImportAuditRestoreResult {
    ok: true
    restoredBatchCount: number
    skippedBatchCount: number
    idMap: Record<string, string>
    skippedBatches: Array<{id: ImportEntityId; reason: string}>
    mode: 'merge' | 'replace'
    auditOnly: true
}

export interface ImportWorkflowApi {
    createBatch(input: CreateImportBatchInput): Promise<ImportIpcResult<ImportBatchDetail>>
    parseFile(input: ParseImportFileInput): Promise<ImportIpcResult<ImportParseResult>>
    preview(input: PreviewImportInput): Promise<ImportIpcResult<ImportPreviewResult>>
    apply(input: ApplyImportInput): Promise<ImportIpcResult<ImportApplyResult>>
    cancel(batchId: ImportEntityId, reason?: string | null): Promise<ImportIpcResult<ImportBatchDetail>>
    listHistory(filters?: {status?: string; source?: string; importType?: string; from?: string; to?: string; search?: string}): Promise<ImportIpcResult<ImportHistoryItem[]>>
    getDetail(batchId: ImportEntityId): Promise<ImportIpcResult<ImportBatchDetail>>
    listErrors(batchId: ImportEntityId): Promise<ImportIpcResult<ImportRowValidationError[]>>
    listDuplicateCandidates(batchId: ImportEntityId): Promise<ImportIpcResult<ImportDuplicateCandidate[]>>
    listSources(): Promise<ImportIpcResult<string[]>>
    deleteHistory(batchId: ImportEntityId, options?: {preserveFinancialData?: boolean}): Promise<ImportIpcResult<unknown>>
    exportReport(batchId: ImportEntityId, options?: {format?: 'markdown' | 'csv'}): Promise<ImportIpcResult<{batchId: ImportEntityId; format: string; fileName: string; mimeType: string; content: string}>>
    restoreBackup(input: {importHistory: unknown[]; mode?: 'merge' | 'replace'}): Promise<ImportIpcResult<ImportAuditRestoreResult>>
    applyReconciliationDecisions(input: {batchId: ImportEntityId; decisions: ImportReconciliationDecisionRecord[]}): Promise<ImportIpcResult<ImportApplyResult>>
    mappingTemplate: {
        list(filters?: {sourceType?: string; importType?: string; search?: string; systemOnly?: boolean; userOnly?: boolean; includeInactive?: boolean}): Promise<ImportIpcResult<ImportMappingTemplate[]>>
        get(id: ImportEntityId): Promise<ImportIpcResult<ImportMappingTemplate>>
        create(data: CreateMappingTemplateInput): Promise<ImportIpcResult<ImportMappingTemplate>>
        update(id: ImportEntityId, data: UpdateMappingTemplateInput): Promise<ImportIpcResult<ImportMappingTemplate>>
        delete(id: ImportEntityId): Promise<ImportIpcResult<{ok: true; id: ImportEntityId; entityType: string; deleted: boolean}>>
        duplicate(id: ImportEntityId, overrides?: Partial<CreateMappingTemplateInput>): Promise<ImportIpcResult<ImportMappingTemplate>>
        validate(data: CreateMappingTemplateInput): Promise<ImportIpcResult<{valid: boolean; template: ImportMappingTemplate | null; errors: ImportIpcError[]; warnings: ImportIpcError[]}>>
        saveFromImport(input: unknown): Promise<ImportIpcResult<ImportMappingTemplate>>
    }
}

declare global {
    interface Window {
        imports: ImportWorkflowApi
    }
}

export type {ImportContractResult}
