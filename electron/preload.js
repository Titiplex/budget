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
    },
    category: {
        list: () => ipcRenderer.invoke('db:category:list'),
        create: (data) => ipcRenderer.invoke('db:category:create', data),
    },
    transaction: {
        list: () => ipcRenderer.invoke('db:transaction:list'),
        create: (data) => ipcRenderer.invoke('db:transaction:create', data),
    },
})