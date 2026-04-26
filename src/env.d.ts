/// <reference types="vite/client" />

declare module '*.vue' {
    import type {DefineComponent} from 'vue'
    const component: DefineComponent<{}, {}, any>
    export default component
}

type AccountTypeDto = 'CASH' | 'BANK' | 'SAVINGS' | 'CREDIT' | 'INVESTMENT' | 'OTHER'
type AccountTaxReportingTypeDto = 'STANDARD' | 'BANK' | 'CASH' | 'BROKERAGE' | 'CRYPTO' | 'LIFE_INSURANCE' | 'RETIREMENT' | 'LOAN' | 'OTHER'
type TransactionKindDto = 'INCOME' | 'EXPENSE' | 'TRANSFER'
type ConversionModeDto = 'NONE' | 'MANUAL' | 'AUTOMATIC'
type TransferDirectionDto = 'OUT' | 'IN'
type BudgetPeriodDto = 'MONTHLY' | 'YEARLY' | 'CUSTOM'
type RecurringFrequencyDto = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
type TaxIncomeCategoryDto = 'EMPLOYMENT' | 'BUSINESS' | 'INTEREST' | 'DIVIDEND' | 'CAPITAL_GAIN' | 'RENTAL' | 'PENSION' | 'BENEFIT' | 'GIFT' | 'REFUND' | 'TRANSFER' | 'OTHER'
type TaxTreatmentDto = 'UNKNOWN' | 'NOT_TAXABLE' | 'TAXABLE_NO_WITHHOLDING' | 'TAX_WITHHELD_AT_SOURCE' | 'FOREIGN_TAX_CREDIT_CANDIDATE' | 'TREATY_EXEMPT_CANDIDATE' | 'REVIEW_REQUIRED'

interface AccountDto {
    id: number
    name: string
    type: AccountTypeDto
    currency: string
    description: string | null
    institutionCountry: string | null
    institutionRegion: string | null
    taxReportingType: AccountTaxReportingTypeDto
    openedAt: string | null
    closedAt: string | null
    createdAt: string
    updatedAt: string
}

interface CategoryDto {
    id: number
    name: string
    kind: TransactionKindDto
    color: string | null
    description: string | null
    createdAt: string
    updatedAt: string
}

interface TransactionDto {
    id: number
    label: string
    amount: number
    sourceAmount: number | null
    sourceCurrency: string | null
    conversionMode: ConversionModeDto
    exchangeRate: number | null
    exchangeProvider: string | null
    exchangeDate: string | null
    kind: TransactionKindDto
    date: string
    note: string | null
    taxCategory: TaxIncomeCategoryDto | null
    taxSourceCountry: string | null
    taxSourceRegion: string | null
    taxTreatment: TaxTreatmentDto
    taxWithheldAmount: number | null
    taxWithheldCurrency: string | null
    taxWithheldCountry: string | null
    taxDocumentRef: string | null
    accountId: number
    categoryId: number | null
    transferGroup?: string | null
    transferDirection?: TransferDirectionDto | null
    transferPeerAccountId?: number | null
    createdAt: string
    updatedAt: string
    account?: AccountDto
    category?: CategoryDto | null
    transferPeerAccount?: AccountDto | null
}

interface TaxProfileDto {
    id: number
    year: number
    residenceCountry: string
    residenceRegion: string | null
    currency: string
    createdAt: string
    updatedAt: string
}

interface BudgetTargetDto {
    id: number
    name: string
    amount: number
    period: BudgetPeriodDto
    startDate: string
    endDate: string | null
    currency: string
    isActive: boolean
    note: string | null
    categoryId: number
    createdAt: string
    updatedAt: string
    category?: CategoryDto | null
}

interface RecurringTransactionTemplateDto {
    id: number
    label: string
    sourceAmount: number
    sourceCurrency: string
    accountAmount: number | null
    conversionMode: ConversionModeDto
    exchangeRate: number | null
    exchangeProvider: string | null
    kind: TransactionKindDto
    note: string | null
    frequency: RecurringFrequencyDto
    intervalCount: number
    startDate: string
    nextOccurrenceDate: string
    endDate: string | null
    isActive: boolean
    accountId: number
    categoryId: number | null
    createdAt: string
    updatedAt: string
    account?: AccountDto | null
    category?: CategoryDto | null
}

interface FileOpenTextResult {
    canceled: boolean
    filePath: string | null
    content: string | null
}

interface FileSaveTextResult {
    canceled: boolean
    filePath: string | null
}

interface FxQuoteResult {
    from: string
    to: string
    rate: number
    convertedAmount: number
    provider: string
    date: string
}

interface RecurringGenerationResult {
    asOfDate: string
    generatedTemplates: number
    generatedTransactions: number
}

interface Window {
    versions: {
        node: () => string
        chrome: () => string
        electron: () => string
        ping: () => Promise<string>
        send: (channel: string, data: unknown) => void
        on: (channel: string, func: (...args: unknown[]) => void) => void
    }

