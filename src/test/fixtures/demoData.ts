const FIXTURE_NOW_ISO = '2026-05-01T12:00:00.000Z'

export const fixtureClock = {
    nowIso: FIXTURE_NOW_ISO,
    now: () => new Date(FIXTURE_NOW_ISO),
    date: (iso: string) => new Date(iso),
}

type CurrencyCode = 'CAD' | 'USD' | 'EUR'
type AccountType = 'CASH' | 'BANK' | 'SAVINGS' | 'CREDIT' | 'INVESTMENT' | 'OTHER'
type TransactionKind = 'INCOME' | 'EXPENSE' | 'TRANSFER'
type ConversionMode = 'NONE' | 'MANUAL' | 'AUTOMATIC'
type BudgetPeriod = 'MONTHLY' | 'YEARLY' | 'CUSTOM'
type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
type TransferDirection = 'OUT' | 'IN'
type WealthRecordStatus = 'ACTIVE' | 'ARCHIVED'
type WealthValuationMode = 'MANUAL' | 'CALCULATED' | 'IMPORTED'
type ImportRowStatus = 'RAW' | 'NORMALIZED' | 'VALID' | 'INVALID' | 'DUPLICATE' | 'RECONCILED' | 'APPLIED' | 'SKIPPED'

type WithKey<T> = T & {key: string}

type AccountFixture = WithKey<{
    name: string
    type: AccountType
    currency: CurrencyCode
    description?: string
    institutionCountry?: string
    institutionRegion?: string
    taxReportingType?: 'STANDARD' | 'BANK' | 'CASH' | 'BROKERAGE' | 'CRYPTO' | 'RETIREMENT' | 'LOAN' | 'OTHER'
    openedAt?: Date
    closedAt?: Date | null
}>

type CategoryFixture = WithKey<{
    name: string
    kind: TransactionKind
    color?: string
    description?: string
}>

type TransactionFixture = WithKey<{
    label: string
    amount: number
    sourceAmount?: number
    sourceCurrency?: CurrencyCode
    conversionMode?: ConversionMode
    exchangeRate?: number
    exchangeProvider?: string
    exchangeDate?: Date
    kind: TransactionKind
    date: Date
    note?: string
    transferGroup?: string
    transferDirection?: TransferDirection
    accountKey: string
    categoryKey?: string
    transferPeerAccountKey?: string
}>

type BudgetFixture = WithKey<{
    name: string
    amount: number
    period: BudgetPeriod
    startDate: Date
    endDate?: Date | null
    currency: CurrencyCode
    isActive?: boolean
    note?: string
    categoryKey: string
}>

type RecurringFixture = WithKey<{
    label: string
    sourceAmount: number
    sourceCurrency: CurrencyCode
    accountAmount?: number
    conversionMode?: ConversionMode
    exchangeRate?: number
    exchangeProvider?: string
    kind: TransactionKind
    note?: string
    frequency: RecurringFrequency
    intervalCount?: number
    startDate: Date
    nextOccurrenceDate: Date
    endDate?: Date | null
    isActive?: boolean
    accountKey: string
    categoryKey?: string
}>

type AssetFixture = WithKey<{
    name: string
    type: 'CASH' | 'REAL_ESTATE' | 'VEHICLE' | 'COLLECTIBLE' | 'BUSINESS' | 'PRIVATE_EQUITY' | 'CRYPTO' | 'OTHER'
    status?: WealthRecordStatus
    currency: CurrencyCode
    valuationMode?: WealthValuationMode
    currentValue: number
    includeInNetWorth?: boolean
    ownershipPercent?: number
    acquisitionValue?: number
    acquiredAt?: Date
    valueAsOf?: Date
    institutionName?: string
    institutionCountry?: string
    institutionRegion?: string
    note?: string
}>

type PortfolioFixture = WithKey<{
    name: string
    type: 'TAXABLE_BROKERAGE' | 'RETIREMENT' | 'EDUCATION' | 'CRYPTO' | 'SAVINGS_INVESTMENT' | 'OTHER'
    status?: WealthRecordStatus
    currency: CurrencyCode
    institutionName?: string
    institutionCountry?: string
    institutionRegion?: string
    taxWrapper?: 'NONE' | 'TFSA' | 'RRSP' | 'FHSA' | 'RESP' | 'OTHER'
    valuationMode?: WealthValuationMode
    currentValue: number
    includeInNetWorth?: boolean
    ownershipPercent?: number
    cashBalance?: number
    valueAsOf?: Date
    note?: string
    accountKey?: string
}>

