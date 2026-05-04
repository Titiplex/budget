import {describe, expect, it, vi} from 'vitest'
import {ImportAppliedOperation, ImportRowStatus, ImportTargetEntityType} from '../../types/imports'
import type {ImportRowNormalized, JsonObject} from '../../types/imports'
import {
    applyReconciliationDecisions,
    buildReconciliationDecisionsFromPreview,
    createReconciliationDecision,
    validateReconciliationDecision,
    validateReconciliationDecisionSet,
} from '../../utils/importReconciliationEngine'
import type {ImportReconciliationDecisionRecord, ImportReconciliationRepository} from '../../utils/importReconciliationEngine'
import type {ImportDryRunPreview} from '../../utils/importPreviewService'

function row(overrides: Partial<ImportRowNormalized<JsonObject>> = {}): ImportRowNormalized<JsonObject> {
    return {
        id: overrides.id ?? `row-${overrides.rowNumber ?? 1}`,
        rowNumber: overrides.rowNumber ?? 1,
        rawRowId: overrides.rawRowId ?? `raw-${overrides.rowNumber ?? 1}`,
        status: overrides.status ?? ImportRowStatus.Valid,
        targetKind: overrides.targetKind ?? ImportTargetEntityType.Transaction,
        normalizedData: overrides.normalizedData ?? {
            date: '2026-05-01T00:00:00.000Z',
            label: 'Coffee',
            amount: -4.5,
            currency: 'CAD',
        },
        transactionDate: overrides.transactionDate ?? '2026-05-01T00:00:00.000Z',
        label: overrides.label ?? 'Coffee',
        amount: overrides.amount ?? -4.5,
        currency: overrides.currency ?? 'CAD',
        accountName: overrides.accountName ?? 'Main',
        validationErrors: overrides.validationErrors ?? [],
        duplicateCandidates: overrides.duplicateCandidates ?? [],
    }
}

function hasOwn<T extends object>(value: T, key: keyof T) {
    return Object.prototype.hasOwnProperty.call(value, key)
}

function decisionFor(kind: ImportReconciliationDecisionRecord['kind'], importedRow = row(), overrides: Partial<ImportReconciliationDecisionRecord> = {}) {
    return createReconciliationDecision({
        id: overrides.id,
        batchId: 7,
        row: importedRow,
        kind,
        targetEntityType: hasOwn(overrides, 'targetEntityType')
            ? overrides.targetEntityType
            : (['linkToExisting', 'updateExisting', 'markAsDuplicate'].includes(kind) ? ImportTargetEntityType.Transaction : null),
        targetEntityId: hasOwn(overrides, 'targetEntityId')
            ? overrides.targetEntityId
            : (['linkToExisting', 'updateExisting', 'markAsDuplicate'].includes(kind) ? 42 : null),
        reason: overrides.reason ?? `${kind} test reason`,
        reasonSource: overrides.reasonSource ?? 'user',
        decidedBy: 'tester',
        now: '2026-05-03T00:00:00.000Z',
        payload: overrides.payload ?? null,
    })
}

function memoryRepository(options: {failOnUpdate?: boolean; transactional?: boolean} = {}) {
    const state = {
        decisions: [] as ImportReconciliationDecisionRecord[],
        links: [] as any[],
        created: [] as any[],
        linked: [] as any[],
        updated: [] as any[],
        skipped: [] as any[],
    }
    const repository: ImportReconciliationRepository & {state: typeof state} = {
        state,
        async persistDecision(decision) {
            const existingIndex = state.decisions.findIndex((entry) => entry.id === decision.id)
            if (existingIndex >= 0) state.decisions[existingIndex] = decision
            else state.decisions.push(decision)
            return decision
        },
        async persistAppliedLink(link) {
            state.links.push(link)
            return link
        },
        async createEntity(importedRow) {
            const entity = {entityType: ImportTargetEntityType.Transaction, entityId: 100 + state.created.length, snapshot: importedRow.normalizedData}
            state.created.push(entity)
            return entity
        },
        async linkExisting(_importedRow, decision) {
            const entity = {entityType: ImportTargetEntityType.Transaction, entityId: decision.targetEntityId || 42, snapshot: {linked: true}}
            state.linked.push(entity)
            return entity
        },
        async updateExisting(_importedRow, decision) {
            if (options.failOnUpdate) throw new Error('boom update')
            const entity = {entityType: ImportTargetEntityType.Transaction, entityId: decision.targetEntityId || 42, snapshot: {updated: true}}
            state.updated.push(entity)
            return entity
        },
        async markSkipped(importedRow, decision) {
            state.skipped.push({row: importedRow.id, decision: decision.id})
        },
    }

    if (options.transactional) {
        repository.transaction = async (operation) => {
            const snapshot = JSON.parse(JSON.stringify(state))
            try {
                return await operation(repository)
            } catch (error) {
                state.decisions.splice(0, state.decisions.length, ...snapshot.decisions)
                state.links.splice(0, state.links.length, ...snapshot.links)
                state.created.splice(0, state.created.length, ...snapshot.created)
                state.linked.splice(0, state.linked.length, ...snapshot.linked)
                state.updated.splice(0, state.updated.length, ...snapshot.updated)
                state.skipped.splice(0, state.skipped.length, ...snapshot.skipped)
                throw error
            }
        }
    }

    return repository
}

