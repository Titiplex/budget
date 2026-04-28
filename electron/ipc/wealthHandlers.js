const ASSET_TYPES = [
    'CASH',
    'REAL_ESTATE',
    'VEHICLE',
    'COLLECTIBLE',
    'BUSINESS',
    'PRIVATE_EQUITY',
    'CRYPTO',
    'OTHER',
]

const PORTFOLIO_TYPES = [
    'TAXABLE_BROKERAGE',
    'RETIREMENT',
    'EDUCATION',
    'CRYPTO',
    'SAVINGS_INVESTMENT',
    'OTHER',
]

const PORTFOLIO_TAX_WRAPPERS = [
    'NONE',
    'TFSA',
    'RRSP',
    'FHSA',
    'RESP',
    'PEA',
    'ASSURANCE_VIE',
    'PER',
    'OTHER',
]

const LIABILITY_TYPES = [
    'MORTGAGE',
    'STUDENT_LOAN',
    'PERSONAL_LOAN',
    'CREDIT_CARD',
    'LINE_OF_CREDIT',
    'AUTO_LOAN',
    'TAX_DEBT',
    'OTHER',
]

const LIABILITY_PAYMENT_FREQUENCIES = ['MONTHLY', 'BIWEEKLY', 'WEEKLY', 'YEARLY', 'OTHER']
const LIABILITY_RATE_TYPES = ['FIXED', 'VARIABLE', 'PROMOTIONAL', 'UNKNOWN']
const RECORD_STATUSES = ['ACTIVE', 'ARCHIVED']
const VALUATION_MODES = ['MANUAL', 'CALCULATED', 'IMPORTED']

function normalizeText(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function normalizeUpperText(value) {
    return normalizeText(value)?.toUpperCase() || null
}

function hasOwn(data, fieldName) {
    return Object.prototype.hasOwnProperty.call(Object(data), fieldName)
}

function requireText(value, fieldName) {
    const normalized = normalizeText(value)

    if (!normalized) {
        throw new Error(`${fieldName} est obligatoire.`)
    }

    return normalized
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

function optionalId(value, fieldName) {
    if (value == null || value === '') return null
    return requireId(value, fieldName)
}

function requireNonNegativeNumber(value, fieldName, fallback = null) {
    const candidate = value == null || value === '' ? fallback : value
    const parsed = Number(candidate)

    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`${fieldName} doit être positif ou nul.`)
    }

    return parsed
}

function optionalNonNegativeNumber(value, fieldName) {
    if (value == null || value === '') return null
    return requireNonNegativeNumber(value, fieldName)
}

function normalizePercent(value, fieldName, fallback = 100) {
    const parsed = requireNonNegativeNumber(value, fieldName, fallback)

    if (parsed > 100) {
        throw new Error(`${fieldName} doit être inférieur ou égal à 100.`)
    }

    return parsed
}

function optionalDate(value, fieldName) {
    if (value == null || value === '') return null

    const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value)

    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`${fieldName} est invalide.`)
    }

    return parsed
}

function normalizeEnum(value, allowedValues, fallback, fieldName) {
    const normalized = normalizeUpperText(value)

    if (!normalized) {
        if (fallback != null) return fallback
        throw new Error(`${fieldName} est obligatoire.`)
    }

    if (!allowedValues.includes(normalized)) {
        throw new Error(`${fieldName} est invalide.`)
    }

    return normalized
}

function optionalEnum(value, allowedValues, fieldName) {
    if (value == null || value === '') return null
    return normalizeEnum(value, allowedValues, null, fieldName)
}

function normalizeBoolean(value, fallback = true) {
    if (value == null || value === '') return fallback
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (['true', '1', 'yes', 'y', 'oui'].includes(normalized)) return true
        if (['false', '0', 'no', 'n', 'non'].includes(normalized)) return false
    }

    return Boolean(value)
}

function putRequiredText(payload, data, fieldName, label, partial) {
    if (!partial || hasOwn(data, fieldName)) {
        payload[fieldName] = requireText(data?.[fieldName], label)
    }
}

function putOptionalText(payload, data, fieldName, partial) {
    if (!partial || hasOwn(data, fieldName)) {
        payload[fieldName] = normalizeText(data?.[fieldName])
    }
}

function putCurrency(payload, data, partial) {
    if (!partial || hasOwn(data, 'currency')) {
        payload.currency = normalizeCurrency(data?.currency)
    }
}

