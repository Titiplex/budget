import {
    ImportErrorSeverity,
    ImportErrorStage,
    ImportRowStatus,
    ImportSourceType,
    ImportTargetEntityType,
    ImportType,
} from '../types/imports'
import type {
    ImportBusinessError,
    ImportEntityId,
    ImportRowNormalized,
    ImportRowRaw,
    ImportRowValidationError,
    IsoDateString,
    JsonObject,
} from '../types/imports'

export enum ReadOnlyConnectorCapability {
    ListAccounts = 'listAccounts',
    ListHoldings = 'listHoldings',
    ListTransactions = 'listTransactions',
    FetchStatement = 'fetchStatement',
    TestConnection = 'testConnection',
}

export enum ReadOnlyConnectorStatus {
    Available = 'available',
    Disabled = 'disabled',
    NeedsConfiguration = 'needsConfiguration',
    Failed = 'failed',
}

export enum ReadOnlyConnectorErrorCode {
    AuthRequired = 'authRequired',
    RateLimited = 'rateLimited',
    Unavailable = 'unavailable',
    UnsupportedOperation = 'unsupportedOperation',
    InvalidResponse = 'invalidResponse',
}

export interface ReadOnlyConnectorError extends ImportBusinessError {
    code: ReadOnlyConnectorErrorCode
    connectorId?: string
    operation?: ReadOnlyConnectorCapability
}

export type ReadOnlyConnectorResult<T> =
    | {ok: true; data: T; warnings?: ReadOnlyConnectorError[]}
    | {ok: false; errors: ReadOnlyConnectorError[]}

export interface ReadOnlyConnectorDescriptor {
    id: string
    name: string
    provider: string
    sourceType: ImportSourceType.Sync | ImportSourceType.Api | ImportSourceType.Other
    status: ReadOnlyConnectorStatus
    supportedImportTypes: ImportType[]
    capabilities: ReadOnlyConnectorCapability[]
    defaultCurrency?: string
    version?: string
    metadata?: JsonObject
}

export interface ReadOnlyConnectorContext {
    now?: IsoDateString
    locale?: string
    timezone?: string
    metadata?: JsonObject
}

export interface ReadOnlyConnectorAccount {
    externalId: string
    name: string
    currency: string
    type?: 'cash' | 'checking' | 'savings' | 'credit' | 'brokerage' | 'investment' | 'loan' | 'other'
    institutionName?: string | null
    balance?: number | null
    availableBalance?: number | null
    asOf?: IsoDateString | null
    metadata?: JsonObject | null
}

export interface ReadOnlyConnectorHolding {
    externalId: string
    accountExternalId: string
    symbol?: string | null
    name?: string | null
    quantity: number
    currency: string
    unitPrice?: number | null
    marketValue?: number | null
    costBasis?: number | null
    asOf?: IsoDateString | null
    metadata?: JsonObject | null
}

export interface ReadOnlyConnectorTransaction {
    externalId: string
    accountExternalId: string
    date: IsoDateString
    label: string
    amount: number
    currency: string
    description?: string | null
    merchantName?: string | null
    categoryName?: string | null
    pending?: boolean
    symbol?: string | null
    quantity?: number | null
    unitPrice?: number | null
    fees?: number | null
    operationType?: string | null
    metadata?: JsonObject | null
}

export interface ReadOnlyConnectorStatement {
    externalId: string
    accountExternalId: string
    periodStart: IsoDateString
    periodEnd: IsoDateString
    generatedAt?: IsoDateString | null
    currency: string
    openingBalance?: number | null
    closingBalance?: number | null
    transactions: ReadOnlyConnectorTransaction[]
    holdings?: ReadOnlyConnectorHolding[]
    metadata?: JsonObject | null
}

export interface ReadOnlyConnectorQuery {
    accountExternalId?: string
    from?: IsoDateString
    to?: IsoDateString
    cursor?: string | null
    limit?: number
    metadata?: JsonObject
}

export interface FetchStatementQuery extends ReadOnlyConnectorQuery {
    statementExternalId?: string
}

