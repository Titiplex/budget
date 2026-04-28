export type SectionKey = 'overview' | 'transactions' | 'accounts' | 'categories' | 'budgets' | 'recurring' | 'wealth' | 'reports' | 'wealth'
export type CreateTabKey = 'transaction' | 'account' | 'category'
export type EntityType = 'transaction' | 'account' | 'category'
export type PanelMode = 'create' | 'edit'
export type TransactionKind = 'INCOME' | 'EXPENSE' | 'TRANSFER'
export type AccountType = 'CASH' | 'BANK' | 'SAVINGS' | 'CREDIT' | 'INVESTMENT' | 'OTHER'
export type AccountTaxReportingType = 'STANDARD' | 'BANK' | 'CASH' | 'BROKERAGE' | 'CRYPTO' | 'LIFE_INSURANCE' | 'RETIREMENT' | 'LOAN' | 'OTHER'
export type ConversionMode = 'NONE' | 'MANUAL' | 'AUTOMATIC'
export type TransferDirection = 'OUT' | 'IN'
export type ReportPreset = 'THIS_MONTH' | 'LAST_30_DAYS' | 'THIS_YEAR' | 'ALL' | 'CUSTOM'
export type BudgetPeriod = 'MONTHLY' | 'YEARLY' | 'CUSTOM'
export type BudgetStatus = 'UNDER' | 'NEAR' | 'OVER'
export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
export type TaxIncomeCategory = 'EMPLOYMENT' | 'BUSINESS' | 'INTEREST' | 'DIVIDEND' | 'CAPITAL_GAIN' | 'RENTAL' | 'PENSION' | 'BENEFIT' | 'GIFT' | 'REFUND' | 'TRANSFER' | 'OTHER'
export type TaxTreatment = 'UNKNOWN' | 'NOT_TAXABLE' | 'TAXABLE_NO_WITHHOLDING' | 'TAX_WITHHELD_AT_SOURCE' | 'FOREIGN_TAX_CREDIT_CANDIDATE' | 'TREATY_EXEMPT_CANDIDATE' | 'REVIEW_REQUIRED'
export type TaxJurisdiction = 'FR' | 'CA' | 'QC' | (string & {})
export type TaxReportSeverity = 'info' | 'warning' | 'review'
export type TaxReportConfidence = 'low' | 'medium' | 'high'

export interface Account {
    id: number
    name: string
    type: AccountType
    currency: string
    description: string | null
    institutionCountry?: string | null
    institutionRegion?: string | null
    taxReportingType?: AccountTaxReportingType
    openedAt?: string | null
    closedAt?: string | null
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
    taxCategory?: TaxIncomeCategory | null
    taxSourceCountry?: string | null
    taxSourceRegion?: string | null
    taxTreatment?: TaxTreatment
    taxWithheldAmount?: number | null
    taxWithheldCurrency?: string | null
    taxWithheldCountry?: string | null
    taxDocumentRef?: string | null
    accountId: number
    categoryId: number | null
    transferGroup?: string | null
    transferDirection?: TransferDirection | null
    transferPeerAccountId?: number | null
    account?: Account | null
    category?: Category | null
    transferPeerAccount?: Account | null
}

export interface TaxProfile {
    id: number
    year: number
    residenceCountry: string
    residenceRegion: string | null
    currency: string
}

export interface TaxReportItem {
    entityType: 'account' | 'transaction' | 'aggregate'
    entityId?: number
    label: string
    amount?: number
    currency?: string
    explanation: string
    explanationKey?: string
    explanationValues?: Record<string, string | number | null | undefined>
    suggestedForms: string[]
    confidence: TaxReportConfidence
}

export interface TaxReportSection {
    jurisdiction: TaxJurisdiction
    title: string
    titleKey?: string
    severity: TaxReportSeverity
    items: TaxReportItem[]
}

export interface TaxReport {
    profile: TaxProfile
    generatedAt: string
    sections: TaxReportSection[]
    disclaimer: string
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

export interface RecurringForecastOccurrence {
    templateId: number
    label: string
    kind: TransactionKind
    plannedDate: string
    amount: number
    currency: string
    accountName: string
    categoryName: string
}

export interface RecurringInsightSummary {
    activeCount: number
    monthlyExpenseCommitment: number
    monthlyIncomeCommitment: number
    netMonthlyCommitment: number
    next30DaysExpense: number
    next30DaysIncome: number
    next30DaysNet: number
    upcomingCount: number
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
    heading: string
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
    internalTransferCount: number
}

export interface ReportMetricComparison {
    current: number
    previous: number
    delta: number
    deltaPercent: number | null
    trend: 'up' | 'down' | 'flat'
}

export interface ReportComparisonSummary {
    previousStartDate: string
    previousEndDate: string
    transactionCount: ReportMetricComparison
    income: ReportMetricComparison
    expense: ReportMetricComparison
    net: ReportMetricComparison
    savingsRate: ReportMetricComparison
    averageExpense: ReportMetricComparison
    averageIncome: ReportMetricComparison
    foreignTransactionCount: ReportMetricComparison
    internalTransferCount: ReportMetricComparison
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
    institutionCountry?: string | null
    institutionRegion?: string | null
    taxReportingType?: AccountTaxReportingType
    openedAt?: string | null
    closedAt?: string | null
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
    taxCategory?: TaxIncomeCategory | null
    taxSourceCountry?: string | null
    taxSourceRegion?: string | null
    taxTreatment?: TaxTreatment
    taxWithheldAmount?: number | null
    taxWithheldCurrency?: string | null
    taxWithheldCountry?: string | null
    taxDocumentRef?: string | null
    accountId: number
    categoryId: number | null
    transferGroup?: string | null
    transferDirection?: TransferDirection | null
    transferPeerAccountId?: number | null
}

export interface BudgetBackupTaxProfile {
    id: number
    year: number
    residenceCountry: string
    residenceRegion: string | null
    currency: string
}

export interface BudgetBackupSnapshot {
    kind: 'budget-backup'
    version: 2 | 3 | 4
    exportedAt: string
    data: {
        accounts: BudgetBackupAccount[]
        categories: BudgetBackupCategory[]
        budgetTargets: BudgetBackupBudgetTarget[]
        recurringTemplates: BudgetBackupRecurringTransactionTemplate[]
        transactions: BudgetBackupTransaction[]
        taxProfiles?: BudgetBackupTaxProfile[]
    }
}