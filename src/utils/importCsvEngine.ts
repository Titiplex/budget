import {
    ImportBatchStatus,
    ImportBusinessErrorCode,
    ImportErrorSeverity,
    ImportErrorStage,
    ImportMappingTemplate,
    ImportPreviewResult,
    ImportRowNormalized,
    ImportRowRaw,
    ImportRowStatus,
    ImportRowValidationError,
    ImportTargetEntityType,
    ImportType,
    JsonObject,
    JsonValue,
} from '../types/imports'
import {normalizeHeader} from './csv'

export type CsvDelimiter = ',' | ';' | '\t'
export type CsvDateFormat = 'auto' | 'yyyy-MM-dd' | 'yyyy/MM/dd' | 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'dd-MM-yyyy' | 'yyyyMMdd'
export type CsvDecimalSeparator = 'auto' | '.' | ','
export type CsvNormalizedField =
    | 'date'
    | 'label'
    | 'amount'
    | 'currency'
    | 'quantity'
    | 'unitPrice'
    | 'fees'
    | 'taxes'
    | 'symbol'
    | 'operationType'
    | 'accountName'
    | 'sourceName'
    | 'isin'
    | 'grossAmount'
    | 'cashAmount'
    | 'externalRef'
export type CsvImportMapping = Partial<Record<CsvNormalizedField, string[]>>

export interface CsvImportParseOptions {
    delimiter?: CsvDelimiter
    hasHeader?: boolean
    dateFormat?: CsvDateFormat
    decimalSeparator?: CsvDecimalSeparator
    defaultCurrency?: string
    mapping?: CsvImportMapping
    mappingTemplate?: Pick<ImportMappingTemplate, 'columnMappings' | 'defaultValues' | 'deduplicationStrategy'>
    sourceName?: string
    skipEmptyLines?: boolean
    strict?: boolean
}

export type NormalizedCsvImportData = JsonObject & {
    date?: string
    label?: string
    amount?: number
    currency?: string
    quantity?: number
    unitPrice?: number
    fees?: number
    taxes?: number
    symbol?: string
    operationType?: string
    accountName?: string
    sourceName?: string
    isin?: string
    grossAmount?: number
    cashAmount?: number
    externalRef?: string
}

export interface CsvImportParseResult {
    delimiter: CsvDelimiter
    hasHeader: boolean
    headers: string[]
    rawRows: ImportRowRaw[]
    normalizedRows: ImportRowNormalized<NormalizedCsvImportData>[]
    validRows: ImportRowNormalized<NormalizedCsvImportData>[]
    invalidRows: ImportRowNormalized<NormalizedCsvImportData>[]
    warnings: ImportRowValidationError[]
    blockingErrors: ImportRowValidationError[]
    preview: ImportPreviewResult<NormalizedCsvImportData>
}

interface ParsedCsvRow { lineNumber: number; cells: string[] }
interface ParsedCsvDocument { rows: ParsedCsvRow[]; errors: ImportRowValidationError[] }
interface HeaderDescriptor { raw: string; key: string }

const DELIMITERS: CsvDelimiter[] = [',', ';', '\t']
const DEFAULT_CURRENCY = 'CAD'
const DEFAULT_MAPPING: Required<CsvImportMapping> = {
    date: ['date', 'timestamp', 'transaction date', 'trade date', 'operation date', 'settlement date', 'payment date', 'as of date', 'posted date', 'jour', 'date operation', 'date opération'],
    label: ['label', 'description', 'details', 'security name', 'name', 'memo', 'libelle', 'libellé', 'operation', 'opération'],
    amount: ['amount', 'net amount', 'total', 'value', 'market value', 'montant', 'montant net'],
    currency: ['currency', 'quote currency', 'devise', 'ccy'],
    quantity: ['quantity', 'qty', 'shares', 'units', 'base quantity', 'quantite', 'quantité'],
    unitPrice: ['unit price', 'price', 'market price', 'prix unitaire', 'prix'],
    fees: ['fees', 'fee', 'fee amount', 'commission', 'commissions', 'frais'],
    taxes: ['taxes', 'tax', 'withholding tax', 'network fee', 'taxe', 'impot', 'impôt'],
    symbol: ['symbol', 'ticker', 'asset', 'base asset', 'instrument', 'symbole'],
    operationType: ['type', 'operation type', 'transaction type', 'side', 'action', 'income type', 'type operation', 'type opération'],
    accountName: ['account', 'account name', 'compte', 'nom compte'],
    sourceName: ['source', 'provider', 'broker', 'exchange', 'courtier'],
    isin: ['isin'],
    grossAmount: ['gross amount', 'quote amount', 'gross proceeds', 'gross'],
    cashAmount: ['cash amount', 'settlement amount', 'net cash', 'cash'],
    externalRef: ['external id', 'trade id', 'transaction id', 'transaction hash', 'id', 'reference', 'ref'],
}

