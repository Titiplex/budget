const fs = require('node:fs/promises')
const path = require('node:path')

const SOURCE_TYPES = Object.freeze(['manualFile', 'csvFile', 'ofxFile', 'qifFile', 'api', 'sync', 'other'])
const IMPORT_TYPES = Object.freeze(['transactions', 'assets', 'investments', 'netWorth', 'mixed', 'other'])
const DEDUPLICATION_STRATEGIES = Object.freeze(['none', 'strict', 'fuzzy', 'externalReference', 'manualReview'])
const FIELD_TYPES = Object.freeze(['string', 'number', 'date', 'currency', 'boolean', 'json'])
const DATE_FORMATS = Object.freeze(['auto', 'yyyy-MM-dd', 'yyyy/MM/dd', 'dd/MM/yyyy', 'MM/dd/yyyy', 'dd-MM-yyyy', 'yyyyMMdd'])
const DECIMAL_SEPARATORS = Object.freeze(['auto', '.', ','])
const TRANSFORMATIONS = Object.freeze(['trim', 'uppercase', 'lowercase', 'abs', 'negate', 'debitCreditAmount', 'inferOperationType'])
const TARGET_FIELDS = Object.freeze([
    'date',
    'label',
    'amount',
    'currency',
    'quantity',
    'unitPrice',
    'fees',
    'taxes',
    'symbol',
    'operationType',
    'accountName',
    'sourceName',
])

const TEMPLATE_ERROR_CODES = Object.freeze({
    TEMPLATE_NOT_FOUND: 'mappingTemplateNotFound',
    SYSTEM_TEMPLATE_LOCKED: 'systemTemplateLocked',
    INVALID_NAME: 'invalidTemplateName',
    INVALID_SOURCE_TYPE: 'invalidSourceType',
    INVALID_IMPORT_TYPE: 'invalidImportType',
    INVALID_CURRENCY: 'invalidCurrency',
    INVALID_DATE_FORMAT: 'invalidDateFormat',
    INVALID_DECIMAL_SEPARATOR: 'invalidDecimalSeparator',
    INVALID_DEDUPLICATION_STRATEGY: 'invalidDeduplicationStrategy',
    INVALID_COLUMN_MAPPING: 'invalidColumnMapping',
    INCOMPLETE_MAPPING: 'incompleteMapping',
    INCOMPATIBLE_MAPPING: 'incompatibleMapping',
    STORAGE_ERROR: 'mappingTemplateStorageError',
})

