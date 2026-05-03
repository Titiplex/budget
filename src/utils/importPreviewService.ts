import {
    ImportBusinessErrorCode,
    ImportDeduplicationStrategy,
    ImportErrorSeverity,
    ImportErrorStage,
    ImportRowStatus,
    ImportTargetEntityType,
    ImportType,
} from '../types/imports'
import type {
    ImportDuplicateCandidate,
    ImportEntityId,
    ImportMappingTemplate,
    ImportPreviewResult,
    ImportRowNormalized,
    ImportRowValidationError,
    ImportSource,
    JsonObject,
} from '../types/imports'
import type {NormalizedCsvImportData} from './importCsvEngine'

export type ImportPreviewPlannedAction =
    | 'createTransaction'
    | 'updateTransaction'
    | 'createAssetOperation'
    | 'skip'
    | 'needsReview'

export interface ImportPreviewConflict {
    code: string
    message: string
    field?: string | null
    details?: JsonObject | null
}

export interface ImportDryRunPreviewRow<TNormalized extends JsonObject = NormalizedCsvImportData> {
    rowNumber: number
    rowId?: ImportEntityId | null
    rawRowId?: ImportEntityId | null
    status: ImportRowStatus
    action: ImportPreviewPlannedAction
    targetEntityType: ImportTargetEntityType
    targetAccountId?: ImportEntityId | null
    targetPortfolioId?: ImportEntityId | null
    targetEntityId?: ImportEntityId | null
    reviewRequired: boolean
    reasons: string[]
    missingFields: string[]
    warnings: ImportRowValidationError[]
    errors: ImportRowValidationError[]
    duplicateCandidates: ImportDuplicateCandidate[]
    conflicts: ImportPreviewConflict[]
    normalizedData: TNormalized
}

export interface ImportDryRunPreviewStats {
    totalRows: number
    validRows: number
    invalidRows: number
    errorCount: number
    warningCount: number
    duplicateCount: number
    conflictCount: number
    missingDataCount: number
    needsReviewRows: number
    createTransactionRows: number
    updateTransactionRows: number
    createAssetOperationRows: number
    skippedRows: number
}

export interface ImportDryRunPreview<TNormalized extends JsonObject = NormalizedCsvImportData> {
    dryRun: true
    source?: Partial<ImportSource> | null
    template?: Pick<ImportMappingTemplate, 'id' | 'name' | 'importType' | 'sourceType'> | null
    targetAccountId?: ImportEntityId | null
    targetPortfolioId?: ImportEntityId | null
    defaultCurrency: string
    rows: ImportDryRunPreviewRow<TNormalized>[]
    readyRows: ImportDryRunPreviewRow<TNormalized>[]
    invalidRows: ImportDryRunPreviewRow<TNormalized>[]
    warnings: ImportRowValidationError[]
    blockingErrors: ImportRowValidationError[]
    duplicateCandidates: ImportDuplicateCandidate[]
    conflicts: ImportPreviewConflict[]
    stats: ImportDryRunPreviewStats
    canApply: boolean
    generatedAt: string
}

export interface ImportPreviewReadModel<TNormalized extends JsonObject = NormalizedCsvImportData> {
    findDuplicateCandidates?: (row: ImportRowNormalized<TNormalized>) => ImportDuplicateCandidate[] | Promise<ImportDuplicateCandidate[]>
    findConflicts?: (row: ImportRowNormalized<TNormalized>) => ImportPreviewConflict[] | Promise<ImportPreviewConflict[]>
}

export interface BuildImportDryRunPreviewInput<TNormalized extends JsonObject = NormalizedCsvImportData> {
    parsedFile?: Pick<ImportPreviewResult<TNormalized>, 'normalizedRows' | 'rawRows' | 'errors' | 'duplicateCandidates'>
    rows?: ImportRowNormalized<TNormalized>[]
    template?: Pick<ImportMappingTemplate, 'id' | 'name' | 'importType' | 'sourceType'> | null
    source?: Partial<ImportSource> | null
    targetAccountId?: ImportEntityId | null
    targetPortfolioId?: ImportEntityId | null
    defaultCurrency?: string
    duplicateCandidates?: ImportDuplicateCandidate[]
    readModel?: ImportPreviewReadModel<TNormalized>
    generatedAt?: string
}

function validationMessage(input: {
    rowNumber?: number
    stage: ImportErrorStage
    severity: ImportErrorSeverity
    code: ImportBusinessErrorCode | string
    message: string
    field?: string | null
    details?: JsonObject | null
}): ImportRowValidationError {
    return {
        rowNumber: input.rowNumber,
        stage: input.stage,
        severity: input.severity,
        code: input.code,
        message: input.message,
        field: input.field ?? null,
        details: input.details ?? null,
    }
}