type LiabilityFixture = WithKey<{
    name: string
    type: 'CREDIT_CARD' | 'PERSONAL_LOAN' | 'MORTGAGE' | 'STUDENT_LOAN' | 'LINE_OF_CREDIT' | 'OTHER'
    status?: WealthRecordStatus
    currency: CurrencyCode
    currentBalance: number
    includeInNetWorth?: boolean
    initialAmount?: number
    interestRate?: number
    minimumPayment?: number
    paymentFrequency?: 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY' | 'YEARLY' | 'OTHER'
    rateType?: 'FIXED' | 'VARIABLE' | 'UNKNOWN'
    lenderName?: string
    institutionCountry?: string
    institutionRegion?: string
    openedAt?: Date
    dueAt?: Date
    balanceAsOf?: Date
    note?: string
    securedAssetKey?: string
    accountKey?: string
}>

type NetWorthSnapshotFixture = WithKey<{
    snapshotDate: Date
    currency: CurrencyCode
    totalStandaloneAssets: number
    totalPortfolios: number
    totalAssets: number
    totalLiabilities: number
    netWorth: number
    source?: 'MANUAL' | 'GENERATED' | 'IMPORT' | 'OTHER'
    assetBreakdownJson?: string
    portfolioBreakdownJson?: string
    liabilityBreakdownJson?: string
    note?: string
}>

type GoalFixture = WithKey<{
    name: string
    type: 'EMERGENCY_FUND' | 'SAVINGS' | 'PURCHASE' | 'DEBT_PAYOFF' | 'NET_WORTH' | 'RETIREMENT' | 'OTHER'
    targetAmount: number
    currency: CurrencyCode
    targetDate?: Date | null
    startingAmount?: number
    status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
    priority?: number
    notes?: string
    trackedAssetKey?: string
    trackedPortfolioKey?: string
    trackedLiabilityKey?: string
    baselineSnapshotKey?: string
}>

type ProjectionScenarioFixture = WithKey<{
    name: string
    kind?: 'CONSERVATIVE' | 'BASELINE' | 'OPTIMISTIC' | 'CUSTOM'
    description?: string
    isDefault?: boolean
}>

type ProjectionSettingFixture = WithKey<{
    projectionHorizonMonths: number
    displayCurrency: CurrencyCode
    estimatedMonthlySurplus: number
    manualMonthlyContribution?: number
    annualGrowthRate?: number
    notes?: string
    goalKey: string
    scenarioKey: string
}>

type ImportCsvFixture = WithKey<{
    fileName: string
    provider: string
    accountKey: string
    defaultCurrency: CurrencyCode
    csv: string
    rows: Array<{
        rowNumber: number
        rawText: string
        rawJson: Record<string, string>
        status: ImportRowStatus
        normalized?: {
            label: string
            amount: number
            currency: CurrencyCode
            transactionDate: Date
            externalRef: string
            duplicateKey: string
            duplicateConfidence: number
        }
        error?: {
            stage: 'PARSING' | 'NORMALIZATION' | 'VALIDATION' | 'RECONCILIATION' | 'APPLY'
            severity: 'INFO' | 'WARNING' | 'ERROR'
            code: string
            message: string
            field?: string
            detailsJson?: string
        }
    }>
}>

export type DemoProfile = {
    key: string
    name: string
    description: string
    fixedNow: Date
    accounts: AccountFixture[]
    categories: CategoryFixture[]
    transactions: TransactionFixture[]
    transfers: TransactionFixture[]
    budgets: BudgetFixture[]
    recurringTransactions: RecurringFixture[]
    assets: AssetFixture[]
    portfolios: PortfolioFixture[]
    liabilities: LiabilityFixture[]
    netWorthSnapshots: NetWorthSnapshotFixture[]
    financialGoals: GoalFixture[]
    projectionScenarios: ProjectionScenarioFixture[]
    projectionSettings: ProjectionSettingFixture[]
    imports: ImportCsvFixture[]
}

