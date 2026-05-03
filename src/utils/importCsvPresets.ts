import {
    ImportDeduplicationStrategy,
    ImportMappingFieldType,
    ImportSourceType,
    ImportType,
} from '../types/imports'
import type {ImportMappingTemplate} from '../types/imports'

export type CsvPresetId =
    | 'system:csv:preset:broker-transactions'
    | 'system:csv:preset:broker-holdings'
    | 'system:csv:preset:dividends-interests'
    | 'system:csv:preset:crypto-trades'
    | 'system:csv:preset:crypto-deposits-withdrawals'

export interface CsvMappingPreset extends ImportMappingTemplate {
    id: CsvPresetId
    isSystem: true
    isPreset: true
    universalCompatibility: false
    notes: string
}

function mapping(sourceColumn: string, targetField: string, fieldType: ImportMappingFieldType, required = false, transformName?: string) {
    return {sourceColumn, targetField, fieldType, required, transformName: transformName || null}
}

export const BROKER_AND_EXCHANGE_CSV_PRESETS: CsvMappingPreset[] = [
    {
        id: 'system:csv:preset:broker-transactions',
        name: 'Preset broker générique — transactions',
        sourceType: ImportSourceType.CsvFile,
        importType: ImportType.Investments,
        provider: 'system-preset',
        delimiter: ',',
        hasHeader: true,
        defaultCurrency: 'CAD',
        deduplicationStrategy: ImportDeduplicationStrategy.ExternalReference,
        isSystem: true,
        isPreset: true,
        universalCompatibility: false,
        notes: 'Preset MVP générique pour exports brokers; à copier puis adapter selon le broker réel.',
        metadata: {presetCategory: 'broker', presetKind: 'transactions', destructive: false},
        columnMappings: [
            mapping('Trade Date', 'date', ImportMappingFieldType.Date, true),
            mapping('Action', 'operationType', ImportMappingFieldType.String, true, 'inferOperationType'),
            mapping('Symbol', 'symbol', ImportMappingFieldType.String, true, 'uppercase'),
            mapping('ISIN', 'isin', ImportMappingFieldType.String),
            mapping('Quantity', 'quantity', ImportMappingFieldType.Number, true),
            mapping('Price', 'unitPrice', ImportMappingFieldType.Number, true),
            mapping('Gross Amount', 'grossAmount', ImportMappingFieldType.Number),
            mapping('Fees', 'fees', ImportMappingFieldType.Number),
            mapping('Tax', 'taxes', ImportMappingFieldType.Number),
            mapping('Cash Amount', 'cashAmount', ImportMappingFieldType.Number),
            mapping('Currency', 'currency', ImportMappingFieldType.Currency),
            mapping('Account', 'accountName', ImportMappingFieldType.String),
            mapping('External ID', 'externalRef', ImportMappingFieldType.String),
        ],
    },
    {
        id: 'system:csv:preset:broker-holdings',
        name: 'Preset broker générique — positions',
        sourceType: ImportSourceType.CsvFile,
        importType: ImportType.Investments,
        provider: 'system-preset',
        delimiter: ',',
        hasHeader: true,
        defaultCurrency: 'CAD',
        deduplicationStrategy: ImportDeduplicationStrategy.Strict,
        isSystem: true,
        isPreset: true,
        universalCompatibility: false,
        notes: 'Preset MVP pour positions/holdings exportées en CSV; il ne garantit pas la compatibilité universelle.',
        metadata: {presetCategory: 'broker', presetKind: 'holdings', destructive: false},
        columnMappings: [
            mapping('As Of Date', 'date', ImportMappingFieldType.Date, true),
            mapping('Symbol', 'symbol', ImportMappingFieldType.String, true, 'uppercase'),
            mapping('ISIN', 'isin', ImportMappingFieldType.String),
            mapping('Security Name', 'label', ImportMappingFieldType.String),
            mapping('Quantity', 'quantity', ImportMappingFieldType.Number, true),
            mapping('Market Price', 'unitPrice', ImportMappingFieldType.Number),
            mapping('Market Value', 'amount', ImportMappingFieldType.Number, true),
            mapping('Currency', 'currency', ImportMappingFieldType.Currency),
            mapping('Account', 'accountName', ImportMappingFieldType.String),
            mapping('External ID', 'externalRef', ImportMappingFieldType.String),
        ],
    },
    {
        id: 'system:csv:preset:dividends-interests',
        name: 'Preset revenus — dividendes et intérêts',
        sourceType: ImportSourceType.CsvFile,
        importType: ImportType.Investments,
        provider: 'system-preset',
        delimiter: ',',
        hasHeader: true,
        defaultCurrency: 'CAD',
        deduplicationStrategy: ImportDeduplicationStrategy.ExternalReference,
        isSystem: true,
        isPreset: true,
        universalCompatibility: false,
        notes: 'Preset générique pour revenus de placement, dividendes, intérêts et retenues.',
        metadata: {presetCategory: 'income', presetKind: 'dividends-interests', destructive: false},
        columnMappings: [
            mapping('Payment Date', 'date', ImportMappingFieldType.Date, true),
            mapping('Income Type', 'operationType', ImportMappingFieldType.String, true, 'inferOperationType'),
            mapping('Symbol', 'symbol', ImportMappingFieldType.String, false, 'uppercase'),
            mapping('ISIN', 'isin', ImportMappingFieldType.String),
            mapping('Description', 'label', ImportMappingFieldType.String),
            mapping('Gross Amount', 'grossAmount', ImportMappingFieldType.Number),
            mapping('Withholding Tax', 'taxes', ImportMappingFieldType.Number),
            mapping('Cash Amount', 'cashAmount', ImportMappingFieldType.Number),
            mapping('Amount', 'amount', ImportMappingFieldType.Number, true),
            mapping('Currency', 'currency', ImportMappingFieldType.Currency),
            mapping('Account', 'accountName', ImportMappingFieldType.String),
            mapping('External ID', 'externalRef', ImportMappingFieldType.String),
        ],
    },
    {
        id: 'system:csv:preset:crypto-trades',
        name: 'Preset exchange crypto — trades',
        sourceType: ImportSourceType.CsvFile,
        importType: ImportType.Investments,
        provider: 'system-preset',
        delimiter: ',',
        hasHeader: true,
        defaultCurrency: 'CAD',
        deduplicationStrategy: ImportDeduplicationStrategy.ExternalReference,
        isSystem: true,
        isPreset: true,
        universalCompatibility: false,
        notes: 'Preset générique pour trades crypto spot; les formats exchange varient fortement.',
        metadata: {presetCategory: 'crypto', presetKind: 'trades', destructive: false},
        columnMappings: [
            mapping('Timestamp', 'date', ImportMappingFieldType.Date, true),
            mapping('Side', 'operationType', ImportMappingFieldType.String, true, 'inferOperationType'),
            mapping('Base Asset', 'symbol', ImportMappingFieldType.String, true, 'uppercase'),
            mapping('Base Quantity', 'quantity', ImportMappingFieldType.Number, true),
            mapping('Price', 'unitPrice', ImportMappingFieldType.Number, true),
            mapping('Quote Amount', 'grossAmount', ImportMappingFieldType.Number),
            mapping('Fee Amount', 'fees', ImportMappingFieldType.Number),
            mapping('Quote Currency', 'currency', ImportMappingFieldType.Currency),
            mapping('Account', 'accountName', ImportMappingFieldType.String),
            mapping('Trade ID', 'externalRef', ImportMappingFieldType.String),
        ],
    },
    {
        id: 'system:csv:preset:crypto-deposits-withdrawals',
        name: 'Preset exchange crypto — dépôts/retraits',
        sourceType: ImportSourceType.CsvFile,
        importType: ImportType.Mixed,
        provider: 'system-preset',
        delimiter: ',',
        hasHeader: true,
        defaultCurrency: 'CAD',
        deduplicationStrategy: ImportDeduplicationStrategy.ExternalReference,
        isSystem: true,
        isPreset: true,
        universalCompatibility: false,
        notes: 'Preset générique pour mouvements crypto on/off exchange; à adapter selon les colonnes réelles.',
        metadata: {presetCategory: 'crypto', presetKind: 'deposits-withdrawals', destructive: false},
        columnMappings: [
            mapping('Timestamp', 'date', ImportMappingFieldType.Date, true),
            mapping('Type', 'operationType', ImportMappingFieldType.String, true, 'inferOperationType'),
            mapping('Asset', 'symbol', ImportMappingFieldType.String, true, 'uppercase'),
            mapping('Quantity', 'quantity', ImportMappingFieldType.Number, true),
            mapping('Fee Amount', 'fees', ImportMappingFieldType.Number),
            mapping('Network Fee', 'taxes', ImportMappingFieldType.Number),
            mapping('Currency', 'currency', ImportMappingFieldType.Currency),
            mapping('Account', 'accountName', ImportMappingFieldType.String),
            mapping('Transaction Hash', 'externalRef', ImportMappingFieldType.String),
        ],
    },
]

export function listBrokerExchangeCsvPresets() {
    return BROKER_AND_EXCHANGE_CSV_PRESETS.map((preset) => structuredClone(preset))
}

export function getBrokerExchangeCsvPreset(id: CsvPresetId | string) {
    const preset = BROKER_AND_EXCHANGE_CSV_PRESETS.find((entry) => entry.id === id)
    return preset ? structuredClone(preset) : null
}

export function copyCsvPresetToUserTemplate(id: CsvPresetId | string, overrides: Partial<ImportMappingTemplate> = {}): ImportMappingTemplate {
    const preset = getBrokerExchangeCsvPreset(id)
    if (!preset) throw new Error(`CSV preset not found: ${id}`)
    const {isPreset: _isPreset, universalCompatibility: _universalCompatibility, notes, ...template} = preset
    return {
        ...template,
        ...overrides,
        id: overrides.id,
        name: overrides.name || `${preset.name} (copie)`,
        provider: overrides.provider ?? preset.provider,
        metadata: {
            ...(preset.metadata || {}),
            ...(overrides.metadata || {}),
            copiedFromPresetId: preset.id,
            copiedFromPresetNotes: notes,
            isSystem: false,
        },
    }
}
