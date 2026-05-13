import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'import-csv')

export function readImportCsvFixture(fileName) {
    return fs.readFileSync(path.join(fixturesDir, fileName), 'utf8').trimEnd()
}

export const importCsvFixtures = Object.freeze({
    simpleTransactions: readImportCsvFixture('transactions-simple.csv'),
    multiCurrencyTransactions: readImportCsvFixture('transactions-multicurrency.csv'),
    brokerTransactions: readImportCsvFixture('broker-transactions.csv'),
    holdings: readImportCsvFixture('holdings.csv'),
    dividendsInterests: readImportCsvFixture('dividends-interests.csv'),
    cryptoTrades: readImportCsvFixture('crypto-trades.csv'),
    withErrors: readImportCsvFixture('with-errors.csv'),
    duplicates: readImportCsvFixture('duplicates.csv'),
    missingColumns: readImportCsvFixture('missing-columns.csv'),
})

export const importTemplates = Object.freeze({
    bankTransactions: {
        importType: 'transactions',
        defaultCurrency: 'CAD',
        columnMappings: [
            {sourceColumn: 'Date', targetField: 'date'},
            {sourceColumn: 'Description', targetField: 'label'},
            {sourceColumn: 'Amount', targetField: 'amount'},
            {sourceColumn: 'Currency', targetField: 'currency'},
            {sourceColumn: 'Account', targetField: 'accountName'},
        ],
    },
    semicolonBankTransactions: {
        importType: 'transactions',
        defaultCurrency: 'CAD',
        delimiter: ';',
        decimalSeparator: ',',
        columnMappings: [
            {sourceColumn: 'Date', targetField: 'date'},
            {sourceColumn: 'Description', targetField: 'label'},
            {sourceColumn: 'Amount', targetField: 'amount'},
            {sourceColumn: 'Currency', targetField: 'currency'},
            {sourceColumn: 'Account', targetField: 'accountName'},
        ],
    },
    brokerOperations: {
        importType: 'investments',
        defaultCurrency: 'CAD',
        columnMappings: [
            {sourceColumn: 'Trade Date', targetField: 'date'},
            {sourceColumn: 'Action', targetField: 'operationType'},
            {sourceColumn: 'Symbol', targetField: 'symbol'},
            {sourceColumn: 'Description', targetField: 'label'},
            {sourceColumn: 'Quantity', targetField: 'quantity'},
            {sourceColumn: 'Unit Price', targetField: 'unitPrice'},
            {sourceColumn: 'Fees', targetField: 'fees'},
            {sourceColumn: 'Currency', targetField: 'currency'},
            {sourceColumn: 'Broker', targetField: 'sourceName'},
        ],
    },
    holdings: {
        importType: 'investments',
        defaultCurrency: 'CAD',
        columnMappings: [
            {sourceColumn: 'As Of', targetField: 'date'},
            {sourceColumn: 'Name', targetField: 'label'},
            {sourceColumn: 'Symbol', targetField: 'symbol'},
            {sourceColumn: 'Quantity', targetField: 'quantity'},
            {sourceColumn: 'Unit Price', targetField: 'unitPrice'},
            {sourceColumn: 'Currency', targetField: 'currency'},
            {sourceColumn: 'Broker', targetField: 'sourceName'},
        ],
    },
    incomeOperations: {
        importType: 'investments',
        defaultCurrency: 'CAD',
        columnMappings: [
            {sourceColumn: 'Date', targetField: 'date'},
            {sourceColumn: 'Type', targetField: 'operationType'},
            {sourceColumn: 'Symbol', targetField: 'symbol'},
            {sourceColumn: 'Description', targetField: 'label'},
            {sourceColumn: 'Amount', targetField: 'amount'},
            {sourceColumn: 'Currency', targetField: 'currency'},
            {sourceColumn: 'Account', targetField: 'accountName'},
        ],
    },
    cryptoTrades: {
        importType: 'investments',
        defaultCurrency: 'CAD',
        columnMappings: [
            {sourceColumn: 'Date', targetField: 'date'},
            {sourceColumn: 'Type', targetField: 'operationType'},
            {sourceColumn: 'Symbol', targetField: 'symbol'},
            {sourceColumn: 'Description', targetField: 'label'},
            {sourceColumn: 'Quantity', targetField: 'quantity'},
            {sourceColumn: 'Unit Price', targetField: 'unitPrice'},
            {sourceColumn: 'Fees', targetField: 'fees'},
            {sourceColumn: 'Currency', targetField: 'currency'},
            {sourceColumn: 'Source', targetField: 'sourceName'},
        ],
    },
    missingColumns: {
        importType: 'transactions',
        defaultCurrency: 'CAD',
        columnMappings: [
            {sourceColumn: 'Description', targetField: 'label'},
            {sourceColumn: 'Amount', targetField: 'amount'},
        ],
    },
})

export const expectedSimpleTransactionRows = Object.freeze([
    {
        label: 'Salary',
        amount: 2500,
        currency: 'CAD',
        date: '2026-05-01T00:00:00.000Z',
        accountName: 'Chequing',
    },
    {
        label: 'Groceries',
        amount: -83.41,
        currency: 'CAD',
        date: '2026-05-02T00:00:00.000Z',
        accountName: 'Chequing',
    },
])

export const existingGroceriesImportRow = Object.freeze({
    id: 'existing-groceries-row',
    entityId: 123,
    targetKind: 'transaction',
    transactionDate: '2026-05-02T00:00:00.000Z',
    label: 'Groceries',
    amount: -83.41,
    currency: 'CAD',
    normalizedData: {
        date: '2026-05-02T00:00:00.000Z',
        label: 'Groceries',
        amount: -83.41,
        currency: 'CAD',
        accountName: 'Chequing',
    },
})