const DEFAULT_COLORS = {
    income: '#22c55e',
    expense: '#f59e0b',
    transfer: '#3b82f6',
}

function mergeFixture<T extends {key: string}>(base: T, overrides: Partial<T> = {}): T {
    return {...base, ...overrides}
}

export function makeAccount(overrides: Partial<AccountFixture> = {}): AccountFixture {
    return mergeFixture(
        {
            key: 'account-main-chequing',
            name: 'Main chequing',
            type: 'BANK',
            currency: 'CAD',
            description: 'Deterministic local-first test account.',
            institutionCountry: 'CA',
            institutionRegion: 'QC',
            taxReportingType: 'BANK',
            openedAt: fixtureClock.date('2024-01-01T00:00:00.000Z'),
        },
        overrides,
    )
}

export function makeCategory(overrides: Partial<CategoryFixture> = {}): CategoryFixture {
    return mergeFixture(
        {
            key: 'category-groceries',
            name: 'Groceries',
            kind: 'EXPENSE',
            color: DEFAULT_COLORS.expense,
            description: 'Stable category for grocery expenses.',
        },
        overrides,
    )
}

export function makeTransaction(overrides: Partial<TransactionFixture> = {}): TransactionFixture {
    return mergeFixture(
        {
            key: 'transaction-groceries-2026-04-05',
            label: 'Groceries',
            amount: 86.42,
            sourceAmount: 86.42,
            sourceCurrency: 'CAD',
            conversionMode: 'NONE',
            kind: 'EXPENSE',
            date: fixtureClock.date('2026-04-05T00:00:00.000Z'),
            note: 'Fixture transaction with a fixed date.',
            accountKey: 'account-main-chequing',
            categoryKey: 'category-groceries',
        },
        overrides,
    )
}

export function makeInternalTransfer(overrides: {
    key?: string
    fromAccountKey?: string
    toAccountKey?: string
    amount?: number
    currency?: CurrencyCode
    date?: Date
    note?: string
} = {}): TransactionFixture[] {
    const transferKey = overrides.key ?? 'transfer-chequing-to-savings-2026-04-15'
    const fromAccountKey = overrides.fromAccountKey ?? 'account-main-chequing'
    const toAccountKey = overrides.toAccountKey ?? 'account-emergency-savings'
    const amount = overrides.amount ?? 250
    const currency = overrides.currency ?? 'CAD'
    const date = overrides.date ?? fixtureClock.date('2026-04-15T00:00:00.000Z')

    return [
        makeTransaction({
            key: `${transferKey}-out`,
            label: 'Transfer to emergency savings',
            amount,
            sourceAmount: amount,
            sourceCurrency: currency,
            conversionMode: 'NONE',
            kind: 'TRANSFER',
            date,
            note: overrides.note ?? 'Fixture transfer outgoing leg.',
            accountKey: fromAccountKey,
            categoryKey: undefined,
            transferGroup: transferKey,
            transferDirection: 'OUT',
            transferPeerAccountKey: toAccountKey,
        }),
        makeTransaction({
            key: `${transferKey}-in`,
            label: 'Transfer from chequing',
            amount,
            sourceAmount: amount,
            sourceCurrency: currency,
            conversionMode: 'NONE',
            kind: 'TRANSFER',
            date,
            note: overrides.note ?? 'Fixture transfer incoming leg.',
            accountKey: toAccountKey,
            categoryKey: undefined,
            transferGroup: transferKey,
            transferDirection: 'IN',
            transferPeerAccountKey: fromAccountKey,
        }),
    ]
}

export function makeBudgetTarget(overrides: Partial<BudgetFixture> = {}): BudgetFixture {
    return mergeFixture(
        {
            key: 'budget-groceries-april-2026',
            name: 'Groceries monthly cap',
            amount: 450,
            period: 'MONTHLY',
            startDate: fixtureClock.date('2026-04-01T00:00:00.000Z'),
            endDate: null,
            currency: 'CAD',
            isActive: true,
            note: 'Stable monthly budget target for tests.',
            categoryKey: 'category-groceries',
        },
        overrides,
    )
}

