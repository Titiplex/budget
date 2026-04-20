import type {Ref} from 'vue'
import type {
    Account,
    Category,
    Transaction,
} from '../types/budget'
import {createBudgetBackupSnapshot, parseBudgetBackup, serializeBudgetBackup} from '../utils/jsonBackup'

interface UseJsonBackupOptions {
    accounts: Ref<Account[]>
    categories: Ref<Category[]>
    transactions: Ref<Transaction[]>
    refreshData: () => Promise<void>
    showNotice: (type: 'success' | 'error', text: string) => void
}

export function useJsonBackup(options: UseJsonBackupOptions) {
    async function exportBackupJson() {
        const snapshot = createBudgetBackupSnapshot(
            options.accounts.value,
            options.categories.value,
            options.transactions.value,
        )

        const result = await window.file.saveText({
            title: 'Exporter un backup JSON complet',
            defaultPath: 'budget-backup.json',
            content: serializeBudgetBackup(snapshot),
            filters: [{name: 'JSON', extensions: ['json']}],
        })

        if (!result?.canceled) {
            options.showNotice('success', 'Backup JSON exporté.')
        }
    }

    async function replaceAllData() {
        for (const transaction of [...options.transactions.value]) {
            await window.db.transaction.delete(transaction.id)
        }

        for (const category of [...options.categories.value]) {
            await window.db.category.delete(category.id)
        }

        for (const account of [...options.accounts.value]) {
            await window.db.account.delete(account.id)
        }
    }

    async function restoreBackupJson() {
        const result = await window.file.openText({
            title: 'Restaurer un backup JSON complet',
            filters: [{name: 'JSON', extensions: ['json']}],
        })

        if (!result || result.canceled || !result.content) {
            return
        }

        try {
            const snapshot = parseBudgetBackup(result.content)

            const confirmed = window.confirm(
                'La restauration complète va remplacer toutes les données actuelles. Continuer ?',
            )

            if (!confirmed) {
                return
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

            for (const transaction of snapshot.data.transactions) {
                const mappedAccountId = accountIdMap.get(transaction.accountId)
                if (!mappedAccountId) {
                    throw new Error(`Compte introuvable pour la transaction "${transaction.label}".`)
                }

                const mappedCategoryId = transaction.categoryId == null
                    ? null
                    : (categoryIdMap.get(transaction.categoryId) ?? null)

                await window.db.transaction.create({
                    label: transaction.label,
                    amount: Math.abs(transaction.amount),
                    kind: transaction.kind,
                    date: transaction.date,
                    note: transaction.note,
                    accountId: mappedAccountId,
                    categoryId: mappedCategoryId,
                })
            }

            await options.refreshData()
            options.showNotice('success', 'Restauration JSON terminée.')
        } catch (error) {
            options.showNotice(
                'error',
                error instanceof Error ? error.message : 'Échec de la restauration JSON.',
            )
        }
    }

    return {
        exportBackupJson,
        restoreBackupJson,
    }
}