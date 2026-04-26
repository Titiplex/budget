import {createRequire} from 'node:module'
import {describe, expect, it} from 'vitest'

const require = createRequire(import.meta.url)
const {
    createInternalTransfer,
    deleteTransaction,
    updateInternalTransfer,
} = require('../../../electron/ipc/transactionHandlers.js')

type AccountRow = {
    id: number
    name: string
    currency: string
}

type TransactionRow = {
    id: number
    label: string
    amount: number
    sourceAmount: number | null
    sourceCurrency: string | null
    conversionMode: string
    exchangeRate: number | null
    exchangeProvider: string | null
    exchangeDate: Date | null
    kind: string
    date: Date
    note: string | null
    accountId: number
    categoryId: number | null
    transferGroup: string | null
    transferDirection: string | null
    transferPeerAccountId: number | null
    createdAt: Date
    updatedAt: Date
}

type FakeDb = {
    accounts: AccountRow[]
    transactions: TransactionRow[]
}

function makeAccount(id: number, name: string, currency = 'CAD'): AccountRow {
    return {id, name, currency}
}

function cloneDate(value: Date | null) {
    return value ? new Date(value.getTime()) : null
}

function cloneTransaction(transaction: TransactionRow): TransactionRow {
    return {
        ...transaction,
        date: new Date(transaction.date.getTime()),
        exchangeDate: cloneDate(transaction.exchangeDate),
        createdAt: new Date(transaction.createdAt.getTime()),
        updatedAt: new Date(transaction.updatedAt.getTime()),
    }
}

function cloneDb(db: FakeDb): FakeDb {
    return {
        accounts: db.accounts.map((account) => ({...account})),
        transactions: db.transactions.map(cloneTransaction),
    }
}

function matchesIdFilter(id: number, filter: unknown) {
    if (!filter || typeof filter !== 'object') return true
    if ('not' in filter && id === Number((filter as {not: number}).not)) return false
    if ('notIn' in filter && (filter as {notIn: number[]}).notIn.includes(id)) return false
    return true
}

function matchesWhere(transaction: TransactionRow, where: {transferGroup?: string | null; id?: unknown}) {
    if (where.transferGroup !== undefined && transaction.transferGroup !== where.transferGroup) {
        return false
    }

    if (typeof where.id === 'number') {
        return transaction.id === where.id
    }

    return matchesIdFilter(transaction.id, where.id)
}

function createFakePrisma(db: FakeDb) {
    let nextTransactionId = Math.max(0, ...db.transactions.map((transaction) => transaction.id)) + 1

    const withRelations = (transaction: TransactionRow) => ({
        ...cloneTransaction(transaction),
        account: db.accounts.find((account) => account.id === transaction.accountId) || null,
        category: null,
        transferPeerAccount: db.accounts.find((account) => account.id === transaction.transferPeerAccountId) || null,
    })

    const prisma: any = {
        account: {
            findUnique: async ({where}: {where: {id: number}}) => (
                db.accounts.find((account) => account.id === where.id) || null
            ),
        },
        transaction: {
            create: async ({data}: {data: Omit<TransactionRow, 'id' | 'createdAt' | 'updatedAt'>}) => {
                const now = new Date('2026-04-25T12:00:00.000Z')
                const transaction = {
                    id: nextTransactionId,
                    ...data,
                    createdAt: now,
                    updatedAt: now,
                } as TransactionRow
                nextTransactionId += 1
                db.transactions.push(transaction)
                return withRelations(transaction)
            },
            findUnique: async ({where}: {where: {id: number}}) => {
                const transaction = db.transactions.find((entry) => entry.id === where.id)
                return transaction ? withRelations(transaction) : null
            },
            findMany: async ({where}: {where: {transferGroup?: string | null}}) => {
                return db.transactions
                    .filter((transaction) => matchesWhere(transaction, where))
                    .sort((a, b) => a.id - b.id)
                    .map(withRelations)
            },
            update: async ({where, data}: {where: {id: number}; data: Partial<TransactionRow>}) => {
                const index = db.transactions.findIndex((transaction) => transaction.id === where.id)
                if (index < 0) throw new Error('Not found')

                db.transactions[index] = {
                    ...db.transactions[index],
                    ...data,
                    updatedAt: new Date('2026-04-25T12:01:00.000Z'),
                }
                return withRelations(db.transactions[index])
            },
            delete: async ({where}: {where: {id: number}}) => {
                const index = db.transactions.findIndex((transaction) => transaction.id === where.id)
                if (index < 0) throw new Error('Not found')

                const [deleted] = db.transactions.splice(index, 1)
                return withRelations(deleted)
            },
            deleteMany: async ({where}: {where: {transferGroup?: string | null; id?: unknown}}) => {
                const before = db.transactions.length
                db.transactions = db.transactions.filter((transaction) => !matchesWhere(transaction, where))
                return {count: before - db.transactions.length}
            },
        },
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
            const snapshot = cloneDb(db)
            const nextIdSnapshot = nextTransactionId

            try {
                return await callback(prisma)
            } catch (error) {
                db.accounts = snapshot.accounts
                db.transactions = snapshot.transactions
                nextTransactionId = nextIdSnapshot
                throw error
            }
        },
    }

    return prisma
}

