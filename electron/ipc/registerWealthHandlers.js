const {app, ipcMain} = require('electron')

const {getPrisma} = require('../db')
const {createAuditLogService} = require('../audit/auditLogService')
const {getPortfolioDashboard} = require('../portfolio/portfolioDashboardService')
const {createRecoverySnapshotService} = require('../recovery/recoverySnapshotService')
const {createDatabaseRecoverySnapshot} = require('../recovery/databaseRecoveryBackup')
const {registerGoalHandlers} = require('./registerGoalHandlers')
const {registerMonthlySurplusHandlers} = require('./registerMonthlySurplusHandlers')
const {registerProjectionScenarioHandlers} = require('./registerProjectionScenarioHandlers')
const {
    createAsset,
    createLiability,
    createPortfolio,
    deleteAsset,
    deleteLiability,
    deletePortfolio,
    listAssets,
    listLiabilities,
    listPortfolios,
    updateAsset,
    updateLiability,
    updatePortfolio,
} = require('./wealthHandlers')
const {
    createGeneratedNetWorthSnapshot,
    getWealthOverview,
    listNetWorthSnapshots,
} = require('./wealthOverviewHandlers')

function registerWealthHandlers(prisma = getPrisma(), {
    auditLog = createAuditLogService({prisma}),
    recoverySnapshots = null,
} = {}) {
    let lazyRecoverySnapshots = recoverySnapshots

    function getRecoverySnapshots() {
        if (!lazyRecoverySnapshots) lazyRecoverySnapshots = createRecoverySnapshotService({app, auditLog})
        return lazyRecoverySnapshots
    }

    async function snapshotBefore(operationType, reason, source) {
        return createDatabaseRecoverySnapshot({prisma, recoverySnapshots: getRecoverySnapshots(), operationType, reason, source})
    }

    ipcMain.handle('db:asset:list', async (_event, filters) => listAssets(prisma, filters))
    ipcMain.handle('db:asset:create', async (_event, data) => createAsset(prisma, data))
    ipcMain.handle('db:asset:update', async (_event, id, data) => updateAsset(prisma, id, data))
    ipcMain.handle('db:asset:delete', async (_event, id) => {
        const recovery = await snapshotBefore('delete-asset', `Suppression de l’actif ${id}`, 'db:asset:delete')
        const deleted = await deleteAsset(prisma, id)
        await auditLog.logCriticalDelete({
            domain: 'wealth',
            entityType: 'asset',
            entityId: id,
            summary: `Actif supprimé: ${deleted.name}`,
            source: 'db:asset:delete',
            metadata: {type: deleted.type, status: deleted.status, currency: deleted.currency, recoverySnapshotId: recovery?.id, recoverySnapshotPath: recovery?.filePath},
        })
        return deleted
    })

    ipcMain.handle('db:portfolio:list', async (_event, filters) => listPortfolios(prisma, filters))
    ipcMain.handle('db:portfolio:create', async (_event, data) => createPortfolio(prisma, data))
    ipcMain.handle('db:portfolio:update', async (_event, id, data) => updatePortfolio(prisma, id, data))
    ipcMain.handle('db:portfolio:delete', async (_event, id) => {
        const recovery = await snapshotBefore('delete-portfolio', `Suppression du portfolio ${id}`, 'db:portfolio:delete')
        const deleted = await deletePortfolio(prisma, id)
        await auditLog.logCriticalDelete({
            domain: 'wealth',
            entityType: 'portfolio',
            entityId: id,
            summary: `Portfolio supprimé: ${deleted.name}`,
            source: 'db:portfolio:delete',
            metadata: {type: deleted.type, status: deleted.status, currency: deleted.currency, recoverySnapshotId: recovery?.id, recoverySnapshotPath: recovery?.filePath},
        })
        return deleted
    })

    ipcMain.handle('db:liability:list', async (_event, filters) => listLiabilities(prisma, filters))
    ipcMain.handle('db:liability:create', async (_event, data) => createLiability(prisma, data))
    ipcMain.handle('db:liability:update', async (_event, id, data) => updateLiability(prisma, id, data))
    ipcMain.handle('db:liability:delete', async (_event, id) => {
        const recovery = await snapshotBefore('delete-liability', `Suppression du passif ${id}`, 'db:liability:delete')
        const deleted = await deleteLiability(prisma, id)
        await auditLog.logCriticalDelete({
            domain: 'wealth',
            entityType: 'liability',
            entityId: id,
            summary: `Passif supprimé: ${deleted.name}`,
            source: 'db:liability:delete',
            metadata: {type: deleted.type, status: deleted.status, currency: deleted.currency, recoverySnapshotId: recovery?.id, recoverySnapshotPath: recovery?.filePath},
        })
        return deleted
    })

    ipcMain.handle('db:wealth:overview', async (_event, options) => getWealthOverview(prisma, options))
    ipcMain.handle('db:netWorthSnapshot:createGenerated', async (_event, options) =>
        createGeneratedNetWorthSnapshot(prisma, options),
    )
    ipcMain.handle('db:netWorthSnapshot:list', async (_event, filters) => listNetWorthSnapshots(prisma, filters))
    ipcMain.handle('db:portfolioAnalytics:dashboard', async (_event, options) =>
        getPortfolioDashboard(options || {}, {prisma}),
    )

    registerGoalHandlers({ipc: ipcMain, prisma})
    registerProjectionScenarioHandlers({ipc: ipcMain, prisma})
    registerMonthlySurplusHandlers({ipc: ipcMain, prisma})
}

module.exports = {registerWealthHandlers}