function error(input: {rowNumber?: number; stage: ImportErrorStage; severity: ImportErrorSeverity; code: ImportBusinessErrorCode | string; message: string; field?: string | null; details?: JsonObject | null}): ImportRowValidationError {
    return {rowNumber: input.rowNumber, stage: input.stage, severity: input.severity, code: input.code, message: input.message, field: input.field ?? null, details: input.details ?? null}
}

function stripBom(content: string) {
    return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
}

function parseRows(content: string, delimiter: CsvDelimiter, skipEmptyLines = true): ParsedCsvDocument {
    const rows: ParsedCsvRow[] = []
    const errors: ImportRowValidationError[] = []
    let cells: string[] = []
    let cell = ''
    let inQuotes = false
    let line = 1
    let rowLine = 1
    const source = stripBom(content)

    const pushRow = () => {
        cells.push(cell)
        if (!skipEmptyLines || cells.some((value) => value.trim().length > 0)) rows.push({lineNumber: rowLine, cells})
        cells = []
        cell = ''
        rowLine = line + 1
    }

    for (let index = 0; index < source.length; index += 1) {
        const char = source[index]
        const next = source[index + 1]
        if (char === '"') {
            if (inQuotes && next === '"') {
                cell += '"'
                index += 1
            } else {
                inQuotes = !inQuotes
            }
            continue
        }
        if (char === delimiter && !inQuotes) {
            cells.push(cell)
            cell = ''
            continue
        }
        if ((char === '\n' || char === '\r') && !inQuotes) {
            pushRow()
            if (char === '\r' && next === '\n') index += 1
            line += 1
            continue
        }
        if (char === '\n' || char === '\r') line += 1
        cell += char
    }

    if (inQuotes) {
        errors.push(error({stage: ImportErrorStage.Parsing, severity: ImportErrorSeverity.Error, code: ImportBusinessErrorCode.UnsupportedFormat, message: 'CSV contains an unterminated quoted field.', details: {delimiter}}))
    }
    if (cell.length > 0 || cells.length > 0 || !skipEmptyLines) pushRow()
    return {rows, errors}
}

function delimiterScore(document: ParsedCsvDocument) {
    if (document.errors.length || !document.rows.length) return -1
    const widths = document.rows.slice(0, 10).map((row) => row.cells.length)
    const maxWidth = Math.max(...widths)
    return widths.filter((width) => width > 1).length * 100 + widths.filter((width) => width === maxWidth).length * 10 + maxWidth
}

function detectDelimiter(content: string, options: CsvImportParseOptions): CsvDelimiter {
    if (options.delimiter) return options.delimiter
    return DELIMITERS.map((delimiter) => ({delimiter, score: delimiterScore(parseRows(content, delimiter, options.skipEmptyLines ?? true))})).sort((a, b) => b.score - a.score)[0]?.delimiter ?? ','
}

