const {app, BrowserWindow, ipcMain, Menu} = require('electron')
const {updateElectronApp} = require('update-electron-app')
const path = require('node:path')
const {registerDbHandlers} = require('./ipc/registerDbHandlers')
const {registerFileHandlers} = require('./ipc/registerFileHandlers')
const {registerFxHandlers} = require('./ipc/registerFxHandlers')
const {disconnectPrisma} = require('./db')

updateElectronApp()

function getActiveWindow() {
    return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null
}

function sendMenuCommand(command) {
    const win = getActiveWindow()
    if (!win) return
    win.webContents.send('app:menu-command', command)
}

function buildAppMenu() {
    const isMac = process.platform === 'darwin'

    const template = [
        ...(isMac
            ? [{
                label: app.name,
                submenu: [
                    {role: 'about'},
                    {type: 'separator'},
                    {
                        label: 'Preferences…',
                        accelerator: 'CmdOrCtrl+,',
                        click: () => sendMenuCommand('open-settings'),
                    },
                    {type: 'separator'},
                    {role: 'services'},
                    {type: 'separator'},
                    {role: 'hide'},
                    {role: 'hideOthers'},
                    {role: 'unhide'},
                    {type: 'separator'},
                    {role: 'quit'},
                ],
            }]
            : []),
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Transaction',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => sendMenuCommand('create-transaction'),
                },
                {
                    label: 'New Account',
                    accelerator: 'CmdOrCtrl+Shift+A',
                    click: () => sendMenuCommand('create-account'),
                },
                {
                    label: 'New Category',
                    accelerator: 'CmdOrCtrl+Shift+C',
                    click: () => sendMenuCommand('create-category'),
                },
                {type: 'separator'},
                {
                    label: 'Open Reports',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => sendMenuCommand('open-reports'),
                },
                {
                    label: 'Export Period Report',
                    accelerator: 'CmdOrCtrl+Shift+R',
                    click: () => sendMenuCommand('export-period-report'),
                },
                {type: 'separator'},
                {
                    label: 'Import CSV',
                    accelerator: 'CmdOrCtrl+I',
                    click: () => sendMenuCommand('import-csv'),
                },
                {
                    label: 'Export CSV',
                    accelerator: 'CmdOrCtrl+E',
                    click: () => sendMenuCommand('export-csv'),
                },
                {type: 'separator'},
                {
                    label: 'Export JSON Backup',
                    accelerator: 'CmdOrCtrl+Shift+E',
                    click: () => sendMenuCommand('export-json'),
                },
                {
                    label: 'Restore JSON Backup',
                    accelerator: 'CmdOrCtrl+Shift+I',
                    click: () => sendMenuCommand('restore-json'),
                },
                {type: 'separator'},
                {
                    label: 'Refresh Data',
                    accelerator: 'F5',
                    click: () => sendMenuCommand('refresh-data'),
                },
                {type: 'separator'},
                ...(isMac ? [{role: 'close'}] : [{role: 'quit'}]),
            ],
        },
        {
            label: 'Edit',
            submenu: [
                {role: 'undo'},
                {role: 'redo'},
                {type: 'separator'},
                {role: 'cut'},
                {role: 'copy'},
                {role: 'paste'},
                ...(isMac
                    ? [
                        {role: 'pasteAndMatchStyle'},
                        {role: 'delete'},
                        {role: 'selectAll'},
                    ]
                    : [
                        {role: 'delete'},
                        {type: 'separator'},
                        {role: 'selectAll'},
                    ]),
            ],
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Open Reports',
                    click: () => sendMenuCommand('open-reports'),
                },
                {
                    label: 'Toggle Theme',
                    accelerator: 'CmdOrCtrl+D',
                    click: () => sendMenuCommand('toggle-theme'),
                },
                {type: 'separator'},
                {role: 'reload'},
                {role: 'forceReload'},
                {role: 'togglefullscreen'},
            ],
        },
        {
            label: 'Settings',
            submenu: [
                {
                    label: 'Preferences…',
                    accelerator: isMac ? undefined : 'CmdOrCtrl+,',
                    click: () => sendMenuCommand('open-settings'),
                },
                {type: 'separator'},
                {
                    label: 'Light Theme',
                    click: () => sendMenuCommand('set-theme-light'),
                },
                {
                    label: 'Dark Theme',
                    click: () => sendMenuCommand('set-theme-dark'),
                },
                {type: 'separator'},
                {
                    label: 'Français',
                    click: () => sendMenuCommand('set-locale-fr'),
                },
                {
                    label: 'English',
                    click: () => sendMenuCommand('set-locale-en'),
                },
            ],
        },
        {
            label: 'Window',
            submenu: isMac
                ? [
                    {role: 'minimize'},
                    {role: 'zoom'},
                    {type: 'separator'},
                    {role: 'front'},
                ]
                : [
                    {role: 'minimize'},
                    {role: 'zoom'},
                    {role: 'close'},
                ],
        },
    ]

    return Menu.buildFromTemplate(template)
}

const createWindow = () => {
    const win = new BrowserWindow({
        width: 1360,
        height: 900,
        minWidth: 1150,
        minHeight: 760,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
    })

    win.loadFile(path.join(__dirname, '../dist/renderer/index.html'))
    return win
}

app.whenReady().then(() => {
    ipcMain.handle('ping', () => 'pong')
    registerDbHandlers()
    registerFileHandlers()
    registerFxHandlers()

    Menu.setApplicationMenu(buildAppMenu())
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