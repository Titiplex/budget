import {describe, expect, it} from 'vitest'

const {
    TEMPLATE_ERROR_CODES,
    buildParserOptionsFromTemplate,
    createMappingTemplate,
    createMemoryMappingTemplateStore,
    deleteMappingTemplate,
    duplicateMappingTemplate,
    getMappingTemplate,
    listMappingTemplates,
    saveTemplateFromSuccessfulImport,
    updateMappingTemplate,
    validateMappingTemplate,
} = require('../../../electron/import/mappingTemplateService')

function validTransactionTemplate(overrides = {}) {
    return {
        name: 'Banque test',
        sourceType: 'csvFile',
        importType: 'transactions',
        provider: 'test-bank',
        delimiter: ';',
        hasHeader: true,
        defaultCurrency: 'CAD',
        dateFormat: 'dd/MM/yyyy',
        decimalSeparator: ',',
        deduplicationStrategy: 'strict',
        columnMappings: [
            {sourceColumn: 'Date', targetField: 'date', fieldType: 'date', required: true},
            {sourceColumn: 'Libellé', targetField: 'label', fieldType: 'string', required: true, transformName: 'trim'},
            {sourceColumn: 'Montant', targetField: 'amount', fieldType: 'number', required: true},
            {sourceColumn: 'Devise', targetField: 'currency', fieldType: 'currency'},
            {sourceColumn: 'Frais', targetField: 'fees', fieldType: 'number'},
            {sourceColumn: 'Taxes', targetField: 'taxes', fieldType: 'number'},
        ],
        ...overrides,
    }
}

describe('mappingTemplateService', () => {
    it('creates, updates, reuses and deletes a local mapping template', async () => {
        const store = createMemoryMappingTemplateStore()
        const created = await createMappingTemplate(store, validTransactionTemplate())

        expect(created.id).toMatch(/^mapping_/)
        expect(created.isSystem).toBe(false)
        expect(created.defaultCurrency).toBe('CAD')
        expect(created.dateFormat).toBe('dd/MM/yyyy')
        expect(created.decimalSeparator).toBe(',')

        const updated = await updateMappingTemplate(store, created.id, {
            name: 'Banque test v2',
            defaultCurrency: 'EUR',
            decimalSeparator: '.',
        })
        expect(updated.name).toBe('Banque test v2')
        expect(updated.defaultCurrency).toBe('EUR')
        expect(updated.version).toBe(created.version + 1)

        const parserOptions = buildParserOptionsFromTemplate(updated)
        expect(parserOptions).toMatchObject({
            delimiter: ';',
            hasHeader: true,
            dateFormat: 'dd/MM/yyyy',
            decimalSeparator: '.',
            defaultCurrency: 'EUR',
        })

        const templates = await listMappingTemplates(store, {userOnly: true})
        expect(templates).toHaveLength(1)
        expect(await getMappingTemplate(store, created.id)).toMatchObject({name: 'Banque test v2'})

        const deleted = await deleteMappingTemplate(store, created.id)
        expect(deleted).toMatchObject({ok: true, deleted: true})
        expect(await listMappingTemplates(store, {userOnly: true})).toHaveLength(0)
    })

    it('refuses incomplete mappings with a clear validation error', () => {
        const result = validateMappingTemplate(validTransactionTemplate({
            columnMappings: [
                {sourceColumn: 'Date', targetField: 'date', fieldType: 'date', required: true},
                {sourceColumn: 'Description', targetField: 'label', fieldType: 'string'},
            ],
        }))

        expect(result.valid).toBe(false)
        expect(result.errors[0]).toMatchObject({
            code: TEMPLATE_ERROR_CODES.INCOMPLETE_MAPPING,
            field: 'columnMappings',
        })
    })

    it('refuses incompatible mappings with a clear validation error', () => {
        const result = validateMappingTemplate(validTransactionTemplate({
            columnMappings: [
                {sourceColumn: 'Date', targetField: 'date', fieldType: 'date', required: true},
                {sourceColumn: 'Montant', targetField: 'amount', fieldType: 'string', required: true},
            ],
        }))

        expect(result.valid).toBe(false)
        expect(result.errors[0]).toMatchObject({
            code: TEMPLATE_ERROR_CODES.INCOMPATIBLE_MAPPING,
            field: 'columnMappings',
        })
    })

    it('protects system templates while allowing duplication', async () => {
        const store = createMemoryMappingTemplateStore()
        const systemTemplates = await listMappingTemplates(store, {systemOnly: true})
        expect(systemTemplates.length).toBeGreaterThan(0)

        await expect(updateMappingTemplate(store, systemTemplates[0].id, {name: 'Broken system template'}))
            .rejects
            .toMatchObject({code: TEMPLATE_ERROR_CODES.SYSTEM_TEMPLATE_LOCKED})
        await expect(deleteMappingTemplate(store, systemTemplates[0].id))
            .rejects
            .toMatchObject({code: TEMPLATE_ERROR_CODES.SYSTEM_TEMPLATE_LOCKED})

        const copy = await duplicateMappingTemplate(store, systemTemplates[0].id, {name: 'Copie editable'})
        expect(copy).toMatchObject({name: 'Copie editable', isSystem: false})
        expect(await listMappingTemplates(store, {userOnly: true})).toHaveLength(1)
    })

    it('saves a template from a successful import preview', async () => {
        const store = createMemoryMappingTemplateStore()
        const saved = await saveTemplateFromSuccessfulImport(store, {
            fileMetadata: {fileName: 'broker.csv', fileHash: 'abc', provider: 'demo-broker'},
            template: validTransactionTemplate({name: 'Saved from import', provider: 'demo-broker'}),
        })

        expect(saved.name).toBe('Saved from import')
        expect(saved.provider).toBe('demo-broker')
        expect(saved.metadata).toMatchObject({savedFromImport: true, fileName: 'broker.csv', fileHash: 'abc'})
    })
})
