export type ImportEntityId = string | number
export type IsoDateString = string

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonArray
export type JsonObject = {[key: string]: JsonValue}
export type JsonArray = JsonValue[]

export enum ImportSourceType {
    ManualFile = 'manualFile',
    CsvFile = 'csvFile',
    OfxFile = 'ofxFile',
    QifFile = 'qifFile',
    Api = 'api',
    Sync = 'sync',
    Other = 'other',
}

export enum ImportType {
    Transactions = 'transactions',
    Assets = 'assets',
    Investments = 'investments',
    NetWorth = 'netWorth',
    Mixed = 'mixed',
    Other = 'other',
}

export enum ImportBatchStatus {
    Draft = 'draft',
    Parsed = 'parsed',
    Previewed = 'previewed',
    PartiallyApplied = 'partiallyApplied',
    Applied = 'applied',
    Failed = 'failed',
    Cancelled = 'cancelled',
}

export enum ImportRowStatus {
    Raw = 'raw',
    Normalized = 'normalized',
    Valid = 'valid',
    Invalid = 'invalid',
    Duplicate = 'duplicate',
    Reconciled = 'reconciled',
    Applied = 'applied',
    Skipped = 'skipped',
}

export enum ImportErrorStage {
    Parsing = 'parsing',
    Normalization = 'normalization',
    Validation = 'validation',
    Reconciliation = 'reconciliation',
    Apply = 'apply',
}

export enum ImportErrorSeverity {
    Info = 'info',
    Warning = 'warning',
    Error = 'error',
}

export enum ImportDeduplicationStrategy {
    None = 'none',
    Strict = 'strict',
    Fuzzy = 'fuzzy',
    ExternalReference = 'externalReference',
    ManualReview = 'manualReview',
}

export enum ImportReconciliationDecisionType {
    Create = 'create',
    Update = 'update',
    LinkExisting = 'linkExisting',
    SkipDuplicate = 'skipDuplicate',
    Ignore = 'ignore',
    ReviewManually = 'reviewManually',
}

export enum ImportReconciliationDecisionStatus {
    Pending = 'pending',
    Accepted = 'accepted',
    Rejected = 'rejected',
    Applied = 'applied',
    Superseded = 'superseded',
}

export enum ImportBusinessErrorCode {
    UnsupportedFormat = 'unsupportedFormat',
    MissingColumn = 'missingColumn',
    InvalidDate = 'invalidDate',
    InvalidAmount = 'invalidAmount',
    InvalidCurrency = 'invalidCurrency',
    ProbableDuplicate = 'probableDuplicate',
    IncompleteMapping = 'incompleteMapping',
    ValidationFailed = 'validationFailed',
    ApplyFailed = 'applyFailed',
}

export enum ImportTargetEntityType {
    Transaction = 'transaction',
    Asset = 'asset',
    Portfolio = 'portfolio',
    Holding = 'holding',
    InvestmentMovement = 'investmentMovement',
    PriceSnapshot = 'priceSnapshot',
    Unknown = 'unknown',
}

export enum ImportAppliedOperation {
    Created = 'created',
    Updated = 'updated',
    Linked = 'linked',
    Skipped = 'skipped',
}

export enum ImportMappingFieldType {
    String = 'string',
    Number = 'number',
    Date = 'date',
    Currency = 'currency',
    Boolean = 'boolean',
    Json = 'json',
}

export enum ImportConnectorCapability {
    ParseFile = 'parseFile',
    Preview = 'preview',
    Apply = 'apply',
    DetectDuplicates = 'detectDuplicates',
    Reconcile = 'reconcile',
    MappingTemplates = 'mappingTemplates',
    IncrementalSync = 'incrementalSync',
    Offline = 'offline',
}

export interface ImportFileMetadata {
    fileName: string
    fileHash?: string
    mimeType?: string
    extension?: string
    encoding?: string
    sizeBytes?: number
    importedAt?: IsoDateString
    rowCount?: number
    provider?: string
    sourceType?: ImportSourceType
    metadata?: JsonObject
}

export interface ImportSource {
    id?: ImportEntityId
    sourceKey: string
    name: string
    provider: string
    sourceType: ImportSourceType
    importType: ImportType
    defaultCurrency: string
    defaultAccountId?: ImportEntityId | null
    externalSourceId?: string | null
    isActive: boolean
    metadata?: JsonObject | null
    note?: string | null
    createdAt?: IsoDateString
    updatedAt?: IsoDateString
}

