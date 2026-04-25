const {randomUUID} = require('node:crypto')
const {ipcMain} = require('electron')
const {getPrisma} = require('../db')
const {requireDate} = require('../utils/date')

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

function includeTransactionRelations() {
    return {
        account: true,
        category: true,
        transferPeerAccount: true,
    }
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

function buildAccountPayload(data) {
    return {
        name: requireText(data?.name, 'Le nom du compte'),
        type: data?.type,
        currency: normalizeCurrency(data?.currency),
        description: normalizeText(data?.description),
    }
}

function buildCategoryPayload(data) {
    return {
        name: requireText(data?.name, 'Le nom de la catégorie'),
        kind: data?.kind,
        color: normalizeText(data?.color),
        description: normalizeText(data?.description),
    }
}

async function buildTransactionPayload(prisma, data) {
    const accountId = requireId(data?.accountId, 'Le compte')
    const account = await prisma.account.findUnique({where: {id: accountId}})

    if (!account) {
        throw new Error('Le compte sélectionné est introuvable.')
    }

    const accountCurrency = normalizeCurrency(account.currency)
    const sourceAmount = requirePositiveNumber(
        data?.sourceAmount ?? data?.amount,
        'Le montant',
    )

    const sourceCurrency = normalizeCurrency(
        data?.sourceCurrency ?? accountCurrency,
    )

    const conversionMode = normalizeConversionMode(
        data?.conversionMode,
        sourceCurrency,
        accountCurrency,
    )

    let bookedAmount = sourceAmount
    let exchangeRate = 1
    let exchangeProvider = 'ACCOUNT'
    let exchangeDate = requireDate(data?.exchangeDate || data?.date)

    if (sourceCurrency !== accountCurrency) {
        bookedAmount = requirePositiveNumber(
            data?.amount,
            'Le montant converti dans la devise du compte',
        )

        if (conversionMode === 'AUTOMATIC') {
            exchangeRate = requirePositiveNumber(data?.exchangeRate, 'Le taux de change')
            exchangeProvider = requireText(data?.exchangeProvider, 'La source du taux')
            exchangeDate = requireDate(data?.exchangeDate || data?.date)
        } else if (conversionMode === 'MANUAL') {
            exchangeRate = requirePositiveNumber(
                data?.exchangeRate ?? bookedAmount / sourceAmount,
                'Le taux de change',
            )
            exchangeProvider = normalizeText(data?.exchangeProvider) || 'MANUAL'
            exchangeDate = requireDate(data?.exchangeDate || data?.date)
        }
    }

    return {
        label: requireText(data?.label, 'Le libellé'),
        amount: bookedAmount,
        sourceAmount,
        sourceCurrency,
        conversionMode,
        exchangeRate,
        exchangeProvider,
        exchangeDate,
        kind: data?.kind,
        date: requireDate(data?.date),
        note: normalizeText(data?.note),
        accountId,
        categoryId: data?.kind === 'TRANSFER'
            ? null
            : (data?.categoryId ? requireId(data.categoryId, 'La catégorie') : null),
        transferGroup: null,
        transferDirection: null,
        transferPeerAccountId: null,
    }
}

async function buildInternalTransferPayload(prisma, data, transferGroup = null) {
    const sourceAccountId = requireId(data?.accountId, 'Le compte source')
    const targetAccountId = requireId(data?.transferTargetAccountId, 'Le compte destination')

    if (sourceAccountId === targetAccountId) {
        throw new Error('Le compte source et le compte destination doivent être différents.')
    }

    const [sourceAccount, targetAccount] = await Promise.all([
        prisma.account.findUnique({where: {id: sourceAccountId}}),
        prisma.account.findUnique({where: {id: targetAccountId}}),
    ])

    if (!sourceAccount) {
        throw new Error('Le compte source est introuvable.')
    }

    if (!targetAccount) {
        throw new Error('Le compte destination est introuvable.')
    }

    const label = requireText(data?.label, 'Le libellé')
    const date = requireDate(data?.date)
    const note = normalizeText(data?.note)
    const debitAmount = requirePositiveNumber(data?.sourceAmount ?? data?.amount, 'Le montant transféré')
    const sourceCurrency = normalizeCurrency(sourceAccount.currency)
    const targetCurrency = normalizeCurrency(targetAccount.currency)
    const conversionMode = normalizeConversionMode(data?.conversionMode, sourceCurrency, targetCurrency)

    let creditedAmount = debitAmount
    let exchangeRate = 1
    let exchangeProvider = 'ACCOUNT'
    let exchangeDate = requireDate(data?.exchangeDate || data?.date)

    if (sourceCurrency !== targetCurrency) {
        creditedAmount = requirePositiveNumber(
            data?.amount,
            'Le montant crédité dans la devise du compte destination',
        )

        if (conversionMode === 'AUTOMATIC') {
            exchangeRate = requirePositiveNumber(data?.exchangeRate, 'Le taux de change')
            exchangeProvider = requireText(data?.exchangeProvider, 'La source du taux')
            exchangeDate = requireDate(data?.exchangeDate || data?.date)
        } else if (conversionMode === 'MANUAL') {
            exchangeRate = requirePositiveNumber(
                data?.exchangeRate ?? creditedAmount / debitAmount,
                'Le taux de change',
            )
            exchangeProvider = normalizeText(data?.exchangeProvider) || 'MANUAL'
            exchangeDate = requireDate(data?.exchangeDate || data?.date)
        }
    }

    const group = transferGroup || randomUUID()

    return {
        transferGroup: group,
        outgoingData: {
            label,
            amount: debitAmount,
            sourceAmount: debitAmount,
            sourceCurrency,
            conversionMode: 'NONE',
            exchangeRate: 1,
            exchangeProvider: 'ACCOUNT',
            exchangeDate,
            kind: 'TRANSFER',
            date,
            note,
            accountId: sourceAccount.id,
            categoryId: null,
            transferGroup: group,
            transferDirection: 'OUT',
            transferPeerAccountId: targetAccount.id,
        },
        incomingData: {
            label,
            amount: creditedAmount,
            sourceAmount: debitAmount,
            sourceCurrency,
            conversionMode,
            exchangeRate,
            exchangeProvider,
            exchangeDate,
            kind: 'TRANSFER',
            date,
            note,
            accountId: targetAccount.id,
            categoryId: null,
            transferGroup: group,
            transferDirection: 'IN',
            transferPeerAccountId: sourceAccount.id,
        },
    }
}

async function createInternalTransfer(prisma, data, transferGroup = null) {
    const payload = await buildInternalTransferPayload(prisma, data, transferGroup)

    const created = await prisma.$transaction(async (tx) => {
        const outgoing = await tx.transaction.create({data: payload.outgoingData})
        await tx.transaction.create({data: payload.incomingData})

        return tx.transaction.findUnique({
            where: {id: outgoing.id},
            include: includeTransactionRelations(),
        })
    })

    return created
}

async function updateInternalTransfer(prisma, currentTransactionId, data, existingTransferGroup) {
    const payload = await buildInternalTransferPayload(prisma, data, existingTransferGroup)
    const siblings = await prisma.transaction.findMany({
        where: {transferGroup: payload.transferGroup},
        orderBy: {id: 'asc'},
    })

    const outgoingSibling = siblings.find((transaction) => transaction.transferDirection === 'OUT')
    const incomingSibling = siblings.find((transaction) => transaction.transferDirection === 'IN')

    return prisma.$transaction(async (tx) => {
        let outgoingId = outgoingSibling?.id || null
        let incomingId = incomingSibling?.id || null

        if (outgoingId) {
            await tx.transaction.update({
                where: {id: outgoingId},
                data: payload.outgoingData,
            })
        } else {
            const createdOutgoing = await tx.transaction.create({data: payload.outgoingData})
            outgoingId = createdOutgoing.id
        }

        if (incomingId) {
            await tx.transaction.update({
                where: {id: incomingId},
                data: payload.incomingData,
            })
        } else {
            const createdIncoming = await tx.transaction.create({data: payload.incomingData})
            incomingId = createdIncoming.id
        }

        await tx.transaction.deleteMany({
            where: {
                transferGroup: payload.transferGroup,
                id: {
                    notIn: [outgoingId, incomingId].filter(Boolean),
                },
            },
        })

        const preferredId = currentTransactionId === incomingSibling?.id ? incomingId : outgoingId
        return tx.transaction.findUnique({
            where: {id: preferredId},
            include: includeTransactionRelations(),
        })
    })
}

async function convertTransferToStandard(prisma, currentTransactionId, data, existingTransferGroup) {
    const standardPayload = await buildTransactionPayload(prisma, data)

    return prisma.$transaction(async (tx) => {
        await tx.transaction.deleteMany({
            where: {
                transferGroup: existingTransferGroup,
                id: {not: currentTransactionId},
            },
        })

        return tx.transaction.update({
            where: {id: currentTransactionId},
            data: standardPayload,
            include: includeTransactionRelations(),
        })
    })
}

async function convertStandardToTransfer(prisma, currentTransactionId, data) {
    const payload = await buildInternalTransferPayload(prisma, data)

    return prisma.$transaction(async (tx) => {
        await tx.transaction.update({
            where: {id: currentTransactionId},
            data: payload.outgoingData,
        })

        await tx.transaction.create({data: payload.incomingData})

        return tx.transaction.findUnique({
            where: {id: currentTransactionId},
            include: includeTransactionRelations(),
        })
    })
}

function registerDbHandlers() {
    const prisma = getPrisma()

    ipcMain.handle('db:account:list', async () => {
        return prisma.account.findMany({
            orderBy: {createdAt: 'desc'},
        })
    })

    ipcMain.handle('db:account:create', async (_event, data) => {
        return prisma.account.create({
            data: buildAccountPayload(data),
        })
    })

    ipcMain.handle('db:account:update', async (_event, id, data) => {
        return prisma.account.update({
            where: {
                id: requireId(id, 'Le compte'),
            },
            data: buildAccountPayload(data),
        })
    })

    ipcMain.handle('db:account:delete', async (_event, id) => {
        return prisma.account.delete({
            where: {
                id: requireId(id, 'Le compte'),
            },
        })
    })

    ipcMain.handle('db:category:list', async () => {
        return prisma.category.findMany({
            orderBy: {name: 'asc'},
        })
    })

    ipcMain.handle('db:category:create', async (_event, data) => {
        return prisma.category.create({
            data: buildCategoryPayload(data),
        })
    })

    ipcMain.handle('db:category:update', async (_event, id, data) => {
        return prisma.category.update({
            where: {
                id: requireId(id, 'La catégorie'),
            },
            data: buildCategoryPayload(data),
        })
    })

    ipcMain.handle('db:category:delete', async (_event, id) => {
        return prisma.category.delete({
            where: {
                id: requireId(id, 'La catégorie'),
            },
        })
    })

    ipcMain.handle('db:transaction:list', async () => {
        return prisma.transaction.findMany({
            include: includeTransactionRelations(),
            orderBy: [
                {date: 'desc'},
                {createdAt: 'desc'},
            ],
        })
    })

    ipcMain.handle('db:transaction:create', async (_event, data) => {
        if (data?.kind === 'TRANSFER' && data?.transferTargetAccountId) {
            return createInternalTransfer(prisma, data)
        }

        return prisma.transaction.create({
            data: await buildTransactionPayload(prisma, data),
            include: includeTransactionRelations(),
        })
    })

    ipcMain.handle('db:transaction:update', async (_event, id, data) => {
        const transactionId = requireId(id, 'La transaction')
        const existing = await prisma.transaction.findUnique({
            where: {id: transactionId},
            include: includeTransactionRelations(),
        })

        if (!existing) {
            throw new Error('La transaction est introuvable.')
        }

        const wantsInternalTransfer = data?.kind === 'TRANSFER' && data?.transferTargetAccountId

        if (existing.transferGroup) {
            if (wantsInternalTransfer) {
                return updateInternalTransfer(prisma, transactionId, data, existing.transferGroup)
            }

            return convertTransferToStandard(prisma, transactionId, data, existing.transferGroup)
        }

        if (wantsInternalTransfer) {
            return convertStandardToTransfer(prisma, transactionId, data)
        }

        return prisma.transaction.update({
            where: {
                id: transactionId,
            },
            data: await buildTransactionPayload(prisma, data),
            include: includeTransactionRelations(),
        })
    })

    ipcMain.handle('db:transaction:delete', async (_event, id) => {
        const transactionId = requireId(id, 'La transaction')
        const existing = await prisma.transaction.findUnique({
            where: {id: transactionId},
            include: includeTransactionRelations(),
        })

        if (!existing) {
            throw new Error('La transaction est introuvable.')
        }

        if (existing.transferGroup) {
            await prisma.transaction.deleteMany({
                where: {transferGroup: existing.transferGroup},
            })
            return existing
        }

        return prisma.transaction.delete({
            where: {
                id: transactionId,
            },
            include: includeTransactionRelations(),
        })
    })
}

module.exports = {registerDbHandlers}