function putEnum(payload, data, fieldName, allowedValues, fallback, label, partial) {
    if (!partial || hasOwn(data, fieldName)) {
        payload[fieldName] = normalizeEnum(data?.[fieldName], allowedValues, fallback, label)
    }
}

function putOptionalEnum(payload, data, fieldName, allowedValues, label, partial) {
    if (!partial || hasOwn(data, fieldName)) {
        payload[fieldName] = optionalEnum(data?.[fieldName], allowedValues, label)
    }
}

function putNonNegativeNumber(payload, data, fieldName, label, fallback, partial) {
    if (!partial || hasOwn(data, fieldName)) {
        payload[fieldName] = requireNonNegativeNumber(data?.[fieldName], label, fallback)
    }
}

function putOptionalNonNegativeNumber(payload, data, fieldName, label, partial) {
    if (!partial || hasOwn(data, fieldName)) {
        payload[fieldName] = optionalNonNegativeNumber(data?.[fieldName], label)
    }
}

function putBoolean(payload, data, fieldName, fallback, partial) {
    if (!partial || hasOwn(data, fieldName)) {
        payload[fieldName] = normalizeBoolean(data?.[fieldName], fallback)
    }
}

function putOwnershipPercent(payload, data, partial) {
    if (!partial || hasOwn(data, 'ownershipPercent')) {
        payload.ownershipPercent = normalizePercent(data?.ownershipPercent, 'Le pourcentage de détention', 100)
    }
}

function putOptionalDate(payload, data, fieldName, label, partial) {
    if (!partial || hasOwn(data, fieldName)) {
        payload[fieldName] = optionalDate(data?.[fieldName], label)
    }
}

function putOptionalId(payload, data, fieldName, label, partial) {
    if (!partial || hasOwn(data, fieldName)) {
        payload[fieldName] = optionalId(data?.[fieldName], label)
    }
}

function buildAssetPayload(data, options = {}) {
    const partial = Boolean(options.partial)
    const payload = {}

    putRequiredText(payload, data, 'name', "Le nom de l'actif", partial)
    putEnum(payload, data, 'type', ASSET_TYPES, 'OTHER', "Le type d'actif", partial)
    putEnum(payload, data, 'status', RECORD_STATUSES, 'ACTIVE', 'Le statut', partial)
    putCurrency(payload, data, partial)
    putEnum(payload, data, 'valuationMode', VALUATION_MODES, 'MANUAL', 'Le mode de valorisation', partial)
    putNonNegativeNumber(payload, data, 'currentValue', 'La valeur actuelle', 0, partial)
    putBoolean(payload, data, 'includeInNetWorth', true, partial)
    putOwnershipPercent(payload, data, partial)
    putOptionalNonNegativeNumber(payload, data, 'acquisitionValue', "La valeur d'acquisition", partial)
    putOptionalDate(payload, data, 'acquiredAt', "La date d'acquisition", partial)
    putOptionalDate(payload, data, 'valueAsOf', 'La date de valorisation', partial)
    putOptionalText(payload, data, 'institutionName', partial)
    putOptionalText(payload, data, 'institutionCountry', partial)
    putOptionalText(payload, data, 'institutionRegion', partial)
    putOptionalText(payload, data, 'note', partial)

    return payload
}

function buildPortfolioPayload(data, options = {}) {
    const partial = Boolean(options.partial)
    const payload = {}

    putRequiredText(payload, data, 'name', 'Le nom du portefeuille', partial)
    putEnum(payload, data, 'type', PORTFOLIO_TYPES, 'OTHER', 'Le type de portefeuille', partial)
    putEnum(payload, data, 'status', RECORD_STATUSES, 'ACTIVE', 'Le statut', partial)
    putCurrency(payload, data, partial)
    putOptionalText(payload, data, 'institutionName', partial)
    putOptionalText(payload, data, 'institutionCountry', partial)
    putOptionalText(payload, data, 'institutionRegion', partial)
    putEnum(payload, data, 'taxWrapper', PORTFOLIO_TAX_WRAPPERS, 'NONE', "L'enveloppe fiscale", partial)
    putEnum(payload, data, 'valuationMode', VALUATION_MODES, 'MANUAL', 'Le mode de valorisation', partial)
    putNonNegativeNumber(payload, data, 'currentValue', 'La valeur actuelle', 0, partial)
    putBoolean(payload, data, 'includeInNetWorth', true, partial)
    putOwnershipPercent(payload, data, partial)
    putNonNegativeNumber(payload, data, 'cashBalance', 'Le solde cash', 0, partial)
    putOptionalDate(payload, data, 'valueAsOf', 'La date de valorisation', partial)
    putOptionalId(payload, data, 'accountId', 'Le compte budget lié', partial)
    putOptionalText(payload, data, 'note', partial)

    return payload
}