export function makeRecurringTransaction(overrides: Partial<RecurringFixture> = {}): RecurringFixture {
    return mergeFixture(
        {
            key: 'recurring-rent-2026',
            label: 'Rent',
            sourceAmount: 1250,
            sourceCurrency: 'CAD',
            accountAmount: 1250,
            conversionMode: 'NONE',
            kind: 'EXPENSE',
            note: 'Fixed recurring fixture with a deterministic next occurrence.',
            frequency: 'MONTHLY',
            intervalCount: 1,
            startDate: fixtureClock.date('2026-01-01T00:00:00.000Z'),
            nextOccurrenceDate: fixtureClock.date('2026-05-01T00:00:00.000Z'),
            endDate: null,
            isActive: true,
            accountKey: 'account-main-chequing',
            categoryKey: 'category-rent',
        },
        overrides,
    )
}

export function makeAsset(overrides: Partial<AssetFixture> = {}): AssetFixture {
    return mergeFixture(
        {
            key: 'asset-used-car',
            name: 'Used car',
            type: 'VEHICLE',
            status: 'ACTIVE',
            currency: 'CAD',
            valuationMode: 'MANUAL',
            currentValue: 8500,
            includeInNetWorth: true,
            ownershipPercent: 100,
            acquisitionValue: 11000,
            acquiredAt: fixtureClock.date('2024-07-01T00:00:00.000Z'),
            valueAsOf: fixtureClock.date('2026-04-30T00:00:00.000Z'),
            note: 'Manual valuation fixture.',
        },
        overrides,
    )
}

export function makePortfolio(overrides: Partial<PortfolioFixture> = {}): PortfolioFixture {
    return mergeFixture(
        {
            key: 'portfolio-tfsa-growth',
            name: 'TFSA growth portfolio',
            type: 'RETIREMENT',
            status: 'ACTIVE',
            currency: 'CAD',
            institutionName: 'Demo Brokerage',
            institutionCountry: 'CA',
            institutionRegion: 'QC',
            taxWrapper: 'TFSA',
            valuationMode: 'MANUAL',
            currentValue: 12750,
            includeInNetWorth: true,
            ownershipPercent: 100,
            cashBalance: 250,
            valueAsOf: fixtureClock.date('2026-04-30T00:00:00.000Z'),
            note: 'Demo portfolio without external market dependency.',
            accountKey: 'account-tfsa-investment',
        },
        overrides,
    )
}

export function makeLiability(overrides: Partial<LiabilityFixture> = {}): LiabilityFixture {
    return mergeFixture(
        {
            key: 'liability-credit-card',
            name: 'Credit card balance',
            type: 'CREDIT_CARD',
            status: 'ACTIVE',
            currency: 'CAD',
            currentBalance: 620,
            includeInNetWorth: true,
            initialAmount: 620,
            interestRate: 0.1999,
            minimumPayment: 35,
            paymentFrequency: 'MONTHLY',
            rateType: 'VARIABLE',
            lenderName: 'Demo Card',
            institutionCountry: 'CA',
            institutionRegion: 'QC',
            openedAt: fixtureClock.date('2023-03-01T00:00:00.000Z'),
            balanceAsOf: fixtureClock.date('2026-04-30T00:00:00.000Z'),
            note: 'Small deterministic liability fixture.',
            accountKey: 'account-credit-card',
        },
        overrides,
    )
}

export function makeNetWorthSnapshot(overrides: Partial<NetWorthSnapshotFixture> = {}): NetWorthSnapshotFixture {
    return mergeFixture(
        {
            key: 'snapshot-net-worth-2026-04-30',
            snapshotDate: fixtureClock.date('2026-04-30T00:00:00.000Z'),
            currency: 'CAD',
            totalStandaloneAssets: 8500,
            totalPortfolios: 12750,
            totalAssets: 21250,
            totalLiabilities: 620,
            netWorth: 20630,
            source: 'GENERATED',
            assetBreakdownJson: JSON.stringify([{key: 'asset-used-car', name: 'Used car', value: 8500, currency: 'CAD'}]),
            portfolioBreakdownJson: JSON.stringify([
                {key: 'portfolio-tfsa-growth', name: 'TFSA growth portfolio', value: 12750, currency: 'CAD'},
            ]),
            liabilityBreakdownJson: JSON.stringify([
                {key: 'liability-credit-card', name: 'Credit card balance', value: 620, currency: 'CAD'},
            ]),
            note: 'Generated from deterministic fixture values.',
        },
        overrides,
    )
}