const SYSTEM_MAPPING_TEMPLATES = Object.freeze([
    {
        id: 'system:csv:bank-transactions',
        name: 'CSV bancaire standard',
        sourceType: 'csvFile',
        importType: 'transactions',
        provider: 'system',
        delimiter: ',',
        hasHeader: true,
        defaultCurrency: 'CAD',
        dateFormat: 'auto',
        decimalSeparator: 'auto',
        deduplicationStrategy: 'strict',
        isSystem: true,
        isActive: true,
        columnMappings: [
            {sourceColumn: 'Date', targetField: 'date', fieldType: 'date', required: true},
            {sourceColumn: 'Description', targetField: 'label', fieldType: 'string', required: true, transformName: 'trim'},
            {sourceColumn: 'Amount', targetField: 'amount', fieldType: 'number', required: true},
            {sourceColumn: 'Currency', targetField: 'currency', fieldType: 'currency'},
            {sourceColumn: 'Account', targetField: 'accountName', fieldType: 'string'},
        ],
    },
    {
        id: 'system:csv:investment-trades',
        name: 'CSV broker - transactions investissement',
        sourceType: 'csvFile',
        importType: 'investments',
        provider: 'system',
        delimiter: ',',
        hasHeader: true,
        defaultCurrency: 'CAD',
        dateFormat: 'auto',
        decimalSeparator: 'auto',
        deduplicationStrategy: 'strict',
        isSystem: true,
        isActive: true,
        columnMappings: [
            {sourceColumn: 'Trade Date', targetField: 'date', fieldType: 'date', required: true},
            {sourceColumn: 'Action', targetField: 'operationType', fieldType: 'string', required: true, transformName: 'inferOperationType'},
            {sourceColumn: 'Symbol', targetField: 'symbol', fieldType: 'string', required: true, transformName: 'uppercase'},
            {sourceColumn: 'Quantity', targetField: 'quantity', fieldType: 'number', required: true},
            {sourceColumn: 'Price', targetField: 'unitPrice', fieldType: 'number', required: true},
            {sourceColumn: 'Fees', targetField: 'fees', fieldType: 'number'},
            {sourceColumn: 'Taxes', targetField: 'taxes', fieldType: 'number'},
            {sourceColumn: 'Currency', targetField: 'currency', fieldType: 'currency'},
            {sourceColumn: 'Account', targetField: 'accountName', fieldType: 'string'},
        ],
    },
    {
        id: 'system:csv:cash-movements',
        name: 'CSV mouvements cash',
        sourceType: 'csvFile',
        importType: 'transactions',
        provider: 'system',
        delimiter: ';',
        hasHeader: true,
        defaultCurrency: 'CAD',
        dateFormat: 'dd/MM/yyyy',
        decimalSeparator: ',',
        deduplicationStrategy: 'fuzzy',
        isSystem: true,
        isActive: true,
        columnMappings: [
            {sourceColumn: 'Date', targetField: 'date', fieldType: 'date', required: true},
            {sourceColumn: 'Libellé', targetField: 'label', fieldType: 'string', required: true, transformName: 'trim'},
            {sourceColumn: 'Montant', targetField: 'amount', fieldType: 'number', required: true},
            {sourceColumn: 'Devise', targetField: 'currency', fieldType: 'currency'},
            {sourceColumn: 'Compte', targetField: 'accountName', fieldType: 'string'},
            {sourceColumn: 'Frais', targetField: 'fees', fieldType: 'number'},
            {sourceColumn: 'Taxes', targetField: 'taxes', fieldType: 'number'},
        ],
    },
    {
        id: 'system:csv:broker-operations',
        name: 'CSV broker/exchange - opérations',
        sourceType: 'csvFile',
        importType: 'mixed',
        provider: 'system',
        delimiter: ',',
        hasHeader: true,
        defaultCurrency: 'CAD',
        dateFormat: 'auto',
        decimalSeparator: 'auto',
        deduplicationStrategy: 'externalReference',
        isSystem: true,
        isActive: true,
        columnMappings: [
            {sourceColumn: 'Date', targetField: 'date', fieldType: 'date', required: true},
            {sourceColumn: 'Type', targetField: 'operationType', fieldType: 'string', required: true, transformName: 'inferOperationType'},
            {sourceColumn: 'Asset', targetField: 'symbol', fieldType: 'string', transformName: 'uppercase'},
            {sourceColumn: 'Amount', targetField: 'amount', fieldType: 'number'},
            {sourceColumn: 'Quantity', targetField: 'quantity', fieldType: 'number'},
            {sourceColumn: 'Unit Price', targetField: 'unitPrice', fieldType: 'number'},
            {sourceColumn: 'Fee', targetField: 'fees', fieldType: 'number'},
            {sourceColumn: 'Tax', targetField: 'taxes', fieldType: 'number'},
            {sourceColumn: 'Currency', targetField: 'currency', fieldType: 'currency'},
            {sourceColumn: 'Source', targetField: 'sourceName', fieldType: 'string'},
        ],
    },
    {
        id: 'system:csv:dividends-interest',
        name: 'CSV dividendes et intérêts',
        sourceType: 'csvFile',
        importType: 'investments',
        provider: 'system',
        delimiter: ',',
        hasHeader: true,
        defaultCurrency: 'CAD',
        dateFormat: 'auto',
        decimalSeparator: 'auto',
        deduplicationStrategy: 'strict',
        isSystem: true,
        isActive: true,
        columnMappings: [
            {sourceColumn: 'Payment Date', targetField: 'date', fieldType: 'date', required: true},
            {sourceColumn: 'Income Type', targetField: 'operationType', fieldType: 'string', required: true, transformName: 'inferOperationType'},
            {sourceColumn: 'Symbol', targetField: 'symbol', fieldType: 'string', transformName: 'uppercase'},
            {sourceColumn: 'Description', targetField: 'label', fieldType: 'string'},
            {sourceColumn: 'Amount', targetField: 'amount', fieldType: 'number', required: true},
            {sourceColumn: 'Withholding Tax', targetField: 'taxes', fieldType: 'number'},
            {sourceColumn: 'Currency', targetField: 'currency', fieldType: 'currency'},
            {sourceColumn: 'Account', targetField: 'accountName', fieldType: 'string'},
        ],
    },
])

