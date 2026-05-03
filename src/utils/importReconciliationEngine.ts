import {ImportAppliedOperation, ImportTargetEntityType} from '../types/imports'
import type {ImportAppliedLink, ImportEntityId, ImportRowNormalized, JsonObject} from '../types/imports'
import type {ImportDryRunPreview, ImportDryRunPreviewRow} from './importPreviewService'

export type ImportReconciliationDecisionKind =
    | 'importAsNew'
    | 'linkToExisting'
    | 'updateExisting'
    | 'skip'
    | 'markAsDuplicate'
    | 'needsManualReview'

export type ImportReconciliationReasonSource = 'automatic' | 'user' | 'rule' | 'template'
export type ImportReconciliationDecisionStatus = 'pending' | 'validated' | 'applied' | 'failed'
export type ImportReconciliationTargetType = ImportTargetEntityType | 'account' | 'portfolio' | 'assetOperation'

export interface ImportReconciliationHistoryEntry {
    at: string
    actor: string
    status: ImportReconciliationDecisionStatus
    message: string
    metadata?: JsonObject | null
}

export interface ImportReconciliationDecisionRecord {
    id: ImportEntityId
    batchId?: ImportEntityId | null
    normalizedRowId?: ImportEntityId | null
    rowNumber: number
    kind: ImportReconciliationDecisionKind
    status: ImportReconciliationDecisionStatus
    targetEntityType?: ImportReconciliationTargetType | null
    targetEntityId?: ImportEntityId | null
    payload?: JsonObject | null
    reason: string
    reasonSource: ImportReconciliationReasonSource
    decidedBy?: string | null
    decidedAt?: string | null
    createdAt: string
    updatedAt: string
    history: ImportReconciliationHistoryEntry[]
}

export interface ImportReconciliationValidationIssue {
    code: string
    message: string
    field?: string | null
    rowNumber?: number | null
    decisionId?: ImportEntityId | null
}

export interface ImportReconciliationValidationResult {
    valid: boolean
    issues: ImportReconciliationValidationIssue[]
}

export interface ImportReconciliationApplyResult {
    ok: boolean
    appliedAt: string
    appliedDecisions: ImportReconciliationDecisionRecord[]
    appliedLinks: ImportAppliedLink[]
    errors: ImportReconciliationValidationIssue[]
}

export interface ImportReconciliationRepository {
    persistDecision: (decision: ImportReconciliationDecisionRecord) => Promise<ImportReconciliationDecisionRecord>
    persistAppliedLink: (link: ImportAppliedLink) => Promise<ImportAppliedLink>
    createEntity?: (row: ImportRowNormalized<JsonObject>, decision: ImportReconciliationDecisionRecord) => Promise<{entityType: ImportTargetEntityType; entityId: ImportEntityId; snapshot?: JsonObject | null}>
    linkExisting?: (row: ImportRowNormalized<JsonObject>, decision: ImportReconciliationDecisionRecord) => Promise<{entityType: ImportTargetEntityType; entityId: ImportEntityId; snapshot?: JsonObject | null}>
    updateExisting?: (row: ImportRowNormalized<JsonObject>, decision: ImportReconciliationDecisionRecord) => Promise<{entityType: ImportTargetEntityType; entityId: ImportEntityId; snapshot?: JsonObject | null}>
    markSkipped?: (row: ImportRowNormalized<JsonObject>, decision: ImportReconciliationDecisionRecord) => Promise<void>
    transaction?: <T>(operation: (repository: ImportReconciliationRepository) => Promise<T>) => Promise<T>
}

export interface CreateReconciliationDecisionInput {
    id?: ImportEntityId
    batchId?: ImportEntityId | null
    row: Pick<ImportRowNormalized<JsonObject>, 'id' | 'rowNumber' | 'normalizedData'>
    kind: ImportReconciliationDecisionKind
    targetEntityType?: ImportReconciliationTargetType | null
    targetEntityId?: ImportEntityId | null
    payload?: JsonObject | null
    reason: string
    reasonSource: ImportReconciliationReasonSource
    decidedBy?: string | null
    decidedAt?: string | null
    now?: string
}

let nextDecisionCounter = 1

