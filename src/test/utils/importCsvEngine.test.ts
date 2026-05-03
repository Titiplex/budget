import {describe, expect, it} from 'vitest'
import {ImportBusinessErrorCode, ImportDeduplicationStrategy} from '../../types/imports'
import {detectCsvDialect, parseCsvImport, parseCsvImportWithTemplate} from '../../utils/importCsvEngine'

describe('importCsvEngine', () => {
    it('parses comma-separated CSV with quoted values and normalizes transaction fields', () => {
        const result = parseCsvImport([
            'Date,Description,Amount,Currency,Account',
            '2026-05-01,"Groceries, cafe",-42.50,CAD,Main account',
            '',
        ].join('\n'))

        expect(result.delimiter).toBe(',')
        expect(result.hasHeader).toBe(true)
        expect(result.rawRows).toHaveLength(1)
        expect(result.validRows).toHaveLength(1)
        expect(result.invalidRows).toHaveLength(0)
        expect(result.validRows[0].transactionDate).toBe('2026-05-01T00:00:00.000Z')
        expect(result.validRows[0].label).toBe('Groceries, cafe')
        expect(result.validRows[0].amount).toBe(-42.5)
        expect(result.validRows[0].currency).toBe('CAD')
        expect(result.validRows[0].accountName).toBe('Main account')
        expect(result.preview.canApply).toBe(true)
    })

    it('parses semicolon CSV with decimal comma and localized headers', () => {
        const result = parseCsvImport([
            'Date;Libellé;Montant;Devise;Frais;Taxes',
            '01/05/2026;Épicerie;-42,50;EUR;1,25;0,50',
        ].join('\n'), {
            dateFormat: 'dd/MM/yyyy',
            decimalSeparator: ',',
            defaultCurrency: 'EUR',
        })

        expect(result.delimiter).toBe(';')
        expect(result.headers).toEqual(['Date', 'Libellé', 'Montant', 'Devise', 'Frais', 'Taxes'])
        expect(result.validRows).toHaveLength(1)
        expect(result.validRows[0].normalizedData).toMatchObject({
            date: '2026-05-01T00:00:00.000Z',
            label: 'Épicerie',
            amount: -42.5,
            currency: 'EUR',
            fees: 1.25,
            taxes: 0.5,
        })
    })

    it('parses tab-separated rows without headers using a mapping template', () => {
        const result = parseCsvImportWithTemplate(
            '2026-05-03\tBuy XEQT\t10\t32.50\t1.25\tCAD\tXEQT\tbuy\n',
            {
                deduplicationStrategy: ImportDeduplicationStrategy.Strict,
                columnMappings: [
                    {sourceColumn: 'column1', targetField: 'date', fieldType: 'date'},
                    {sourceColumn: 'column2', targetField: 'label', fieldType: 'string'},
                    {sourceColumn: 'column3', targetField: 'quantity', fieldType: 'number'},
                    {sourceColumn: 'column4', targetField: 'unitPrice', fieldType: 'number'},
                    {sourceColumn: 'column5', targetField: 'fees', fieldType: 'number'},
                    {sourceColumn: 'column6', targetField: 'currency', fieldType: 'currency'},
                    {sourceColumn: 'column7', targetField: 'symbol', fieldType: 'string'},
                    {sourceColumn: 'column8', targetField: 'operationType', fieldType: 'string'},
                ],
            },
            {hasHeader: false, delimiter: '\t'},
        )

        expect(result.delimiter).toBe('\t')
        expect(result.hasHeader).toBe(false)
        expect(result.validRows).toHaveLength(1)
        expect(result.validRows[0].normalizedData).toMatchObject({
            date: '2026-05-03T00:00:00.000Z',
            label: 'Buy XEQT',
            quantity: 10,
            unitPrice: 32.5,
            fees: 1.25,
            currency: 'CAD',
            symbol: 'XEQT',
            operationType: 'BUY',
        })
    })

    it('localizes invalid row errors without throwing exceptions', () => {
        const result = parseCsvImport([
            'Date,Description,Amount,Currency',
            'not-a-date,Broken row,abc,CAD',
        ].join('\n'))

        expect(result.validRows).toHaveLength(0)
        expect(result.invalidRows).toHaveLength(1)
        expect(result.preview.canApply).toBe(false)
        expect(result.preview.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({
                rowNumber: 2,
                code: ImportBusinessErrorCode.InvalidDate,
                field: 'date',
            }),
            expect.objectContaining({
                rowNumber: 2,
                code: ImportBusinessErrorCode.InvalidAmount,
                field: 'amount',
            }),
        ]))
    })

    it('detects CSV dialect without normalizing rows', () => {
        const dialect = detectCsvDialect('date;description;amount\n2026-05-01;Coffee;-4,50\n')

        expect(dialect.delimiter).toBe(';')
        expect(dialect.hasHeader).toBe(true)
        expect(dialect.rowCount).toBe(2)
        expect(dialect.errors).toHaveLength(0)
    })
})
