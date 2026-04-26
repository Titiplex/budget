const {ipcMain} = require('electron')
const {getPrisma} = require('../db')
const {
    buildAccountPayload,
    buildCategoryPayload,
    createTransaction,
    deleteTransaction,
    includeTransactionRelations,
    requireId,
    updateTransaction,
} = require('./transactionHandlers')

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
            where: {id: requireId(id, 'Le compte')},
            data: buildAccountPayload(data),
        })
    })

    ipcMain.handle('db:account:delete', async (_event, id) => {
        return prisma.account.delete({
            where: {id: requireId(id, 'Le compte')},
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
            where: {id: requireId(id, 'La catégorie')},
            data: buildCategoryPayload(data),
        })
    })

    ipcMain.handle('db:category:delete', async (_event, id) => {
        return prisma.category.delete({
            where: {id: requireId(id, 'La catégorie')},
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
        return createTransaction(prisma, data)
    })

    ipcMain.handle('db:transaction:update', async (_event, id, data) => {
        return updateTransaction(prisma, id, data)
    })

    ipcMain.handle('db:transaction:delete', async (_event, id) => {
        return deleteTransaction(prisma, id)
    })
}

module.exports = {registerDbHandlers}
