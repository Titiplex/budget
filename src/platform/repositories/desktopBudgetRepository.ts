import type {BudgetRepository} from './budgetRepository'

function requireDesktopApi<T>(value: T | undefined, label: string): T {
    if (!value) {
        throw new Error(`${label} is not available. This code path must run inside Electron.`)
    }

    return value
}

export function createDesktopBudgetRepository(): BudgetRepository {
    const db = requireDesktopApi(window.db, 'window.db')
    const fx = requireDesktopApi(window.fx, 'window.fx')

    return {
        accounts: {
            list: () => db.account.list(),
            create: (data) => db.account.create(data),
            update: (id, data) => db.account.update(id, data),
            delete: (id) => db.account.delete(id),
        },
        categories: {
            list: () => db.category.list(),
            create: (data) => db.category.create(data),
            update: (id, data) => db.category.update(id, data),
            delete: (id) => db.category.delete(id),
        },
        transactions: {
            list: () => db.transaction.list(),
            create: (data) => db.transaction.create(data),
            update: (id, data) => db.transaction.update(id, data),
            delete: (id) => db.transaction.delete(id),
        },
        fx: {
            quoteHistorical: (input) => fx.quoteHistorical(input),
        },
    }
}