function buildLiabilityPayload(data, options = {}) {
    const partial = Boolean(options.partial)
    const payload = {}

    putRequiredText(payload, data, 'name', 'Le nom de la dette', partial)
    putEnum(payload, data, 'type', LIABILITY_TYPES, 'OTHER', 'Le type de dette', partial)
    putEnum(payload, data, 'status', RECORD_STATUSES, 'ACTIVE', 'Le statut', partial)
    putCurrency(payload, data, partial)
    putNonNegativeNumber(payload, data, 'currentBalance', 'Le solde courant', 0, partial)
    putBoolean(payload, data, 'includeInNetWorth', true, partial)
    putOptionalNonNegativeNumber(payload, data, 'initialAmount', 'Le montant initial', partial)
    putOptionalNonNegativeNumber(payload, data, 'interestRate', "Le taux d'intérêt", partial)
    putOptionalNonNegativeNumber(payload, data, 'minimumPayment', 'Le paiement minimum', partial)
    putOptionalEnum(payload, data, 'paymentFrequency', LIABILITY_PAYMENT_FREQUENCIES, 'La fréquence de paiement', partial)
    putEnum(payload, data, 'rateType', LIABILITY_RATE_TYPES, 'UNKNOWN', 'Le type de taux', partial)
    putOptionalText(payload, data, 'lenderName', partial)
    putOptionalText(payload, data, 'institutionCountry', partial)
    putOptionalText(payload, data, 'institutionRegion', partial)
    putOptionalDate(payload, data, 'openedAt', "La date d'ouverture", partial)
    putOptionalDate(payload, data, 'dueAt', "La date d'échéance", partial)
    putOptionalDate(payload, data, 'balanceAsOf', 'La date du solde', partial)
    putOptionalId(payload, data, 'securedAssetId', "L'actif garanti", partial)
    putOptionalId(payload, data, 'accountId', 'Le compte budget lié', partial)
    putOptionalText(payload, data, 'note', partial)

    return payload
}

function buildWealthWhere(filters, typeFilterName) {
    if (!filters || typeof filters !== 'object') return {}

    const where = {}
    const status = normalizeUpperText(filters.status)

    if (status && status !== 'ALL') {
        where.status = normalizeEnum(status, RECORD_STATUSES, null, 'Le statut')
    }

    const currency = normalizeUpperText(filters.currency)

    if (currency && currency !== 'ALL') {
        where.currency = currency
    }

    const type = normalizeUpperText(filters[typeFilterName])

    if (type && type !== 'ALL') {
        const allowed =
            typeFilterName === 'assetType'
                ? ASSET_TYPES
                : typeFilterName === 'portfolioType'
                    ? PORTFOLIO_TYPES
                    : LIABILITY_TYPES

        where.type = normalizeEnum(type, allowed, null, 'Le type')
    }

    const search = normalizeText(filters.search)

    if (search) {
        const searchFields =
            typeFilterName === 'liabilityType'
                ? ['name', 'lenderName', 'note']
                : ['name', 'institutionName', 'note']

        where.OR = searchFields.map((fieldName) => ({[fieldName]: {contains: search}}))
    }

    return where
}

function includeAssetRelations() {
    return {securedLiabilities: true}
}

function includePortfolioRelations() {
    return {account: true}
}

function includeLiabilityRelations() {
    return {account: true, securedAsset: true}
}

async function assertOptionalRelationExists(delegate, id, errorMessage) {
    if (id == null) return

    const row = await delegate.findUnique({where: {id}})

    if (!row) {
        throw new Error(errorMessage)
    }
}

async function validatePortfolioRelations(prisma, payload) {
    if (hasOwn(payload, 'accountId')) {
        await assertOptionalRelationExists(prisma.account, payload.accountId, 'Le compte budget lié est introuvable.')
    }
}

