const {ipcMain} = require('electron')

const {getPrisma} = require('../db')
const {getPortfolioDashboard} = require('../portfolio/portfolioDashboardService')
const {registerGoalHandlers} = require('./registerGoalHandlers')
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

function registerWealthHandlers(prisma = getPrisma()) {
    ipcMain.handle('db:asset:list', async (_event, filters) => listAssets(prisma, filters))
    ipcMain.handle('db:asset:create', async (_event, data) => createAsset(prisma, data))
    ipcMain.handle('db:asset:update', async (_event, id, data) => updateAsset(prisma, id, data))
    ipcMain.handle('db:asset:delete', async (_event, id) => deleteAsset(prisma, id))

    ipcMain.handle('db:portfolio:list', async (_event, filters) => listPortfolios(prisma, filters))
    ipcMain.handle('db:portfolio:create', async (_event, data) => createPortfolio(prisma, data))
    ipcMain.handle('db:portfolio:update', async (_event, id, data) => updatePortfolio(prisma, id, data))
    ipcMain.handle('db:portfolio:delete', async (_event, id) => deletePortfolio(prisma, id))

    ipcMain.handle('db:liability:list', async (_event, filters) => listLiabilities(prisma, filters))
    ipcMain.handle('db:liability:create', async (_event, data) => createLiability(prisma, data))
    ipcMain.handle('db:liability:update', async (_event, id, data) => updateLiability(prisma, id, data))
    ipcMain.handle('db:liability:delete', async (_event, id) => deleteLiability(prisma, id))

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
}

module.exports = {registerWealthHandlers}
