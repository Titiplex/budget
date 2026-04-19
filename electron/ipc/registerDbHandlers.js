const {ipcMain} = require('electron')
const {getPrisma} = require('../db')

function registerDbHandlers() {
    const prisma = getPrisma()

    ipcMain.handle('db:account:list', async () => {
        return prisma.account.findMany({
            orderBy: {createdAt: 'desc'},
        })
    })

    ipcMain.handle('db:account:create', async (_event, data) => {
        return prisma.account.create({
            data: {
                name: String(data.name).trim(),
                type: data.type,
                currency: data.currency?.trim() || 'CAD',
                description: data.description?.trim() || null,
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
            data: {
                name: String(data.name).trim(),
                kind: data.kind,
                color: data.color?.trim() || null,
                description: data.description?.trim() || null,
            },
        })
    })

    ipcMain.handle('db:transaction:list', async () => {
        return prisma.transaction.findMany({
            include: {
                account: true,
                category: true,
            },
            orderBy: {date: 'desc'},
        })
    })

    ipcMain.handle('db:transaction:create', async (_event, data) => {
        return prisma.transaction.create({
            data: {
                label: String(data.label).trim(),
                amount: Number(data.amount),
                kind: data.kind,
                date: new Date(data.date),
                note: data.note?.trim() || null,
                accountId: Number(data.accountId),
                categoryId: data.categoryId ? Number(data.categoryId) : null,
            },
            include: {
                account: true,
                category: true,
            },
        })
    })
}

module.exports = {registerDbHandlers}