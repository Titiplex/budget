import type {
    Account,
    BudgetBackupSnapshot,
    BudgetTarget,
    Category,
    RecurringTransactionTemplate,
    TaxProfile,
    Transaction,
} from '../types/budget'
import {toDateOnly} from './date'

export function createBudgetBackupSnapshot(
    accounts: Account[],
    categories: Category[],
    budgetTargets: BudgetTarget[],
    recurringTemplates: RecurringTransactionTemplate[],
    transactions: Transaction[],
    taxProfiles: TaxProfile[] = [],
): BudgetBackupSnapshot {
    return {
        kind: 'budget-backup',
        version: 4,
        exportedAt: new Date().toISOString(),
        data: {
            accounts: accounts.map((account) => ({
                id: account.id,
                name: account.name,
                type: account.type,
                currency: account.currency,
                description: account.description,
                institutionCountry: account.institutionCountry ?? null,
                institutionRegion: account.institutionRegion ?? null,
                taxReportingType: account.taxReportingType ?? 'STANDARD',
                openedAt: account.openedAt ? new Date(account.openedAt).toISOString() : null,
                closedAt: account.closedAt ? new Date(account.closedAt).toISOString() : null,
            })),
            categories: categories.map((category) => ({
                id: category.id,
                name: category.name,
                kind: category.kind,
                color: category.color,
                description: category.description,
            })),
            budgetTargets: budgetTargets.map((budgetTarget) => ({
                id: budgetTarget.id,
                name: budgetTarget.name,
                amount: budgetTarget.amount,
                period: budgetTarget.period,
                startDate: toDateOnly(budgetTarget.startDate),
                endDate: budgetTarget.endDate ? toDateOnly(budgetTarget.endDate) : null,
                currency: budgetTarget.currency,
                isActive: budgetTarget.isActive,
                note: budgetTarget.note,
                categoryId: budgetTarget.categoryId,
            })),
            recurringTemplates: recurringTemplates.map((template) => ({
                id: template.id,
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
                startDate: toDateOnly(template.startDate),
                nextOccurrenceDate: toDateOnly(template.nextOccurrenceDate),
                endDate: template.endDate ? toDateOnly(template.endDate) : null,
                isActive: template.isActive,
                accountId: template.accountId,
                categoryId: template.categoryId,
            })),
            transactions: transactions.map((transaction) => ({
                id: transaction.id,
                label: transaction.label,
                amount: Math.abs(transaction.amount),
                sourceAmount: transaction.sourceAmount == null ? null : Math.abs(transaction.sourceAmount),
                sourceCurrency: transaction.sourceCurrency,
                conversionMode: transaction.conversionMode,
                exchangeRate: transaction.exchangeRate,
                exchangeProvider: transaction.exchangeProvider,
                exchangeDate: transaction.exchangeDate ? toDateOnly(transaction.exchangeDate) : null,
                kind: transaction.kind,
                date: toDateOnly(transaction.date),
                note: transaction.note,
                taxCategory: transaction.taxCategory ?? null,
                taxSourceCountry: transaction.taxSourceCountry ?? null,
                taxSourceRegion: transaction.taxSourceRegion ?? null,
                taxTreatment: transaction.taxTreatment ?? 'UNKNOWN',
                taxWithheldAmount: transaction.taxWithheldAmount ?? null,
                taxWithheldCurrency: transaction.taxWithheldCurrency ?? null,
                taxWithheldCountry: transaction.taxWithheldCountry ?? null,
                taxDocumentRef: transaction.taxDocumentRef ?? null,
                accountId: transaction.accountId,
                categoryId: transaction.categoryId,
                transferGroup: transaction.transferGroup ?? null,
                transferDirection: transaction.transferDirection ?? null,
                transferPeerAccountId: transaction.transferPeerAccountId ?? null,
            })),
            taxProfiles: taxProfiles.map((profile) => ({
                id: profile.id,
                year: profile.year,
                residenceCountry: profile.residenceCountry,
                residenceRegion: profile.residenceRegion,
                currency: profile.currency,
            })),
        },
    }
}

export function serializeBudgetBackup(snapshot: BudgetBackupSnapshot) {
    return `${JSON.stringify(snapshot, null, 2)}\n`
}

export function parseBudgetBackup(content: string): BudgetBackupSnapshot {
    const parsed = JSON.parse(content)

    if (
        !parsed ||
        parsed.kind !== 'budget-backup' ||
        ![2, 3, 4].includes(parsed.version) ||
        !parsed.data ||
        !Array.isArray(parsed.data.accounts) ||
        !Array.isArray(parsed.data.categories) ||
        !Array.isArray(parsed.data.budgetTargets) ||
        !Array.isArray(parsed.data.recurringTemplates) ||
        !Array.isArray(parsed.data.transactions) ||
        (parsed.data.taxProfiles != null && !Array.isArray(parsed.data.taxProfiles))
    ) {
        throw new Error('Le fichier JSON ne correspond pas à un backup budget valide.')
    }

    return parsed as BudgetBackupSnapshot
}
