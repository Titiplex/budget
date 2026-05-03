import {describe, expect, it} from 'vitest'
import {ImportRowStatus, ImportSourceType, ImportTargetEntityType, ImportType} from '../../types/imports'
import {
    createMockReadOnlyConnector,
    normalizeConnectorHoldings,
    normalizeConnectorStatement,
    normalizeConnectorTransactions,
    ReadOnlyConnectorCapability,
    ReadOnlyConnectorErrorCode,
    ReadOnlyConnectorRegistry,
    ReadOnlyConnectorStatus,
} from '../../utils/readOnlyConnector'
import type {ReadOnlyConnectorAccount, ReadOnlyConnectorHolding, ReadOnlyConnectorStatement, ReadOnlyConnectorTransaction} from '../../utils/readOnlyConnector'

const accounts: ReadOnlyConnectorAccount[] = [
    {externalId: 'acc-cash', name: 'Mock Chequing', currency: 'CAD', type: 'checking', balance: 1200, asOf: '2026-05-03T00:00:00.000Z'},
    {externalId: 'acc-broker', name: 'Mock Brokerage', currency: 'CAD', type: 'brokerage', balance: 10000, asOf: '2026-05-03T00:00:00.000Z'},
]

const transactions: ReadOnlyConnectorTransaction[] = [
    {externalId: 'tx-1', accountExternalId: 'acc-cash', date: '2026-05-01T00:00:00.000Z', label: 'Coffee', amount: -4.5, currency: 'CAD', merchantName: 'Cafe'},
    {externalId: 'tx-2', accountExternalId: 'acc-cash', date: '2026-05-02T00:00:00.000Z', label: 'Salary', amount: 2500, currency: 'CAD'},
    {externalId: 'tx-buy', accountExternalId: 'acc-broker', date: '2026-05-02T00:00:00.000Z', label: 'Buy XEQT', amount: -1000, currency: 'CAD', symbol: 'XEQT', quantity: 20, unitPrice: 50, fees: 0, operationType: 'BUY'},
]

const holdings: ReadOnlyConnectorHolding[] = [
    {externalId: 'holding-1', accountExternalId: 'acc-broker', symbol: 'XEQT', name: 'iShares Core Equity ETF Portfolio', quantity: 20, currency: 'CAD', unitPrice: 50, marketValue: 1000, asOf: '2026-05-03T00:00:00.000Z'},
]

const statement: ReadOnlyConnectorStatement = {
    externalId: 'statement-1',
    accountExternalId: 'acc-broker',
    periodStart: '2026-05-01T00:00:00.000Z',
    periodEnd: '2026-05-03T00:00:00.000Z',
    currency: 'CAD',
    transactions: [transactions[2]],
    holdings,
}

