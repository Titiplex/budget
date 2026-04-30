const {contextBridge, ipcRenderer} = require('electron')

contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
  ping: () => ipcRenderer.invoke('ping'),
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, func) => ipcRenderer.on(channel, (_event, ...args) => func(...args)),
})

contextBridge.exposeInMainWorld('appShell', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  setLocale: (locale) => ipcRenderer.send('app:set-locale', locale),
})

contextBridge.exposeInMainWorld('db', {
  account: {
    list: () => ipcRenderer.invoke('db:account:list'),
    create: (data) => ipcRenderer.invoke('db:account:create', data),
    update: (id, data) => ipcRenderer.invoke('db:account:update', id, data),
    delete: (id) => ipcRenderer.invoke('db:account:delete', id),
  },
  category: {
    list: () => ipcRenderer.invoke('db:category:list'),
    create: (data) => ipcRenderer.invoke('db:category:create', data),
    update: (id, data) => ipcRenderer.invoke('db:category:update', id, data),
    delete: (id) => ipcRenderer.invoke('db:category:delete', id),
  },
  transaction: {
    list: () => ipcRenderer.invoke('db:transaction:list'),
    create: (data) => ipcRenderer.invoke('db:transaction:create', data),
    update: (id, data) => ipcRenderer.invoke('db:transaction:update', id, data),
    delete: (id) => ipcRenderer.invoke('db:transaction:delete', id),
  },
  budgetTarget: {
    list: () => ipcRenderer.invoke('db:budgetTarget:list'),
    create: (data) => ipcRenderer.invoke('db:budgetTarget:create', data),
    update: (id, data) => ipcRenderer.invoke('db:budgetTarget:update', id, data),
    delete: (id) => ipcRenderer.invoke('db:budgetTarget:delete', id),
  },
  recurringTemplate: {
    list: () => ipcRenderer.invoke('db:recurringTemplate:list'),
    create: (data) => ipcRenderer.invoke('db:recurringTemplate:create', data),
    update: (id, data) => ipcRenderer.invoke('db:recurringTemplate:update', id, data),
    delete: (id) => ipcRenderer.invoke('db:recurringTemplate:delete', id),
    generateDue: (data) => ipcRenderer.invoke('db:recurringTemplate:generateDue', data),
  },
  taxProfile: {
    list: () => ipcRenderer.invoke('db:taxProfile:list'),
    create: (data) => ipcRenderer.invoke('db:taxProfile:create', data),
    update: (id, data) => ipcRenderer.invoke('db:taxProfile:update', id, data),
    delete: (id) => ipcRenderer.invoke('db:taxProfile:delete', id),
  },
  taxMetadata: {
    updateAccount: (id, data) => ipcRenderer.invoke('db:taxMetadata:updateAccount', id, data),
    updateTransaction: (id, data) => ipcRenderer.invoke('db:taxMetadata:updateTransaction', id, data),
  },
})

contextBridge.exposeInMainWorld('file', {
  openText: (options) => ipcRenderer.invoke('file:open-text', options),
  saveText: (options) => ipcRenderer.invoke('file:save-text', options),
})

contextBridge.exposeInMainWorld('fx', {
  quoteHistorical: (options) => ipcRenderer.invoke('fx:quote-historical', options),
})

contextBridge.exposeInMainWorld('marketData', {
  listInstruments: (filters) => ipcRenderer.invoke('marketData:instrument:list', filters),
  getLatestSnapshot: (options) => ipcRenderer.invoke('marketData:snapshot:latest', options),
  listSnapshotHistory: (options) => ipcRenderer.invoke('marketData:snapshot:history', options),
  refresh: (options) => ipcRenderer.invoke('marketData:refresh', options),
  getAssetValuation: (options) => ipcRenderer.invoke('marketData:valuation:get', options),
  listFreshnessStatuses: (filters) => ipcRenderer.invoke('marketData:freshness:list', filters),
  listWatchlist: (options) => ipcRenderer.invoke('marketData:watchlist:list', options),
  addWatchlistInstrument: (data) => ipcRenderer.invoke('marketData:watchlist:add', data),
  removeWatchlistInstrument: (id) => ipcRenderer.invoke('marketData:watchlist:remove', id),
  refreshWatchlist: (options) => ipcRenderer.invoke('marketData:watchlist:refresh', options),
})

contextBridge.exposeInMainWorld('wealth', {
  listAssets: (filters) => ipcRenderer.invoke('db:asset:list', filters),
  createAsset: (data) => ipcRenderer.invoke('db:asset:create', data),
  updateAsset: (id, data) => ipcRenderer.invoke('db:asset:update', id, data),
  deleteAsset: (id) => ipcRenderer.invoke('db:asset:delete', id),
  listPortfolios: (filters) => ipcRenderer.invoke('db:portfolio:list', filters),
  createPortfolio: (data) => ipcRenderer.invoke('db:portfolio:create', data),
  updatePortfolio: (id, data) => ipcRenderer.invoke('db:portfolio:update', id, data),
  deletePortfolio: (id) => ipcRenderer.invoke('db:portfolio:delete', id),
  listLiabilities: (filters) => ipcRenderer.invoke('db:liability:list', filters),
  createLiability: (data) => ipcRenderer.invoke('db:liability:create', data),
  updateLiability: (id, data) => ipcRenderer.invoke('db:liability:update', id, data),
  deleteLiability: (id) => ipcRenderer.invoke('db:liability:delete', id),
  getOverview: (options) => ipcRenderer.invoke('db:wealth:overview', options),
  createGeneratedNetWorthSnapshot: (options) => ipcRenderer.invoke('db:netWorthSnapshot:createGenerated', options),
  listNetWorthSnapshots: (filters) => ipcRenderer.invoke('db:netWorthSnapshot:list', filters),
})
