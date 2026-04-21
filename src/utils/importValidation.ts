import type {CsvRecord} from './csv'
import type {BudgetBackupSnapshot, EntityType} from '../types/budget'

export interface ImportPreviewSummary {
    totalRows: number
    validRows: number
    invalidRows: number
    warnings: string[]
}

function hasValue(value: string | undefined | null) {
    return Boolean(value && value.trim().length)
}

export function summarizeCsvRows(entity: EntityType, rows: CsvRecord[]): ImportPreviewSummary {
    const warnings: string[] = []
    let validRows = 0
    let invalidRows = 0

    for (const row of rows) {
        if (entity === 'account') {
            if (hasValue(row.name) || hasValue(row.nom)) {
                validRows += 1
            } else {
                invalidRows += 1
            }
            continue
        }

        if (entity === 'category') {
            if (hasValue(row.name) || hasValue(row.nom)) {
                validRows += 1
            } else {
                invalidRows += 1
            }
            continue
        }

        const label = row.label ?? row.libelle ?? ''
        const amount = row.amount ?? row.montant ?? ''
        const date = row.date ?? ''

        if (hasValue(label) && hasValue(amount) && hasValue(date)) {
            validRows += 1
        } else {
            invalidRows += 1
        }
    }

    if (invalidRows > 0) {
        warnings.push(`${invalidRows} ligne(s) incomplète(s) seront ignorées.`)
    }

    return {
        totalRows: rows.length,
        validRows,
        invalidRows,
        warnings,
    }
}

export interface BackupValidationResult {
    ok: boolean
    warnings: string[]
    counts: {
        accounts: number
        categories: number
        budgetTargets: number
        recurringTemplates: number
        transactions: number
    }
}

export function validateBackupSnapshot(snapshot: BudgetBackupSnapshot): BackupValidationResult {
    const warnings: string[] = []

    const accountIds = new Set(snapshot.data.accounts.map((account) => account.id))
    const categoryIds = new Set(snapshot.data.categories.map((category) => category.id))

    for (const budgetTarget of snapshot.data.budgetTargets) {
        if (!categoryIds.has(budgetTarget.categoryId)) {
            warnings.push(`Budget "${budgetTarget.name}" référence une catégorie manquante (${budgetTarget.categoryId}).`)
        }

        if (!budgetTarget.name.trim()) {
            warnings.push('Un budget a un nom vide.')
        }

        if (!(budgetTarget.amount > 0)) {
            warnings.push(`Budget "${budgetTarget.name}" avec montant non positif.`)
        }
    }

    for (const template of snapshot.data.recurringTemplates) {
        if (!accountIds.has(template.accountId)) {
            warnings.push(`Récurrence "${template.label}" référence un compte manquant (${template.accountId}).`)
        }

        if (template.categoryId != null && !categoryIds.has(template.categoryId)) {
            warnings.push(`Récurrence "${template.label}" référence une catégorie manquante (${template.categoryId}).`)
        }

        if (!template.label.trim()) {
            warnings.push('Une récurrence a un libellé vide.')
        }

        if (!(template.sourceAmount > 0)) {
            warnings.push(`Récurrence "${template.label}" avec montant source non positif.`)
        }
    }

    const transferGroups = new Map<string, number>()

    for (const transaction of snapshot.data.transactions) {
        if (!accountIds.has(transaction.accountId)) {
            warnings.push(`Transaction "${transaction.label}" référence un compte manquant (${transaction.accountId}).`)
        }

        if (transaction.categoryId != null && !categoryIds.has(transaction.categoryId)) {
            warnings.push(`Transaction "${transaction.label}" référence une catégorie manquante (${transaction.categoryId}).`)
        }

        if (!transaction.label.trim()) {
            warnings.push('Une transaction a un libellé vide.')
        }

        if (!(transaction.amount > 0)) {
            warnings.push(`Transaction "${transaction.label}" avec montant non positif.`)
        }

        if (transaction.transferPeerAccountId != null && !accountIds.has(transaction.transferPeerAccountId)) {
            warnings.push(`Transaction "${transaction.label}" référence un compte pair manquant (${transaction.transferPeerAccountId}).`)
        }

        if (transaction.kind === 'TRANSFER' && transaction.categoryId != null) {
            warnings.push(`Transaction "${transaction.label}" est un transfert mais porte une catégorie (${transaction.categoryId}).`)
        }

        if (transaction.transferGroup) {
            transferGroups.set(transaction.transferGroup, (transferGroups.get(transaction.transferGroup) || 0) + 1)
        }
    }

    for (const [group, count] of transferGroups.entries()) {
        if (count === 1) {
            warnings.push(`Le transfert interne ${group} ne contient qu'une seule jambe.`)
        }
    }

    return {
        ok: warnings.length === 0,
        warnings,
        counts: {
            accounts: snapshot.data.accounts.length,
            categories: snapshot.data.categories.length,
            budgetTargets: snapshot.data.budgetTargets.length,
            recurringTemplates: snapshot.data.recurringTemplates.length,
            transactions: snapshot.data.transactions.length,
        },
    }
}
