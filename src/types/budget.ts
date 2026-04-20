export type SectionKey = 'overview' | 'transactions' | 'accounts' | 'categories'
export type CreateTabKey = 'transaction' | 'account' | 'category'
export type EntityType = 'transaction' | 'account' | 'category'
export type PanelMode = 'create' | 'edit'
export type TransactionKind = 'INCOME' | 'EXPENSE' | 'TRANSFER'
export type AccountType = 'CASH' | 'BANK' | 'SAVINGS' | 'CREDIT' | 'INVESTMENT' | 'OTHER'

export interface Account {
    id: number
    name: string
    type: AccountType
    currency: string
    description: string | null
}

export interface Category {
    id: number
    name: string
    kind: TransactionKind
    color: string | null
    description: string | null
}

export interface Transaction {
    id: number
    label: string
    amount: number
    kind: TransactionKind
    date: string
    note: string | null
    accountId: number
    categoryId: number | null
    account?: Account | null
    category?: Category | null
}

export interface AccountSummary extends Account {
    transactionCount: number
    income: number
    expense: number
    net: number
}

export interface CategorySummary extends Category {
    transactionCount: number
    total: number
}

export interface EditTarget {
    type: EntityType
    id: number
}

export interface DeleteState {
    open: boolean
    busy: boolean
    type: EntityType
    id: number
    label: string
    message: string
}