class MappingTemplateServiceError extends Error {
    constructor(code, message, options = {}) {
        super(message)
        this.name = 'MappingTemplateServiceError'
        this.code = code
        this.field = options.field || null
        this.templateId = options.templateId || null
        this.details = options.details || null
        this.recoverable = options.recoverable ?? true
    }
}

function nowIso() {
    return new Date().toISOString()
}

function normalizeText(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function hasOwn(data, fieldName) {
    return Object.prototype.hasOwnProperty.call(Object(data), fieldName)
}

function normalizeBoolean(value, fallback = true) {
    if (value == null || value === '') return fallback
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (['true', '1', 'yes', 'y', 'oui'].includes(normalized)) return true
        if (['false', '0', 'no', 'n', 'non'].includes(normalized)) return false
    }
    return Boolean(value)
}

function normalizeEnum(value, allowedValues, fallback, code, message, field) {
    const normalized = normalizeText(value)
    if (!normalized) {
        if (fallback != null) return fallback
        throw new MappingTemplateServiceError(code, message, {field})
    }

    const compact = normalized.replace(/[\s_-]+/g, '').toLowerCase()
    const match = allowedValues.find((candidate) => candidate.replace(/[\s_-]+/g, '').toLowerCase() === compact)
    if (!match) throw new MappingTemplateServiceError(code, message, {field, details: {received: value, allowedValues}})
    return match
}

function normalizeCurrency(value, fallback = 'CAD') {
    const normalized = normalizeText(value)?.toUpperCase() || fallback
    if (!/^[A-Z]{3}$/.test(normalized)) {
        throw new MappingTemplateServiceError(
            TEMPLATE_ERROR_CODES.INVALID_CURRENCY,
            'La devise par défaut doit être un code ISO à 3 lettres.',
            {field: 'defaultCurrency', details: {received: value}},
        )
    }
    return normalized
}

function normalizeDelimiter(value, fallback = ',') {
    if (value == null || value === '') return fallback
    if (value === ',' || value === ';' || value === '\t') return value
    if (String(value).toLowerCase() === 'tab') return '\t'
    throw new MappingTemplateServiceError(
        TEMPLATE_ERROR_CODES.INCOMPATIBLE_MAPPING,
        'Le séparateur CSV doit être une virgule, un point-virgule ou une tabulation.',
        {field: 'delimiter', details: {received: value}},
    )
}

function normalizeColumnMapping(mapping, index) {
    const sourceColumn = normalizeText(mapping?.sourceColumn)
    const targetField = normalizeEnum(
        mapping?.targetField,
        TARGET_FIELDS,
        null,
        TEMPLATE_ERROR_CODES.INVALID_COLUMN_MAPPING,
        'Le champ cible du mapping est invalide.',
        `columnMappings.${index}.targetField`,
    )
    const fieldType = normalizeEnum(
        mapping?.fieldType,
        FIELD_TYPES,
        null,
        TEMPLATE_ERROR_CODES.INVALID_COLUMN_MAPPING,
        'Le type du champ mappé est invalide.',
        `columnMappings.${index}.fieldType`,
    )
    const transformName = normalizeText(mapping?.transformName)

    if (!sourceColumn) {
        throw new MappingTemplateServiceError(
            TEMPLATE_ERROR_CODES.INVALID_COLUMN_MAPPING,
            'Chaque mapping doit définir une colonne source.',
            {field: `columnMappings.${index}.sourceColumn`},
        )
    }

    if (transformName && !TRANSFORMATIONS.includes(transformName)) {
        throw new MappingTemplateServiceError(
            TEMPLATE_ERROR_CODES.INVALID_COLUMN_MAPPING,
            'La règle de transformation est inconnue.',
            {field: `columnMappings.${index}.transformName`, details: {received: transformName, allowedValues: TRANSFORMATIONS}},
        )
    }

    return {
        sourceColumn,
        targetField,
        fieldType,
        required: normalizeBoolean(mapping?.required, false),
        defaultValue: hasOwn(mapping, 'defaultValue') ? mapping.defaultValue : undefined,
        transformName: transformName || null,
        metadata: mapping?.metadata && typeof mapping.metadata === 'object' ? mapping.metadata : undefined,
    }
}

