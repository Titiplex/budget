import type {BudgetBackupSnapshot, BudgetBackupTransaction} from '../types/budget'
import type {BudgetBackupWithImportDataSnapshot} from './importJsonBackup'
import type {BackupIntegrityVerification} from './backupIntegrity'

export interface RestoreDryRunReport {
    ok: boolean
    canApply: boolean
    source: {
        kind: string
        version: number
        exportedAt: string | null
    }
    integrity: BackupIntegrityVerification | null
    counts: {
        accounts: number
        categories: number
        budgetTargets: number
        recurringTemplates: number
        transactions: number
        taxProfiles: number
        accountsToCreate: number
        categoriesToCreate: number
        budgetTargetsToCreate: number
        recurringTemplatesToCreate: number
        transactionsToCreate: number
        taxProfilesToCreate: number
        financialGoalsToCreate: number
        projectionScenariosToCreate: number
        importMappingTemplatesToRestore: number
        importHistoryItemsToRestore: number
        existingAccountsToReplace: number
        existingCategoriesToReplace: number
        existingBudgetTargetsToReplace: number
        existingRecurringTemplatesToReplace: number
        existingTransactionsToReplace: number
        existingTaxProfilesToReplace: number
    }
    ignoredItems: string[]
    warnings: string[]
    blockingErrors: string[]
    recovery: {
        preRestoreBackupRequired: true
        createdBeforeWrite: boolean
        path: string | null
    }
}

export interface RestoreDryRunCurrentState {
    accounts?: unknown[]
    categories?: unknown[]
    budgetTargets?: unknown[]
    recurringTemplates?: unknown[]
    transactions?: unknown[]
    taxProfiles?: unknown[]
}

const SUPPORTED_KIND = 'budget-backup'
const SUPPORTED_VERSIONS = new Set([2, 3, 4, 5, 6])
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY_CODE = /^[A-Z]{3}$/

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasValidDate(value: string | null | undefined, dateOnly = false) {
    if (value == null || value === '') return true
    if (dateOnly && !ISO_DATE_ONLY.test(value)) return false
    return !Number.isNaN(Date.parse(value))
}

function isValidCurrency(value: string | null | undefined) {
    return typeof value === 'string' && CURRENCY_CODE.test(value.trim().toUpperCase())
}

function addDuplicateIdErrors(rows: Array<{id: number; name?: string; label?: string}>, entityLabel: string, errors: string[]) {
    const seen = new Map<number, string>()

    for (const row of rows) {
        const label = row.name || row.label || `#${row.id}`
        const existing = seen.get(row.id)
        if (existing) {
            errors.push(`${entityLabel} contient un identifiant dupliqué (${row.id}) : ${existing} / ${label}.`)
        } else {
            seen.set(row.id, label)
        }
    }
}

function addDuplicateStringIdErrors(rows: Array<{id: string; name?: string; label?: string}>, entityLabel: string, errors: string[]) {
    const seen = new Map<string, string>()

    for (const row of rows) {
        const id = String(row.id)
        const label = row.name || row.label || id
        const existing = seen.get(id)
        if (existing) {
            errors.push(`${entityLabel} contient un identifiant dupliqué (${id}) : ${existing} / ${label}.`)
        } else {
            seen.set(id, label)
        }
    }
}

function hasSection(snapshot: BudgetBackupSnapshot, key: keyof BudgetBackupSnapshot['data']) {
    return Array.isArray((snapshot.data as Record<string, unknown>)[key as string])
}

function validateRequiredSections(snapshot: BudgetBackupSnapshot, errors: string[]) {
    const requiredSections: Array<keyof BudgetBackupSnapshot['data']> = [
        'accounts',
        'categories',
        'budgetTargets',
        'recurringTemplates',
        'transactions',
        'taxProfiles',
    ]

    for (const section of requiredSections) {
        if (!hasSection(snapshot, section)) {
            errors.push(`Section data.${String(section)} absente ou invalide.`)
        }
    }
}