export function makeFinancialGoal(overrides: Partial<GoalFixture> = {}): GoalFixture {
    return mergeFixture(
        {
            key: 'goal-emergency-fund',
            name: 'Emergency fund',
            type: 'EMERGENCY_FUND',
            targetAmount: 6000,
            currency: 'CAD',
            targetDate: fixtureClock.date('2027-05-01T00:00:00.000Z'),
            startingAmount: 1500,
            status: 'ACTIVE',
            priority: 1,
            notes: 'Demo goal using deterministic assumptions only.',
        },
        overrides,
    )
}

export function makeProjectionScenario(overrides: Partial<ProjectionScenarioFixture> = {}): ProjectionScenarioFixture {
    return mergeFixture(
        {
            key: 'scenario-base',
            name: 'Fixture base projection',
            kind: 'BASELINE',
            description: 'Stable baseline projection scenario for tests.',
            isDefault: true,
        },
        overrides,
    )
}

export function makeProjectionSetting(overrides: Partial<ProjectionSettingFixture> = {}): ProjectionSettingFixture {
    return mergeFixture(
        {
            key: 'projection-emergency-base',
            projectionHorizonMonths: 24,
            displayCurrency: 'CAD',
            estimatedMonthlySurplus: 500,
            manualMonthlyContribution: 500,
            annualGrowthRate: 0.02,
            notes: 'Fixture projection setting, not financial advice.',
            goalKey: 'goal-emergency-fund',
            scenarioKey: 'scenario-base',
        },
        overrides,
    )
}

export function makeImportCsvFixture(overrides: Partial<ImportCsvFixture> = {}): ImportCsvFixture {
    const csv = [
        'date,label,amount,currency,externalRef',
        '2026-04-05,Groceries,-86.42,CAD,fixture-import-001',
        'not-a-date,Broken row,abc,CAD,fixture-import-002',
    ].join('\n')

    return mergeFixture(
        {
            key: 'import-main-chequing-april-2026',
            fileName: 'fixture-main-chequing-april-2026.csv',
            provider: 'fixture-bank',
            accountKey: 'account-main-chequing',
            defaultCurrency: 'CAD',
            csv,
            rows: [
                {
                    rowNumber: 1,
                    rawText: '2026-04-05,Groceries,-86.42,CAD,fixture-import-001',
                    rawJson: {
                        date: '2026-04-05',
                        label: 'Groceries',
                        amount: '-86.42',
                        currency: 'CAD',
                        externalRef: 'fixture-import-001',
                    },
                    status: 'APPLIED',
                    normalized: {
                        label: 'Groceries',
                        amount: 86.42,
                        currency: 'CAD',
                        transactionDate: fixtureClock.date('2026-04-05T00:00:00.000Z'),
                        externalRef: 'fixture-import-001',
                        duplicateKey: 'transaction:account-main-chequing:2026-04-05:86.42:Groceries',
                        duplicateConfidence: 0.98,
                    },
                },
                {
                    rowNumber: 2,
                    rawText: 'not-a-date,Broken row,abc,CAD,fixture-import-002',
                    rawJson: {
                        date: 'not-a-date',
                        label: 'Broken row',
                        amount: 'abc',
                        currency: 'CAD',
                        externalRef: 'fixture-import-002',
                    },
                    status: 'INVALID',
                    error: {
                        stage: 'VALIDATION',
                        severity: 'ERROR',
                        code: 'INVALID_AMOUNT',
                        message: 'Amount must be a finite number before normalization.',
                        field: 'amount',
                        detailsJson: JSON.stringify({received: 'abc', rowNumber: 2}),
                    },
                },
            ],
        },
        overrides,
    )
}