function asImportType(template?: Pick<ImportMappingTemplate, 'importType'> | null) {
    const value = String(template?.importType || ImportType.Transactions)
    return value as ImportType
}

function isInvestmentLike(row: ImportRowNormalized<JsonObject>, importType: ImportType) {
    const data = row.normalizedData || {}
    return importType === ImportType.Investments
        || importType === ImportType.Mixed
        || row.targetKind === ImportTargetEntityType.InvestmentMovement
        || Boolean(data.symbol || data.quantity || data.unitPrice || data.operationType)
}

function rowMessages(row: ImportRowNormalized<JsonObject>) {
    const messages = row.validationErrors || []
    return {
        errors: messages.filter((message) => message.severity === ImportErrorSeverity.Error),
        warnings: messages.filter((message) => message.severity !== ImportErrorSeverity.Error),
    }
}

function getDuplicateCandidatesForRow<TNormalized extends JsonObject>(
    row: ImportRowNormalized<TNormalized>,
    parsedDuplicates: ImportDuplicateCandidate[],
    externalDuplicates: ImportDuplicateCandidate[],
) {
    const rowId = row.id == null ? null : String(row.id)
    const rowDuplicates = [
        ...(row.duplicateCandidates || []),
        ...parsedDuplicates.filter((candidate) => candidate.normalizedRowId != null && String(candidate.normalizedRowId) === rowId),
        ...externalDuplicates.filter((candidate) => candidate.normalizedRowId == null || String(candidate.normalizedRowId) === rowId),
    ]

    const seen = new Set<string>()
    return rowDuplicates.filter((candidate) => {
        const key = `${candidate.entityType}:${candidate.entityId ?? ''}:${candidate.confidence}:${candidate.reason ?? ''}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

function missingFieldsFor(row: ImportRowNormalized<JsonObject>, importType: ImportType, targetAccountId?: ImportEntityId | null, targetPortfolioId?: ImportEntityId | null) {
    const data = row.normalizedData || {}
    const missing: string[] = []

    if (!data.date && !row.transactionDate) missing.push('date')
    if (!data.currency && !row.currency) missing.push('currency')

    if (importType === ImportType.Investments || isInvestmentLike(row, importType)) {
        if (!data.operationType) missing.push('operationType')
        if (!data.amount && !(data.quantity && data.unitPrice)) missing.push('amount|quantity+unitPrice')
        if (['BUY', 'SELL', 'DIVIDEND', 'INTEREST'].includes(String(data.operationType || '').toUpperCase()) && !data.symbol) missing.push('symbol')
        if (!targetPortfolioId && !data.accountName && !data.sourceName) missing.push('targetPortfolioOrSource')
    } else if (importType === ImportType.Assets) {
        if (!data.label && !data.symbol) missing.push('label|symbol')
        if (!data.amount && !data.unitPrice) missing.push('amount|unitPrice')
    } else {
        if (data.amount == null && row.amount == null) missing.push('amount')
        if (!targetAccountId && !data.accountName) missing.push('targetAccountOrAccountName')
    }

    return missing
}

function localConflictsFor(row: ImportRowNormalized<JsonObject>, defaultCurrency: string) {
    const data = row.normalizedData || {}
    const conflicts: ImportPreviewConflict[] = []
    const currency = String(data.currency || row.currency || defaultCurrency || '').toUpperCase()
    if (currency && !/^[A-Z]{3}$/.test(currency)) {
        conflicts.push({
            code: 'invalidCurrencyShape',
            message: 'La devise normalisée ne ressemble pas à un code ISO à 3 lettres.',
            field: 'currency',
            details: {currency},
        })
    }

    const operationType = String(data.operationType || '').toUpperCase()
    if (['BUY', 'SELL'].includes(operationType) && data.amount != null && data.quantity != null && data.unitPrice != null) {
        const expected = Math.abs(Number(data.quantity) * Number(data.unitPrice))
        const actual = Math.abs(Number(data.amount))
        if (Number.isFinite(expected) && Number.isFinite(actual) && Math.abs(expected - actual) > Math.max(0.01, expected * 0.02)) {
            conflicts.push({
                code: 'amountQuantityPriceMismatch',
                message: 'Le montant ne correspond pas à quantité × prix unitaire.',
                field: 'amount',
                details: {amount: data.amount, quantity: data.quantity, unitPrice: data.unitPrice, expected},
            })
        }
    }

    return conflicts
}

function duplicateReviewReason(candidate: ImportDuplicateCandidate) {
    if (candidate.strategy === ImportDeduplicationStrategy.Strict || candidate.confidence >= 0.98) {
        return 'Doublon très probable trouvé; une mise à jour/fusion est prévue.'
    }
    return 'Doublon probable trouvé; validation manuelle requise.'
}

function chooseAction(input: {
    row: ImportRowNormalized<JsonObject>
    importType: ImportType
    errors: ImportRowValidationError[]
    warnings: ImportRowValidationError[]
    missingFields: string[]
    duplicates: ImportDuplicateCandidate[]
    conflicts: ImportPreviewConflict[]
}) {
    const {row, importType, errors, warnings, missingFields, duplicates, conflicts} = input
    const reasons: string[] = []

    if (row.status === ImportRowStatus.Skipped) {
        return {action: 'skip' as ImportPreviewPlannedAction, reviewRequired: false, reasons: ['Ligne déjà marquée comme ignorée.']}
    }

    if (errors.length > 0 || row.status === ImportRowStatus.Invalid) {
        return {action: 'skip' as ImportPreviewPlannedAction, reviewRequired: false, reasons: errors.map((entry) => entry.message)}
    }

    if (missingFields.length > 0) {
        reasons.push(`Données manquantes: ${missingFields.join(', ')}.`)
    }
    if (conflicts.length > 0) {
        reasons.push(...conflicts.map((conflict) => conflict.message))
    }
    if (warnings.length > 0) {
        reasons.push(...warnings.map((warning) => warning.message))
    }

    const strongestDuplicate = [...duplicates].sort((a, b) => b.confidence - a.confidence)[0]
    if (strongestDuplicate) reasons.push(duplicateReviewReason(strongestDuplicate))

    if (missingFields.length > 0 || conflicts.length > 0) {
        return {action: 'needsReview' as ImportPreviewPlannedAction, reviewRequired: true, reasons}
    }

    if (strongestDuplicate) {
        if (strongestDuplicate.confidence >= 0.98 && strongestDuplicate.entityType === ImportTargetEntityType.Transaction) {
            return {action: 'updateTransaction' as ImportPreviewPlannedAction, reviewRequired: false, reasons}
        }
        return {action: 'needsReview' as ImportPreviewPlannedAction, reviewRequired: true, reasons}
    }

    if (isInvestmentLike(row, importType)) {
        return {action: 'createAssetOperation' as ImportPreviewPlannedAction, reviewRequired: false, reasons: reasons.length ? reasons : ['Opération d’actif prête à être créée.']}
    }

    return {action: 'createTransaction' as ImportPreviewPlannedAction, reviewRequired: false, reasons: reasons.length ? reasons : ['Transaction prête à être créée.']}
}

async function resolveReadModelDuplicates<TNormalized extends JsonObject>(
    row: ImportRowNormalized<TNormalized>,
    readModel?: ImportPreviewReadModel<TNormalized>,
) {
    return readModel?.findDuplicateCandidates ? await readModel.findDuplicateCandidates(row) : []
}

async function resolveReadModelConflicts<TNormalized extends JsonObject>(
    row: ImportRowNormalized<TNormalized>,
    readModel?: ImportPreviewReadModel<TNormalized>,
) {
    return readModel?.findConflicts ? await readModel.findConflicts(row) : []
}

export async function buildImportDryRunPreview<TNormalized extends JsonObject = NormalizedCsvImportData>(
    input: BuildImportDryRunPreviewInput<TNormalized>,
): Promise<ImportDryRunPreview<TNormalized>> {
    const rows = input.rows || input.parsedFile?.normalizedRows || []
    const importType = asImportType(input.template)
    const defaultCurrency = String(input.defaultCurrency || 'CAD').toUpperCase()
    const parsedDuplicates = input.parsedFile?.duplicateCandidates || []
    const globalDuplicates = input.duplicateCandidates || []
    const previewRows: ImportDryRunPreviewRow<TNormalized>[] = []

    for (const row of rows) {
        const {errors, warnings} = rowMessages(row as ImportRowNormalized<JsonObject>)
        const readModelDuplicates = await resolveReadModelDuplicates(row, input.readModel)
        const duplicateCandidates = getDuplicateCandidatesForRow(row, parsedDuplicates, [...globalDuplicates, ...readModelDuplicates])
        const localConflicts = localConflictsFor(row as ImportRowNormalized<JsonObject>, defaultCurrency)
        const readModelConflicts = await resolveReadModelConflicts(row, input.readModel)
        const conflicts = [...localConflicts, ...readModelConflicts]
        const missingFields = missingFieldsFor(row as ImportRowNormalized<JsonObject>, importType, input.targetAccountId, input.targetPortfolioId)
        const decision = chooseAction({
            row: row as ImportRowNormalized<JsonObject>,
            importType,
            errors,
            warnings,
            missingFields,
            duplicates: duplicateCandidates,
            conflicts,
        })
        const strongestDuplicate = [...duplicateCandidates].sort((a, b) => b.confidence - a.confidence)[0]
        const targetEntityType = isInvestmentLike(row as ImportRowNormalized<JsonObject>, importType)
            ? ImportTargetEntityType.InvestmentMovement
            : ImportTargetEntityType.Transaction

        previewRows.push({
            rowNumber: row.rowNumber,
            rowId: row.id ?? null,
            rawRowId: row.rawRowId ?? null,
            status: row.status,
            action: decision.action,
            targetEntityType,
            targetAccountId: input.targetAccountId ?? null,
            targetPortfolioId: input.targetPortfolioId ?? null,
            targetEntityId: decision.action === 'updateTransaction' ? strongestDuplicate?.entityId ?? null : null,
            reviewRequired: decision.reviewRequired,
            reasons: decision.reasons,
            missingFields,
            warnings,
            errors,
            duplicateCandidates,
            conflicts,
            normalizedData: row.normalizedData,
        })
    }

    const warnings = previewRows.flatMap((row) => row.warnings)
    const blockingErrors = [
        ...(input.parsedFile?.errors || []),
        ...previewRows.flatMap((row) => row.errors),
        ...previewRows.flatMap((row) => row.missingFields.map((field) => validationMessage({
            rowNumber: row.rowNumber,
            stage: ImportErrorStage.Validation,
            severity: ImportErrorSeverity.Error,
            code: ImportBusinessErrorCode.IncompleteMapping,
            message: `Donnée manquante pour la preview: ${field}.`,
            field,
        }))),
    ]
    const duplicateCandidates = previewRows.flatMap((row) => row.duplicateCandidates)
    const conflicts = previewRows.flatMap((row) => row.conflicts)
    const stats: ImportDryRunPreviewStats = {
        totalRows: previewRows.length,
        validRows: previewRows.filter((row) => row.action !== 'skip').length,
        invalidRows: previewRows.filter((row) => row.action === 'skip').length,
        errorCount: blockingErrors.length,
        warningCount: warnings.length,
        duplicateCount: previewRows.filter((row) => row.duplicateCandidates.length > 0).length,
        conflictCount: previewRows.filter((row) => row.conflicts.length > 0).length,
        missingDataCount: previewRows.filter((row) => row.missingFields.length > 0).length,
        needsReviewRows: previewRows.filter((row) => row.action === 'needsReview').length,
        createTransactionRows: previewRows.filter((row) => row.action === 'createTransaction').length,
        updateTransactionRows: previewRows.filter((row) => row.action === 'updateTransaction').length,
        createAssetOperationRows: previewRows.filter((row) => row.action === 'createAssetOperation').length,
        skippedRows: previewRows.filter((row) => row.action === 'skip').length,
    }

    return {
        dryRun: true,
        source: input.source ?? null,
        template: input.template ?? null,
        targetAccountId: input.targetAccountId ?? null,
        targetPortfolioId: input.targetPortfolioId ?? null,
        defaultCurrency,
        rows: previewRows,
        readyRows: previewRows.filter((row) => ['createTransaction', 'updateTransaction', 'createAssetOperation'].includes(row.action)),
        invalidRows: previewRows.filter((row) => row.action === 'skip'),
        warnings,
        blockingErrors,
        duplicateCandidates,
        conflicts,
        stats,
        canApply: previewRows.some((row) => ['createTransaction', 'updateTransaction', 'createAssetOperation'].includes(row.action)),
        generatedAt: input.generatedAt || new Date(0).toISOString(),
    }
}

export function assertDryRunReadModel(readModel: unknown) {
    const forbiddenMethods = ['create', 'createTransaction', 'update', 'updateTransaction', 'delete', 'deleteTransaction', 'upsert', 'apply']
    const methods = Object.keys(Object(readModel))
    const found = methods.filter((method) => forbiddenMethods.includes(method))
    if (found.length > 0) {
        return {
            safe: false,
            forbiddenMethods: found,
            message: `Le read model de preview expose des méthodes d’écriture interdites: ${found.join(', ')}.`,
        }
    }
    return {safe: true, forbiddenMethods: [], message: 'Read model compatible dry-run.'}
}