    db: {
        account: {
            list: () => Promise<AccountDto[]>
            create: (data: {
                name: string
                type: AccountTypeDto
                currency?: string
                description?: string | null
            }) => Promise<AccountDto>
            update: (id: number, data: {
                name: string
                type: AccountTypeDto
                currency?: string
                description?: string | null
            }) => Promise<AccountDto>
            delete: (id: number) => Promise<AccountDto>
        }

        category: {
            list: () => Promise<CategoryDto[]>
            create: (data: {
                name: string
                kind: TransactionKindDto
                color?: string | null
                description?: string | null
            }) => Promise<CategoryDto>
            update: (id: number, data: {
                name: string
                kind: TransactionKindDto
                color?: string | null
                description?: string | null
            }) => Promise<CategoryDto>
            delete: (id: number) => Promise<CategoryDto>
        }

        transaction: {
            list: () => Promise<TransactionDto[]>
            create: (data: {
                label: string
                amount: number
                sourceAmount?: number | null
                sourceCurrency?: string | null
                conversionMode?: ConversionModeDto
                exchangeRate?: number | null
                exchangeProvider?: string | null
                exchangeDate?: string | null
                kind: TransactionKindDto
                date: string
                note?: string | null
                accountId: number
                categoryId?: number | null
                transferTargetAccountId?: number | null
            }) => Promise<TransactionDto>
            update: (id: number, data: {
                label: string
                amount: number
                sourceAmount?: number | null
                sourceCurrency?: string | null
                conversionMode?: ConversionModeDto
                exchangeRate?: number | null
                exchangeProvider?: string | null
                exchangeDate?: string | null
                kind: TransactionKindDto
                date: string
                note?: string | null
                accountId: number
                categoryId?: number | null
                transferTargetAccountId?: number | null
            }) => Promise<TransactionDto>
            delete: (id: number) => Promise<TransactionDto>
        }

        budgetTarget: {
            list: () => Promise<BudgetTargetDto[]>
            create: (data: {
                name: string
                amount: number
                period: BudgetPeriodDto
                startDate: string
                endDate?: string | null
                currency?: string
                isActive?: boolean
                note?: string | null
                categoryId: number
            }) => Promise<BudgetTargetDto>
            update: (id: number, data: {
                name: string
                amount: number
                period: BudgetPeriodDto
                startDate: string
                endDate?: string | null
                currency?: string
                isActive?: boolean
                note?: string | null
                categoryId: number
            }) => Promise<BudgetTargetDto>
            delete: (id: number) => Promise<BudgetTargetDto>
        }

        recurringTemplate: {
            list: () => Promise<RecurringTransactionTemplateDto[]>
            create: (data: {
                label: string
                sourceAmount: number
                sourceCurrency: string
                accountAmount?: number | null
                conversionMode?: ConversionModeDto
                exchangeRate?: number | null
                exchangeProvider?: string | null
                kind: TransactionKindDto
                note?: string | null
                frequency: RecurringFrequencyDto
                intervalCount?: number
                startDate: string
                nextOccurrenceDate: string
                endDate?: string | null
                isActive?: boolean
                accountId: number
                categoryId?: number | null
            }) => Promise<RecurringTransactionTemplateDto>
            update: (id: number, data: {
                label: string
                sourceAmount: number
                sourceCurrency: string
                accountAmount?: number | null
                conversionMode?: ConversionModeDto
                exchangeRate?: number | null
                exchangeProvider?: string | null
                kind: TransactionKindDto
                note?: string | null
                frequency: RecurringFrequencyDto
                intervalCount?: number
                startDate: string
                nextOccurrenceDate: string
                endDate?: string | null
                isActive?: boolean
                accountId: number
                categoryId?: number | null
            }) => Promise<RecurringTransactionTemplateDto>
            delete: (id: number) => Promise<RecurringTransactionTemplateDto>
            generateDue: (data?: {
                asOfDate?: string
                templateId?: number
            }) => Promise<RecurringGenerationResult>
        }

        taxProfile: {
            list: () => Promise<TaxProfileDto[]>
            create: (data: {
                year: number
                residenceCountry: string
                residenceRegion?: string | null
                currency?: string
            }) => Promise<TaxProfileDto>
            update: (id: number, data: {
                year: number
                residenceCountry: string
                residenceRegion?: string | null
                currency?: string
            }) => Promise<TaxProfileDto>
            delete: (id: number) => Promise<TaxProfileDto>
        }

        taxMetadata: {
            updateAccount: (id: number, data: {
                institutionCountry?: string | null
                institutionRegion?: string | null
                taxReportingType?: AccountTaxReportingTypeDto
                openedAt?: string | null
                closedAt?: string | null
            }) => Promise<AccountDto>
            updateTransaction: (id: number, data: {
                taxCategory?: TaxIncomeCategoryDto | null
                taxSourceCountry?: string | null
                taxSourceRegion?: string | null
                taxTreatment?: TaxTreatmentDto
                taxWithheldAmount?: number | null
                taxWithheldCurrency?: string | null
                taxWithheldCountry?: string | null
                taxDocumentRef?: string | null
            }) => Promise<TransactionDto>
        }
    }

    file: {
        openText: (options?: {
            title?: string
            buttonLabel?: string
            filters?: Array<{ name: string; extensions: string[] }>
        }) => Promise<FileOpenTextResult>

        saveText: (options?: {
            title?: string
            buttonLabel?: string
            defaultPath?: string
            content?: string
            filters?: Array<{ name: string; extensions: string[] }>
        }) => Promise<FileSaveTextResult>
    }

    fx: {
        quoteHistorical: (options: {
            from: string
            to: string
            amount: number
            date: string
        }) => Promise<FxQuoteResult>
    }

    appShell: {
        getVersion: () => Promise<string>
        setLocale: (locale: 'fr' | 'en') => void
    }
}