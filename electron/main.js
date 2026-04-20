const {app, BrowserWindow, ipcMain} = require('electron/main')
const {updateElectronApp} = require('update-electron-app')
const path = require('node:path')
const {registerDbHandlers} = require('./ipc/registerDbHandlers')
const {registerFileHandlers} = require('./ipc/registerFileHandlers')
const {disconnectPrisma} = require('./db')

updateElectronApp()

const createWindow = () => {
    const win = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 1100,
        minHeight: 720,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
    })

    win.loadFile(path.join(__dirname, '../dist/renderer/index.html'))
    // win.webContents.openDevTools()
}

app.whenReady().then(() => {
    ipcMain.handle('ping', () => 'pong')
    registerDbHandlers()
    registerFileHandlers()

    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', async () => {
    await disconnectPrisma()

    if (process.platform !== 'darwin') {
        app.quit()
    }
})