async function validateLiabilityRelations(prisma, payload) {
    if (hasOwn(payload, 'securedAssetId')) {
        await assertOptionalRelationExists(prisma.asset, payload.securedAssetId, "L'actif garanti est introuvable.")
    }

    if (hasOwn(payload, 'accountId')) {
        await assertOptionalRelationExists(prisma.account, payload.accountId, 'Le compte budget lié est introuvable.')
    }
}

async function listAssets(prisma, filters = {}) {
    return prisma.asset.findMany({
        where: buildWealthWhere(filters, 'assetType'),
        include: includeAssetRelations(),
        orderBy: [{status: 'asc'}, {name: 'asc'}],
    })
}

async function createAsset(prisma, data) {
    return prisma.asset.create({
        data: buildAssetPayload(data),
        include: includeAssetRelations(),
    })
}

async function updateAsset(prisma, id, data) {
    return prisma.asset.update({
        where: {id: requireId(id, "L'actif")},
        data: buildAssetPayload(data, {partial: true}),
        include: includeAssetRelations(),
    })
}

async function deleteAsset(prisma, id) {
    const assetId = requireId(id, "L'actif")

    await prisma.asset.delete({where: {id: assetId}})

    return {ok: true, id: assetId, entityType: 'asset'}
}

async function listPortfolios(prisma, filters = {}) {
    return prisma.portfolio.findMany({
        where: buildWealthWhere(filters, 'portfolioType'),
        include: includePortfolioRelations(),
        orderBy: [{status: 'asc'}, {name: 'asc'}],
    })
}

async function createPortfolio(prisma, data) {
    const payload = buildPortfolioPayload(data)

    await validatePortfolioRelations(prisma, payload)

    return prisma.portfolio.create({
        data: payload,
        include: includePortfolioRelations(),
    })
}

async function updatePortfolio(prisma, id, data) {
    const payload = buildPortfolioPayload(data, {partial: true})

    await validatePortfolioRelations(prisma, payload)

    return prisma.portfolio.update({
        where: {id: requireId(id, 'Le portefeuille')},
        data: payload,
        include: includePortfolioRelations(),
    })
}

async function deletePortfolio(prisma, id) {
    const portfolioId = requireId(id, 'Le portefeuille')

    await prisma.portfolio.delete({where: {id: portfolioId}})

    return {ok: true, id: portfolioId, entityType: 'portfolio'}
}

async function listLiabilities(prisma, filters = {}) {
    return prisma.liability.findMany({
        where: buildWealthWhere(filters, 'liabilityType'),
        include: includeLiabilityRelations(),
        orderBy: [{status: 'asc'}, {name: 'asc'}],
    })
}

async function createLiability(prisma, data) {
    const payload = buildLiabilityPayload(data)

    await validateLiabilityRelations(prisma, payload)

    return prisma.liability.create({
        data: payload,
        include: includeLiabilityRelations(),
    })
}

async function updateLiability(prisma, id, data) {
    const payload = buildLiabilityPayload(data, {partial: true})

    await validateLiabilityRelations(prisma, payload)

    return prisma.liability.update({
        where: {id: requireId(id, 'La dette')},
        data: payload,
        include: includeLiabilityRelations(),
    })
}

async function deleteLiability(prisma, id) {
    const liabilityId = requireId(id, 'La dette')

    await prisma.liability.delete({where: {id: liabilityId}})

    return {ok: true, id: liabilityId, entityType: 'liability'}
}

module.exports = {
    ASSET_TYPES,
    LIABILITY_PAYMENT_FREQUENCIES,
    LIABILITY_RATE_TYPES,
    LIABILITY_TYPES,
    PORTFOLIO_TAX_WRAPPERS,
    PORTFOLIO_TYPES,
    RECORD_STATUSES,
    VALUATION_MODES,
    buildAssetPayload,
    buildLiabilityPayload,
    buildPortfolioPayload,
    buildWealthWhere,
    createAsset,
    createLiability,
    createPortfolio,
    deleteAsset,
    deleteLiability,
    deletePortfolio,
    includeAssetRelations,
    includeLiabilityRelations,
    includePortfolioRelations,
    listAssets,
    listLiabilities,
    listPortfolios,
    normalizeCurrency,
    normalizeText,
    requireId,
    requireNonNegativeNumber,
    requireText,
    updateAsset,
    updateLiability,
    updatePortfolio,
}