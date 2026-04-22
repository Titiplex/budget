import {describe, expect, it} from 'vitest'
import type {Transaction} from '../../types/budget'
import {collapseTransferTransactions, transferRoute} from '../../utils/transferDisplay'

function makeTransaction(overrides: Partial<Transaction>): Transaction {
    return {
        id: 1,
        label: 'Transaction',
        amount: 100,
        sourceAmount: 100,
        sourceCurrency: 'CAD',
        conversionMode: 'NONE',
        exchangeRate: 1,
        exchangeProvider: 'ACCOUNT',
        exchangeDate: '2026-04-02T00:00:00.000Z',
        kind: 'EXPENSE',
        date: '2026-04-02T00:00:00.000Z',
        note: null,
        accountId: 1,
        categoryId: null,
        account: {id: 1, name: 'Main', type: 'BANK', currency: 'CAD', description: null},
        category: null,
        ...overrides,
    }
}

describe('transfer display utils', () => {
    it('collapses a transfer group to a single preferred row', () => {
        const outbound = makeTransaction({
            id: 10,
            label: 'Move to savings',
            kind: 'TRANSFER',
            transferGroup: 'grp-1',
            transferDirection: 'OUT',
            transferPeerAccountId: 2,
            transferPeerAccount: {id: 2, name: 'Savings', type: 'SAVINGS', currency: 'CAD', description: null},
        })
        const inbound = makeTransaction({
            id: 11,
            label: 'Move to savings',
            kind: 'TRANSFER',
            accountId: 2,
            account: {id: 2, name: 'Savings', type: 'SAVINGS', currency: 'CAD', description: null},
            transferGroup: 'grp-1',
            transferDirection: 'IN',
            transferPeerAccountId: 1,
            transferPeerAccount: {id: 1, name: 'Main', type: 'BANK', currency: 'CAD', description: null},
        })
        const expense = makeTransaction({id: 12, label: 'Rent'})

        const collapsed = collapseTransferTransactions([outbound, inbound, expense])

        expect(collapsed).toHaveLength(2)
        expect(collapsed[0].id).toBe(10)
        expect(collapsed[1].id).toBe(12)
    })

    it('builds a readable transfer route for the kept row', () => {
        const outbound = makeTransaction({
            id: 10,
            label: 'Move to savings',
            kind: 'TRANSFER',
            transferGroup: 'grp-1',
            transferDirection: 'OUT',
            transferPeerAccountId: 2,
            transferPeerAccount: {id: 2, name: 'Savings', type: 'SAVINGS', currency: 'CAD', description: null},
        })

        expect(transferRoute(outbound)).toBe('Main → Savings')
    })
})