export interface ReadOnlyConnector<TConfig extends object = JsonObject> {
    descriptor: ReadOnlyConnectorDescriptor
    getStatus(config?: TConfig): ReadOnlyConnectorStatus
    testConnection(config?: TConfig, context?: ReadOnlyConnectorContext): Promise<ReadOnlyConnectorResult<{status: ReadOnlyConnectorStatus; checkedAt: IsoDateString}>>
    listAccounts?: (config?: TConfig, context?: ReadOnlyConnectorContext) => Promise<ReadOnlyConnectorResult<ReadOnlyConnectorAccount[]>>
    listHoldings?: (config?: TConfig, query?: ReadOnlyConnectorQuery, context?: ReadOnlyConnectorContext) => Promise<ReadOnlyConnectorResult<ReadOnlyConnectorHolding[]>>
    listTransactions?: (config?: TConfig, query?: ReadOnlyConnectorQuery, context?: ReadOnlyConnectorContext) => Promise<ReadOnlyConnectorResult<ReadOnlyConnectorTransaction[]>>
    fetchStatement?: (config?: TConfig, query?: FetchStatementQuery, context?: ReadOnlyConnectorContext) => Promise<ReadOnlyConnectorResult<ReadOnlyConnectorStatement>>
}

export interface ConnectorImportNormalizationResult {
    source: {
        sourceKey: string
        name: string
        provider: string
        sourceType: ImportSourceType.Sync | ImportSourceType.Api | ImportSourceType.Other
        importType: ImportType
        defaultCurrency: string
        externalSourceId?: string | null
        isActive: boolean
        metadata?: JsonObject | null
    }
    rawRows: ImportRowRaw[]
    normalizedRows: ImportRowNormalized[]
    errors: ImportRowValidationError[]
}

export function connectorError(input: {
    code: ReadOnlyConnectorErrorCode
    message: string
    connectorId?: string
    operation?: ReadOnlyConnectorCapability
    field?: string | null
    rowNumber?: number
    details?: JsonObject | null
    recoverable?: boolean
}): ReadOnlyConnectorError {
    return {
        code: input.code,
        severity: ImportErrorSeverity.Error,
        message: input.message,
        field: input.field ?? null,
        rowNumber: input.rowNumber,
        details: input.details ?? null,
        recoverable: input.recoverable ?? true,
        connectorId: input.connectorId,
        operation: input.operation,
    }
}

function nowIso(context?: ReadOnlyConnectorContext) {
    return context?.now || new Date(0).toISOString()
}

function stableJson(value: unknown) {
    return JSON.stringify(value, Object.keys(value as object).sort())
}

function rowId(prefix: string, value: string, index: number) {
    return `${prefix}-${value || index + 1}`
}

function validateCurrency(currency: string, rowNumber: number, normalizedRowId: ImportEntityId): ImportRowValidationError[] {
    if (/^[A-Z]{3}$/.test(currency)) return []
    return [{
        normalizedRowId,
        rowNumber,
        stage: ImportErrorStage.Validation,
        severity: ImportErrorSeverity.Error,
        code: ReadOnlyConnectorErrorCode.InvalidResponse,
        message: `Devise invalide retournée par le connecteur: ${currency}`,
        field: 'currency',
    }]
}

function validateIsoDate(value: string | null | undefined, rowNumber: number, normalizedRowId: ImportEntityId, field: string): ImportRowValidationError[] {
    if (value && !Number.isNaN(Date.parse(value))) return []
    return [{
        normalizedRowId,
        rowNumber,
        stage: ImportErrorStage.Validation,
        severity: ImportErrorSeverity.Error,
        code: ReadOnlyConnectorErrorCode.InvalidResponse,
        message: `Date invalide retournée par le connecteur pour ${field}.`,
        field,
    }]
}

