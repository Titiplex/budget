const {ipcMain} = require('electron')
const {getPrisma} = require('../db')

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

function requireDate(value) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        throw new Error('La date est invalide.')
    }
    return date
}

function includeTransactionRelations() {
    return {
        account: true,
        category: true,
    }
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

function buildTransactionPayload(data) {
    return {
        label: requireText(data?.label, 'Le libellé'),
        amount: requirePositiveNumber(data?.amount, 'Le montant'),
        kind: data?.kind,
        date: requireDate(data?.date),
        note: normalizeText(data?.note),
        accountId: requireId(data?.accountId, 'Le compte'),
        categoryId: data?.categoryId ? requireId(data.categoryId, 'La catégorie') : null,
    }
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
        return prisma.transaction.create({
            data: buildTransactionPayload(data),
            include: includeTransactionRelations(),
        })
    })

    ipcMain.handle('db:transaction:update', async (_event, id, data) => {
        return prisma.transaction.update({
            where: {
                id: requireId(id, 'La transaction'),
            },
            data: buildTransactionPayload(data),
            include: includeTransactionRelations(),
        })
    })

    ipcMain.handle('db:transaction:delete', async (_event, id) => {
        return prisma.transaction.delete({
            where: {
                id: requireId(id, 'La transaction'),
            },
        })
    })
}

module.exports = {registerDbHandlers}