import {describe, expect, it} from 'vitest'
import type {Transaction} from '../../types/budget'
import {
    collapseTransferTransactions,
    transferAccountHint,
    transferAmountHint,
    transferDirectionLabel,
    transferRoute,
} from '../../utils/transferDisplay'
import {i18n} from '../../i18n'

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
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

describe('transfer display edge cases', () => {
    it('keeps the inbound row when a transfer group has no outbound entry', () => {
        const inbound = makeTransaction({
            id: 20,
            kind: 'TRANSFER',
            transferGroup: 'grp-inbound-only',
            transferDirection: 'IN',
        })
        const linked = makeTransaction({
            id: 21,
            kind: 'TRANSFER',
            transferGroup: 'grp-linked',
            transferDirection: null,
        })

        expect(collapseTransferTransactions([inbound, linked]).map((transaction) => transaction.id)).toEqual([20, 21])
    })

    it('returns null labels and hints for non-transfer transactions', () => {
        const expense = makeTransaction({kind: 'EXPENSE'})

        expect(transferRoute(expense)).toBeNull()
        expect(transferDirectionLabel(expense)).toBeNull()
        expect(transferAccountHint(expense)).toBeNull()
        expect(transferAmountHint(expense)).toBeNull()
    })

    it('builds inbound and fallback routes', () => {
        i18n.global.locale.value = 'en'
        const inbound = makeTransaction({
            kind: 'TRANSFER',
            transferDirection: 'IN',
            transferPeerAccount: {id: 2, name: 'Savings', type: 'SAVINGS', currency: 'CAD', description: null},
        })
        const withoutAccounts = makeTransaction({
            kind: 'TRANSFER',
            transferDirection: 'OUT',
            account: null,
            transferPeerAccount: null,
        })

        expect(transferRoute(inbound)).toBe('Savings → Main')
        expect(transferRoute(withoutAccounts)).toBe('Account → Linked account')
    })

    it('returns direction labels and account hints for every transfer direction', () => {
        i18n.global.locale.value = 'en'
        const inbound = makeTransaction({
            kind: 'TRANSFER',
            transferDirection: 'IN',
            transferPeerAccount: {id: 2, name: 'Savings', type: 'SAVINGS', currency: 'CAD', description: null},
        })
        const outbound = makeTransaction({
            kind: 'TRANSFER',
            transferDirection: 'OUT',
            transferPeerAccount: {id: 2, name: 'Savings', type: 'SAVINGS', currency: 'CAD', description: null},
        })
        const linked = makeTransaction({kind: 'TRANSFER', transferDirection: null, transferPeerAccount: null})

        expect(transferDirectionLabel(inbound)).toBe('Incoming transfer')
        expect(transferDirectionLabel(outbound)).toBe('Outgoing transfer')
        expect(transferDirectionLabel(linked)).toBe('Linked transfer')
        expect(transferAccountHint(inbound)).toBe('From Savings')
        expect(transferAccountHint(outbound)).toBe('To Savings')
        expect(transferAccountHint(linked)).toBe('To Linked account')
    })

    it('describes inbound transfer amounts with currency conversion when needed', () => {
        i18n.global.locale.value = 'en'
        const inboundForeignAmount = makeTransaction({
            kind: 'TRANSFER',
            transferDirection: 'IN',
            sourceAmount: -75,
            sourceCurrency: 'EUR',
            account: {id: 1, name: 'Main', type: 'BANK', currency: 'CAD', description: null},
        })
        const inboundSameCurrency = makeTransaction({
            kind: 'TRANSFER',
            transferDirection: 'IN',
            sourceAmount: 100,
            sourceCurrency: 'CAD',
        })
        const outbound = makeTransaction({kind: 'TRANSFER', transferDirection: 'OUT'})
        const linked = makeTransaction({kind: 'TRANSFER', transferDirection: null})

        expect(transferAmountHint(inboundForeignAmount)).toContain('Original amount')
        expect(transferAmountHint(inboundSameCurrency)).toBe('Credit in this account')
        expect(transferAmountHint(outbound)).toBe('Debit from this account')
        expect(transferAmountHint(linked)).toBe('Internal movement')
    })
})