function validateRoot(snapshot: BudgetBackupWithImportDataSnapshot, errors: string[]) {
    if (snapshot.kind !== SUPPORTED_KIND) {
        errors.push(`Type de backup invalide (${snapshot.kind || 'inconnu'}).`)
    }

    if (!SUPPORTED_VERSIONS.has(Number(snapshot.version))) {
        errors.push(`Version de backup JSON non supportée (${snapshot.version}).`)
    }

    if (!snapshot.exportedAt || Number.isNaN(Date.parse(snapshot.exportedAt))) {
        errors.push('Le backup doit contenir une date exportedAt valide.')
    }
}

function validateIntegrity(snapshot: BudgetBackupWithImportDataSnapshot, errors: string[], warnings: string[]) {
    const integrity = snapshot.integrityVerification || null
    if (!integrity) {
        warnings.push('Statut d’intégrité indisponible : le backup a été chargé par un ancien parseur.')
        return null
    }

    for (const warning of integrity.warnings) warnings.push(`Intégrité backup : ${warning}`)
    for (const error of integrity.errors) errors.push(`Intégrité backup : ${error}`)

    if (integrity.status === 'valid') {
        warnings.push('Intégrité backup vérifiée : manifeste et checksums valides.')
    } else if (integrity.status === 'legacy') {
        warnings.push('Intégrité backup non vérifiable : backup legacy sans manifeste, restauration autorisée par compatibilité.')
    }

    return integrity
}

function validateAccounts(snapshot: BudgetBackupSnapshot, errors: string[], warnings: string[]) {
    for (const account of snapshot.data.accounts) {
        if (!account.name.trim()) warnings.push('Un compte a un nom vide.')
        if (!isValidCurrency(account.currency)) errors.push(`Compte "${account.name || account.id}" avec devise invalide (${account.currency || 'vide'}).`)
        if (!hasValidDate(account.openedAt)) errors.push(`Compte "${account.name || account.id}" avec date d’ouverture invalide.`)
        if (!hasValidDate(account.closedAt)) errors.push(`Compte "${account.name || account.id}" avec date de fermeture invalide.`)
        if (account.openedAt && account.closedAt && Date.parse(account.closedAt) < Date.parse(account.openedAt)) {
            warnings.push(`Compte "${account.name}" : la date de fermeture précède la date d’ouverture.`)
        }
    }
}

function validateCategories(snapshot: BudgetBackupSnapshot, warnings: string[]) {
    for (const category of snapshot.data.categories) {
        if (!category.name.trim()) warnings.push('Une catégorie a un nom vide.')
    }
}

function validateBudgetTargets(snapshot: BudgetBackupSnapshot, categoryIds: Set<number>, errors: string[], warnings: string[]) {
    for (const budgetTarget of snapshot.data.budgetTargets) {
        if (!budgetTarget.name.trim()) warnings.push('Un budget a un nom vide.')
        if (!categoryIds.has(budgetTarget.categoryId)) errors.push(`Budget "${budgetTarget.name}" référence une catégorie absente (${budgetTarget.categoryId}).`)
        if (!(budgetTarget.amount > 0)) errors.push(`Budget "${budgetTarget.name}" avec montant non positif.`)
        if (!isValidCurrency(budgetTarget.currency)) errors.push(`Budget "${budgetTarget.name}" avec devise invalide (${budgetTarget.currency || 'vide'}).`)
        if (!hasValidDate(budgetTarget.startDate, true)) errors.push(`Budget "${budgetTarget.name}" avec date de début invalide.`)
        if (!hasValidDate(budgetTarget.endDate, true)) errors.push(`Budget "${budgetTarget.name}" avec date de fin invalide.`)
    }
}

