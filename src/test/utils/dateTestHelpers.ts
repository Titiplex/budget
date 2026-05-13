import {expect} from 'vitest'
import type {Transaction, TransactionKind} from '../../types/budget'

export function dateOnly(value: Date | string) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value
    }

    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid date fixture: ${String(value)}`)
    }

    return date.toISOString().slice(0, 10)
}

export function expectDateOnlySequence(actual: Array<Date | string>, expected: string[]) {
    expect(actual.map(dateOnly)).toEqual(expected)
}

export function makeReportTransaction(overrides: Partial<Transaction> & {
    id: number
    date: string
    kind: TransactionKind
    amount: number
}): Transaction {
    const currency = overrides.account?.currency || overrides.sourceCurrency || 'CAD'

    return {
        id: overrides.id,
        label: overrides.label || `Temporal fixture ${overrides.id}`,
        amount: overrides.amount,
        sourceAmount: overrides.sourceAmount ?? Math.abs(overrides.amount),
        sourceCurrency: overrides.sourceCurrency ?? currency,
        conversionMode: overrides.conversionMode ?? 'NONE',
        exchangeRate: overrides.exchangeRate ?? 1,
        exchangeProvider: overrides.exchangeProvider ?? 'TEST',
        exchangeDate: overrides.exchangeDate ?? overrides.date,
        kind: overrides.kind,
        date: overrides.date,
        note: overrides.note ?? null,
        accountId: overrides.accountId ?? 1,
        categoryId: overrides.categoryId ?? null,
        transferGroup: overrides.transferGroup ?? null,
        transferDirection: overrides.transferDirection ?? null,
        transferPeerAccountId: overrides.transferPeerAccountId ?? null,
        account: overrides.account ?? {
            id: overrides.accountId ?? 1,
            name: 'Temporal test account',
            type: 'BANK',
            currency,
            description: null,
        },
        category: overrides.category ?? null,
        transferPeerAccount: overrides.transferPeerAccount ?? null,
    }
}

export function projectionInput(overrides: Record<string, unknown> = {}) {
    return {
        initialValue: 0,
        targetAmount: 1_000,
        monthlyContribution: 100,
        horizonMonths: 12,
        annualGrowthRate: 0,
        annualInflationRate: 0,
        currency: 'CAD',
        scenarioKind: 'base',
        startDate: '2026-01-01',
        ...overrides,
    } as any
}
