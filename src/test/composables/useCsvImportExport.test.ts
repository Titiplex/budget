import {beforeEach, describe, expect, it, vi} from 'vitest'
import {ref, type Ref} from 'vue'
import {useCsvImportExport} from '../../composables/useCsvImportExport'
import type {Account, Category, SectionKey, Transaction} from '../../types/budget'
import {i18n} from '../../i18n'

const accountTypes = ['CASH', 'BANK', 'SAVINGS', 'CREDIT', 'INVESTMENT', 'OTHER'] as const
const transactionKinds = ['INCOME', 'EXPENSE', 'TRANSFER'] as const

function makeAccount(overrides: Partial<Account> = {}): Account {
    return {
        id: 1,
        name: 'Main',
        type: 'BANK',
        currency: 'CAD',
        description: null,
        ...overrides,
    }
}

function makeCategory(overrides: Partial<Category> = {}): Category {
    return {
        id: 1,
        name: 'Groceries',
        kind: 'EXPENSE',
        color: '#22c55e',
        description: null,
        ...overrides,
    }
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
    return {
        id: 1,
        label: 'Groceries',
        amount: 42,
        sourceAmount: 42,
        sourceCurrency: 'CAD',
        conversionMode: 'NONE',
        exchangeRate: null,
        exchangeProvider: null,
        exchangeDate: null,
        kind: 'EXPENSE',
        date: '2026-04-02T00:00:00.000Z',
        note: null,
        accountId: 1,
        categoryId: 1,
        account: makeAccount(),
        category: makeCategory(),
        ...overrides,
    }
}

function installBridgeMocks() {
    let nextAccountId = 100
    let nextCategoryId = 200
    let nextTransactionId = 300

    ;(window as any).file = {
        saveText: vi.fn().mockResolvedValue({canceled: false}),
        openText: vi.fn(),
    }

    ;(window as any).db = {
        account: {
            create: vi.fn().mockImplementation(async (payload) => ({id: nextAccountId++, ...payload})),
            update: vi.fn().mockImplementation(async (id, payload) => ({id, ...payload})),
        },
        category: {
            create: vi.fn().mockImplementation(async (payload) => ({id: nextCategoryId++, ...payload})),
            update: vi.fn().mockImplementation(async (id, payload) => ({id, ...payload})),
        },
        transaction: {
            create: vi.fn().mockImplementation(async (payload) => ({id: nextTransactionId++, ...payload})),
        },
    }
}

function createCsvHarness(section: SectionKey = 'transactions') {
    const activeSection = ref<SectionKey>(section)
    const accounts = ref<Account[]>([
        makeAccount({id: 1, name: 'Main', type: 'BANK', currency: 'CAD'}),
        makeAccount({id: 2, name: 'Savings', type: 'SAVINGS', currency: 'CAD'}),
    ])
    const categories = ref<Category[]>([
        makeCategory({id: 1, name: 'Groceries', kind: 'EXPENSE'}),
        makeCategory({id: 2, name: 'Salary', kind: 'INCOME', color: null}),
    ])
    const transactions = ref<Transaction[]>([
        makeTransaction(),
        makeTransaction({
            id: 2,
            label: 'Move to savings',
            kind: 'TRANSFER',
            amount: -100,
            sourceAmount: 100,
            categoryId: null,
            category: null,
            transferGroup: 'grp-1',
            transferDirection: 'OUT',
            transferPeerAccountId: 2,
            transferPeerAccount: makeAccount({id: 2, name: 'Savings', type: 'SAVINGS'}),
        }),
        makeTransaction({
            id: 3,
            label: 'Move to savings',
            kind: 'TRANSFER',
            accountId: 2,
            account: makeAccount({id: 2, name: 'Savings', type: 'SAVINGS'}),
            amount: 100,
            sourceAmount: 100,
            categoryId: null,
            category: null,
            transferGroup: 'grp-1',
            transferDirection: 'IN',
            transferPeerAccountId: 1,
            transferPeerAccount: makeAccount({id: 1, name: 'Main'}),
        }),
    ])
    const refreshData = vi.fn().mockResolvedValue(undefined)
    const showNotice = vi.fn()

    const composable = useCsvImportExport({
        activeSection,
        accounts: accounts as Ref<Account[]>,
        categories: categories as Ref<Category[]>,
        transactions: transactions as Ref<Transaction[]>,
        accountTypeOptions: [...accountTypes],
        transactionKindOptions: [...transactionKinds],
        refreshData,
        showNotice,
    })

    return {
        activeSection,
        accounts,
        categories,
        transactions,
        refreshData,
        showNotice,
        composable,
    }
}

