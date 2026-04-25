const {ipcMain} = require('electron')
const {getPrisma} = require('../db')
const {getHistoricalQuote} = require('./registerFxHandlers')
const {
    requireDate,
    addUtcDays,
    addUtcWeeks,
    addUtcMonths,
    addUtcYears,
    endOfUtcDay,
} = require('../utils/date')

function normalizeText(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function requireText(value, fieldName) {
    const normalized = normalizeText(value)
    if (!normalized) {
        throw new Error(`${fieldName} est obligatoire.`)
    }
    return normalized
}

function normalizeCurrency(value) {
    return (normalizeText(value) || 'CAD').toUpperCase()
}

function requirePositiveNumber(value, fieldName) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${fieldName} doit être un nombre strictement positif.`)
    }
    return parsed
}

function requireId(value, fieldName) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${fieldName} est invalide.`)
    }
    return parsed
}

function requireInterval(value) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('L’intervalle doit être un entier strictement positif.')
    }
    return parsed
}

function normalizeConversionMode(value, sourceCurrency, accountCurrency) {
    const normalized = normalizeText(value)?.toUpperCase()

    if (sourceCurrency === accountCurrency) {
        return 'NONE'
    }

    if (normalized === 'MANUAL' || normalized === 'AUTOMATIC') {
        return normalized
    }

    throw new Error('Le mode de conversion est invalide.')
}

function includeRecurringRelations() {
    return {
        account: true,
        category: true,
    }
}

function addInterval(date, frequency, intervalCount) {
    if (frequency === 'DAILY') return addUtcDays(date, intervalCount)
    if (frequency === 'WEEKLY') return addUtcWeeks(date, intervalCount)
    if (frequency === 'MONTHLY') return addUtcMonths(date, intervalCount)
    return addUtcYears(date, intervalCount)
}

async function buildRecurringPayload(prisma, data) {
    const accountId = requireId(data?.accountId, 'Le compte')
    const account = await prisma.account.findUnique({where: {id: accountId}})

    if (!account) {
        throw new Error('Le compte sélectionné est introuvable.')
    }

    const accountCurrency = normalizeCurrency(account.currency)
    const sourceAmount = requirePositiveNumber(data?.sourceAmount, 'Le montant source')
    const sourceCurrency = normalizeCurrency(data?.sourceCurrency ?? accountCurrency)
    const conversionMode = normalizeConversionMode(
        data?.conversionMode,
        sourceCurrency,
        accountCurrency,
    )

    const startDate = requireDate(data?.startDate, 'La date de début')
    const nextOccurrenceDate = requireDate(data?.nextOccurrenceDate || data?.startDate, 'La prochaine occurrence')
    const endDate = data?.endDate ? requireDate(data.endDate, 'La date de fin') : null

    if (nextOccurrenceDate.getTime() < startDate.getTime()) {
        throw new Error('La prochaine occurrence doit être après ou égale au début.')
    }

    if (endDate && endDate.getTime() < startDate.getTime()) {
        throw new Error('La date de fin doit être après ou égale au début.')
    }

    let accountAmount = sourceAmount
    let exchangeRate = 1
    let exchangeProvider = 'ACCOUNT'

    if (sourceCurrency !== accountCurrency) {
        if (conversionMode === 'MANUAL') {
            accountAmount = requirePositiveNumber(
                data?.accountAmount,
                'Le montant comptabilisé',
            )
            exchangeRate = requirePositiveNumber(
                data?.exchangeRate ?? accountAmount / sourceAmount,
                'Le taux de change',
            )
            exchangeProvider = normalizeText(data?.exchangeProvider) || 'MANUAL'
        } else {
            accountAmount = null
            exchangeRate = null
            exchangeProvider = normalizeText(data?.exchangeProvider) || 'ECB via Frankfurter'
        }
    }

    return {
        label: requireText(data?.label, 'Le libellé'),
        sourceAmount,
        sourceCurrency,
        accountAmount,
        conversionMode,
        exchangeRate,
        exchangeProvider,
        kind: data?.kind,
        note: normalizeText(data?.note),
        frequency: data?.frequency,
        intervalCount: requireInterval(data?.intervalCount ?? 1),
        startDate,
        nextOccurrenceDate,
        endDate,
        isActive: Boolean(data?.isActive ?? true),
        accountId,
        categoryId: data?.categoryId ? requireId(data.categoryId, 'La catégorie') : null,
    }
}