function transferPayload(overrides: Record<string, unknown> = {}) {
    return {
        label: 'Virement épargne',
        amount: 125,
        sourceAmount: 125,
        conversionMode: 'NONE',
        date: '2026-04-20',
        accountId: 1,
        transferTargetAccountId: 2,
        kind: 'TRANSFER',
        ...overrides,
    }
}

describe('internal transfer lifecycle', () => {
    it('creates a debit and credit pair with one coherent transferGroup', async () => {
        const db = {
            accounts: [makeAccount(1, 'Chèques'), makeAccount(2, 'Épargne')],
            transactions: [],
        }
        const prisma = createFakePrisma(db)

        const result = await createInternalTransfer(prisma, transferPayload())

        expect(result.transferDirection).toBe('OUT')
        expect(db.transactions).toHaveLength(2)

        const [outgoing, incoming] = db.transactions
        expect(outgoing.transferGroup).toBeTruthy()
        expect(incoming.transferGroup).toBe(outgoing.transferGroup)
        expect(outgoing.transferDirection).toBe('OUT')
        expect(incoming.transferDirection).toBe('IN')
        expect(outgoing.accountId).toBe(1)
        expect(incoming.accountId).toBe(2)
        expect(outgoing.transferPeerAccountId).toBe(2)
        expect(incoming.transferPeerAccountId).toBe(1)
    })

    it('updates both sides while preserving the existing transferGroup', async () => {
        const db = {
            accounts: [makeAccount(1, 'Chèques'), makeAccount(2, 'Épargne')],
            transactions: [],
        }
        const prisma = createFakePrisma(db)
        await createInternalTransfer(prisma, transferPayload())
        const group = db.transactions[0].transferGroup
        const incomingId = db.transactions.find((transaction) => transaction.transferDirection === 'IN')?.id

        const result = await updateInternalTransfer(
            prisma,
            incomingId,
            transferPayload({label: 'Virement corrigé', amount: 200, sourceAmount: 200}),
            group,
        )

        expect(result.id).toBe(incomingId)
        expect(db.transactions).toHaveLength(2)
        expect(new Set(db.transactions.map((transaction) => transaction.transferGroup))).toEqual(new Set([group]))
        expect(db.transactions.every((transaction) => transaction.label === 'Virement corrigé')).toBe(true)

        const outgoing = db.transactions.find((transaction) => transaction.transferDirection === 'OUT')
        const incoming = db.transactions.find((transaction) => transaction.transferDirection === 'IN')
        expect(outgoing?.amount).toBe(200)
        expect(incoming?.amount).toBe(200)
        expect(outgoing?.transferPeerAccountId).toBe(incoming?.accountId)
        expect(incoming?.transferPeerAccountId).toBe(outgoing?.accountId)
    })

    it('repairs a one-sided transfer during edit instead of keeping an orphan', async () => {
        const db = {
            accounts: [makeAccount(1, 'Chèques'), makeAccount(2, 'Épargne')],
            transactions: [
                {
                    id: 7,
                    label: 'Orphelin',
                    amount: 50,
                    sourceAmount: 50,
                    sourceCurrency: 'CAD',
                    conversionMode: 'NONE',
                    exchangeRate: 1,
                    exchangeProvider: 'ACCOUNT',
                    exchangeDate: new Date('2026-04-20T00:00:00.000Z'),
                    kind: 'TRANSFER',
                    date: new Date('2026-04-20T00:00:00.000Z'),
                    note: null,
                    accountId: 1,
                    categoryId: null,
                    transferGroup: 'group-orphan',
                    transferDirection: 'OUT',
                    transferPeerAccountId: 2,
                    createdAt: new Date('2026-04-20T00:00:00.000Z'),
                    updatedAt: new Date('2026-04-20T00:00:00.000Z'),
                },
            ],
        }
        const prisma = createFakePrisma(db)

        await updateInternalTransfer(prisma, 7, transferPayload({amount: 75, sourceAmount: 75}), 'group-orphan')

        expect(db.transactions).toHaveLength(2)
        expect(db.transactions.map((transaction) => transaction.transferDirection).sort()).toEqual(['IN', 'OUT'])
        expect(db.transactions.every((transaction) => transaction.transferGroup === 'group-orphan')).toBe(true)
    })

    it('rejects malformed transfer groups atomically', async () => {
        const malformedRows = [
            {
                id: 10,
                label: 'Bad A',
                amount: 10,
                sourceAmount: 10,
                sourceCurrency: 'CAD',
                conversionMode: 'NONE',
                exchangeRate: 1,
                exchangeProvider: 'ACCOUNT',
                exchangeDate: new Date('2026-04-20T00:00:00.000Z'),
                kind: 'TRANSFER',
                date: new Date('2026-04-20T00:00:00.000Z'),
                note: null,
                accountId: 1,
                categoryId: null,
                transferGroup: 'group-bad',
                transferDirection: 'OUT',
                transferPeerAccountId: 2,
                createdAt: new Date('2026-04-20T00:00:00.000Z'),
                updatedAt: new Date('2026-04-20T00:00:00.000Z'),
            },
            {
                id: 11,
                label: 'Bad B',
                amount: 10,
                sourceAmount: 10,
                sourceCurrency: 'CAD',
                conversionMode: 'NONE',
                exchangeRate: 1,
                exchangeProvider: 'ACCOUNT',
                exchangeDate: new Date('2026-04-20T00:00:00.000Z'),
                kind: 'TRANSFER',
                date: new Date('2026-04-20T00:00:00.000Z'),
                note: null,
                accountId: 2,
                categoryId: null,
                transferGroup: 'group-bad',
                transferDirection: 'OUT',
                transferPeerAccountId: 1,
                createdAt: new Date('2026-04-20T00:00:00.000Z'),
                updatedAt: new Date('2026-04-20T00:00:00.000Z'),
            },
        ]
        const db = {
            accounts: [makeAccount(1, 'Chèques'), makeAccount(2, 'Épargne')],
            transactions: malformedRows.map(cloneTransaction),
        }
        const prisma = createFakePrisma(db)

        await expect(updateInternalTransfer(
            prisma,
            10,
            transferPayload({label: 'Should not write'}),
            'group-bad',
        )).rejects.toThrow('Le transfert interne group-bad est incohérent.')

        expect(db.transactions).toEqual(malformedRows)
    })

    it('deletes both sides when either side of a transfer is deleted', async () => {
        const db = {
            accounts: [makeAccount(1, 'Chèques'), makeAccount(2, 'Épargne')],
            transactions: [],
        }
        const prisma = createFakePrisma(db)
        await createInternalTransfer(prisma, transferPayload())
        const incomingId = db.transactions.find((transaction) => transaction.transferDirection === 'IN')?.id

        await deleteTransaction(prisma, incomingId)

        expect(db.transactions).toHaveLength(0)
    })

    it('deletes an orphaned transfer row by group without leaving residue', async () => {
        const db = {
            accounts: [makeAccount(1, 'Chèques'), makeAccount(2, 'Épargne')],
            transactions: [
                {
                    id: 21,
                    label: 'Orphelin',
                    amount: 50,
                    sourceAmount: 50,
                    sourceCurrency: 'CAD',
                    conversionMode: 'NONE',
                    exchangeRate: 1,
                    exchangeProvider: 'ACCOUNT',
                    exchangeDate: new Date('2026-04-20T00:00:00.000Z'),
                    kind: 'TRANSFER',
                    date: new Date('2026-04-20T00:00:00.000Z'),
                    note: null,
                    accountId: 1,
                    categoryId: null,
                    transferGroup: 'group-delete-orphan',
                    transferDirection: 'OUT',
                    transferPeerAccountId: 2,
                    createdAt: new Date('2026-04-20T00:00:00.000Z'),
                    updatedAt: new Date('2026-04-20T00:00:00.000Z'),
                },
            ],
        }
        const prisma = createFakePrisma(db)

        await deleteTransaction(prisma, 21)

        expect(db.transactions).toHaveLength(0)
    })
})
