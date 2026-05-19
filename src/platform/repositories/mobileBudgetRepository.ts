import type {BudgetRepository} from './budgetRepository'

let repositoryPromise: Promise<BudgetRepository> | null = null

async function getMobileRepositoryImpl(): Promise<BudgetRepository> {
    if (!repositoryPromise) {
        repositoryPromise = import('./mobileSqliteBudgetRepository')
            .then(({createMobileSqliteBudgetRepository}) => createMobileSqliteBudgetRepository())
    }

    return repositoryPromise
}

export function createMobileBudgetRepository(): BudgetRepository {
    return {
        accounts: {
            list: async () => (await getMobileRepositoryImpl()).accounts.list(),
            create: async (data) => (await getMobileRepositoryImpl()).accounts.create(data),
            update: async (id, data) => (await getMobileRepositoryImpl()).accounts.update(id, data),
            delete: async (id) => (await getMobileRepositoryImpl()).accounts.delete(id),
        },
        categories: {
            list: async () => (await getMobileRepositoryImpl()).categories.list(),
            create: async (data) => (await getMobileRepositoryImpl()).categories.create(data),
            update: async (id, data) => (await getMobileRepositoryImpl()).categories.update(id, data),
            delete: async (id) => (await getMobileRepositoryImpl()).categories.delete(id),
        },
        transactions: {
            list: async () => (await getMobileRepositoryImpl()).transactions.list(),
            create: async (data) => (await getMobileRepositoryImpl()).transactions.create(data),
            update: async (id, data) => (await getMobileRepositoryImpl()).transactions.update(id, data),
            delete: async (id) => (await getMobileRepositoryImpl()).transactions.delete(id),
        },
        fx: {
            quoteHistorical: async (input) => (await getMobileRepositoryImpl()).fx.quoteHistorical(input),
        },
    }
}
