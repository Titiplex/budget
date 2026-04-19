/// <reference types="vite/client" />

declare module '*.vue' {
    import type {DefineComponent} from 'vue'
    const component: DefineComponent<{}, {}, any>
    export default component
}

interface AccountDto {
    id: number
    name: string
    type: 'CASH' | 'BANK' | 'SAVINGS' | 'CREDIT' | 'INVESTMENT' | 'OTHER'
    currency: string
    description?: string | null
    createdAt: string
    updatedAt: string
}

interface CategoryDto {
    id: number
    name: string
    kind: 'INCOME' | 'EXPENSE' | 'TRANSFER'
    color?: string | null
    description?: string | null
    createdAt: string
    updatedAt: string
}

interface TransactionDto {
    id: number
    label: string
    amount: number
    kind: 'INCOME' | 'EXPENSE' | 'TRANSFER'
    date: string
    note?: string | null
    accountId: number
    categoryId?: number | null
    createdAt: string
    updatedAt: string
    account?: AccountDto
    category?: CategoryDto | null
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
                type: AccountDto['type']
                currency?: string
                description?: string
            }) => Promise<AccountDto>
        }
        category: {
            list: () => Promise<CategoryDto[]>
            create: (data: {
                name: string
                kind: CategoryDto['kind']
                color?: string
                description?: string
            }) => Promise<CategoryDto>
        }
        transaction: {
            list: () => Promise<TransactionDto[]>
            create: (data: {
                label: string
                amount: number
                kind: TransactionDto['kind']
                date: string
                note?: string
                accountId: number
                categoryId?: number | null
            }) => Promise<TransactionDto>
        }
    }
}