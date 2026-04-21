export type SectionKey = 'overview' | 'transactions' | 'accounts' | 'categories' | 'budgets' | 'recurring' | 'reports'
export type CreateTabKey = 'transaction' | 'account' | 'category'
export type EntityType = 'transaction' | 'account' | 'category'
export type PanelMode = 'create' | 'edit'
export type TransactionKind = 'INCOME' | 'EXPENSE' | 'TRANSFER'
export type AccountType = 'CASH' | 'BANK' | 'SAVINGS' | 'CREDIT' | 'INVESTMENT' | 'OTHER'
export type ConversionMode = 'NONE' | 'MANUAL' | 'AUTOMATIC'
export type ReportPreset = 'THIS_MONTH' | 'LAST_30_DAYS' | 'THIS_YEAR' | 'ALL' | 'CUSTOM'
export type BudgetPeriod = 'MONTHLY' | 'YEARLY' | 'CUSTOM'
export type BudgetStatus = 'UNDER' | 'NEAR' | 'OVER'
export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

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
    sourceAmount: number | null
    sourceCurrency: string | null
    conversionMode: ConversionMode
    exchangeRate: number | null
    exchangeProvider: string | null
    exchangeDate: string | null
    kind: TransactionKind
    date: string
    note: string | null
    accountId: number
    categoryId: number | null
    account?: Account | null
    category?: Category | null
}

export interface BudgetTarget {
    id: number
    name: string
    amount: number
    period: BudgetPeriod
    startDate: string
    endDate: string | null
    currency: string
    isActive: boolean
    note: string | null
    categoryId: number
    category?: Category | null
}

export interface BudgetProgressRow {
    budgetId: number
    name: string
    categoryId: number
    categoryName: string
    categoryColor: string | null
    period: BudgetPeriod
    startDate: string
    endDate: string | null
    targetAmount: number
    spentAmount: number
    remainingAmount: number
    progressPercent: number
    status: BudgetStatus
    transactionCount: number
    currency: string
    note: string | null
    isActive: boolean
}

export interface RecurringTransactionTemplate {
    id: number
    label: string
    sourceAmount: number
    sourceCurrency: string
    accountAmount: number | null
    conversionMode: ConversionMode
    exchangeRate: number | null
    exchangeProvider: string | null
    kind: TransactionKind
    note: string | null
    frequency: RecurringFrequency
    intervalCount: number
    startDate: string
    nextOccurrenceDate: string
    endDate: string | null
    isActive: boolean
    accountId: number
    categoryId: number | null
    account?: Account | null
    category?: Category | null
}

export interface RecurringTemplateRow {
    templateId: number
    label: string
    sourceAmount: number
    sourceCurrency: string
    accountCurrency: string
    conversionMode: ConversionMode
    kind: TransactionKind
    frequency: RecurringFrequency
    intervalCount: number
    nextOccurrenceDate: string
    endDate: string | null
    isActive: boolean
    dueCount: number
    overdue: boolean
    accountName: string
    categoryName: string
    note: string | null
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

export interface MonthlyPoint {
    key: string
    label: string
    income: number
    expense: number
    net: number
}

export interface ExpenseBreakdownItem {
    name: string
    total: number
    color: string | null
    percent: number
}

export interface ReportSummary {
    startDate: string
    endDate: string
    transactionCount: number
    income: number
    expense: number
    net: number
    savingsRate: number
    averageExpense: number
    averageIncome: number
    foreignTransactionCount: number
}

export interface ReportAccountTypeRow {
    type: AccountType
    accountCount: number
    transactionCount: number
    income: number
    expense: number
    net: number
}

export interface ReportAccountRow {
    accountId: number
    name: string
    type: AccountType
    currency: string
    transactionCount: number
    income: number
    expense: number
    net: number
}

export interface ReportCategoryRow {
    categoryId: number | null
    name: string
    transactionCount: number
    total: number
    kind: TransactionKind | 'MIXED'
}

export interface ReportCurrencyRow {
    currency: string
    transactionCount: number
    sourceTotal: number
    bookedTotal: number
}

export interface ReportWeekdayRow {
    label: string
    total: number
}

export interface ReportInsight {
    title: string
    text: string
}

export interface BudgetBackupAccount {
    id: number
    name: string
    type: AccountType
    currency: string
    description: string | null
}

export interface BudgetBackupCategory {
    id: number
    name: string
    kind: TransactionKind
    color: string | null
    description: string | null
}

export interface BudgetBackupBudgetTarget {
    id: number
    name: string
    amount: number
    period: BudgetPeriod
    startDate: string
    endDate: string | null
    currency: string
    isActive: boolean
    note: string | null
    categoryId: number
}

export interface BudgetBackupRecurringTransactionTemplate {
    id: number
    label: string
    sourceAmount: number
    sourceCurrency: string
    accountAmount: number | null
    conversionMode: ConversionMode
    exchangeRate: number | null
    exchangeProvider: string | null
    kind: TransactionKind
    note: string | null
    frequency: RecurringFrequency
    intervalCount: number
    startDate: string
    nextOccurrenceDate: string
    endDate: string | null
    isActive: boolean
    accountId: number
    categoryId: number | null
}

export interface BudgetBackupTransaction {
    id: number
    label: string
    amount: number
    sourceAmount: number | null
    sourceCurrency: string | null
    conversionMode: ConversionMode
    exchangeRate: number | null
    exchangeProvider: string | null
    exchangeDate: string | null
    kind: TransactionKind
    date: string
    note: string | null
    accountId: number
    categoryId: number | null
}

export interface BudgetBackupSnapshot {
    kind: 'budget-backup'
    version: 2
    exportedAt: string
    data: {
        accounts: BudgetBackupAccount[]
        categories: BudgetBackupCategory[]
        budgetTargets: BudgetBackupBudgetTarget[]
        recurringTemplates: BudgetBackupRecurringTransactionTemplate[]
        transactions: BudgetBackupTransaction[]
    }
}