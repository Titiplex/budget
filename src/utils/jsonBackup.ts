import type {
    Account,
    BudgetBackupSnapshot,
    BudgetTarget,
    Category,
    RecurringTransactionTemplate,
    Transaction,
} from '../types/budget'

export function createBudgetBackupSnapshot(
    accounts: Account[],
    categories: Category[],
    budgetTargets: BudgetTarget[],
    recurringTemplates: RecurringTransactionTemplate[],
    transactions: Transaction[],
): BudgetBackupSnapshot {
    return {
        kind: 'budget-backup',
        version: 2,
        exportedAt: new Date().toISOString(),
        data: {
            accounts: accounts.map((account) => ({
                id: account.id,
                name: account.name,
                type: account.type,
                currency: account.currency,
                description: account.description,
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
                startDate: new Date(budgetTarget.startDate).toISOString(),
                endDate: budgetTarget.endDate ? new Date(budgetTarget.endDate).toISOString() : null,
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
                startDate: new Date(template.startDate).toISOString(),
                nextOccurrenceDate: new Date(template.nextOccurrenceDate).toISOString(),
                endDate: template.endDate ? new Date(template.endDate).toISOString() : null,
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
                exchangeDate: transaction.exchangeDate,
                kind: transaction.kind,
                date: new Date(transaction.date).toISOString(),
                note: transaction.note,
                accountId: transaction.accountId,
                categoryId: transaction.categoryId,
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
        parsed.version !== 2 ||
        !parsed.data ||
        !Array.isArray(parsed.data.accounts) ||
        !Array.isArray(parsed.data.categories) ||
        !Array.isArray(parsed.data.budgetTargets) ||
        !Array.isArray(parsed.data.recurringTemplates) ||
        !Array.isArray(parsed.data.transactions)
    ) {
        throw new Error('Le fichier JSON ne correspond pas à un backup budget valide.')
    }

    return parsed as BudgetBackupSnapshot
}