export function createSimpleBudgetProfile(): DemoProfile {
    const accounts = [
        makeAccount(),
        makeAccount({
            key: 'account-emergency-savings',
            name: 'Emergency savings',
            type: 'SAVINGS',
            description: 'Savings account used by transfer and emergency fund fixtures.',
        }),
    ]

    const categories = [
        makeCategory({key: 'category-salary', name: 'Salary', kind: 'INCOME', color: DEFAULT_COLORS.income}),
        makeCategory({key: 'category-rent', name: 'Rent', kind: 'EXPENSE', color: '#ef4444'}),
        makeCategory(),
        makeCategory({key: 'category-transport', name: 'Transport', kind: 'EXPENSE', color: '#6366f1'}),
    ]

    return {
        key: 'simple-budget',
        name: 'Simple budget profile',
        description: 'Personal budget with income, expenses, one transfer, one recurring rent and one savings goal.',
        fixedNow: fixtureClock.now(),
        accounts,
        categories,
        transactions: [
            makeTransaction({
                key: 'transaction-salary-2026-04-01',
                label: 'April salary',
                amount: 3200,
                sourceAmount: 3200,
                kind: 'INCOME',
                date: fixtureClock.date('2026-04-01T00:00:00.000Z'),
                accountKey: 'account-main-chequing',
                categoryKey: 'category-salary',
            }),
            makeTransaction(),
            makeTransaction({
                key: 'transaction-bus-pass-2026-04-02',
                label: 'Monthly bus pass',
                amount: 97,
                sourceAmount: 97,
                kind: 'EXPENSE',
                date: fixtureClock.date('2026-04-02T00:00:00.000Z'),
                accountKey: 'account-main-chequing',
                categoryKey: 'category-transport',
            }),
        ],
        transfers: makeInternalTransfer(),
        budgets: [
            makeBudgetTarget(),
            makeBudgetTarget({
                key: 'budget-transport-april-2026',
                name: 'Transport monthly cap',
                amount: 120,
                categoryKey: 'category-transport',
            }),
        ],
        recurringTransactions: [makeRecurringTransaction()],
        assets: [],
        portfolios: [],
        liabilities: [],
        netWorthSnapshots: [],
        financialGoals: [makeFinancialGoal()],
        projectionScenarios: [makeProjectionScenario()],
        projectionSettings: [makeProjectionSetting()],
        imports: [],
    }
}

