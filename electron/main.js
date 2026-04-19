const {app, BrowserWindow, ipcMain} = require('electron/main')
const {updateElectronApp} = require('update-electron-app')
const path = require('node:path')
const {registerDbHandlers} = require('./ipc/registerDbHandlers')
const {disconnectPrisma} = require('./db')

updateElectronApp()

const createWindow = () => {
    const win = new BrowserWindow({
        width: 1100,
        height: 750,
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