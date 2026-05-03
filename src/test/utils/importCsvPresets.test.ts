import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {ImportBusinessErrorCode, ImportTargetEntityType} from '../../types/imports'
import {parseCsvImportWithTemplate} from '../../utils/importCsvEngine'
import {
    copyCsvPresetToUserTemplate,
    getBrokerExchangeCsvPreset,
    listBrokerExchangeCsvPresets,
} from '../../utils/importCsvPresets'

function fixture(name: string) {
    return readFileSync(join(process.cwd(), 'src/test/fixtures/import-presets', name), 'utf8')
}

function preset(id: string) {
    const found = getBrokerExchangeCsvPreset(id)
    if (!found) throw new Error(`Missing preset ${id}`)
    return found
}

describe('broker and exchange CSV presets', () => {
    it('lists non-destructive system presets without claiming universal compatibility', () => {
        const presets = listBrokerExchangeCsvPresets()

        expect(presets.map((entry) => entry.id)).toEqual([
            'system:csv:preset:broker-transactions',
            'system:csv:preset:broker-holdings',
            'system:csv:preset:dividends-interests',
            'system:csv:preset:crypto-trades',
            'system:csv:preset:crypto-deposits-withdrawals',
        ])
        expect(presets.every((entry) => entry.isSystem && entry.isPreset && entry.universalCompatibility === false)).toBe(true)
        expect(presets.every((entry) => entry.metadata?.destructive === false)).toBe(true)
    })

    it('copies a preset into a user template without mutating the system preset', () => {
        const original = preset('system:csv:preset:broker-transactions')
        const copy = copyCsvPresetToUserTemplate(original.id, {id: 'user-template-1', name: 'My broker template'})

        expect(copy).toMatchObject({
            id: 'user-template-1',
            name: 'My broker template',
            provider: 'system-preset',
            metadata: expect.objectContaining({copiedFromPresetId: original.id}),
        })
        expect((copy as any).isSystem).toBeUndefined()
        expect((copy as any).isPreset).toBeUndefined()
        expect(preset(original.id)).toMatchObject({id: original.id, name: original.name, isSystem: true, isPreset: true})
    })

    it('parses broker transaction fixtures with frequent broker fields', () => {
        const result = parseCsvImportWithTemplate(fixture('broker-transactions.csv'), preset('system:csv:preset:broker-transactions'))

        expect(result.preview.canApply).toBe(true)
        expect(result.validRows).toHaveLength(2)
        expect(result.normalizedRows[0]).toMatchObject({
            targetKind: ImportTargetEntityType.InvestmentMovement,
            transactionDate: '2026-05-01T00:00:00.000Z',
            amount: -507.45,
            currency: 'CAD',
            externalRef: 'BRK-TX-001',
        })
        expect(result.normalizedRows[0].normalizedData).toMatchObject({
            operationType: 'BUY',
            symbol: 'XEQT',
            isin: 'CA46436J1012',
            quantity: 10,
            unitPrice: 50.25,
            grossAmount: 502.5,
            fees: 4.95,
            cashAmount: -507.45,
        })
    })

    it('parses broker holdings fixtures', () => {
        const result = parseCsvImportWithTemplate(fixture('broker-holdings.csv'), preset('system:csv:preset:broker-holdings'))

        expect(result.validRows).toHaveLength(2)
        expect(result.normalizedRows[0]).toMatchObject({
            targetKind: ImportTargetEntityType.InvestmentMovement,
            label: 'iShares Core Equity ETF Portfolio',
            amount: 1275,
            externalRef: 'HOLD-XEQT',
        })
        expect(result.normalizedRows[0].normalizedData).toMatchObject({
            symbol: 'XEQT',
            isin: 'CA46436J1012',
            quantity: 25,
            unitPrice: 51,
        })
    })

    it('parses dividends and interests fixtures', () => {
        const result = parseCsvImportWithTemplate(fixture('dividends-interests.csv'), preset('system:csv:preset:dividends-interests'))

        expect(result.validRows).toHaveLength(2)
        expect(result.normalizedRows[0].normalizedData).toMatchObject({
            operationType: 'DIVIDEND',
            symbol: 'XEQT',
            grossAmount: 12.5,
            taxes: 1.5,
            cashAmount: 11,
            amount: 11,
            externalRef: 'DIV-001',
        })
        expect(result.normalizedRows[1].normalizedData).toMatchObject({
            operationType: 'INTEREST',
            label: 'Cash interest',
            amount: 4.25,
            externalRef: 'INT-001',
        })
    })

    it('parses crypto trade fixtures', () => {
        const result = parseCsvImportWithTemplate(fixture('crypto-trades.csv'), preset('system:csv:preset:crypto-trades'))

        expect(result.validRows).toHaveLength(2)
        expect(result.normalizedRows[0]).toMatchObject({
            targetKind: ImportTargetEntityType.InvestmentMovement,
            label: 'BTC',
            amount: 850,
            currency: 'CAD',
            externalRef: 'CRYPTO-TRADE-001',
        })
        expect(result.normalizedRows[0].normalizedData).toMatchObject({
            operationType: 'BUY',
            symbol: 'BTC',
            quantity: 0.01,
            unitPrice: 85000,
            grossAmount: 850,
            fees: 1.25,
        })
    })

    it('parses crypto deposit and withdrawal fixtures', () => {
        const result = parseCsvImportWithTemplate(fixture('crypto-deposits-withdrawals.csv'), preset('system:csv:preset:crypto-deposits-withdrawals'))

        expect(result.validRows).toHaveLength(2)
        expect(result.normalizedRows[0].normalizedData).toMatchObject({
            operationType: 'DEPOSIT',
            symbol: 'BTC',
            quantity: 0.02,
            fees: 0,
            taxes: 0,
            externalRef: '0xdeposit001',
        })
        expect(result.normalizedRows[1].normalizedData).toMatchObject({
            operationType: 'WITHDRAWAL',
            symbol: 'ETH',
            quantity: 0.25,
            fees: 0.002,
            taxes: 0.001,
            externalRef: '0xwithdraw001',
        })
    })

    it('returns clear missing-column errors for incompatible broker exports', () => {
        const csv = ['Trade Date,Action,Quantity,Price,Currency', '2026-05-01,BUY,10,50.25,CAD'].join('\n')
        const result = parseCsvImportWithTemplate(csv, preset('system:csv:preset:broker-transactions'))

        expect(result.preview.canApply).toBe(false)
        expect(result.blockingErrors).toEqual(expect.arrayContaining([
            expect.objectContaining({
                code: ImportBusinessErrorCode.MissingColumn,
                field: 'symbol',
                message: expect.stringContaining('Missing required column "Symbol"'),
            }),
        ]))
        expect(result.blockingErrors[0].message).toContain('Copy the preset and adapt the mapping')
    })
})