describe('read-only connector abstraction', () => {
    it('registers read-only connectors and exposes capabilities without write operations', () => {
        const connector = createMockReadOnlyConnector({accounts, transactions, holdings, statements: [statement]})
        const registry = new ReadOnlyConnectorRegistry().register(connector)

        expect(registry.list()).toEqual([
            expect.objectContaining({
                id: 'mock-readonly-local',
                sourceType: ImportSourceType.Sync,
                status: ReadOnlyConnectorStatus.Available,
                supportedImportTypes: [ImportType.Transactions, ImportType.Investments, ImportType.Mixed],
            }),
        ])
        expect(registry.listAvailable()).toHaveLength(1)
        expect(registry.assertCapability('mock-readonly-local', ReadOnlyConnectorCapability.ListTransactions)).toBe(connector)

        const methodNames = Object.keys(connector).sort()
        expect(methodNames).toEqual(['descriptor', 'fetchStatement', 'getStatus', 'listAccounts', 'listHoldings', 'listTransactions', 'testConnection'].sort())
        expect(methodNames.some((name) => /create|update|delete|write|push|send/i.test(name))).toBe(false)
    })

    it('returns unsupported operation errors through the registry', () => {
        const connector = createMockReadOnlyConnector({accounts})
        const connectorWithoutHoldings = {
            ...connector,
            descriptor: {
                ...connector.descriptor,
                id: 'accounts-only',
                capabilities: [ReadOnlyConnectorCapability.TestConnection, ReadOnlyConnectorCapability.ListAccounts],
            },
            listHoldings: undefined,
        }
        const registry = new ReadOnlyConnectorRegistry().register(connectorWithoutHoldings)

        expect(() => registry.assertCapability('missing', ReadOnlyConnectorCapability.ListAccounts)).toThrow(expect.objectContaining({
            code: ReadOnlyConnectorErrorCode.Unavailable,
        }))
        expect(() => registry.assertCapability('accounts-only', ReadOnlyConnectorCapability.ListHoldings)).toThrow(expect.objectContaining({
            code: ReadOnlyConnectorErrorCode.UnsupportedOperation,
        }))
    })

    it('mock connector lists accounts, filters transactions and fetches statements', async () => {
        const connector = createMockReadOnlyConnector({accounts, transactions, holdings, statements: [statement]})

        await expect(connector.testConnection(undefined, {now: '2026-05-03T12:00:00.000Z'})).resolves.toEqual({
            ok: true,
            data: {status: ReadOnlyConnectorStatus.Available, checkedAt: '2026-05-03T12:00:00.000Z'},
        })

        const listedAccounts = await connector.listAccounts?.()
        const filteredTransactions = await connector.listTransactions?.(undefined, {accountExternalId: 'acc-cash', from: '2026-05-02T00:00:00.000Z'})
        const fetchedStatement = await connector.fetchStatement?.(undefined, {statementExternalId: 'statement-1'})

        expect(listedAccounts).toMatchObject({ok: true, data: accounts})
        expect(filteredTransactions).toMatchObject({ok: true, data: [transactions[1]]})
        expect(fetchedStatement).toMatchObject({ok: true, data: statement})
    })

    it('mock connector exposes auth, rate limit and unavailable errors cleanly', async () => {
        const authConnector = createMockReadOnlyConnector({requireAuth: true})
        const rateLimitedConnector = createMockReadOnlyConnector({rateLimited: true})
        const disabledConnector = createMockReadOnlyConnector({enabled: false})

        await expect(authConnector.listAccounts?.()).resolves.toMatchObject({
            ok: false,
            errors: [expect.objectContaining({code: ReadOnlyConnectorErrorCode.AuthRequired, operation: ReadOnlyConnectorCapability.ListAccounts})],
        })
        await expect(rateLimitedConnector.listTransactions?.()).resolves.toMatchObject({
            ok: false,
            errors: [expect.objectContaining({code: ReadOnlyConnectorErrorCode.RateLimited, recoverable: true})],
        })
        await expect(disabledConnector.testConnection()).resolves.toMatchObject({
            ok: false,
            errors: [expect.objectContaining({code: ReadOnlyConnectorErrorCode.Unavailable})],
        })
        expect(authConnector.getStatus()).toBe(ReadOnlyConnectorStatus.NeedsConfiguration)
        expect(rateLimitedConnector.getStatus()).toBe(ReadOnlyConnectorStatus.Failed)
        expect(disabledConnector.getStatus()).toBe(ReadOnlyConnectorStatus.Disabled)
    })

    it('normalizes connector transactions into import rows used by the existing pipeline', () => {
        const connector = createMockReadOnlyConnector({accounts, transactions})
        const normalized = normalizeConnectorTransactions({
            connector: connector.descriptor,
            transactions,
            accounts,
            context: {now: '2026-05-03T12:00:00.000Z'},
        })

        expect(normalized.source).toMatchObject({
            sourceKey: 'mock-readonly-local',
            provider: 'local-mock',
            sourceType: ImportSourceType.Sync,
            importType: ImportType.Transactions,
            isActive: true,
        })
        expect(normalized.rawRows).toHaveLength(3)
        expect(normalized.normalizedRows).toEqual([
            expect.objectContaining({
                id: 'connector-row-tx-1',
                status: ImportRowStatus.Valid,
                targetKind: ImportTargetEntityType.Transaction,
                accountName: 'Mock Chequing',
                externalRef: 'tx-1',
                amount: -4.5,
            }),
            expect.objectContaining({
                id: 'connector-row-tx-2',
                status: ImportRowStatus.Valid,
                targetKind: ImportTargetEntityType.Transaction,
                accountName: 'Mock Chequing',
                externalRef: 'tx-2',
                amount: 2500,
            }),
            expect.objectContaining({
                id: 'connector-row-tx-buy',
                status: ImportRowStatus.Valid,
                targetKind: ImportTargetEntityType.InvestmentMovement,
                accountName: 'Mock Brokerage',
                externalRef: 'tx-buy',
            }),
        ])
        expect(normalized.normalizedRows[2].normalizedData).toMatchObject({symbol: 'XEQT', quantity: 20, unitPrice: 50, operationType: 'BUY'})
        expect(normalized.errors).toHaveLength(0)
    })

    it('normalizes holdings and statements into import-compatible rows', () => {
        const connector = createMockReadOnlyConnector({accounts, holdings, statements: [statement]})
        const normalizedHoldings = normalizeConnectorHoldings({connector: connector.descriptor, holdings, accounts})
        const normalizedStatement = normalizeConnectorStatement({connector: connector.descriptor, statement, accounts})

        expect(normalizedHoldings.source).toMatchObject({importType: ImportType.Investments})
        expect(normalizedHoldings.normalizedRows[0]).toMatchObject({
            status: ImportRowStatus.Valid,
            targetKind: ImportTargetEntityType.Holding,
            label: 'iShares Core Equity ETF Portfolio',
            amount: 1000,
            externalRef: 'holding-1',
        })
        expect(normalizedStatement.rawRows).toHaveLength(2)
        expect(normalizedStatement.normalizedRows.map((row) => row.targetKind)).toEqual([
            ImportTargetEntityType.InvestmentMovement,
            ImportTargetEntityType.Holding,
        ])
    })

    it('marks invalid connector responses as invalid import rows', () => {
        const connector = createMockReadOnlyConnector()
        const normalized = normalizeConnectorTransactions({
            connector: connector.descriptor,
            transactions: [{externalId: 'bad-tx', accountExternalId: 'acc-cash', date: 'not-a-date', label: 'Broken', amount: 10, currency: 'cad'}],
            accounts,
        })

        expect(normalized.normalizedRows[0]).toMatchObject({status: ImportRowStatus.Invalid})
        expect(normalized.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({code: ReadOnlyConnectorErrorCode.InvalidResponse, field: 'date'}),
            expect.objectContaining({code: ReadOnlyConnectorErrorCode.InvalidResponse, field: 'currency'}),
        ]))
    })
})