function assertRequiredFields(template) {
    const targets = new Set(template.columnMappings.map((mapping) => mapping.targetField))
    const requiredErrors = []
    if (!targets.has('date')) requiredErrors.push('date')

    if (template.importType === 'transactions') {
        if (!targets.has('amount')) requiredErrors.push('amount')
    } else if (template.importType === 'investments') {
        if (!targets.has('operationType')) requiredErrors.push('operationType')
        if (!targets.has('amount') && !(targets.has('quantity') && targets.has('unitPrice'))) requiredErrors.push('amount|quantity+unitPrice')
    } else if (template.importType === 'assets') {
        if (!targets.has('label') && !targets.has('symbol')) requiredErrors.push('label|symbol')
        if (!targets.has('amount') && !targets.has('unitPrice')) requiredErrors.push('amount|unitPrice')
    }

    if (requiredErrors.length) {
        throw new MappingTemplateServiceError(
            TEMPLATE_ERROR_CODES.INCOMPLETE_MAPPING,
            `Le template est incomplet. Champs requis manquants: ${requiredErrors.join(', ')}.`,
            {field: 'columnMappings', details: {missingFields: requiredErrors}},
        )
    }
}

function assertCompatibleMapping(template) {
    for (const mapping of template.columnMappings) {
        if (['amount', 'quantity', 'unitPrice', 'fees', 'taxes'].includes(mapping.targetField) && mapping.fieldType !== 'number') {
            throw new MappingTemplateServiceError(
                TEMPLATE_ERROR_CODES.INCOMPATIBLE_MAPPING,
                `Le champ ${mapping.targetField} doit être mappé comme un nombre.`,
                {field: 'columnMappings', details: {targetField: mapping.targetField, fieldType: mapping.fieldType}},
            )
        }
        if (mapping.targetField === 'date' && mapping.fieldType !== 'date') {
            throw new MappingTemplateServiceError(
                TEMPLATE_ERROR_CODES.INCOMPATIBLE_MAPPING,
                'Le champ date doit être mappé comme une date.',
                {field: 'columnMappings', details: {targetField: mapping.targetField, fieldType: mapping.fieldType}},
            )
        }
        if (mapping.targetField === 'currency' && mapping.fieldType !== 'currency') {
            throw new MappingTemplateServiceError(
                TEMPLATE_ERROR_CODES.INCOMPATIBLE_MAPPING,
                'Le champ devise doit être mappé comme une devise.',
                {field: 'columnMappings', details: {targetField: mapping.targetField, fieldType: mapping.fieldType}},
            )
        }
    }

    const sourceColumns = new Map()
    for (const mapping of template.columnMappings) {
        const key = mapping.sourceColumn.trim().toLowerCase()
        sourceColumns.set(key, [...(sourceColumns.get(key) || []), mapping.targetField])
    }
    const ambiguousSources = [...sourceColumns.entries()].filter(([, targets]) => new Set(targets).size > 1)
    if (ambiguousSources.length) {
        throw new MappingTemplateServiceError(
            TEMPLATE_ERROR_CODES.INCOMPATIBLE_MAPPING,
            'Une colonne source ne peut pas alimenter plusieurs champs cibles différents dans ce template simple.',
            {field: 'columnMappings', details: {ambiguousSources}},
        )
    }
}

