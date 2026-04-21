const {contextBridge, ipcRenderer} = require('electron')

contextBridge.exposeInMainWorld('versions', {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
    ping: () => ipcRenderer.invoke('ping'),
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, func) => ipcRenderer.on(channel, (_event, ...args) => func(...args)),
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
})

contextBridge.exposeInMainWorld('file', {
    openText: (options) => ipcRenderer.invoke('file:open-text', options),
    saveText: (options) => ipcRenderer.invoke('file:save-text', options),
})

contextBridge.exposeInMainWorld('fx', {
    quoteHistorical: (options) => ipcRenderer.invoke('fx:quote-historical', options),
})