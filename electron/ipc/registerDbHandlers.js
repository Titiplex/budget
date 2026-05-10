const {ipcMain} = require('electron')
const {getPrisma} = require('../db')
const {createAuditLogService} = require('../audit/auditLogService')
const {
    buildAccountPayload,
    buildCategoryPayload,
    createTransaction,
    deleteTransaction,
    includeTransactionRelations,
    requireId,
    updateTransaction,
} = require('./transactionHandlers')

function registerDbHandlers({auditLog = createAuditLogService({prisma: getPrisma()})} = {}) {
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
        const accountId = requireId(id, 'Le compte')
        const deleted = await prisma.account.delete({
            where: {id: accountId},
        })
        await auditLog.logCriticalDelete({
            domain: 'account',
            entityType: 'account',
            entityId: accountId,
            summary: `Compte supprimé: ${deleted.name}`,
            source: 'db:account:delete',
            metadata: {type: deleted.type, currency: deleted.currency},
        })
        return deleted
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
        const categoryId = requireId(id, 'La catégorie')
        const deleted = await prisma.category.delete({
            where: {id: categoryId},
        })
        await auditLog.logCriticalDelete({
            domain: 'category',
            entityType: 'category',
            entityId: categoryId,
            summary: `Catégorie supprimée: ${deleted.name}`,
            source: 'db:category:delete',
            metadata: {kind: deleted.kind},
        })
        return deleted
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
        const transactionId = requireId(id, 'La transaction')
        const deleted = await deleteTransaction(prisma, transactionId)
        await auditLog.logCriticalDelete({
            domain: 'transaction',
            entityType: 'transaction',
            entityId: transactionId,
            summary: `Transaction supprimée: ${deleted.label}`,
            source: 'db:transaction:delete',
            metadata: {kind: deleted.kind, date: deleted.date, accountId: deleted.accountId, categoryId: deleted.categoryId},
        })
        return deleted
    })
}

module.exports = {registerDbHandlers}
