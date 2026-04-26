import type {CsvRecord} from './csv'
import type {BudgetBackupSnapshot, BudgetBackupTransaction, EntityType} from '../types/budget'

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
        taxProfiles: number
    }
}

function addDuplicateIdWarnings(rows: {id: number; name?: string; label?: string}[], entityLabel: string, warnings: string[]) {
    const seen = new Map<number, string>()

    for (const row of rows) {
        const label = row.name || row.label || `#${row.id}`
        const existing = seen.get(row.id)
        if (existing) {
            warnings.push(`${entityLabel} contient un identifiant dupliqué (${row.id}) : ${existing} / ${label}.`)
        } else {
            seen.set(row.id, label)
        }
    }
}

export function validateBackupSnapshot(snapshot: BudgetBackupSnapshot): BackupValidationResult {
    const warnings: string[] = []
    const taxProfiles = snapshot.data.taxProfiles || []

    addDuplicateIdWarnings(snapshot.data.accounts, 'Comptes', warnings)
    addDuplicateIdWarnings(snapshot.data.categories, 'Catégories', warnings)
    addDuplicateIdWarnings(snapshot.data.budgetTargets, 'Budgets', warnings)
    addDuplicateIdWarnings(snapshot.data.recurringTemplates, 'Récurrences', warnings)
    addDuplicateIdWarnings(snapshot.data.transactions, 'Transactions', warnings)
    addDuplicateIdWarnings(taxProfiles, 'Profils fiscaux', warnings)

    const accountIds = new Set(snapshot.data.accounts.map((account) => account.id))
    const categoryIds = new Set(snapshot.data.categories.map((category) => category.id))

    for (const account of snapshot.data.accounts) {
        if (!account.name.trim()) {
            warnings.push('Un compte a un nom vide.')
        }

        if (!account.currency.trim()) {
            warnings.push(`Compte "${account.name}" sans devise.`)
        }

        if (account.openedAt && account.closedAt && new Date(account.closedAt).getTime() < new Date(account.openedAt).getTime()) {
            warnings.push(`Compte "${account.name}" : la date de fermeture précède la date d'ouverture.`)
        }
    }

    for (const category of snapshot.data.categories) {
        if (!category.name.trim()) {
            warnings.push('Une catégorie a un nom vide.')
        }
    }

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

    const transferGroups = new Map<string, BudgetBackupTransaction[]>()

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
            const rows = transferGroups.get(transaction.transferGroup) || []
            rows.push(transaction)
            transferGroups.set(transaction.transferGroup, rows)
        }
    }

    for (const [group, rows] of transferGroups.entries()) {
        const outgoing = rows.filter((transaction) => transaction.transferDirection === 'OUT')
        const incoming = rows.filter((transaction) => transaction.transferDirection === 'IN')

        if (rows.length !== 2) {
            warnings.push(`Le transfert interne ${group} doit contenir exactement deux jambes.`)
        } else if (outgoing.length !== 1 || incoming.length !== 1) {
            warnings.push(`Le transfert interne ${group} doit contenir une jambe OUT et une jambe IN.`)
        } else if (
            outgoing[0].accountId === incoming[0].accountId ||
            outgoing[0].transferPeerAccountId !== incoming[0].accountId ||
            incoming[0].transferPeerAccountId !== outgoing[0].accountId
        ) {
            warnings.push(`Le transfert interne ${group} est incohérent.`)
        }
    }

    for (const profile of taxProfiles) {
        if (!(profile.year >= 1900 && profile.year <= 2200)) {
            warnings.push(`Profil fiscal ${profile.id} avec année invalide (${profile.year}).`)
        }

        if (!profile.residenceCountry.trim()) {
            warnings.push(`Profil fiscal ${profile.id} sans pays de résidence.`)
        }

        if (!profile.currency.trim()) {
            warnings.push(`Profil fiscal ${profile.id} sans devise.`)
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
            taxProfiles: taxProfiles.length,
        },
    }
}