function makeDecisionId() {
    nextDecisionCounter += 1
    return `decision-${nextDecisionCounter}`
}

function nowIso(value?: string) {
    return value || new Date(0).toISOString()
}

function asTargetEntityType(value?: ImportReconciliationTargetType | null): ImportTargetEntityType {
    if (value === ImportTargetEntityType.Asset || value === 'assetOperation') return ImportTargetEntityType.Asset
    return ImportTargetEntityType.Transaction
}

function historyEntry(input: {actor?: string | null; status: ImportReconciliationDecisionStatus; message: string; at: string; metadata?: JsonObject | null}): ImportReconciliationHistoryEntry {
    return {at: input.at, actor: input.actor || 'system', status: input.status, message: input.message, metadata: input.metadata ?? null}
}

export function createReconciliationDecision(input: CreateReconciliationDecisionInput): ImportReconciliationDecisionRecord {
    const timestamp = nowIso(input.now)
    return {
        id: input.id || makeDecisionId(),
        batchId: input.batchId ?? null,
        normalizedRowId: input.row.id ?? null,
        rowNumber: input.row.rowNumber,
        kind: input.kind,
        status: 'pending',
        targetEntityType: input.targetEntityType ?? null,
        targetEntityId: input.targetEntityId ?? null,
        payload: input.payload ?? null,
        reason: input.reason,
        reasonSource: input.reasonSource,
        decidedBy: input.decidedBy ?? null,
        decidedAt: input.decidedAt ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
        history: [historyEntry({actor: input.decidedBy, status: 'pending', message: input.reason, at: timestamp, metadata: {reasonSource: input.reasonSource}})],
    }
}

function issue(input: {code: string; message: string; field?: string | null; rowNumber?: number | null; decisionId?: ImportEntityId | null}): ImportReconciliationValidationIssue {
    return {code: input.code, message: input.message, field: input.field ?? null, rowNumber: input.rowNumber ?? null, decisionId: input.decisionId ?? null}
}

export function validateReconciliationDecision(decision: ImportReconciliationDecisionRecord, row?: ImportRowNormalized<JsonObject>): ImportReconciliationValidationResult {
    const issues: ImportReconciliationValidationIssue[] = []
    if (!decision.reason?.trim()) issues.push(issue({code: 'missingDecisionReason', message: 'La décision doit conserver une raison compréhensible.', field: 'reason', rowNumber: decision.rowNumber, decisionId: decision.id}))
    if (!['automatic', 'user', 'rule', 'template'].includes(decision.reasonSource)) issues.push(issue({code: 'invalidReasonSource', message: 'La source de la décision est invalide.', field: 'reasonSource', rowNumber: decision.rowNumber, decisionId: decision.id}))
    if (['linkToExisting', 'updateExisting', 'markAsDuplicate'].includes(decision.kind) && (decision.targetEntityId == null || !decision.targetEntityType)) issues.push(issue({code: 'missingTargetEntity', message: 'Cette décision doit cibler une entité existante.', field: 'targetEntityId', rowNumber: decision.rowNumber, decisionId: decision.id}))
    if (decision.kind === 'importAsNew' && decision.targetEntityId != null) issues.push(issue({code: 'unexpectedTargetForNewImport', message: 'Une création ne doit pas cibler une entité existante.', field: 'targetEntityId', rowNumber: decision.rowNumber, decisionId: decision.id}))
    if (decision.kind === 'needsManualReview' && decision.reasonSource !== 'user' && !decision.reason.toLowerCase().includes('review')) issues.push(issue({code: 'manualReviewNeedsExplicitReason', message: 'Une revue manuelle doit expliquer pourquoi la ligne est ambiguë.', field: 'reason', rowNumber: decision.rowNumber, decisionId: decision.id}))
    if (!row) issues.push(issue({code: 'missingImportedRow', message: 'La ligne importée associée à la décision est introuvable.', field: 'normalizedRowId', rowNumber: decision.rowNumber, decisionId: decision.id}))
    return {valid: issues.length === 0, issues}
}