export function normalizeConnectorTransactions(input: {
    connector: ReadOnlyConnectorDescriptor
    transactions: ReadOnlyConnectorTransaction[]
    accounts?: ReadOnlyConnectorAccount[]
    context?: ReadOnlyConnectorContext
}): ConnectorImportNormalizationResult {
    const accountIndex = new Map((input.accounts || []).map((account) => [account.externalId, account]))
    const rawRows: ImportRowRaw[] = []
    const normalizedRows: ImportRowNormalized[] = []
    const errors: ImportRowValidationError[] = []
    const timestamp = nowIso(input.context)

    input.transactions.forEach((transaction, index) => {
        const rowNumber = index + 1
        const rawRowId = rowId('connector-raw', transaction.externalId, index)
        const normalizedRowId = rowId('connector-row', transaction.externalId, index)
        const account = accountIndex.get(transaction.accountExternalId)
        const rowErrors = [
            ...validateIsoDate(transaction.date, rowNumber, normalizedRowId, 'date'),
            ...validateCurrency(transaction.currency, rowNumber, normalizedRowId),
        ]

        rawRows.push({
            id: rawRowId,
            rowNumber,
            rawJson: transaction as unknown as JsonObject,
            rawHash: stableJson(transaction),
            status: ImportRowStatus.Raw,
            createdAt: timestamp,
            updatedAt: timestamp,
        })

        const isInvestment = Boolean(transaction.symbol || transaction.quantity != null || transaction.unitPrice != null)
        normalizedRows.push({
            id: normalizedRowId,
            rawRowId,
            rowNumber,
            status: rowErrors.length ? ImportRowStatus.Invalid : ImportRowStatus.Valid,
            targetKind: isInvestment ? ImportTargetEntityType.InvestmentMovement : ImportTargetEntityType.Transaction,
            normalizedData: {
                externalId: transaction.externalId,
                accountExternalId: transaction.accountExternalId,
                date: transaction.date,
                label: transaction.label,
                amount: transaction.amount,
                currency: transaction.currency,
                description: transaction.description ?? null,
                merchantName: transaction.merchantName ?? null,
                categoryName: transaction.categoryName ?? null,
                pending: transaction.pending ?? false,
                symbol: transaction.symbol ?? null,
                quantity: transaction.quantity ?? null,
                unitPrice: transaction.unitPrice ?? null,
                fees: transaction.fees ?? null,
                operationType: transaction.operationType ?? null,
                connectorId: input.connector.id,
                provider: input.connector.provider,
                metadata: transaction.metadata ?? null,
            },
            transactionDate: transaction.date,
            label: transaction.label,
            amount: transaction.amount,
            currency: transaction.currency,
            accountName: account?.name ?? transaction.accountExternalId,
            externalRef: transaction.externalId,
            validationErrors: rowErrors,
            duplicateCandidates: [],
            createdAt: timestamp,
            updatedAt: timestamp,
        })
        errors.push(...rowErrors)
    })

    return {
        source: {
            sourceKey: input.connector.id,
            name: input.connector.name,
            provider: input.connector.provider,
            sourceType: input.connector.sourceType,
            importType: ImportType.Transactions,
            defaultCurrency: input.connector.defaultCurrency || input.transactions[0]?.currency || 'CAD',
            externalSourceId: input.connector.id,
            isActive: input.connector.status === ReadOnlyConnectorStatus.Available,
            metadata: input.connector.metadata ?? null,
        },
        rawRows,
        normalizedRows,
        errors,
    }
}

export function normalizeConnectorHoldings(input: {
    connector: ReadOnlyConnectorDescriptor
    holdings: ReadOnlyConnectorHolding[]
    accounts?: ReadOnlyConnectorAccount[]
    context?: ReadOnlyConnectorContext
}): ConnectorImportNormalizationResult {
    const accountIndex = new Map((input.accounts || []).map((account) => [account.externalId, account]))
    const rawRows: ImportRowRaw[] = []
    const normalizedRows: ImportRowNormalized[] = []
    const errors: ImportRowValidationError[] = []
    const timestamp = nowIso(input.context)

    input.holdings.forEach((holding, index) => {
        const rowNumber = index + 1
        const rawRowId = rowId('connector-holding-raw', holding.externalId, index)
        const normalizedRowId = rowId('connector-holding-row', holding.externalId, index)
        const account = accountIndex.get(holding.accountExternalId)
        const rowErrors = validateCurrency(holding.currency, rowNumber, normalizedRowId)

        rawRows.push({
            id: rawRowId,
            rowNumber,
            rawJson: holding as unknown as JsonObject,
            rawHash: stableJson(holding),
            status: ImportRowStatus.Raw,
            createdAt: timestamp,
            updatedAt: timestamp,
        })

        normalizedRows.push({
            id: normalizedRowId,
            rawRowId,
            rowNumber,
            status: rowErrors.length ? ImportRowStatus.Invalid : ImportRowStatus.Valid,
            targetKind: ImportTargetEntityType.Holding,
            normalizedData: {
                externalId: holding.externalId,
                accountExternalId: holding.accountExternalId,
                symbol: holding.symbol ?? null,
                name: holding.name ?? null,
                quantity: holding.quantity,
                currency: holding.currency,
                unitPrice: holding.unitPrice ?? null,
                marketValue: holding.marketValue ?? null,
                costBasis: holding.costBasis ?? null,
                asOf: holding.asOf ?? null,
                connectorId: input.connector.id,
                provider: input.connector.provider,
                metadata: holding.metadata ?? null,
            },
            transactionDate: holding.asOf ?? null,
            label: holding.name || holding.symbol || holding.externalId,
            amount: holding.marketValue ?? null,
            currency: holding.currency,
            accountName: account?.name ?? holding.accountExternalId,
            externalRef: holding.externalId,
            validationErrors: rowErrors,
            duplicateCandidates: [],
            createdAt: timestamp,
            updatedAt: timestamp,
        })
        errors.push(...rowErrors)
    })

    return {
        source: {
            sourceKey: input.connector.id,
            name: input.connector.name,
            provider: input.connector.provider,
            sourceType: input.connector.sourceType,
            importType: ImportType.Investments,
            defaultCurrency: input.connector.defaultCurrency || input.holdings[0]?.currency || 'CAD',
            externalSourceId: input.connector.id,
            isActive: input.connector.status === ReadOnlyConnectorStatus.Available,
            metadata: input.connector.metadata ?? null,
        },
        rawRows,
        normalizedRows,
        errors,
    }
}