function normalizeTemplatePayload(data, options = {}) {
    const partial = Boolean(options.partial)
    const existing = options.existing || {}
    const output = {...existing}

    function set(fieldName, normalizer) {
        if (!partial || hasOwn(data, fieldName)) output[fieldName] = normalizer(data?.[fieldName])
    }

    set('name', (value) => {
        const normalized = normalizeText(value)
        if (!normalized) throw new MappingTemplateServiceError(TEMPLATE_ERROR_CODES.INVALID_NAME, 'Le nom du template est obligatoire.', {field: 'name'})
        return normalized
    })
    set('sourceType', (value) => normalizeEnum(value, SOURCE_TYPES, 'csvFile', TEMPLATE_ERROR_CODES.INVALID_SOURCE_TYPE, 'Le type de source est invalide.', 'sourceType'))
    set('importType', (value) => normalizeEnum(value, IMPORT_TYPES, 'transactions', TEMPLATE_ERROR_CODES.INVALID_IMPORT_TYPE, 'Le type d’import est invalide.', 'importType'))
    set('provider', (value) => normalizeText(value))
    set('delimiter', (value) => normalizeDelimiter(value, ','))
    set('hasHeader', (value) => normalizeBoolean(value, true))
    set('defaultCurrency', (value) => normalizeCurrency(value, 'CAD'))
    set('dateFormat', (value) => normalizeEnum(value, DATE_FORMATS, 'auto', TEMPLATE_ERROR_CODES.INVALID_DATE_FORMAT, 'Le format de date est invalide.', 'dateFormat'))
    set('decimalSeparator', (value) => normalizeEnum(value, DECIMAL_SEPARATORS, 'auto', TEMPLATE_ERROR_CODES.INVALID_DECIMAL_SEPARATOR, 'Le séparateur décimal est invalide.', 'decimalSeparator'))
    set('deduplicationStrategy', (value) => normalizeEnum(value, DEDUPLICATION_STRATEGIES, 'strict', TEMPLATE_ERROR_CODES.INVALID_DEDUPLICATION_STRATEGY, 'La stratégie de dédoublonnage est invalide.', 'deduplicationStrategy'))
    set('defaultValues', (value) => value && typeof value === 'object' ? value : {})
    set('metadata', (value) => value && typeof value === 'object' ? value : {})
    set('isActive', (value) => normalizeBoolean(value, true))

    if (!partial || hasOwn(data, 'columnMappings')) {
        if (!Array.isArray(data?.columnMappings) || data.columnMappings.length === 0) {
            throw new MappingTemplateServiceError(
                TEMPLATE_ERROR_CODES.INVALID_COLUMN_MAPPING,
                'Le template doit contenir au moins un mapping de colonne.',
                {field: 'columnMappings'},
            )
        }
        output.columnMappings = data.columnMappings.map(normalizeColumnMapping)
    }

    output.isSystem = Boolean(existing.isSystem || options.isSystem)
    output.version = Number(existing.version || data?.version || 1)
    output.createdAt = existing.createdAt || nowIso()
    output.updatedAt = partial ? nowIso() : existing.updatedAt || nowIso()

    assertRequiredFields(output)
    assertCompatibleMapping(output)
    return output
}

function cloneTemplate(template) {
    return JSON.parse(JSON.stringify(template))
}