function validateRecurringTemplates(snapshot: BudgetBackupSnapshot, accountIds: Set<number>, categoryIds: Set<number>, errors: string[], warnings: string[]) {
    for (const template of snapshot.data.recurringTemplates) {
        if (!template.label.trim()) warnings.push('Une récurrence a un libellé vide.')
        if (!accountIds.has(template.accountId)) errors.push(`Récurrence "${template.label}" référence un compte absent (${template.accountId}).`)
        if (template.categoryId != null && !categoryIds.has(template.categoryId)) errors.push(`Récurrence "${template.label}" référence une catégorie absente (${template.categoryId}).`)
        if (!(template.sourceAmount > 0)) errors.push(`Récurrence "${template.label}" avec montant source non positif.`)
        if (template.accountAmount != null && !(template.accountAmount > 0)) errors.push(`Récurrence "${template.label}" avec montant comptabilisé non positif.`)
        if (!isValidCurrency(template.sourceCurrency)) errors.push(`Récurrence "${template.label}" avec devise source invalide (${template.sourceCurrency || 'vide'}).`)
        if (!hasValidDate(template.startDate, true)) errors.push(`Récurrence "${template.label}" avec date de début invalide.`)
        if (!hasValidDate(template.nextOccurrenceDate, true)) errors.push(`Récurrence "${template.label}" avec prochaine occurrence invalide.`)
        if (!hasValidDate(template.endDate, true)) errors.push(`Récurrence "${template.label}" avec date de fin invalide.`)
    }
}

function validateTransferGroups(transactions: BudgetBackupTransaction[], accountIds: Set<number>, errors: string[], warnings: string[]) {
    const transferGroups = new Map<string, BudgetBackupTransaction[]>()

    for (const transaction of transactions) {
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
            errors.push(`Le transfert interne ${group} doit contenir exactement deux jambes.`)
        } else if (outgoing.length !== 1 || incoming.length !== 1) {
            errors.push(`Le transfert interne ${group} doit contenir une jambe OUT et une jambe IN.`)
        } else if (
            outgoing[0].accountId === incoming[0].accountId ||
            outgoing[0].transferPeerAccountId !== incoming[0].accountId ||
            incoming[0].transferPeerAccountId !== outgoing[0].accountId ||
            !accountIds.has(outgoing[0].accountId) ||
            !accountIds.has(incoming[0].accountId)
        ) {
            errors.push(`Le transfert interne ${group} est incohérent.`)
        }

        if (rows.some((transaction) => transaction.kind !== 'TRANSFER')) {
            warnings.push(`Le groupe ${group} contient une ligne qui n’est pas marquée comme transfert.`)
        }
    }
}

function validateTransactions(snapshot: BudgetBackupSnapshot, accountIds: Set<number>, categoryIds: Set<number>, errors: string[], warnings: string[]) {
    for (const transaction of snapshot.data.transactions) {
        if (!transaction.label.trim()) warnings.push('Une transaction a un libellé vide.')
        if (!accountIds.has(transaction.accountId)) errors.push(`Transaction "${transaction.label}" référence un compte absent (${transaction.accountId}).`)
        if (transaction.categoryId != null && !categoryIds.has(transaction.categoryId)) errors.push(`Transaction "${transaction.label}" référence une catégorie absente (${transaction.categoryId}).`)
        if (!(transaction.amount > 0)) errors.push(`Transaction "${transaction.label}" avec montant non positif.`)
        if (transaction.sourceAmount != null && !(transaction.sourceAmount > 0)) errors.push(`Transaction "${transaction.label}" avec montant source non positif.`)
        if (transaction.sourceCurrency != null && !isValidCurrency(transaction.sourceCurrency)) errors.push(`Transaction "${transaction.label}" avec devise source invalide (${transaction.sourceCurrency}).`)
        if (!hasValidDate(transaction.date, true)) errors.push(`Transaction "${transaction.label}" avec date invalide.`)
        if (!hasValidDate(transaction.exchangeDate, true)) errors.push(`Transaction "${transaction.label}" avec date de taux invalide.`)
        if (transaction.transferPeerAccountId != null && !accountIds.has(transaction.transferPeerAccountId)) {
            errors.push(`Transaction "${transaction.label}" référence un compte pair absent (${transaction.transferPeerAccountId}).`)
        }
        if (transaction.kind === 'TRANSFER' && transaction.categoryId != null) {
            warnings.push(`Transaction "${transaction.label}" est un transfert mais porte une catégorie (${transaction.categoryId}).`)
        }
    }

    validateTransferGroups(snapshot.data.transactions, accountIds, errors, warnings)
}

