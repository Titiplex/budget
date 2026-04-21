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

function requireDate(value, fieldName = 'La date') {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`${fieldName} est invalide.`)
    }
    return parsed
}

function normalizeCurrency(value) {
    return (normalizeText(value) || 'CAD').toUpperCase()
}

function buildBudgetPayload(data) {
    const startDate = requireDate(data?.startDate, 'La date de début')
    const endDate = data?.endDate ? requireDate(data.endDate, 'La date de fin') : null

    if (endDate && endDate.getTime() < startDate.getTime()) {
        throw new Error('La date de fin doit être après la date de début.')
    }

    return {
        name: requireText(data?.name, 'Le nom du budget'),
        amount: requirePositiveNumber(data?.amount, 'Le montant cible'),
        period: data?.period,
        startDate,
        endDate,
        currency: normalizeCurrency(data?.currency),
        isActive: Boolean(data?.isActive ?? true),
        note: normalizeText(data?.note),
        categoryId: requireId(data?.categoryId, 'La catégorie'),
    }
}

function registerBudgetHandlers() {
    const prisma = getPrisma()

    ipcMain.handle('db:budgetTarget:list', async () => {
        return prisma.budgetTarget.findMany({
            include: {
                category: true,
            },
            orderBy: [
                {isActive: 'desc'},
                {createdAt: 'desc'},
            ],
        })
    })

    ipcMain.handle('db:budgetTarget:create', async (_event, data) => {
        return prisma.budgetTarget.create({
            data: buildBudgetPayload(data),
            include: {
                category: true,
            },
        })
    })

    ipcMain.handle('db:budgetTarget:update', async (_event, id, data) => {
        return prisma.budgetTarget.update({
            where: {
                id: requireId(id, 'Le budget'),
            },
            data: buildBudgetPayload(data),
            include: {
                category: true,
            },
        })
    })

    ipcMain.handle('db:budgetTarget:delete', async (_event, id) => {
        return prisma.budgetTarget.delete({
            where: {
                id: requireId(id, 'Le budget'),
            },
            include: {
                category: true,
            },
        })
    })
}

module.exports = {registerBudgetHandlers}