export function mergeConnectorNormalizationResults(results: ConnectorImportNormalizationResult[]): ConnectorImportNormalizationResult {
    const first = results[0]
    return {
        source: first?.source || {
            sourceKey: 'connector-empty',
            name: 'Empty connector result',
            provider: 'unknown',
            sourceType: ImportSourceType.Sync,
            importType: ImportType.Mixed,
            defaultCurrency: 'CAD',
            isActive: false,
        },
        rawRows: results.flatMap((result) => result.rawRows),
        normalizedRows: results.flatMap((result) => result.normalizedRows),
        errors: results.flatMap((result) => result.errors),
    }
}

export function normalizeConnectorStatement(input: {
    connector: ReadOnlyConnectorDescriptor
    statement: ReadOnlyConnectorStatement
    accounts?: ReadOnlyConnectorAccount[]
    context?: ReadOnlyConnectorContext
}): ConnectorImportNormalizationResult {
    const transactions = normalizeConnectorTransactions({connector: input.connector, transactions: input.statement.transactions, accounts: input.accounts, context: input.context})
    const holdings = input.statement.holdings?.length
        ? normalizeConnectorHoldings({connector: input.connector, holdings: input.statement.holdings, accounts: input.accounts, context: input.context})
        : null
    return mergeConnectorNormalizationResults(holdings ? [transactions, holdings] : [transactions])
}

export class ReadOnlyConnectorRegistry {
    private readonly connectors = new Map<string, ReadOnlyConnector>()

    register(connector: ReadOnlyConnector): this {
        this.connectors.set(connector.descriptor.id, connector)
        return this
    }

    unregister(connectorId: string): this {
        this.connectors.delete(connectorId)
        return this
    }

    get(connectorId: string): ReadOnlyConnector | undefined {
        return this.connectors.get(connectorId)
    }

    list(): ReadOnlyConnectorDescriptor[] {
        return [...this.connectors.values()].map((connector) => connector.descriptor)
    }

    listAvailable(): ReadOnlyConnectorDescriptor[] {
        return this.list().filter((connector) => connector.status === ReadOnlyConnectorStatus.Available)
    }

    assertCapability(connectorId: string, capability: ReadOnlyConnectorCapability): ReadOnlyConnector {
        const connector = this.get(connectorId)
        if (!connector) {
            throw connectorError({
                code: ReadOnlyConnectorErrorCode.Unavailable,
                connectorId,
                operation: capability,
                message: `Connecteur ${connectorId} introuvable.`,
            })
        }
        const method = connector[capability as keyof ReadOnlyConnector]
        if (!connector.descriptor.capabilities.includes(capability) || typeof method !== 'function') {
            throw connectorError({
                code: ReadOnlyConnectorErrorCode.UnsupportedOperation,
                connectorId,
                operation: capability,
                message: `Le connecteur ${connectorId} ne supporte pas ${capability}.`,
            })
        }
        return connector
    }
}

export interface MockReadOnlyConnectorConfig {
    enabled?: boolean
    requireAuth?: boolean
    rateLimited?: boolean
    accounts?: ReadOnlyConnectorAccount[]
    holdings?: ReadOnlyConnectorHolding[]
    transactions?: ReadOnlyConnectorTransaction[]
    statements?: ReadOnlyConnectorStatement[]
}

function applyQuery<T extends {accountExternalId?: string; date?: string; asOf?: string}>(items: T[], query?: ReadOnlyConnectorQuery) {
    return items.filter((item) => {
        if (query?.accountExternalId && item.accountExternalId !== query.accountExternalId) return false
        const date = item.date || item.asOf
        if (query?.from && date && Date.parse(date) < Date.parse(query.from)) return false
        if (query?.to && date && Date.parse(date) > Date.parse(query.to)) return false
        return true
    }).slice(0, query?.limit ?? items.length)
}