export interface ImportBatch {
    id?: ImportEntityId
    sourceId?: ImportEntityId | null
    status: ImportBatchStatus
    importType: ImportType
    provider?: string | null
    fileName?: string | null
    fileHash?: string | null
    defaultCurrency: string
    parserVersion?: string | null
    fileMetadata?: ImportFileMetadata | null
    sourceMetadata?: JsonObject | null
    retentionPolicy?: ImportRetentionPolicy | null
    rowCount: number
    errorCount: number
    duplicateCount: number
    importedAt: IsoDateString
    parsedAt?: IsoDateString | null
    previewedAt?: IsoDateString | null
    appliedAt?: IsoDateString | null
    cancelledAt?: IsoDateString | null
    note?: string | null
    restoredFromBackup?: boolean
    restoredAt?: IsoDateString
    restoredAsAuditOnly?: boolean
    originalBackupBatchId?: ImportEntityId
}

export interface ImportRetentionPolicy {
    strategy: 'keepAll' | 'deleteBatchCascadeKeepAppliedEntities' | 'redactRawRows' | 'manualCleanup'
    keepRawRowsUntil?: IsoDateString | null
    redactFields?: string[]
    metadata?: JsonObject
}

export interface ImportRowRaw {
    id?: ImportEntityId
    batchId?: ImportEntityId
    rowNumber: number
    rawText?: string | null
    rawFields?: Record<string, string | number | boolean | null>
    rawJson: JsonObject
    rawHash?: string | null
    status: ImportRowStatus
    createdAt?: IsoDateString
    updatedAt?: IsoDateString
}

export interface ImportRowNormalized<TNormalized extends JsonObject = JsonObject> {
    id?: ImportEntityId
    batchId?: ImportEntityId
    rawRowId?: ImportEntityId | null
    rowNumber: number
    status: ImportRowStatus
    targetKind: ImportTargetEntityType
    normalizedData: TNormalized
    transactionDate?: IsoDateString | null
    label?: string | null
    amount?: number | null
    currency?: string | null
    accountName?: string | null
    externalRef?: string | null
    duplicateKey?: string | null
    duplicateConfidence?: number | null
    validationErrors?: ImportRowValidationError[]
    duplicateCandidates?: ImportDuplicateCandidate[]
    createdAt?: IsoDateString
    updatedAt?: IsoDateString
}

export interface ImportRowValidationError {
    id?: ImportEntityId
    batchId?: ImportEntityId
    rawRowId?: ImportEntityId | null
    normalizedRowId?: ImportEntityId | null
    rowNumber?: number
    stage: ImportErrorStage
    severity: ImportErrorSeverity
    code: ImportBusinessErrorCode | string
    message: string
    field?: string | null
    details?: JsonObject | null
    createdAt?: IsoDateString
}

export interface ImportDuplicateCandidate {
    id?: ImportEntityId
    normalizedRowId?: ImportEntityId
    entityType: ImportTargetEntityType
    entityId?: ImportEntityId | null
    confidence: number
    strategy: ImportDeduplicationStrategy
    reason?: string | null
    matchFields: string[]
    candidateSnapshot?: JsonObject | null
}

export interface ImportReconciliationDecision {
    id?: ImportEntityId
    batchId?: ImportEntityId
    normalizedRowId: ImportEntityId
    type: ImportReconciliationDecisionType
    status: ImportReconciliationDecisionStatus
    confidence?: number | null
    targetEntityType?: ImportTargetEntityType | null
    targetEntityId?: ImportEntityId | null
    reason?: string | null
    payload?: JsonObject | null
    decidedBy?: string | null
    decidedAt?: IsoDateString | null
    createdAt?: IsoDateString
    updatedAt?: IsoDateString
}

export interface ImportAppliedLink {
    id?: ImportEntityId
    batchId?: ImportEntityId
    normalizedRowId?: ImportEntityId | null
    decisionId?: ImportEntityId | null
    entityType: ImportTargetEntityType.Transaction | ImportTargetEntityType.Asset
    operation: ImportAppliedOperation
    entityId?: ImportEntityId | null
    transactionId?: ImportEntityId | null
    assetId?: ImportEntityId | null
    entitySnapshot?: JsonObject | null
    appliedAt: IsoDateString
    createdAt?: IsoDateString
    updatedAt?: IsoDateString
}

export interface ImportPreviewSummary {
    totalRows: number
    rawRows: number
    normalizedRows: number
    validRows: number
    invalidRows: number
    duplicateRows: number
    errorCount: number
    warningCount: number
}

export interface ImportPreviewResult<TNormalized extends JsonObject = JsonObject> {
    batch: ImportBatch
    summary: ImportPreviewSummary
    rawRows?: ImportRowRaw[]
    normalizedRows: ImportRowNormalized<TNormalized>[]
    errors: ImportRowValidationError[]
    duplicateCandidates: ImportDuplicateCandidate[]
    decisions?: ImportReconciliationDecision[]
    canApply: boolean
}