export function validateReconciliationDecisionSet(decisions: ImportReconciliationDecisionRecord[], rows: Array<ImportRowNormalized<JsonObject>>): ImportReconciliationValidationResult {
    const rowIndex = new Map(rows.map((row) => [String(row.id ?? row.rowNumber), row]))
    const issues = decisions.flatMap((decision) => validateReconciliationDecision(decision, rowIndex.get(String(decision.normalizedRowId ?? decision.rowNumber))).issues)
    const seenRows = new Set<string>()
    for (const decision of decisions) {
        const rowKey = String(decision.normalizedRowId ?? decision.rowNumber)
        if (seenRows.has(rowKey)) issues.push(issue({code: 'multipleDecisionsForRow', message: 'Une ligne importée ne peut pas recevoir plusieurs décisions dans le même lot d’application.', field: 'normalizedRowId', rowNumber: decision.rowNumber, decisionId: decision.id}))
        seenRows.add(rowKey)
    }
    return {valid: issues.length === 0, issues}
}

function rowKey(row: ImportRowNormalized<JsonObject>) {
    return String(row.id ?? row.rowNumber)
}

function decisionRowKey(decision: ImportReconciliationDecisionRecord) {
    return String(decision.normalizedRowId ?? decision.rowNumber)
}

function withStatus(decision: ImportReconciliationDecisionRecord, status: ImportReconciliationDecisionStatus, message: string, at: string, actor = 'system', metadata?: JsonObject | null): ImportReconciliationDecisionRecord {
    return {...decision, status, updatedAt: at, history: [...decision.history, historyEntry({actor, status, message, at, metadata})]}
}

function buildAppliedLink(input: {decision: ImportReconciliationDecisionRecord; row: ImportRowNormalized<JsonObject>; operation: ImportAppliedOperation; entityType: ImportTargetEntityType; entityId?: ImportEntityId | null; snapshot?: JsonObject | null; appliedAt: string}): ImportAppliedLink {
    const entityType = input.entityType === ImportTargetEntityType.Asset ? ImportTargetEntityType.Asset : ImportTargetEntityType.Transaction
    return {
        batchId: input.decision.batchId ?? undefined,
        normalizedRowId: input.row.id ?? undefined,
        decisionId: input.decision.id,
        entityType,
        operation: input.operation,
        transactionId: entityType === ImportTargetEntityType.Transaction ? input.entityId ?? null : undefined,
        assetId: entityType === ImportTargetEntityType.Asset ? input.entityId ?? null : undefined,
        entitySnapshot: input.snapshot ?? null,
        appliedAt: input.appliedAt,
    }
}

async function persistAppliedStatus(repository: ImportReconciliationRepository, decision: ImportReconciliationDecisionRecord, message: string, appliedAt: string, metadata?: JsonObject | null) {
    return repository.persistDecision(withStatus(decision, 'applied', message, appliedAt, 'system', metadata))
}

async function applyOne(repository: ImportReconciliationRepository, decision: ImportReconciliationDecisionRecord, row: ImportRowNormalized<JsonObject>, appliedAt: string) {
    const persistedDecision = await repository.persistDecision(withStatus(decision, 'validated', 'Décision validée avant application.', appliedAt))
    if (decision.kind === 'needsManualReview') return {decision: persistedDecision, link: null}

    if (decision.kind === 'skip' || decision.kind === 'markAsDuplicate') {
        await repository.markSkipped?.(row, persistedDecision)
        const link = await repository.persistAppliedLink(buildAppliedLink({decision: persistedDecision, row, operation: ImportAppliedOperation.Skipped, entityType: asTargetEntityType(decision.targetEntityType), entityId: decision.targetEntityId ?? null, snapshot: {reason: decision.reason, kind: decision.kind}, appliedAt}))
        return {decision: await persistAppliedStatus(repository, persistedDecision, 'Ligne ignorée et conservée dans l’historique.', appliedAt), link}
    }

    if (decision.kind === 'importAsNew') {
        const created = await repository.createEntity?.(row, persistedDecision)
        if (!created) throw new Error('Repository createEntity is required to apply importAsNew.')
        const link = await repository.persistAppliedLink(buildAppliedLink({decision: persistedDecision, row, operation: ImportAppliedOperation.Created, entityType: created.entityType, entityId: created.entityId, snapshot: created.snapshot ?? null, appliedAt}))
        return {decision: await persistAppliedStatus(repository, persistedDecision, 'Entité créée depuis la ligne importée.', appliedAt, {entityId: created.entityId}), link}
    }

    if (decision.kind === 'linkToExisting') {
        const linked = await repository.linkExisting?.(row, persistedDecision)
        const entityType = linked?.entityType ?? asTargetEntityType(decision.targetEntityType)
        const entityId = linked?.entityId ?? decision.targetEntityId ?? null
        const link = await repository.persistAppliedLink(buildAppliedLink({decision: persistedDecision, row, operation: ImportAppliedOperation.Linked, entityType, entityId, snapshot: linked?.snapshot ?? null, appliedAt}))
        return {decision: await persistAppliedStatus(repository, persistedDecision, 'Ligne liée à une entité existante.', appliedAt, {entityId}), link}
    }

    const updated = await repository.updateExisting?.(row, persistedDecision)
    if (!updated) throw new Error('Repository updateExisting is required to apply updateExisting.')
    const link = await repository.persistAppliedLink(buildAppliedLink({decision: persistedDecision, row, operation: ImportAppliedOperation.Updated, entityType: updated.entityType, entityId: updated.entityId, snapshot: updated.snapshot ?? null, appliedAt}))
    return {decision: await persistAppliedStatus(repository, persistedDecision, 'Entité existante mise à jour depuis la ligne importée.', appliedAt, {entityId: updated.entityId}), link}
}