function validateTaxProfiles(snapshot: BudgetBackupSnapshot, errors: string[]) {
    for (const profile of snapshot.data.taxProfiles || []) {
        if (!(profile.year >= 1900 && profile.year <= 2200)) errors.push(`Profil fiscal ${profile.id} avec année invalide (${profile.year}).`)
        if (!profile.residenceCountry.trim()) errors.push(`Profil fiscal ${profile.id} sans pays de résidence.`)
        if (!isValidCurrency(profile.currency)) errors.push(`Profil fiscal ${profile.id} avec devise invalide (${profile.currency || 'vide'}).`)
    }
}

function validateGoals(snapshot: BudgetBackupWithImportDataSnapshot, errors: string[], warnings: string[]) {
    const goals = snapshot.data.financialGoals || []
    const scenarios = snapshot.data.projectionScenarios || []

    addDuplicateIdErrors(goals as Array<{id: number; name?: string}>, 'Objectifs', errors)
    addDuplicateIdErrors(scenarios as Array<{id: number; name?: string}>, 'Scénarios', errors)

    for (const goal of goals) {
        if (!goal.name.trim()) warnings.push('Un objectif a un nom vide.')
        if (!(goal.targetAmount > 0)) errors.push(`Objectif "${goal.name}" avec montant cible non positif.`)
        if (!isValidCurrency(goal.currency)) errors.push(`Objectif "${goal.name}" avec devise invalide (${goal.currency || 'vide'}).`)
        if (!hasValidDate(goal.targetDate, true)) errors.push(`Objectif "${goal.name}" avec date cible invalide.`)
    }

    for (const scenario of scenarios) {
        if (!scenario.name.trim()) warnings.push('Un scénario a un nom vide.')
        if (!isValidCurrency(scenario.currency)) errors.push(`Scénario "${scenario.name}" avec devise invalide (${scenario.currency || 'vide'}).`)
        if (!(scenario.horizonMonths >= 1 && scenario.horizonMonths <= 1200)) errors.push(`Scénario "${scenario.name}" avec horizon invalide (${scenario.horizonMonths}).`)
    }
}

function validateImportBackup(snapshot: BudgetBackupWithImportDataSnapshot, errors: string[], warnings: string[], ignoredItems: string[]) {
    const importBackup = snapshot.data.importBackup
    if (!importBackup) {
        ignoredItems.push('Aucune donnée d’audit d’import à restaurer.')
        return
    }

    addDuplicateStringIdErrors(importBackup.mappingTemplates || [], 'Templates de mapping import', errors)
    addDuplicateStringIdErrors(importBackup.importHistory || [], 'Historique d’import', errors)

    if (importBackup.metadata?.auditOnlyRestore !== true) {
        errors.push('L’historique d’import doit rester en mode audit-only pour la restauration.')
    }

    for (const template of importBackup.mappingTemplates || []) {
        if (isRecord(template) && String(template.id || '').startsWith('system:')) {
            ignoredItems.push(`Template système ignoré : ${String(template.id)}.`)
        }
    }

    if ((importBackup.importHistory || []).length) {
        warnings.push('L’historique d’import sera restauré en audit-only ; il ne recréera pas de transactions financières.')
    }
}

function buildCounts(snapshot: BudgetBackupWithImportDataSnapshot, current: RestoreDryRunCurrentState): RestoreDryRunReport['counts'] {
    const importBackup = snapshot.data.importBackup
    const accountsToCreate = snapshot.data.accounts.length
    const categoriesToCreate = snapshot.data.categories.length
    const budgetTargetsToCreate = snapshot.data.budgetTargets.length
    const recurringTemplatesToCreate = snapshot.data.recurringTemplates.length
    const transactionsToCreate = snapshot.data.transactions.length
    const taxProfilesToCreate = (snapshot.data.taxProfiles || []).length

    return {
        accounts: accountsToCreate,
        categories: categoriesToCreate,
        budgetTargets: budgetTargetsToCreate,
        recurringTemplates: recurringTemplatesToCreate,
        transactions: transactionsToCreate,
        taxProfiles: taxProfilesToCreate,
        accountsToCreate,
        categoriesToCreate,
        budgetTargetsToCreate,
        recurringTemplatesToCreate,
        transactionsToCreate,
        taxProfilesToCreate,
        financialGoalsToCreate: (snapshot.data.financialGoals || []).length,
        projectionScenariosToCreate: (snapshot.data.projectionScenarios || []).length,
        importMappingTemplatesToRestore: importBackup?.mappingTemplates?.length || 0,
        importHistoryItemsToRestore: importBackup?.importHistory?.length || 0,
        existingAccountsToReplace: current.accounts?.length || 0,
        existingCategoriesToReplace: current.categories?.length || 0,
        existingBudgetTargetsToReplace: current.budgetTargets?.length || 0,
        existingRecurringTemplatesToReplace: current.recurringTemplates?.length || 0,
        existingTransactionsToReplace: current.transactions?.length || 0,
        existingTaxProfilesToReplace: current.taxProfiles?.length || 0,
    }
}

