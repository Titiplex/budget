import type {
    Account,
    AccountType,
    Category,
    ConversionMode,
    Transaction,
    TransactionKind,
} from '../../types/budget'

export interface CreateAccountInput {
    name: string
    type: AccountType
    currency?: string
    description?: string | null
}

export interface UpdateAccountInput extends CreateAccountInput {}

export interface CreateCategoryInput {
    name: string
    kind: TransactionKind
    color?: string | null
    description?: string | null
}

export interface UpdateCategoryInput extends CreateCategoryInput {}

export interface CreateTransactionInput {
    label: string
    amount: number
    sourceAmount?: number | null
    sourceCurrency?: string | null
    conversionMode?: ConversionMode
    exchangeRate?: number | null
    exchangeProvider?: string | null
    exchangeDate?: string | null
    kind: TransactionKind
    date: string
    note?: string | null
    accountId: number
    categoryId?: number | null
    transferTargetAccountId?: number | null
}

export interface UpdateTransactionInput extends CreateTransactionInput {}

export interface FxQuoteInput {
    from: string
    to: string
    amount: number
    date: string
}

export interface FxQuoteResult {
    from: string
    to: string
    rate: number
    convertedAmount: number
    provider: string
    date: string
}

export interface EntityRepository<T, TCreate, TUpdate> {
    list(): Promise<T[]>
    create(data: TCreate): Promise<T>
    update(id: number, data: TUpdate): Promise<T>
    delete(id: number): Promise<T>
}

export interface BudgetRepository {
    accounts: EntityRepository<Account, CreateAccountInput, UpdateAccountInput>
    categories: EntityRepository<Category, CreateCategoryInput, UpdateCategoryInput>
    transactions: EntityRepository<Transaction, CreateTransactionInput, UpdateTransactionInput>
    fx: {
        quoteHistorical(input: FxQuoteInput): Promise<FxQuoteResult>
    }
}
