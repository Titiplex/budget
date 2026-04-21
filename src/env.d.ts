/// <reference types="vite/client" />

declare module '*.vue' {
    import type {DefineComponent} from 'vue'
    const component: DefineComponent<{}, {}, any>
    export default component
}

type AccountTypeDto = 'CASH' | 'BANK' | 'SAVINGS' | 'CREDIT' | 'INVESTMENT' | 'OTHER'
type TransactionKindDto = 'INCOME' | 'EXPENSE' | 'TRANSFER'
type ConversionModeDto = 'NONE' | 'MANUAL' | 'AUTOMATIC'
type BudgetPeriodDto = 'MONTHLY' | 'YEARLY' | 'CUSTOM'

interface AccountDto {
    id: number
    name: string
    type: AccountTypeDto
    currency: string
    description: string | null
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
    accountId: number
    categoryId: number | null
    createdAt: string
    updatedAt: string
    account?: AccountDto
    category?: CategoryDto | null
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
}