function looksLikeHeader(row: ParsedCsvRow) {
    const knownHeaders = new Set(Object.values(DEFAULT_MAPPING).flat().map(normalizeHeader))
    if (row.cells.some((cell) => knownHeaders.has(normalizeHeader(cell)))) return true
    const nonDataLike = row.cells.filter((cell) => {
        const value = cell.trim()
        return value && !/^[-+]?\(?[\d\s.,']+\)?$/.test(value) && !/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(value)
    }).length
    return row.cells.length > 1 && nonDataLike >= Math.ceil(row.cells.length / 2)
}

function detectHasHeader(rows: ParsedCsvRow[], options: CsvImportParseOptions) {
    if (typeof options.hasHeader === 'boolean') return options.hasHeader
    return rows[0] ? looksLikeHeader(rows[0]) : true
}

function mergeMappings(options: CsvImportParseOptions): Required<CsvImportMapping> {
    const merged = {...DEFAULT_MAPPING}
    for (const columnMapping of options.mappingTemplate?.columnMappings ?? []) {
        const targetField = columnMapping.targetField as CsvNormalizedField
        if (Object.prototype.hasOwnProperty.call(merged, targetField)) merged[targetField] = [columnMapping.sourceColumn, ...merged[targetField]]
    }
    for (const field of Object.keys(merged) as CsvNormalizedField[]) merged[field] = [...(options.mapping?.[field] ?? []), ...merged[field]]
    return merged
}

function requiredTemplateColumns(options: CsvImportParseOptions) {
    return (options.mappingTemplate?.columnMappings ?? [])
        .filter((mapping) => mapping.required)
        .map((mapping) => ({sourceColumn: mapping.sourceColumn, targetField: mapping.targetField}))
}

function buildHeaders(headerRow: ParsedCsvRow | undefined, maxColumns: number, hasHeader: boolean): HeaderDescriptor[] {
    const rawHeaders = hasHeader && headerRow ? headerRow.cells : Array.from({length: maxColumns}, (_, index) => `column${index + 1}`)
    return rawHeaders.map((header, index) => {
        const raw = header.trim() || `column${index + 1}`
        return {raw, key: normalizeHeader(raw)}
    })
}

function missingRequiredColumnErrors(headers: HeaderDescriptor[], options: CsvImportParseOptions) {
    const available = new Set(headers.map((header) => header.key))
    return requiredTemplateColumns(options)
        .filter((mapping) => !available.has(normalizeHeader(mapping.sourceColumn)))
        .map((mapping) => error({
            stage: ImportErrorStage.Validation,
            severity: ImportErrorSeverity.Error,
            code: ImportBusinessErrorCode.MissingColumn,
            message: `Missing required column "${mapping.sourceColumn}" for preset field "${mapping.targetField}". Copy the preset and adapt the mapping if your export uses another column name.`,
            field: mapping.targetField,
            details: {sourceColumn: mapping.sourceColumn, targetField: mapping.targetField, availableColumns: headers.map((header) => header.raw)},
        }))
}

function buildRecord(row: ParsedCsvRow, headers: HeaderDescriptor[]): Record<string, string> {
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
        record[header.key] = (row.cells[index] ?? '').trim()
    })
    return record
}

function read(record: Record<string, string>, mapping: Required<CsvImportMapping>, field: CsvNormalizedField) {
    for (const alias of mapping[field]) {
        const value = record[normalizeHeader(alias)]
        if (value?.trim()) return value.trim()
    }
    return ''
}

function dateFromParts(year: number, month: number, day: number) {
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
    return date.toISOString()
}

function parseDateWithFormat(value: string, format: Exclude<CsvDateFormat, 'auto'>) {
    const patterns: Record<Exclude<CsvDateFormat, 'auto'>, RegExp> = {
        'yyyy-MM-dd': /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
        'yyyy/MM/dd': /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
        'dd/MM/yyyy': /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
        'MM/dd/yyyy': /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
        'dd-MM-yyyy': /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
        yyyyMMdd: /^(\d{4})(\d{2})(\d{2})$/,
    }
    const match = value.match(patterns[format])
    if (!match) return null
    if (format === 'dd/MM/yyyy' || format === 'dd-MM-yyyy') return dateFromParts(Number(match[3]), Number(match[2]), Number(match[1]))
    if (format === 'MM/dd/yyyy') return dateFromParts(Number(match[3]), Number(match[1]), Number(match[2]))
    return dateFromParts(Number(match[1]), Number(match[2]), Number(match[3]))
}