function buildTransactionPayloadFromTemplate(template, occurrenceDate, fxQuote) {
    const accountCurrency = normalizeCurrency(template.account.currency)
    const sourceCurrency = normalizeCurrency(template.sourceCurrency || accountCurrency)

    let amount = template.accountAmount ?? template.sourceAmount
    let exchangeRate = template.exchangeRate ?? (sourceCurrency === accountCurrency ? 1 : null)
    let exchangeProvider = template.exchangeProvider || (sourceCurrency === accountCurrency ? 'ACCOUNT' : null)
    let exchangeDate = occurrenceDate

    if (sourceCurrency !== accountCurrency && template.conversionMode === 'AUTOMATIC') {
        amount = fxQuote.convertedAmount
        exchangeRate = fxQuote.rate
        exchangeProvider = fxQuote.provider
        exchangeDate = new Date(fxQuote.date)
    }

    return {
        label: template.label,
        amount,
        sourceAmount: template.sourceAmount,
        sourceCurrency,
        conversionMode: template.conversionMode,
        exchangeRate,
        exchangeProvider,
        exchangeDate,
        kind: template.kind,
        date: occurrenceDate,
        note: template.note,
        accountId: template.accountId,
        categoryId: template.categoryId,
    }
}

function registerRecurringHandlers() {
    const prisma = getPrisma()

    ipcMain.handle('db:recurringTemplate:list', async () => {
        return prisma.recurringTransactionTemplate.findMany({
            include: includeRecurringRelations(),
            orderBy: [
                {isActive: 'desc'},
                {nextOccurrenceDate: 'asc'},
                {createdAt: 'desc'},
            ],
        })
    })

    ipcMain.handle('db:recurringTemplate:create', async (_event, data) => {
        return prisma.recurringTransactionTemplate.create({
            data: await buildRecurringPayload(prisma, data),
            include: includeRecurringRelations(),
        })
    })

    ipcMain.handle('db:recurringTemplate:update', async (_event, id, data) => {
        return prisma.recurringTransactionTemplate.update({
            where: {
                id: requireId(id, 'Le template récurrent'),
            },
            data: await buildRecurringPayload(prisma, data),
            include: includeRecurringRelations(),
        })
    })

    ipcMain.handle('db:recurringTemplate:delete', async (_event, id) => {
        return prisma.recurringTransactionTemplate.delete({
            where: {
                id: requireId(id, 'Le template récurrent'),
            },
            include: includeRecurringRelations(),
        })
    })

    ipcMain.handle('db:recurringTemplate:generateDue', async (_event, data) => {
        const asOfDate = endOfUtcDay(data?.asOfDate || new Date())
        const templateId = data?.templateId ? requireId(data.templateId, 'Le template') : null

        const templates = await prisma.recurringTransactionTemplate.findMany({
            where: {
                ...(templateId ? {id: templateId} : {}),
                isActive: true,
            },
            include: {
                account: true,
                category: true,
            },
            orderBy: {
                nextOccurrenceDate: 'asc',
            },
        })

        let generatedTemplates = 0
        let generatedTransactions = 0

        for (const template of templates) {
            let cursor = requireDate(template.nextOccurrenceDate, 'La prochaine occurrence')
            const templateEndDate = template.endDate
                ? requireDate(template.endDate, 'La date de fin')
                : null
            let createdForTemplate = 0
            let guard = 0

            while (
                cursor.getTime() <= asOfDate.getTime()
                && (!templateEndDate || cursor.getTime() <= templateEndDate.getTime())
                ) {
                let fxQuote = null

                if (
                    template.conversionMode === 'AUTOMATIC'
                    && normalizeCurrency(template.sourceCurrency) !== normalizeCurrency(template.account.currency)
                ) {
                    fxQuote = await getHistoricalQuote({
                        from: template.sourceCurrency,
                        to: template.account.currency,
                        amount: template.sourceAmount,
                        date: cursor,
                    })
                }

                await prisma.transaction.create({
                    data: buildTransactionPayloadFromTemplate(template, cursor, fxQuote),
                })

                createdForTemplate += 1
                generatedTransactions += 1
                cursor = addInterval(cursor, template.frequency, template.intervalCount)

                guard += 1
                if (guard > 500) {
                    throw new Error(`Boucle de génération anormale sur le template "${template.label}".`)
                }
            }

            if (createdForTemplate > 0) {
                generatedTemplates += 1

                const shouldRemainActive = !templateEndDate || cursor.getTime() <= templateEndDate.getTime()

                await prisma.recurringTransactionTemplate.update({
                    where: {id: template.id},
                    data: {
                        nextOccurrenceDate: cursor,
                        isActive: shouldRemainActive,
                    },
                })
            }
        }

        return {
            asOfDate: asOfDate.toISOString(),
            generatedTemplates,
            generatedTransactions,
        }
    })
}

module.exports = {registerRecurringHandlers}