describe('importReconciliationEngine', () => {
    it('creates explicit decisions with traceable history', () => {
        const importedRow = row({id: 'row-1', rowNumber: 1})
        const decision = createReconciliationDecision({
            batchId: 7,
            row: importedRow,
            kind: 'linkToExisting',
            targetEntityType: ImportTargetEntityType.Transaction,
            targetEntityId: 42,
            reason: 'User confirmed the duplicate.',
            reasonSource: 'user',
            decidedBy: 'alice',
            now: '2026-05-03T00:00:00.000Z',
        })

        expect(decision).toMatchObject({
            batchId: 7,
            normalizedRowId: 'row-1',
            kind: 'linkToExisting',
            status: 'pending',
            targetEntityId: 42,
            reasonSource: 'user',
        })
        expect(decision.history[0]).toMatchObject({actor: 'alice', status: 'pending', message: 'User confirmed the duplicate.'})
    })

    it('validates missing target and duplicate decisions before application', () => {
        const importedRow = row({id: 'row-1'})
        const invalid = createReconciliationDecision({
            row: importedRow,
            kind: 'updateExisting',
            reason: 'Update existing row',
            reasonSource: 'user',
            now: '2026-05-03T00:00:00.000Z',
        })
        const valid = decisionFor('skip', importedRow, {id: 'skip-1'})
        const duplicate = decisionFor('markAsDuplicate', importedRow, {id: 'dup-1'})

        expect(validateReconciliationDecision(invalid, importedRow)).toMatchObject({
            valid: false,
            issues: [expect.objectContaining({code: 'missingTargetEntity'})],
        })
        expect(validateReconciliationDecisionSet([valid, duplicate], [importedRow])).toMatchObject({
            valid: false,
            issues: [expect.objectContaining({code: 'multipleDecisionsForRow'})],
        })
    })

    it('applies create, link, update, skip and duplicate decisions with applied links', async () => {
        const rows = [
            row({id: 'row-create', rowNumber: 1}),
            row({id: 'row-link', rowNumber: 2}),
            row({id: 'row-update', rowNumber: 3}),
            row({id: 'row-skip', rowNumber: 4}),
            row({id: 'row-duplicate', rowNumber: 5}),
        ]
        const decisions = [
            decisionFor('importAsNew', rows[0], {id: 'd-create'}),
            decisionFor('linkToExisting', rows[1], {id: 'd-link', targetEntityId: 201}),
            decisionFor('updateExisting', rows[2], {id: 'd-update', targetEntityId: 202}),
            decisionFor('skip', rows[3], {id: 'd-skip'}),
            decisionFor('markAsDuplicate', rows[4], {id: 'd-duplicate', targetEntityId: 203}),
        ]
        const repository = memoryRepository({transactional: true})

        const result = await applyReconciliationDecisions({
            repository,
            rows,
            decisions,
            appliedAt: '2026-05-03T01:00:00.000Z',
        })

        expect(result.ok).toBe(true)
        expect(result.appliedDecisions).toHaveLength(5)
        expect(result.appliedDecisions.every((decision) => decision.status === 'applied')).toBe(true)
        expect(result.appliedLinks.map((link) => link.operation)).toEqual([
            ImportAppliedOperation.Created,
            ImportAppliedOperation.Linked,
            ImportAppliedOperation.Updated,
            ImportAppliedOperation.Skipped,
            ImportAppliedOperation.Skipped,
        ])
        expect(result.appliedLinks[0].transactionId).toBe(100)
        expect(result.appliedLinks[1].transactionId).toBe(201)
        expect(result.appliedLinks[2].transactionId).toBe(202)
        expect(result.appliedLinks[4].transactionId).toBe(203)
        expect(repository.state.skipped).toHaveLength(2)
        expect(repository.state.decisions.filter((decision) => decision.status === 'applied')).toHaveLength(5)
    })

    it('does not apply needsManualReview decisions but persists the pending validation trail', async () => {
        const importedRow = row({id: 'row-review'})
        const decision = createReconciliationDecision({
            id: 'd-review',
            batchId: 7,
            row: importedRow,
            kind: 'needsManualReview',
            reason: 'Needs review because duplicate confidence is ambiguous.',
            reasonSource: 'automatic',
            now: '2026-05-03T00:00:00.000Z',
        })
        const repository = memoryRepository()

        const result = await applyReconciliationDecisions({repository, rows: [importedRow], decisions: [decision]})

        expect(result.ok).toBe(true)
        expect(result.appliedLinks).toHaveLength(0)
        expect(result.appliedDecisions[0].status).toBe('validated')
        expect(repository.state.created).toHaveLength(0)
        expect(repository.state.updated).toHaveLength(0)
    })

    it('rolls back repository state when transactional application fails', async () => {
        const rows = [row({id: 'row-create'}), row({id: 'row-update', rowNumber: 2})]
        const decisions = [
            decisionFor('importAsNew', rows[0], {id: 'd-create'}),
            decisionFor('updateExisting', rows[1], {id: 'd-update', targetEntityId: 88}),
        ]
        const repository = memoryRepository({transactional: true, failOnUpdate: true})

        await expect(applyReconciliationDecisions({repository, rows, decisions}))
            .rejects
            .toThrow('boom update')

        expect(repository.state.decisions).toHaveLength(0)
        expect(repository.state.links).toHaveLength(0)
        expect(repository.state.created).toHaveLength(0)
        expect(repository.state.updated).toHaveLength(0)
    })

    it('builds reconciliation decisions from preview rows', () => {
        const preview = {
            dryRun: true,
            source: {id: 7},
            template: null,
            targetAccountId: 1,
            targetPortfolioId: null,
            defaultCurrency: 'CAD',
            rows: [
                {
                    rowNumber: 1,
                    rowId: 'row-1',
                    rawRowId: 'raw-1',
                    status: ImportRowStatus.Valid,
                    action: 'createTransaction',
                    targetEntityType: ImportTargetEntityType.Transaction,
                    targetAccountId: 1,
                    targetPortfolioId: null,
                    targetEntityId: null,
                    reviewRequired: false,
                    reasons: ['Transaction prête à être créée.'],
                    missingFields: [],
                    warnings: [],
                    errors: [],
                    duplicateCandidates: [],
                    conflicts: [],
                    normalizedData: {date: '2026-05-01T00:00:00.000Z', amount: -4.5, currency: 'CAD'},
                },
                {
                    rowNumber: 2,
                    rowId: 'row-2',
                    rawRowId: 'raw-2',
                    status: ImportRowStatus.Valid,
                    action: 'updateTransaction',
                    targetEntityType: ImportTargetEntityType.Transaction,
                    targetAccountId: 1,
                    targetPortfolioId: null,
                    targetEntityId: 99,
                    reviewRequired: false,
                    reasons: ['Doublon exact trouvé.'],
                    missingFields: [],
                    warnings: [],
                    errors: [],
                    duplicateCandidates: [],
                    conflicts: [],
                    normalizedData: {date: '2026-05-01T00:00:00.000Z', amount: -4.5, currency: 'CAD'},
                },
            ],
            readyRows: [],
            invalidRows: [],
            warnings: [],
            blockingErrors: [],
            duplicateCandidates: [],
            conflicts: [],
            stats: {} as never,
            canApply: true,
            generatedAt: '2026-05-03T00:00:00.000Z',
        } satisfies ImportDryRunPreview<JsonObject>

        const decisions = buildReconciliationDecisionsFromPreview(preview, {decidedBy: 'system', now: '2026-05-03T00:00:00.000Z'})

        expect(decisions).toEqual([
            expect.objectContaining({batchId: 7, normalizedRowId: 'row-1', kind: 'importAsNew'}),
            expect.objectContaining({batchId: 7, normalizedRowId: 'row-2', kind: 'updateExisting', targetEntityId: 99}),
        ])
    })

    it('returns validation errors instead of writing when decision set is invalid', async () => {
        const importedRow = row({id: 'row-1'})
        const invalid = decisionFor('linkToExisting', importedRow, {id: 'd-bad', targetEntityId: null, targetEntityType: null})
        const repository = memoryRepository()
        const persistSpy = vi.spyOn(repository, 'persistDecision')

        const result = await applyReconciliationDecisions({repository, rows: [importedRow], decisions: [invalid]})

        expect(result.ok).toBe(false)
        expect(result.errors[0]).toMatchObject({code: 'missingTargetEntity'})
        expect(persistSpy).not.toHaveBeenCalled()
    })
})
