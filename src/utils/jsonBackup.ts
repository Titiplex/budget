import type {
    Account,
    BudgetBackupSnapshot,
    Category,
    Transaction,
} from '../types/budget'

export function createBudgetBackupSnapshot(
    accounts: Account[],
    categories: Category[],
    transactions: Transaction[],
): BudgetBackupSnapshot {
    return {
        kind: 'budget-backup',
        version: 1,
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
            transactions: transactions.map((transaction) => ({
                id: transaction.id,
                label: transaction.label,
                amount: Math.abs(transaction.amount),
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
        parsed.version !== 1 ||
        !parsed.data ||
        !Array.isArray(parsed.data.accounts) ||
        !Array.isArray(parsed.data.categories) ||
        !Array.isArray(parsed.data.transactions)
    ) {
        throw new Error('Le fichier JSON ne correspond pas à un backup budget valide.')
    }

    return parsed as BudgetBackupSnapshot
}