export interface ImportApplySummary {
    requestedRows: number
    createdCount: number
    updatedCount: number
    linkedCount: number
    skippedCount: number
    failedCount: number
}

export interface ImportApplyResult {
    batchId: ImportEntityId
    status: ImportBatchStatus.Applied | ImportBatchStatus.PartiallyApplied | ImportBatchStatus.Failed
    appliedAt: IsoDateString
    summary: ImportApplySummary
    appliedLinks: ImportAppliedLink[]
    errors: ImportRowValidationError[]
}

export interface ImportColumnMapping {
    sourceColumn: string
    targetField: string
    fieldType: ImportMappingFieldType
    required?: boolean
    defaultValue?: JsonValue
    transformName?: string | null
    metadata?: JsonObject
}

export interface ImportMappingTemplate {
    id?: ImportEntityId
    name: string
    sourceType: ImportSourceType
    importType: ImportType
    provider?: string | null
    delimiter?: string | null
    hasHeader?: boolean
    defaultCurrency?: string
    dateFormat?: string
    decimalSeparator?: string
    columnMappings: ImportColumnMapping[]
    defaultValues?: JsonObject
    deduplicationStrategy: ImportDeduplicationStrategy
    metadata?: JsonObject | null
    version?: number
    isSystem?: boolean
    isPreset?: boolean
    isActive?: boolean
    notes?: string
    universalCompatibility?: boolean
    createdAt?: IsoDateString
    updatedAt?: IsoDateString
}

export interface ImportConnector {
    id: string
    name: string
    provider: string
    sourceType: ImportSourceType
    supportedImportTypes: ImportType[]
    capabilities: ImportConnectorCapability[]
    supportedExtensions?: string[]
    supportedMimeTypes?: string[]
    defaultCurrency?: string
    version?: string
    metadata?: JsonObject
}

export interface ImportOptions {
    preserveRawRows?: boolean
    deduplicationStrategy?: ImportDeduplicationStrategy
    strictMapping?: boolean
    dryRun?: boolean
    locale?: string
    timezone?: string
    metadata?: JsonObject
}

export interface CreateImportBatchInput {
    sourceId?: ImportEntityId | null
    source?: Omit<ImportSource, 'id' | 'createdAt' | 'updatedAt'>
    importType: ImportType
    defaultCurrency?: string
    fileMetadata: ImportFileMetadata
    mappingTemplateId?: ImportEntityId | null
    options?: ImportOptions
}

export interface ParseImportFileInput {
    batchId: ImportEntityId
    fileMetadata: ImportFileMetadata
    rawText?: string
    filePath?: string
    fileBufferBase64?: string
    mappingTemplateId?: ImportEntityId | null
    options?: ImportOptions
}

export interface PreviewImportInput {
    batchId: ImportEntityId
    mappingTemplateId?: ImportEntityId | null
    deduplicationStrategy?: ImportDeduplicationStrategy
    decisions?: ImportReconciliationDecision[]
    limit?: number
    options?: ImportOptions
}

export interface ApplyImportInput {
    batchId: ImportEntityId
    decisions: ImportReconciliationDecision[]
    applyOnlyRowIds?: ImportEntityId[]
    applyOnlyValidRows?: boolean
    allowPartialApply?: boolean
    dryRun?: boolean
    appliedBy?: string
}

export interface CreateMappingTemplateInput {
    name: string
    sourceType: ImportSourceType
    importType: ImportType
    provider?: string | null
    delimiter?: string | null
    hasHeader?: boolean
    defaultCurrency?: string
    dateFormat?: string
    decimalSeparator?: string
    columnMappings: ImportColumnMapping[]
    defaultValues?: JsonObject
    deduplicationStrategy?: ImportDeduplicationStrategy
    metadata?: JsonObject | null
}

export interface UpdateMappingTemplateInput {
    id: ImportEntityId
    name?: string
    provider?: string | null
    delimiter?: string | null
    hasHeader?: boolean
    defaultCurrency?: string
    dateFormat?: string
    decimalSeparator?: string
    columnMappings?: ImportColumnMapping[]
    defaultValues?: JsonObject
    deduplicationStrategy?: ImportDeduplicationStrategy
    metadata?: JsonObject | null
}

export interface ImportBusinessError {
    code: ImportBusinessErrorCode | string
    severity: ImportErrorSeverity
    message: string
    field?: string | null
    rowNumber?: number
    details?: JsonObject | null
    recoverable: boolean
}

export type ImportContractResult<T> =
    | {ok: true; data: T; warnings?: ImportBusinessError[]}
    | {ok: false; errors: ImportBusinessError[]}