export async function applyReconciliationDecisions(input: {repository: ImportReconciliationRepository; rows: Array<ImportRowNormalized<JsonObject>>; decisions: ImportReconciliationDecisionRecord[]; appliedAt?: string}): Promise<ImportReconciliationApplyResult> {
    const appliedAt = nowIso(input.appliedAt)
    const rowIndex = new Map(input.rows.map((row) => [rowKey(row), row]))
    const validation = validateReconciliationDecisionSet(input.decisions, input.rows)
    if (!validation.valid) return {ok: false, appliedAt, appliedDecisions: [], appliedLinks: [], errors: validation.issues}

    const operation = async (repository: ImportReconciliationRepository) => {
        const appliedDecisions: ImportReconciliationDecisionRecord[] = []
        const appliedLinks: ImportAppliedLink[] = []
        for (const decision of input.decisions) {
            const row = rowIndex.get(decisionRowKey(decision))
            if (!row) throw new Error(`Missing row for decision ${decision.id}`)
            const applied = await applyOne(repository, decision, row, appliedAt)
            appliedDecisions.push(applied.decision)
            if (applied.link) appliedLinks.push(applied.link)
        }
        return {ok: true, appliedAt, appliedDecisions, appliedLinks, errors: []}
    }
    return input.repository.transaction ? input.repository.transaction(operation) : operation(input.repository)
}

function decisionKindFromPreviewAction(row: ImportDryRunPreviewRow<JsonObject>): ImportReconciliationDecisionKind {
    if (row.action === 'createTransaction' || row.action === 'createAssetOperation') return 'importAsNew'
    if (row.action === 'updateTransaction') return 'updateExisting'
    if (row.action === 'skip') return 'skip'
    return 'needsManualReview'
}

export function buildReconciliationDecisionsFromPreview(preview: ImportDryRunPreview<JsonObject>, options: {decidedBy?: string; reasonSource?: ImportReconciliationReasonSource; now?: string} = {}) {
    return preview.rows.map((row) => createReconciliationDecision({
        batchId: preview.source?.id ?? null,
        row: {id: row.rowId ?? row.rowNumber, rowNumber: row.rowNumber, normalizedData: row.normalizedData},
        kind: row.duplicateCandidates.some((candidate) => candidate.confidence >= 0.98) && row.action === 'needsReview' ? 'markAsDuplicate' : decisionKindFromPreviewAction(row),
        targetEntityType: row.targetEntityType,
        targetEntityId: row.targetEntityId ?? null,
        payload: {previewAction: row.action, missingFields: row.missingFields, conflicts: row.conflicts},
        reason: row.reasons[0] || 'Décision générée depuis la preview.',
        reasonSource: options.reasonSource || 'automatic',
        decidedBy: options.decidedBy || 'system',
        decidedAt: options.now,
        now: options.now,
    }))
}
