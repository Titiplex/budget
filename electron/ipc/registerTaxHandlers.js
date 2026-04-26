const {ipcMain} = require('electron')
const {getPrisma} = require('../db')

function normalizeText(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function normalizeCountry(value) {
    return normalizeText(value)?.toUpperCase() || null
}

function normalizeRegion(value) {
    return normalizeText(value)?.toUpperCase() || null
}

function normalizeCurrency(value, fallback = 'CAD') {
    return (normalizeText(value) || fallback).toUpperCase()
}

function requireId(value, fieldName) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${fieldName} est invalide.`)
    }
    return parsed
}

function requireYear(value) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2200) {
        throw new Error("L'année fiscale est invalide.")
    }
    return parsed
}

function requireCountry(value, fieldName = 'Le pays') {
    const country = normalizeCountry(value)
    if (!country) {
        throw new Error(`${fieldName} est obligatoire.`)
    }
    return country
}

function optionalDate(value, fieldName) {
    if (value == null || value === '') return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`${fieldName} est invalide.`)
    }
    return parsed
}

function optionalNonNegativeNumber(value, fieldName) {
    if (value == null || value === '') return null
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`${fieldName} doit être un nombre positif ou nul.`)
    }
    return parsed
}

function normalizeEnum(value, allowed, fallback = null) {
    const normalized = normalizeText(value)?.toUpperCase()
    if (!normalized) return fallback
    return allowed.includes(normalized) ? normalized : fallback
}

const accountTaxReportingTypes = [
    'STANDARD',
    'BANK',
    'CASH',
    'BROKERAGE',
    'CRYPTO',
    'LIFE_INSURANCE',
    'RETIREMENT',
    'LOAN',
    'OTHER',
]

const taxIncomeCategories = [
    'EMPLOYMENT',
    'BUSINESS',
    'INTEREST',
    'DIVIDEND',
    'CAPITAL_GAIN',
    'RENTAL',
    'PENSION',
    'BENEFIT',
    'GIFT',
    'REFUND',
    'TRANSFER',
    'OTHER',
]

const taxTreatments = [
    'UNKNOWN',
    'NOT_TAXABLE',
    'TAXABLE_NO_WITHHOLDING',
    'TAX_WITHHELD_AT_SOURCE',
    'FOREIGN_TAX_CREDIT_CANDIDATE',
    'TREATY_EXEMPT_CANDIDATE',
    'REVIEW_REQUIRED',
]

function buildTaxProfilePayload(data) {
    return {
        year: requireYear(data?.year),
        residenceCountry: requireCountry(data?.residenceCountry, 'Le pays de résidence fiscale'),
        residenceRegion: normalizeRegion(data?.residenceRegion),
        currency: normalizeCurrency(data?.currency),
    }
}

function buildAccountTaxMetadataPayload(data) {
    return {
        institutionCountry: normalizeCountry(data?.institutionCountry),
        institutionRegion: normalizeRegion(data?.institutionRegion),
        taxReportingType: normalizeEnum(data?.taxReportingType, accountTaxReportingTypes, 'STANDARD'),
        openedAt: optionalDate(data?.openedAt, "La date d'ouverture"),
        closedAt: optionalDate(data?.closedAt, 'La date de fermeture'),
    }
}

function buildTransactionTaxMetadataPayload(data) {
    const taxWithheldAmount = optionalNonNegativeNumber(data?.taxWithheldAmount, "L'impôt retenu")

    return {
        taxCategory: normalizeEnum(data?.taxCategory, taxIncomeCategories, null),
        taxSourceCountry: normalizeCountry(data?.taxSourceCountry),
        taxSourceRegion: normalizeRegion(data?.taxSourceRegion),
        taxTreatment: normalizeEnum(data?.taxTreatment, taxTreatments, 'UNKNOWN'),
        taxWithheldAmount,
        taxWithheldCurrency: taxWithheldAmount == null
            ? null
            : normalizeCurrency(data?.taxWithheldCurrency),
        taxWithheldCountry: normalizeCountry(data?.taxWithheldCountry),
        taxDocumentRef: normalizeText(data?.taxDocumentRef),
    }
}

function includeTransactionRelations() {
    return {
        account: true,
        category: true,
        transferPeerAccount: true,
    }
}

function registerTaxHandlers() {
    const prisma = getPrisma()

    ipcMain.handle('db:taxProfile:list', async () => {
        return prisma.taxProfile.findMany({
            orderBy: [
                {year: 'desc'},
                {residenceCountry: 'asc'},
                {residenceRegion: 'asc'},
            ],
        })
    })

    ipcMain.handle('db:taxProfile:create', async (_event, data) => {
        return prisma.taxProfile.create({
            data: buildTaxProfilePayload(data),
        })
    })

    ipcMain.handle('db:taxProfile:update', async (_event, id, data) => {
        return prisma.taxProfile.update({
            where: {id: requireId(id, 'Le profil fiscal')},
            data: buildTaxProfilePayload(data),
        })
    })

    ipcMain.handle('db:taxProfile:delete', async (_event, id) => {
        return prisma.taxProfile.delete({
            where: {id: requireId(id, 'Le profil fiscal')},
        })
    })

    ipcMain.handle('db:taxMetadata:updateAccount', async (_event, id, data) => {
        return prisma.account.update({
            where: {id: requireId(id, 'Le compte')},
            data: buildAccountTaxMetadataPayload(data),
        })
    })

    ipcMain.handle('db:taxMetadata:updateTransaction', async (_event, id, data) => {
        return prisma.transaction.update({
            where: {id: requireId(id, 'La transaction')},
            data: buildTransactionTaxMetadataPayload(data),
            include: includeTransactionRelations(),
        })
    })
}

module.exports = {registerTaxHandlers}
