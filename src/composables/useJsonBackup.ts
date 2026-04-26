import {ref, type Ref} from 'vue'
import type {
    Account,
    BudgetBackupSnapshot,
    BudgetBackupTransaction,
    BudgetTarget,
    Category,
    RecurringTransactionTemplate,
    TaxProfile,
    Transaction,
} from '../types/budget'
import {tr} from '../i18n'
import {createBudgetBackupSnapshot, parseBudgetBackup, serializeBudgetBackup} from '../utils/jsonBackup'
import {validateBackupSnapshot, type BackupValidationResult} from '../utils/importValidation'

interface UseJsonBackupOptions {
    accounts: Ref<Account[]>
    categories: Ref<Category[]>
    budgetTargets: Ref<BudgetTarget[]>
    recurringTemplates: Ref<RecurringTransactionTemplate[]>
    transactions: Ref<Transaction[]>
    taxProfiles?: Ref<TaxProfile[]>
    refreshAllData: () => Promise<unknown>
    showNotice: (type: 'success' | 'error', text: string) => void
}

function absAmount(value: number | null | undefined) {
    return Math.abs(value ?? 0)
}

function firstValidationError(validation: BackupValidationResult) {
    return validation.warnings[0] || tr('notices.jsonInvalid')
}

export function useJsonBackup(options: UseJsonBackupOptions) {
    const restorePreviewOpen = ref(false)
    const restorePreviewPath = ref<string | null>(null)
    const restorePreviewSnapshot = ref<BudgetBackupSnapshot | null>(null)
    const restorePreviewValidation = ref<BackupValidationResult | null>(null)

    function closeRestorePreview() {
        restorePreviewOpen.value = false
        restorePreviewPath.value = null
        restorePreviewSnapshot.value = null
        restorePreviewValidation.value = null
    }

    async function exportBackupJson() {
        const snapshot = createBudgetBackupSnapshot(
            options.accounts.value,
            options.categories.value,
            options.budgetTargets.value,
            options.recurringTemplates.value,
            options.transactions.value,
            options.taxProfiles?.value || [],
        )

        const result = await window.file.saveText({
            title: `${tr('common.export')} JSON`,
            defaultPath: 'budget-backup.json',
            content: serializeBudgetBackup(snapshot),
            filters: [{name: 'JSON', extensions: ['json']}],
        })

        if (!result?.canceled) {
            options.showNotice('success', tr('notices.jsonExported'))
        }
    }

    async function replaceAllData() {
        for (const transaction of [...options.transactions.value]) {
            await window.db.transaction.delete(transaction.id)
        }

        for (const recurringTemplate of [...options.recurringTemplates.value]) {
            await window.db.recurringTemplate.delete(recurringTemplate.id)
        }

        for (const budgetTarget of [...options.budgetTargets.value]) {
            await window.db.budgetTarget.delete(budgetTarget.id)
        }

        for (const category of [...options.categories.value]) {
            await window.db.category.delete(category.id)
        }

        for (const account of [...options.accounts.value]) {
            await window.db.account.delete(account.id)
        }

        for (const taxProfile of [...(options.taxProfiles?.value || [])]) {
            await window.db.taxProfile.delete(taxProfile.id)
        }
    }

    async function beginRestoreBackupJson() {
        const result = await window.file.openText({
            title: `${tr('common.open')} JSON`,
            filters: [{name: 'JSON', extensions: ['json']}],
        })

        if (!result || result.canceled || !result.content) {
            return
        }

        try {
            const snapshot = parseBudgetBackup(result.content)
            const validation = validateBackupSnapshot(snapshot)

            if (!validation.ok) {
                throw new Error(firstValidationError(validation))
            }

            restorePreviewSnapshot.value = snapshot
            restorePreviewValidation.value = validation
            restorePreviewPath.value = result.filePath
            restorePreviewOpen.value = true
        } catch (error) {
            options.showNotice(
                'error',
                error instanceof Error ? error.message : tr('notices.jsonRestoreFailed'),
            )
        }
    }

    function findIncomingTransferPeer(snapshot: BudgetBackupSnapshot, transaction: BudgetBackupTransaction) {
        if (!transaction.transferGroup) return null
        return snapshot.data.transactions.find((candidate) =>
            candidate.transferGroup === transaction.transferGroup
            && candidate.transferDirection === 'IN'
            && candidate.id !== transaction.id,
        ) || null
    }

    async function restoreAccountTaxMetadata(createdId: number, account: BudgetBackupSnapshot['data']['accounts'][number]) {
        await window.db.taxMetadata.updateAccount(createdId, {
            institutionCountry: account.institutionCountry ?? null,
            institutionRegion: account.institutionRegion ?? null,
            taxReportingType: account.taxReportingType ?? 'STANDARD',
            openedAt: account.openedAt ?? null,
            closedAt: account.closedAt ?? null,
        })
    }

    async function restoreTransactionTaxMetadata(createdId: number, transaction: BudgetBackupTransaction) {
        await window.db.taxMetadata.updateTransaction(createdId, {
            taxCategory: transaction.taxCategory ?? null,
            taxSourceCountry: transaction.taxSourceCountry ?? null,
            taxSourceRegion: transaction.taxSourceRegion ?? null,
            taxTreatment: transaction.taxTreatment ?? 'UNKNOWN',
            taxWithheldAmount: transaction.taxWithheldAmount ?? null,
            taxWithheldCurrency: transaction.taxWithheldCurrency ?? null,
            taxWithheldCountry: transaction.taxWithheldCountry ?? null,
            taxDocumentRef: transaction.taxDocumentRef ?? null,
        })
    }

    async function restoreTransactions(
        snapshot: BudgetBackupSnapshot,
        accountIdMap: Map<number, number>,
        categoryIdMap: Map<number, number>,
    ) {
        const restoredTransferGroups = new Set<string>()

        for (const transaction of snapshot.data.transactions) {
            const mappedAccountId = accountIdMap.get(transaction.accountId)
            if (!mappedAccountId) {
                throw new Error(tr('notices.missingTransactionAccount', {label: transaction.label}))
            }

            const mappedCategoryId = transaction.categoryId == null
                ? null
                : (categoryIdMap.get(transaction.categoryId) ?? null)

            if (transaction.kind === 'TRANSFER') {
                if (transaction.transferGroup && restoredTransferGroups.has(transaction.transferGroup)) {
                    continue
                }

                if (transaction.transferDirection === 'IN' && transaction.transferGroup) {
                    continue
                }

                const incomingPeer = findIncomingTransferPeer(snapshot, transaction)
                const rawTargetAccountId = incomingPeer?.accountId ?? transaction.transferPeerAccountId ?? null
                const mappedTargetAccountId = rawTargetAccountId == null ? null : (accountIdMap.get(rawTargetAccountId) ?? null)

                if (mappedTargetAccountId) {
                    const referenceRow = incomingPeer || transaction
                    const created = await window.db.transaction.create({
                        label: transaction.label,
                        amount: absAmount(referenceRow.amount),
                        sourceAmount: absAmount(transaction.sourceAmount ?? transaction.amount),
                        sourceCurrency: transaction.sourceCurrency,
                        conversionMode: referenceRow.conversionMode,
                        exchangeRate: referenceRow.exchangeRate,
                        exchangeProvider: referenceRow.exchangeProvider,
                        exchangeDate: referenceRow.exchangeDate,
                        kind: 'TRANSFER',
                        date: transaction.date,
                        note: transaction.note,
                        accountId: mappedAccountId,
                        categoryId: null,
                        transferTargetAccountId: mappedTargetAccountId,
                    })
                    await restoreTransactionTaxMetadata(created.id, transaction)

                    if (transaction.transferGroup) {
                        restoredTransferGroups.add(transaction.transferGroup)
                    }
                    continue
                }
            }

            const created = await window.db.transaction.create({
                label: transaction.label,
                amount: absAmount(transaction.amount),
                sourceAmount: transaction.sourceAmount == null ? null : absAmount(transaction.sourceAmount),
                sourceCurrency: transaction.sourceCurrency,
                conversionMode: transaction.conversionMode,
                exchangeRate: transaction.exchangeRate,
                exchangeProvider: transaction.exchangeProvider,
                exchangeDate: transaction.exchangeDate,
                kind: transaction.kind,
                date: transaction.date,
                note: transaction.note,
                accountId: mappedAccountId,
                categoryId: transaction.kind === 'TRANSFER' ? null : mappedCategoryId,
            })
            await restoreTransactionTaxMetadata(created.id, transaction)
        }
    }

    async function confirmRestoreBackupJson() {
        if (!restorePreviewSnapshot.value) return

        try {
            const snapshot = restorePreviewSnapshot.value
            const validation = validateBackupSnapshot(snapshot)

            if (!validation.ok) {
                throw new Error(firstValidationError(validation))
            }

            await replaceAllData()

            const accountIdMap = new Map<number, number>()
            const categoryIdMap = new Map<number, number>()

            for (const account of snapshot.data.accounts) {
                const created = await window.db.account.create({
                    name: account.name,
                    type: account.type,
                    currency: account.currency,
                    description: account.description,
                })
                await restoreAccountTaxMetadata(created.id, account)
                accountIdMap.set(account.id, created.id)
            }

            for (const category of snapshot.data.categories) {
                const created = await window.db.category.create({
                    name: category.name,
                    kind: category.kind,
                    color: category.color,
                    description: category.description,
                })
                categoryIdMap.set(category.id, created.id)
            }

            for (const taxProfile of snapshot.data.taxProfiles || []) {
                await window.db.taxProfile.create({
                    year: taxProfile.year,
                    residenceCountry: taxProfile.residenceCountry,
                    residenceRegion: taxProfile.residenceRegion,
                    currency: taxProfile.currency,
                })
            }

            for (const budgetTarget of snapshot.data.budgetTargets) {
                const mappedCategoryId = categoryIdMap.get(budgetTarget.categoryId)
                if (!mappedCategoryId) {
                    throw new Error(`Budget "${budgetTarget.name}" référence une catégorie absente.`)
                }

                await window.db.budgetTarget.create({
                    name: budgetTarget.name,
                    amount: budgetTarget.amount,
                    period: budgetTarget.period,
                    startDate: budgetTarget.startDate,
                    endDate: budgetTarget.endDate,
                    currency: budgetTarget.currency,
                    isActive: budgetTarget.isActive,
                    note: budgetTarget.note,
                    categoryId: mappedCategoryId,
                })
            }

            for (const template of snapshot.data.recurringTemplates) {
                const mappedAccountId = accountIdMap.get(template.accountId)
                if (!mappedAccountId) {
                    throw new Error(`Récurrence "${template.label}" référence un compte absent.`)
                }

                const mappedCategoryId = template.categoryId == null
                    ? null
                    : (categoryIdMap.get(template.categoryId) ?? null)

                await window.db.recurringTemplate.create({
                    label: template.label,
                    sourceAmount: template.sourceAmount,
                    sourceCurrency: template.sourceCurrency,
                    accountAmount: template.accountAmount,
                    conversionMode: template.conversionMode,
                    exchangeRate: template.exchangeRate,
                    exchangeProvider: template.exchangeProvider,
                    kind: template.kind,
                    note: template.note,
                    frequency: template.frequency,
                    intervalCount: template.intervalCount,
                    startDate: template.startDate,
                    nextOccurrenceDate: template.nextOccurrenceDate,
                    endDate: template.endDate,
                    isActive: template.isActive,
                    accountId: mappedAccountId,
                    categoryId: mappedCategoryId,
                })
            }

            await restoreTransactions(snapshot, accountIdMap, categoryIdMap)

            await options.refreshAllData()
            closeRestorePreview()
            options.showNotice('success', tr('notices.jsonRestored'))
        } catch (error) {
            options.showNotice(
                'error',
                error instanceof Error ? error.message : tr('notices.jsonRestoreFailed'),
            )
        }
    }

    return {
        exportBackupJson,
        beginRestoreBackupJson,
        confirmRestoreBackupJson,
        closeRestorePreview,
        restorePreviewOpen,
        restorePreviewPath,
        restorePreviewValidation,
    }
}