export function createRestoreDryRunReport(
    snapshot: BudgetBackupWithImportDataSnapshot,
    current: RestoreDryRunCurrentState = {},
): RestoreDryRunReport {
    const warnings: string[] = []
    const blockingErrors: string[] = []
    const ignoredItems: string[] = []
    const legacySnapshot = snapshot as unknown as BudgetBackupSnapshot

    validateRoot(snapshot, blockingErrors)
    const integrity = validateIntegrity(snapshot, blockingErrors, warnings)
    validateRequiredSections(legacySnapshot, blockingErrors)

    addDuplicateIdErrors(legacySnapshot.data.accounts, 'Comptes', blockingErrors)
    addDuplicateIdErrors(legacySnapshot.data.categories, 'Catégories', blockingErrors)
    addDuplicateIdErrors(legacySnapshot.data.budgetTargets, 'Budgets', blockingErrors)
    addDuplicateIdErrors(legacySnapshot.data.recurringTemplates, 'Récurrences', blockingErrors)
    addDuplicateIdErrors(legacySnapshot.data.transactions, 'Transactions', blockingErrors)
    addDuplicateIdErrors(legacySnapshot.data.taxProfiles || [], 'Profils fiscaux', blockingErrors)

    const accountIds = new Set(legacySnapshot.data.accounts.map((account) => account.id))
    const categoryIds = new Set(legacySnapshot.data.categories.map((category) => category.id))

    validateAccounts(legacySnapshot, blockingErrors, warnings)
    validateCategories(legacySnapshot, warnings)
    validateBudgetTargets(legacySnapshot, categoryIds, blockingErrors, warnings)
    validateRecurringTemplates(legacySnapshot, accountIds, categoryIds, blockingErrors, warnings)
    validateTransactions(legacySnapshot, accountIds, categoryIds, blockingErrors, warnings)
    validateTaxProfiles(legacySnapshot, blockingErrors)
    validateGoals(snapshot, blockingErrors, warnings)
    validateImportBackup(snapshot, blockingErrors, warnings, ignoredItems)

    const uniqueBlockingErrors = [...new Set(blockingErrors)]
    const uniqueWarnings = [...new Set(warnings)]
    const uniqueIgnoredItems = [...new Set(ignoredItems)]

    return {
        ok: uniqueBlockingErrors.length === 0,
        canApply: uniqueBlockingErrors.length === 0,
        source: {
            kind: snapshot.kind,
            version: snapshot.version,
            exportedAt: snapshot.exportedAt || null,
        },
        integrity,
        counts: buildCounts(snapshot, current),
        ignoredItems: uniqueIgnoredItems,
        warnings: [
            ...uniqueBlockingErrors.map((error) => `Erreur bloquante : ${error}`),
            ...uniqueWarnings,
            ...uniqueIgnoredItems.map((item) => `Élément ignoré : ${item}`),
        ],
        blockingErrors: uniqueBlockingErrors,
        recovery: {
            preRestoreBackupRequired: true,
            createdBeforeWrite: false,
            path: null,
        },
    }
}

export function markRecoveryBackupCreated(report: RestoreDryRunReport, path: string | null): RestoreDryRunReport {
    return {
        ...report,
        recovery: {
            ...report.recovery,
            createdBeforeWrite: Boolean(path),
            path,
        },
    }
}