describe('useCsvImportExport', () => {
    beforeEach(() => {
        i18n.global.locale.value = 'en'
        installBridgeMocks()
    })

    it('exports accounts, categories and transactions with the right filename and content', async () => {
        const harness = createCsvHarness('accounts')

        await harness.composable.exportCurrentCsv()
        harness.activeSection.value = 'categories'
        await harness.composable.exportCurrentCsv()
        harness.activeSection.value = 'transactions'
        await harness.composable.exportCurrentCsv()

        expect((window as any).file.saveText).toHaveBeenNthCalledWith(1, expect.objectContaining({
            defaultPath: 'budget-accounts.csv',
            content: expect.stringContaining('id,name,type,currency,description'),
        }))
        expect((window as any).file.saveText).toHaveBeenNthCalledWith(2, expect.objectContaining({
            defaultPath: 'budget-categories.csv',
            content: expect.stringContaining('id,name,kind,color,description'),
        }))
        expect((window as any).file.saveText).toHaveBeenNthCalledWith(3, expect.objectContaining({
            defaultPath: 'budget-transactions.csv',
            content: expect.stringContaining('transferTargetAccountName'),
        }))
        expect((window as any).file.saveText.mock.calls[2][0].content).toContain('Move to savings')
        expect(harness.showNotice).toHaveBeenCalledTimes(3)
    })

    it('does not show a success notice when CSV export is canceled', async () => {
        ;(window as any).file.saveText.mockResolvedValueOnce({canceled: true})
        const harness = createCsvHarness('accounts')

        await harness.composable.exportCurrentCsv()

        expect(harness.showNotice).not.toHaveBeenCalled()
    })

    it('opens and closes an import preview for a valid CSV file', async () => {
        ;(window as any).file.openText.mockResolvedValueOnce({
            canceled: false,
            filePath: '/tmp/accounts.csv',
            content: 'name,type,currency\nCash,CASH,USD\n',
        })
        const harness = createCsvHarness('accounts')

        await harness.composable.beginImportCurrentCsv()

        expect(harness.composable.importPreviewOpen.value).toBe(true)
        expect(harness.composable.pendingImportEntity.value).toBe('account')
        expect(harness.composable.pendingImportPath.value).toBe('/tmp/accounts.csv')
        expect(harness.composable.importPreviewSummary.value?.totalRows).toBe(1)

        harness.composable.closeImportPreview()

        expect(harness.composable.importPreviewOpen.value).toBe(false)
        expect(harness.composable.pendingImportPath.value).toBeNull()
        expect(harness.composable.importPreviewSummary.value).toBeNull()
    })

    it('ignores canceled imports and reports empty CSV files', async () => {
        const harness = createCsvHarness('accounts')

        ;(window as any).file.openText.mockResolvedValueOnce({canceled: true})
        await harness.composable.beginImportCurrentCsv()
        expect(harness.composable.importPreviewOpen.value).toBe(false)

        ;(window as any).file.openText.mockResolvedValueOnce({
            canceled: false,
            filePath: '/tmp/empty.csv',
            content: 'name,type\n',
        })
        await harness.composable.beginImportCurrentCsv()

        expect(harness.showNotice).toHaveBeenCalledWith('error', expect.any(String))
    })

    it('imports accounts by updating existing names, creating new ones and skipping invalid rows', async () => {
        ;(window as any).file.openText.mockResolvedValueOnce({
            canceled: false,
            filePath: '/tmp/accounts.csv',
            content: 'name,type,currency,description\nMain,CASH,usd,Updated main\nBrokerage,INVESTMENT,eur,Investments\n,bank,cad,Missing name\n',
        })
        const harness = createCsvHarness('accounts')

        await harness.composable.beginImportCurrentCsv()
        await harness.composable.confirmImportCurrentCsv()

        expect((window as any).db.account.update).toHaveBeenCalledWith(1, {
            name: 'Main',
            type: 'CASH',
            currency: 'USD',
            description: 'Updated main',
        })
        expect((window as any).db.account.create).toHaveBeenCalledWith({
            name: 'Brokerage',
            type: 'INVESTMENT',
            currency: 'EUR',
            description: 'Investments',
        })
        expect(harness.refreshData).toHaveBeenCalledTimes(1)
        expect(harness.showNotice).toHaveBeenCalledWith('success', expect.any(String))
        expect(harness.composable.importPreviewOpen.value).toBe(false)
    })

    it('imports categories by updating existing names, creating new ones and normalizing invalid kinds', async () => {
        ;(window as any).file.openText.mockResolvedValueOnce({
            canceled: false,
            filePath: '/tmp/categories.csv',
            content: 'name,kind,color,description\nGroceries,INCOME,#111111,Food updated\nTravel,invalid,#222222,Trips\n,EXPENSE,#333333,Missing name\n',
        })
        const harness = createCsvHarness('categories')

        await harness.composable.beginImportCurrentCsv()
        await harness.composable.confirmImportCurrentCsv()

        expect((window as any).db.category.update).toHaveBeenCalledWith(1, {
            name: 'Groceries',
            kind: 'INCOME',
            color: '#111111',
            description: 'Food updated',
        })
        expect((window as any).db.category.create).toHaveBeenCalledWith({
            name: 'Travel',
            kind: 'EXPENSE',
            color: '#222222',
            description: 'Trips',
        })
        expect(harness.refreshData).toHaveBeenCalledTimes(1)
        expect(harness.showNotice).toHaveBeenCalledWith('success', expect.any(String))
    })

    it('imports regular transactions while creating missing account/category references and skipping invalid rows', async () => {
        ;(window as any).file.openText.mockResolvedValueOnce({
            canceled: false,
            filePath: '/tmp/transactions.csv',
            content: [
                'label,amount,sourceAmount,sourceCurrency,conversionMode,exchangeRate,exchangeProvider,exchangeDate,kind,date,note,accountName,accountType,accountCurrency,categoryName,categoryKind,categoryColor',
                'Coffee,4.50,4.50,CAD,NONE,,,,EXPENSE,2026-04-03,Latte,Main,BANK,CAD,Groceries,EXPENSE,#22c55e',
                'Freelance,1000,1000,USD,MANUAL,1.35,Manual,2026-04-04,INCOME,2026-04-04,Client,USD Wallet,BANK,USD,Consulting,INCOME,#0ea5e9',
                'Broken,,10,CAD,NONE,,,,EXPENSE,2026-04-05,,Main,BANK,CAD,Groceries,EXPENSE,#22c55e',
            ].join('\n'),
        })
        const harness = createCsvHarness('transactions')

        await harness.composable.beginImportCurrentCsv()
        await harness.composable.confirmImportCurrentCsv()

        expect((window as any).db.account.create).toHaveBeenCalledWith(expect.objectContaining({
            name: 'USD Wallet',
            type: 'BANK',
            currency: 'USD',
        }))
        expect((window as any).db.category.create).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Consulting',
            kind: 'INCOME',
            color: '#0ea5e9',
        }))
        expect((window as any).db.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
            label: 'Coffee',
            amount: 4.5,
            sourceAmount: 4.5,
            sourceCurrency: 'CAD',
            conversionMode: 'NONE',
            accountId: 1,
            categoryId: 1,
        }))
        expect((window as any).db.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
            label: 'Freelance',
            amount: 1000,
            sourceAmount: 1000,
            sourceCurrency: 'USD',
            conversionMode: 'MANUAL',
            exchangeRate: 1.35,
            exchangeProvider: 'Manual',
        }))
        expect((window as any).db.transaction.create).toHaveBeenCalledTimes(2)
        expect(harness.refreshData).toHaveBeenCalledTimes(1)
        expect(harness.showNotice).toHaveBeenCalledWith('success', expect.any(String))
    })

    it('imports a transfer group once, using the incoming row as the target account lookup', async () => {
        ;(window as any).file.openText.mockResolvedValueOnce({
            canceled: false,
            filePath: '/tmp/transfers.csv',
            content: [
                'label,amount,sourceAmount,sourceCurrency,conversionMode,exchangeRate,exchangeProvider,exchangeDate,kind,date,note,accountName,transferGroup,transferDirection,transferTargetAccountName,transferTargetAmount',
                'Move to savings,100,100,CAD,MANUAL,1.00,Manual,2026-04-06,TRANSFER,2026-04-06,Monthly move,Main,grp-a,OUT,,',
                'Move to savings,100,100,CAD,MANUAL,1.00,Manual,2026-04-06,TRANSFER,2026-04-06,Monthly move,Savings,grp-a,IN,Savings,100',
            ].join('\n'),
        })
        const harness = createCsvHarness('transactions')

        await harness.composable.beginImportCurrentCsv()
        await harness.composable.confirmImportCurrentCsv()

        expect((window as any).db.transaction.create).toHaveBeenCalledTimes(1)
        expect((window as any).db.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
            label: 'Move to savings',
            kind: 'TRANSFER',
            amount: 100,
            sourceAmount: 100,
            sourceCurrency: 'CAD',
            conversionMode: 'MANUAL',
            exchangeRate: 1,
            exchangeProvider: 'Manual',
            exchangeDate: '2026-04-06',
            accountId: 1,
            categoryId: null,
            transferTargetAccountId: 2,
        }))
        expect(harness.showNotice).toHaveBeenCalledWith('success', expect.any(String))
    })

    it('skips duplicate transactions and duplicate transfers', async () => {
        ;(window as any).file.openText.mockResolvedValueOnce({
            canceled: false,
            filePath: '/tmp/duplicates.csv',
            content: [
                'label,amount,kind,date,accountName,categoryName,transferDirection,transferTargetAccountName',
                'Groceries,42,EXPENSE,2026-04-02,Main,Groceries,,',
                'Move to savings,100,TRANSFER,2026-04-02,Main,,OUT,Savings',
            ].join('\n'),
        })
        const harness = createCsvHarness('transactions')

        await harness.composable.beginImportCurrentCsv()
        await harness.composable.confirmImportCurrentCsv()

        expect((window as any).db.transaction.create).not.toHaveBeenCalled()
        expect(harness.refreshData).toHaveBeenCalledTimes(1)
        expect(harness.showNotice).toHaveBeenCalledWith('success', expect.any(String))
    })

    it('reports an import error when account persistence fails', async () => {
        ;(window as any).db.account.update.mockRejectedValueOnce(new Error('boom'))
        ;(window as any).file.openText.mockResolvedValueOnce({
            canceled: false,
            filePath: '/tmp/accounts.csv',
            content: 'name,type,currency\nMain,BANK,CAD\n',
        })
        const harness = createCsvHarness('accounts')

        await harness.composable.beginImportCurrentCsv()
        await harness.composable.confirmImportCurrentCsv()

        expect(harness.refreshData).not.toHaveBeenCalled()
        expect(harness.showNotice).toHaveBeenCalledWith('error', 'boom')
    })
})