function parseDateValue(value: string, format: CsvDateFormat) {
    if (!value.trim()) return null
    const formats: Exclude<CsvDateFormat, 'auto'>[] = format === 'auto' ? ['yyyy-MM-dd', 'yyyy/MM/dd', 'dd/MM/yyyy', 'MM/dd/yyyy', 'dd-MM-yyyy', 'yyyyMMdd'] : [format]
    for (const currentFormat of formats) {
        const parsed = parseDateWithFormat(value.trim(), currentFormat)
        if (parsed) return parsed
    }
    const timestamp = Date.parse(value)
    if (Number.isNaN(timestamp)) return null
    const date = new Date(timestamp)
    return dateFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

function inferDecimalSeparator(value: string): Exclude<CsvDecimalSeparator, 'auto'> {
    const comma = value.lastIndexOf(',')
    const dot = value.lastIndexOf('.')
    if (comma > -1 && dot > -1) return comma > dot ? ',' : '.'
    return comma > -1 ? ',' : '.'
}

function parseNumberValue(value: string, decimalSeparator: CsvDecimalSeparator) {
    const trimmed = value.trim()
    if (!trimmed || !/\d/.test(trimmed)) return null
    const selectedDecimal = decimalSeparator === 'auto' ? inferDecimalSeparator(trimmed) : decimalSeparator
    const thousandsSeparator = selectedDecimal === ',' ? '.' : ','
    const isParenthesizedNegative = /^\(.*\)$/.test(trimmed)
    let sanitized = trimmed
        .replace(/^\((.*)\)$/, '$1')
        .replace(/[\s\u00a0']/g, '')
        .replace(/[A-Za-z$€£¥₿]/g, '')
        .replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '')
    if (selectedDecimal === ',') sanitized = sanitized.replace(',', '.')
    const parsed = Number(sanitized)
    if (!Number.isFinite(parsed)) return null
    return isParenthesizedNegative ? -Math.abs(parsed) : parsed
}

function put(target: JsonObject, key: string, value: JsonValue | undefined | null) {
    if (value !== undefined && value !== null && value !== '') target[key] = value
}

function normalizeRow(input: {batchId: string; row: ParsedCsvRow; rawRowId: string; record: Record<string, string>; mapping: Required<CsvImportMapping>; options: Required<Pick<CsvImportParseOptions, 'dateFormat' | 'decimalSeparator' | 'defaultCurrency'>> & CsvImportParseOptions}): ImportRowNormalized<NormalizedCsvImportData> {
    const {row, rawRowId, record, mapping, options} = input
    const errors: ImportRowValidationError[] = []
    const warnings: ImportRowValidationError[] = []
    const data: NormalizedCsvImportData = {}
    const dateRaw = read(record, mapping, 'date')
    const parsedDate = parseDateValue(dateRaw, options.dateFormat)

    if (!dateRaw || !parsedDate) errors.push(error({rowNumber: row.lineNumber, stage: ImportErrorStage.Validation, severity: ImportErrorSeverity.Error, code: ImportBusinessErrorCode.InvalidDate, message: dateRaw ? `Invalid date value: ${dateRaw}` : 'Missing required date value.', field: 'date', details: {received: dateRaw}}))
    else put(data, 'date', parsedDate)

    const label = read(record, mapping, 'label')
    if (label) put(data, 'label', label)
    else warnings.push(error({rowNumber: row.lineNumber, stage: ImportErrorStage.Validation, severity: ImportErrorSeverity.Warning, code: ImportBusinessErrorCode.MissingColumn, message: 'No label/description was found for this row.', field: 'label'}))

    const currencyRaw = read(record, mapping, 'currency')
    const currency = (currencyRaw || options.defaultCurrency).toUpperCase()
    if (!/^[A-Z]{3}$/.test(currency)) errors.push(error({rowNumber: row.lineNumber, stage: ImportErrorStage.Validation, severity: ImportErrorSeverity.Error, code: ImportBusinessErrorCode.InvalidCurrency, message: `Invalid currency value: ${currency}`, field: 'currency', details: {received: currency}}))
    else {
        put(data, 'currency', currency)
        if (!currencyRaw) warnings.push(error({rowNumber: row.lineNumber, stage: ImportErrorStage.Normalization, severity: ImportErrorSeverity.Warning, code: 'DEFAULT_CURRENCY_USED', message: `Currency missing; defaulted to ${currency}.`, field: 'currency', details: {defaultCurrency: currency}}))
    }

    let hasCoreNumericValue = false
    let hasCoreNumericCandidate = false
    for (const field of ['amount', 'quantity', 'unitPrice', 'fees', 'taxes', 'grossAmount', 'cashAmount'] as CsvNormalizedField[]) {
        const rawValue = read(record, mapping, field)
        if (!rawValue) continue
        if (field === 'amount' || field === 'quantity' || field === 'unitPrice' || field === 'grossAmount' || field === 'cashAmount') hasCoreNumericCandidate = true
        const parsed = parseNumberValue(rawValue, options.decimalSeparator)
        if (parsed === null) errors.push(error({rowNumber: row.lineNumber, stage: ImportErrorStage.Validation, severity: ImportErrorSeverity.Error, code: ImportBusinessErrorCode.InvalidAmount, message: `Invalid numeric value for ${field}: ${rawValue}`, field, details: {received: rawValue}}))
        else {
            if (field === 'amount' || field === 'quantity' || field === 'unitPrice' || field === 'grossAmount' || field === 'cashAmount') hasCoreNumericValue = true
            put(data, field, parsed)
        }
    }
    if (typeof data.amount !== 'number' && typeof data.cashAmount === 'number') put(data, 'amount', data.cashAmount)
    if (typeof data.amount !== 'number' && typeof data.grossAmount === 'number') put(data, 'amount', data.grossAmount)
    if (!hasCoreNumericValue && !hasCoreNumericCandidate) errors.push(error({rowNumber: row.lineNumber, stage: ImportErrorStage.Validation, severity: ImportErrorSeverity.Error, code: ImportBusinessErrorCode.InvalidAmount, message: 'Missing amount, quantity, unit price, gross amount or cash amount. At least one numeric core value is required.', field: 'amount'}))

    for (const field of ['symbol', 'operationType', 'accountName', 'sourceName', 'isin', 'externalRef'] as CsvNormalizedField[]) {
        const raw = read(record, mapping, field)
        const normalized = field === 'symbol' ? raw.toUpperCase() : field === 'operationType' ? raw.trim().replace(/\s+/g, '_').toUpperCase() : raw
        if (normalized) put(data, field, normalized)
    }
    if (options.sourceName && !data.sourceName) put(data, 'sourceName', options.sourceName)

    const amount = typeof data.amount === 'number' ? data.amount : null
    const isInvestmentLike = Boolean(data.symbol || data.quantity !== undefined || data.unitPrice !== undefined || data.isin)
    const duplicateKey = parsedDate && (amount !== null || data.externalRef) ? `${data.externalRef ?? ''}:${parsedDate.slice(0, 10)}:${amount ?? ''}:${data.currency ?? options.defaultCurrency}:${data.label ?? data.symbol ?? ''}` : null
    return {
        batchId: input.batchId,
        rawRowId,
        rowNumber: row.lineNumber,
        status: errors.length ? ImportRowStatus.Invalid : ImportRowStatus.Valid,
        targetKind: isInvestmentLike ? ImportTargetEntityType.InvestmentMovement : ImportTargetEntityType.Transaction,
        normalizedData: data,
        transactionDate: typeof data.date === 'string' ? data.date : null,
        label: typeof data.label === 'string' ? data.label : typeof data.symbol === 'string' ? data.symbol : null,
        amount,
        currency: typeof data.currency === 'string' ? data.currency : null,
        accountName: typeof data.accountName === 'string' ? data.accountName : null,
        externalRef: typeof data.externalRef === 'string' ? data.externalRef : null,
        duplicateKey,
        duplicateConfidence: duplicateKey ? 1 : null,
        validationErrors: [...errors, ...warnings],
        duplicateCandidates: [],
    }
}

function blocked(errors: ImportRowValidationError[], delimiter: CsvDelimiter, hasHeader: boolean, headers: string[] = []): CsvImportParseResult {
    const batch = {id: 'csv-preview', status: ImportBatchStatus.Failed, importType: ImportType.Mixed, defaultCurrency: DEFAULT_CURRENCY, rowCount: 0, errorCount: errors.length, duplicateCount: 0, importedAt: new Date(0).toISOString()}
    return {delimiter, hasHeader, headers, rawRows: [], normalizedRows: [], validRows: [], invalidRows: [], warnings: [], blockingErrors: errors, preview: {batch, summary: {totalRows: 0, rawRows: 0, normalizedRows: 0, validRows: 0, invalidRows: 0, duplicateRows: 0, errorCount: errors.length, warningCount: 0}, rawRows: [], normalizedRows: [], errors, duplicateCandidates: [], decisions: [], canApply: false}}
}

export function parseCsvImport(content: string, options: CsvImportParseOptions = {}): CsvImportParseResult {
    const delimiter = detectDelimiter(content, options)
    const document = parseRows(content, delimiter, options.skipEmptyLines ?? true)
    const hasHeader = detectHasHeader(document.rows, options)
    if (document.errors.length) return blocked(document.errors, delimiter, hasHeader)
    if (!document.rows.length) return blocked([error({stage: ImportErrorStage.Parsing, severity: ImportErrorSeverity.Error, code: ImportBusinessErrorCode.UnsupportedFormat, message: 'CSV file is empty or contains only empty lines.'})], delimiter, hasHeader)

    const dataRows = hasHeader ? document.rows.slice(1) : document.rows
    const maxColumns = Math.max(...document.rows.map((row) => row.cells.length))
    const headers = buildHeaders(hasHeader ? document.rows[0] : undefined, maxColumns, hasHeader)
    const headerNames = headers.map((header) => header.raw)
    const missingColumnErrors = hasHeader ? missingRequiredColumnErrors(headers, options) : []
    if (missingColumnErrors.length) return blocked(missingColumnErrors, delimiter, hasHeader, headerNames)

    const mapping = mergeMappings(options)
    const batchId = 'csv-preview'
    const defaultCurrency = options.defaultCurrency ?? DEFAULT_CURRENCY
    const dateFormat = options.dateFormat ?? 'auto'
    const decimalSeparator = options.decimalSeparator ?? 'auto'
    const rawRows: ImportRowRaw[] = []
    const normalizedRows: ImportRowNormalized<NormalizedCsvImportData>[] = []

    for (const row of dataRows) {
        const record = buildRecord(row, headers)
        const rawRowId = `raw-${row.lineNumber}`
        const normalizedRow = normalizeRow({batchId, row, rawRowId, record, mapping, options: {...options, defaultCurrency, dateFormat, decimalSeparator}})
        normalizedRow.id = `normalized-${row.lineNumber}`
        rawRows.push({id: rawRowId, batchId, rowNumber: row.lineNumber, rawText: row.cells.join(String(delimiter)), rawFields: record, rawJson: record, status: normalizedRow.status === ImportRowStatus.Invalid ? ImportRowStatus.Invalid : ImportRowStatus.Normalized})
        normalizedRows.push(normalizedRow)
    }

    const validRows = normalizedRows.filter((row) => row.status !== ImportRowStatus.Invalid)
    const invalidRows = normalizedRows.filter((row) => row.status === ImportRowStatus.Invalid)
    const messages = normalizedRows.flatMap((row) => row.validationErrors ?? [])
    const warnings = messages.filter((message) => message.severity === ImportErrorSeverity.Warning)
    const rowErrors = messages.filter((message) => message.severity === ImportErrorSeverity.Error)
    const blockingErrors = options.strict && rowErrors.length ? rowErrors : []
    const duplicateRows = normalizedRows.filter((row) => row.status === ImportRowStatus.Duplicate).length
    const batch = {id: batchId, status: invalidRows.length ? ImportBatchStatus.Parsed : ImportBatchStatus.Previewed, importType: ImportType.Mixed, defaultCurrency, rowCount: dataRows.length, errorCount: rowErrors.length, duplicateCount: duplicateRows, importedAt: new Date(0).toISOString()}
    const preview: ImportPreviewResult<NormalizedCsvImportData> = {batch, summary: {totalRows: dataRows.length, rawRows: rawRows.length, normalizedRows: normalizedRows.length, validRows: validRows.length, invalidRows: invalidRows.length, duplicateRows, errorCount: rowErrors.length, warningCount: warnings.length}, rawRows, normalizedRows, errors: rowErrors, duplicateCandidates: [], decisions: [], canApply: blockingErrors.length === 0 && validRows.length > 0}

    return {delimiter, hasHeader, headers: headerNames, rawRows, normalizedRows, validRows, invalidRows, warnings, blockingErrors, preview}
}

export function parseCsvImportWithTemplate(content: string, mappingTemplate: Pick<ImportMappingTemplate, 'columnMappings' | 'defaultValues' | 'deduplicationStrategy'>, options: Omit<CsvImportParseOptions, 'mappingTemplate'> = {}) {
    return parseCsvImport(content, {...options, mappingTemplate})
}

export function detectCsvDialect(content: string, options: Pick<CsvImportParseOptions, 'delimiter' | 'hasHeader' | 'skipEmptyLines'> = {}) {
    const delimiter = detectDelimiter(content, options)
    const document = parseRows(content, delimiter, options.skipEmptyLines ?? true)
    return {delimiter, hasHeader: detectHasHeader(document.rows, options), rowCount: document.rows.length, errors: document.errors}
}