function makeId() {
    return `mapping_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function createMemoryMappingTemplateStore(initialTemplates = []) {
    let templates = cloneTemplate(initialTemplates)
    return {
        async load() {
            return cloneTemplate(templates)
        },
        async save(nextTemplates) {
            templates = cloneTemplate(nextTemplates)
            return cloneTemplate(templates)
        },
    }
}

function createFileMappingTemplateStore(filePath) {
    return {
        async load() {
            try {
                const content = await fs.readFile(filePath, 'utf8')
                const parsed = JSON.parse(content)
                return Array.isArray(parsed.templates) ? parsed.templates : []
            } catch (error) {
                if (error.code === 'ENOENT') return []
                throw new MappingTemplateServiceError(TEMPLATE_ERROR_CODES.STORAGE_ERROR, 'Impossible de lire les templates de mapping locaux.', {details: {filePath, cause: error.message}, recoverable: false})
            }
        },
        async save(templates) {
            try {
                await fs.mkdir(path.dirname(filePath), {recursive: true})
                await fs.writeFile(filePath, JSON.stringify({version: 1, templates}, null, 2), 'utf8')
                return templates
            } catch (error) {
                throw new MappingTemplateServiceError(TEMPLATE_ERROR_CODES.STORAGE_ERROR, 'Impossible de sauvegarder les templates de mapping locaux.', {details: {filePath, cause: error.message}, recoverable: false})
            }
        },
    }
}

function defaultTemplateStore(app) {
    if (!app || typeof app.getPath !== 'function') return createMemoryMappingTemplateStore()
    return createFileMappingTemplateStore(path.join(app.getPath('userData'), 'import-mapping-templates.json'))
}

async function loadUserTemplates(store) {
    const templates = await store.load()
    return Array.isArray(templates) ? templates.filter((template) => !template.isSystem) : []
}

async function saveUserTemplates(store, templates) {
    return store.save(templates.map((template) => ({...template, isSystem: false})))
}

function allTemplates(userTemplates) {
    return [...SYSTEM_MAPPING_TEMPLATES.map(cloneTemplate), ...userTemplates.map(cloneTemplate)]
}

async function listMappingTemplates(store, filters = {}) {
    const templates = allTemplates(await loadUserTemplates(store))
    return templates.filter((template) => {
        if (filters?.sourceType && template.sourceType !== filters.sourceType) return false
        if (filters?.importType && template.importType !== filters.importType) return false
        if (filters?.includeInactive === false && !template.isActive) return false
        if (filters?.systemOnly === true && !template.isSystem) return false
        if (filters?.userOnly === true && template.isSystem) return false
        const search = normalizeText(filters?.search)
        if (search) {
            const haystack = `${template.name} ${template.provider || ''} ${template.importType} ${template.sourceType}`.toLowerCase()
            return haystack.includes(search.toLowerCase())
        }
        return true
    })
}

async function getMappingTemplate(store, id) {
    const template = (await listMappingTemplates(store)).find((entry) => entry.id === id)
    if (!template) {
        throw new MappingTemplateServiceError(TEMPLATE_ERROR_CODES.TEMPLATE_NOT_FOUND, 'Le template de mapping est introuvable.', {field: 'id', templateId: id})
    }
    return template
}

async function createMappingTemplate(store, data) {
    const userTemplates = await loadUserTemplates(store)
    const template = normalizeTemplatePayload(data)
    template.id = data?.id && !String(data.id).startsWith('system:') ? String(data.id) : makeId()
    template.isSystem = false
    template.createdAt = nowIso()
    template.updatedAt = template.createdAt
    userTemplates.push(template)
    await saveUserTemplates(store, userTemplates)
    return cloneTemplate(template)
}

async function updateMappingTemplate(store, id, data) {
    const current = await getMappingTemplate(store, id)
    if (current.isSystem) {
        throw new MappingTemplateServiceError(TEMPLATE_ERROR_CODES.SYSTEM_TEMPLATE_LOCKED, 'Les templates système ne peuvent pas être modifiés directement. Duplique-le d’abord.', {field: 'id', templateId: id})
    }
    const userTemplates = await loadUserTemplates(store)
    const index = userTemplates.findIndex((entry) => entry.id === id)
    const updated = normalizeTemplatePayload(data, {partial: true, existing: current})
    updated.id = id
    updated.isSystem = false
    updated.version = Number(current.version || 1) + 1
    userTemplates[index] = updated
    await saveUserTemplates(store, userTemplates)
    return cloneTemplate(updated)
}

async function deleteMappingTemplate(store, id) {
    const current = await getMappingTemplate(store, id)
    if (current.isSystem) {
        throw new MappingTemplateServiceError(TEMPLATE_ERROR_CODES.SYSTEM_TEMPLATE_LOCKED, 'Les templates système ne peuvent pas être supprimés.', {field: 'id', templateId: id})
    }
    const userTemplates = await loadUserTemplates(store)
    const nextTemplates = userTemplates.filter((entry) => entry.id !== id)
    await saveUserTemplates(store, nextTemplates)
    return {ok: true, id, entityType: 'importMappingTemplate', deleted: true}
}

async function duplicateMappingTemplate(store, id, overrides = {}) {
    const current = await getMappingTemplate(store, id)
    return createMappingTemplate(store, {
        ...current,
        ...overrides,
        id: overrides.id,
        name: overrides.name || `${current.name} (copie)`,
        isSystem: false,
    })
}

async function saveTemplateFromSuccessfulImport(store, input) {
    const sourceTemplate = input?.template || input
    return createMappingTemplate(store, {
        name: sourceTemplate.name || `Template ${sourceTemplate.provider || sourceTemplate.importType || 'import'}`,
        sourceType: sourceTemplate.sourceType || input?.fileMetadata?.sourceType || 'csvFile',
        importType: sourceTemplate.importType || 'transactions',
        provider: sourceTemplate.provider || input?.fileMetadata?.provider || null,
        delimiter: sourceTemplate.delimiter || ',',
        hasHeader: sourceTemplate.hasHeader ?? true,
        defaultCurrency: sourceTemplate.defaultCurrency || 'CAD',
        dateFormat: sourceTemplate.dateFormat || 'auto',
        decimalSeparator: sourceTemplate.decimalSeparator || 'auto',
        deduplicationStrategy: sourceTemplate.deduplicationStrategy || 'strict',
        columnMappings: sourceTemplate.columnMappings,
        defaultValues: sourceTemplate.defaultValues || {},
        metadata: {
            ...(sourceTemplate.metadata || {}),
            savedFromImport: true,
            fileName: input?.fileMetadata?.fileName || null,
            fileHash: input?.fileMetadata?.fileHash || null,
        },
    })
}

function validateMappingTemplate(data) {
    try {
        return {valid: true, template: normalizeTemplatePayload(data), errors: [], warnings: []}
    } catch (error) {
        return {valid: false, template: null, errors: [toMappingTemplateIpcError(error)], warnings: []}
    }
}

function buildParserOptionsFromTemplate(template) {
    return {
        delimiter: template.delimiter,
        hasHeader: template.hasHeader,
        dateFormat: template.dateFormat,
        decimalSeparator: template.decimalSeparator,
        defaultCurrency: template.defaultCurrency,
        mappingTemplate: template,
    }
}

function toMappingTemplateIpcError(error) {
    if (error instanceof MappingTemplateServiceError) {
        return {
            code: error.code,
            message: error.message,
            field: error.field,
            templateId: error.templateId,
            details: error.details,
            recoverable: error.recoverable,
        }
    }
    return {
        code: 'unknownMappingTemplateError',
        message: error?.message || 'Erreur inconnue pendant la gestion des templates de mapping.',
        field: null,
        templateId: null,
        details: null,
        recoverable: false,
    }
}

module.exports = {
    DATE_FORMATS,
    DECIMAL_SEPARATORS,
    DEDUPLICATION_STRATEGIES,
    FIELD_TYPES,
    IMPORT_TYPES,
    SOURCE_TYPES,
    SYSTEM_MAPPING_TEMPLATES,
    TARGET_FIELDS,
    TEMPLATE_ERROR_CODES,
    TRANSFORMATIONS,
    MappingTemplateServiceError,
    buildParserOptionsFromTemplate,
    createFileMappingTemplateStore,
    createMappingTemplate,
    createMemoryMappingTemplateStore,
    defaultTemplateStore,
    deleteMappingTemplate,
    duplicateMappingTemplate,
    getMappingTemplate,
    listMappingTemplates,
    normalizeTemplatePayload,
    saveTemplateFromSuccessfulImport,
    toMappingTemplateIpcError,
    updateMappingTemplate,
    validateMappingTemplate,
}