export function createAdvancedWealthProfile(): DemoProfile {
    const accounts = [
        makeAccount(),
        makeAccount({
            key: 'account-usd-brokerage-cash',
            name: 'USD brokerage cash',
            type: 'INVESTMENT',
            currency: 'USD',
            description: 'USD account for manual conversion fixtures.',
            institutionCountry: 'US',
            institutionRegion: undefined,
            taxReportingType: 'BROKERAGE',
        }),
        makeAccount({
            key: 'account-tfsa-investment',
            name: 'TFSA investment account',
            type: 'INVESTMENT',
            currency: 'CAD',
            taxReportingType: 'RETIREMENT',
            description: 'Linked to the portfolio fixture.',
        }),
        makeAccount({
            key: 'account-credit-card',
            name: 'Credit card',
            type: 'CREDIT',
            currency: 'CAD',
            taxReportingType: 'STANDARD',
            description: 'Linked to the liability fixture.',
        }),
    ]

    const categories = [
        makeCategory({key: 'category-salary', name: 'Salary', kind: 'INCOME', color: DEFAULT_COLORS.income}),
        makeCategory({key: 'category-dividends', name: 'Dividends', kind: 'INCOME', color: '#14b8a6'}),
        makeCategory(),
        makeCategory({key: 'category-fees', name: 'Fees', kind: 'EXPENSE', color: '#64748b'}),
        makeCategory({key: 'category-rent', name: 'Rent', kind: 'EXPENSE', color: '#ef4444'}),
    ]

    return {
        key: 'advanced-wealth-imports',
        name: 'Advanced wealth and imports profile',
        description:
            'Multi-currency profile with portfolio, asset, liability, net worth snapshot, goals, projection assumptions and import CSV data.',
        fixedNow: fixtureClock.now(),
        accounts,
        categories,
        transactions: [
            makeTransaction({
                key: 'transaction-usd-dividend-2026-04-12',
                label: 'USD dividend',
                amount: 68.5,
                sourceAmount: 50,
                sourceCurrency: 'USD',
                conversionMode: 'MANUAL',
                exchangeRate: 1.37,
                exchangeProvider: 'fixture-manual-rate',
                exchangeDate: fixtureClock.date('2026-04-12T00:00:00.000Z'),
                kind: 'INCOME',
                date: fixtureClock.date('2026-04-12T00:00:00.000Z'),
                note: 'Manual FX fixture; no external rate lookup.',
                accountKey: 'account-usd-brokerage-cash',
                categoryKey: 'category-dividends',
            }),
            makeTransaction({
                key: 'transaction-investment-fee-2026-04-20',
                label: 'Brokerage fee',
                amount: 9.99,
                sourceAmount: 9.99,
                sourceCurrency: 'CAD',
                kind: 'EXPENSE',
                date: fixtureClock.date('2026-04-20T00:00:00.000Z'),
                accountKey: 'account-tfsa-investment',
                categoryKey: 'category-fees',
            }),
        ],
        transfers: makeInternalTransfer({
            key: 'transfer-chequing-to-tfsa-2026-04-18',
            toAccountKey: 'account-tfsa-investment',
            amount: 500,
            note: 'Contribution transfer fixture.',
        }),
        budgets: [makeBudgetTarget(), makeBudgetTarget({key: 'budget-fees-2026', name: 'Investment fees yearly cap', amount: 150, period: 'YEARLY', categoryKey: 'category-fees'})],
        recurringTransactions: [makeRecurringTransaction()],
        assets: [makeAsset()],
        portfolios: [makePortfolio()],
        liabilities: [makeLiability()],
        netWorthSnapshots: [makeNetWorthSnapshot()],
        financialGoals: [
            makeFinancialGoal({baselineSnapshotKey: 'snapshot-net-worth-2026-04-30'}),
            makeFinancialGoal({
                key: 'goal-tfsa-growth',
                name: 'TFSA growth target',
                type: 'SAVINGS',
                targetAmount: 25000,
                startingAmount: 12750,
                targetDate: fixtureClock.date('2028-12-31T00:00:00.000Z'),
                trackedPortfolioKey: 'portfolio-tfsa-growth',
                priority: 2,
            }),
            makeFinancialGoal({
                key: 'goal-credit-card-payoff',
                name: 'Credit card payoff',
                type: 'DEBT_PAYOFF',
                targetAmount: 0,
                startingAmount: 620,
                targetDate: fixtureClock.date('2026-09-30T00:00:00.000Z'),
                trackedLiabilityKey: 'liability-credit-card',
                priority: 3,
            }),
        ],
        projectionScenarios: [
            makeProjectionScenario({key: 'scenario-conservative', name: 'Fixture conservative projection', kind: 'CONSERVATIVE', isDefault: false}),
            makeProjectionScenario(),
            makeProjectionScenario({key: 'scenario-optimistic', name: 'Fixture optimistic projection', kind: 'OPTIMISTIC', isDefault: false}),
        ],
        projectionSettings: [
            makeProjectionSetting({key: 'projection-emergency-base'}),
            makeProjectionSetting({
                key: 'projection-tfsa-conservative',
                goalKey: 'goal-tfsa-growth',
                scenarioKey: 'scenario-conservative',
                estimatedMonthlySurplus: 300,
                manualMonthlyContribution: 300,
                annualGrowthRate: 0.01,
            }),
            makeProjectionSetting({
                key: 'projection-tfsa-optimistic',
                goalKey: 'goal-tfsa-growth',
                scenarioKey: 'scenario-optimistic',
                estimatedMonthlySurplus: 650,
                manualMonthlyContribution: 650,
                annualGrowthRate: 0.05,
            }),
            makeProjectionSetting({
                key: 'projection-credit-card-payoff-base',
                goalKey: 'goal-credit-card-payoff',
                scenarioKey: 'scenario-base',
                estimatedMonthlySurplus: 200,
                manualMonthlyContribution: 200,
                annualGrowthRate: 0,
                notes: 'Debt payoff scenario; growth intentionally zero.',
            }),
        ],
        imports: [makeImportCsvFixture()],
    }
}

export const demoProfiles = {
    simpleBudget: createSimpleBudgetProfile,
    advancedWealth: createAdvancedWealthProfile,
}

export function stableFixtureDate(iso = FIXTURE_NOW_ISO): Date {
    return fixtureClock.date(iso)
}

export function serializableDemoProfile(profile: DemoProfile): unknown {
    return JSON.parse(JSON.stringify(profile))
}