function mockFailure(config: MockReadOnlyConnectorConfig | undefined, connectorId: string, operation: ReadOnlyConnectorCapability): ReadOnlyConnectorResult<never> | null {
    if (config?.requireAuth) return {ok: false, errors: [connectorError({code: ReadOnlyConnectorErrorCode.AuthRequired, connectorId, operation, message: 'Configuration d’authentification requise.'})]}
    if (config?.rateLimited) return {ok: false, errors: [connectorError({code: ReadOnlyConnectorErrorCode.RateLimited, connectorId, operation, message: 'Connecteur temporairement limité.', recoverable: true})]}
    if (config?.enabled === false) return {ok: false, errors: [connectorError({code: ReadOnlyConnectorErrorCode.Unavailable, connectorId, operation, message: 'Connecteur désactivé.', recoverable: true})]}
    return null
}

export function createMockReadOnlyConnector(defaultConfig: MockReadOnlyConnectorConfig = {}): ReadOnlyConnector<MockReadOnlyConnectorConfig> {
    const connectorId = 'mock-readonly-local'
    const descriptor: ReadOnlyConnectorDescriptor = {
        id: connectorId,
        name: 'Mock read-only local connector',
        provider: 'local-mock',
        sourceType: ImportSourceType.Sync,
        status: defaultConfig.enabled === false ? ReadOnlyConnectorStatus.Disabled : defaultConfig.requireAuth ? ReadOnlyConnectorStatus.NeedsConfiguration : ReadOnlyConnectorStatus.Available,
        supportedImportTypes: [ImportType.Transactions, ImportType.Investments, ImportType.Mixed],
        capabilities: [
            ReadOnlyConnectorCapability.TestConnection,
            ReadOnlyConnectorCapability.ListAccounts,
            ReadOnlyConnectorCapability.ListHoldings,
            ReadOnlyConnectorCapability.ListTransactions,
            ReadOnlyConnectorCapability.FetchStatement,
        ],
        defaultCurrency: 'CAD',
        version: '1.0.0',
        metadata: {mock: true},
    }

    function data(config?: MockReadOnlyConnectorConfig) {
        return {...defaultConfig, ...(config || {})}
    }

    return {
        descriptor,
        getStatus(config) {
            const merged = data(config)
            if (merged.enabled === false) return ReadOnlyConnectorStatus.Disabled
            if (merged.requireAuth) return ReadOnlyConnectorStatus.NeedsConfiguration
            if (merged.rateLimited) return ReadOnlyConnectorStatus.Failed
            return ReadOnlyConnectorStatus.Available
        },
        async testConnection(config, context) {
            const failure = mockFailure(data(config), connectorId, ReadOnlyConnectorCapability.TestConnection)
            if (failure) return failure
            return {ok: true, data: {status: this.getStatus(config), checkedAt: nowIso(context)}}
        },
        async listAccounts(config) {
            const merged = data(config)
            const failure = mockFailure(merged, connectorId, ReadOnlyConnectorCapability.ListAccounts)
            if (failure) return failure
            return {ok: true, data: merged.accounts || []}
        },
        async listHoldings(config, query) {
            const merged = data(config)
            const failure = mockFailure(merged, connectorId, ReadOnlyConnectorCapability.ListHoldings)
            if (failure) return failure
            return {ok: true, data: applyQuery(merged.holdings || [], query)}
        },
        async listTransactions(config, query) {
            const merged = data(config)
            const failure = mockFailure(merged, connectorId, ReadOnlyConnectorCapability.ListTransactions)
            if (failure) return failure
            return {ok: true, data: applyQuery(merged.transactions || [], query)}
        },
        async fetchStatement(config, query) {
            const merged = data(config)
            const failure = mockFailure(merged, connectorId, ReadOnlyConnectorCapability.FetchStatement)
            if (failure) return failure
            const statements = merged.statements || []
            const statement = query?.statementExternalId
                ? statements.find((entry) => entry.externalId === query.statementExternalId)
                : statements.find((entry) => !query?.accountExternalId || entry.accountExternalId === query.accountExternalId)
            if (!statement) {
                return {ok: false, errors: [connectorError({code: ReadOnlyConnectorErrorCode.Unavailable, connectorId, operation: ReadOnlyConnectorCapability.FetchStatement, message: 'Statement mock introuvable.'})]}
            }
            return {ok: true, data: statement}
        },
    }
}
