const {app, BrowserWindow, ipcMain, Menu} = require('electron')
const {updateElectronApp} = require('update-electron-app')
const path = require('node:path')
const {registerDbHandlers} = require('./ipc/registerDbHandlers')
const {registerBudgetHandlers} = require('./ipc/registerBudgetHandlers')
const {registerRecurringHandlers} = require('./ipc/registerRecurringHandlers')
const {registerFileHandlers} = require('./ipc/registerFileHandlers')
const {registerFxHandlers} = require('./ipc/registerFxHandlers')
const {registerTaxHandlers} = require('./ipc/registerTaxHandlers')
const {registerMarketDataHandlers} = require('./ipc/registerMarketDataHandlers')
const {registerWealthHandlers} = require('./ipc/registerWealthHandlers')
const {disconnectPrisma} = require('./db')
const {getMenuMessages, normalizeMenuLocale} = require('./menuI18n')

updateElectronApp()

let currentMenuLocale = normalizeMenuLocale(app.getLocale())

function getActiveWindow() {
    return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null
}

function sendMenuCommand(command) {
    const win = getActiveWindow()
    if (!win) return
    win.webContents.send('app:menu-command', command)
}

function buildAppMenu(locale = currentMenuLocale) {
    const isMac = process.platform === 'darwin'
    const m = getMenuMessages(locale)

    const template = [
        ...(isMac
            ? [{
                label: app.name,
                submenu: [
                    {role: 'about'},
                    {type: 'separator'},
                    {
                        label: m.app.preferences,
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
            label: m.menu.file,
            submenu: [
                {
                    label: m.items.newTransaction,
                    accelerator: 'CmdOrCtrl+N',
                    click: () => sendMenuCommand('create-transaction'),
                },
                {
                    label: m.items.newAccount,
                    accelerator: 'CmdOrCtrl+Shift+A',
                    click: () => sendMenuCommand('create-account'),
                },
                {
                    label: m.items.newCategory,
                    accelerator: 'CmdOrCtrl+Shift+C',
                    click: () => sendMenuCommand('create-category'),
                },
                {
                    label: m.items.openBudgets,
                    accelerator: 'CmdOrCtrl+B',
                    click: () => sendMenuCommand('open-budgets'),
                },
                {
                    label: m.items.openRecurring,
                    click: () => sendMenuCommand('open-recurring'),
                },
                {
                    label: m.items.generateDueRecurring,
                    click: () => sendMenuCommand('generate-due-recurring'),
                },
                {type: 'separator'},
                {
                    label: m.items.openReports,
                    accelerator: 'CmdOrCtrl+R',
                    click: () => sendMenuCommand('open-reports'),
                },
                {
                    label: m.items.exportPeriodReport,
                    accelerator: 'CmdOrCtrl+Shift+R',
                    click: () => sendMenuCommand('export-period-report'),
                },
                {type: 'separator'},
                {
                    label: m.items.importCsv,
                    accelerator: 'CmdOrCtrl+I',
                    click: () => sendMenuCommand('import-csv'),
                },
                {
                    label: m.items.exportCsv,
                    accelerator: 'CmdOrCtrl+E',
                    click: () => sendMenuCommand('export-csv'),
                },
                {type: 'separator'},
                {
                    label: m.items.exportJsonBackup,
                    accelerator: 'CmdOrCtrl+Shift+E',
                    click: () => sendMenuCommand('export-json'),
                },
                {
                    label: m.items.restoreJsonBackup,
                    accelerator: 'CmdOrCtrl+Shift+I',
                    click: () => sendMenuCommand('restore-json'),
                },
                {type: 'separator'},
                {
                    label: m.items.refreshData,
                    accelerator: 'F5',
                    click: () => sendMenuCommand('refresh-data'),
                },
                {type: 'separator'},
                ...(isMac ? [{role: 'close'}] : [{role: 'quit'}]),
            ],
        },
        {
            label: m.menu.edit,
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
            label: m.menu.view,
            submenu: [
                {
                    label: m.items.openBudgets,
                    click: () => sendMenuCommand('open-budgets'),
                },
                {
                    label: m.items.openRecurring,
                    click: () => sendMenuCommand('open-recurring'),
                },
                {
                    label: m.items.openReports,
                    click: () => sendMenuCommand('open-reports'),
                },
                {
                    label: m.items.toggleTheme,
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
            label: m.menu.settings,
            submenu: [
                {
                    label: m.app.preferences,
                    accelerator: isMac ? undefined : 'CmdOrCtrl+,',
                    click: () => sendMenuCommand('open-settings'),
                },
                {type: 'separator'},
                {
                    label: m.items.lightTheme,
                    click: () => sendMenuCommand('set-theme-light'),
                },
                {
                    label: m.items.darkTheme,
                    click: () => sendMenuCommand('set-theme-dark'),
                },
                {type: 'separator'},
                {
                    label: m.items.french,
                    click: () => sendMenuCommand('set-locale-fr'),
                },
                {
                    label: m.items.english,
                    click: () => sendMenuCommand('set-locale-en'),
                },
            ],
        },
        {
            label: m.menu.window,
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
        icon: path.join(__dirname, '..', 'assets', 'icons', 'app.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
    })

    win.loadFile(path.join(__dirname, '../dist/renderer/index.html'))
    return win
}

app.whenReady().then(() => {
    ipcMain.handle('ping', () => 'pong')
    ipcMain.handle('app:get-version', () => app.getVersion())
    ipcMain.on('app:set-locale', (_event, locale) => {
        currentMenuLocale = normalizeMenuLocale(locale)
        Menu.setApplicationMenu(buildAppMenu(currentMenuLocale))
    })

    registerDbHandlers()
    registerBudgetHandlers()
    registerRecurringHandlers()
    registerFileHandlers()
    registerFxHandlers()
    registerTaxHandlers()
    registerMarketDataHandlers()
    registerWealthHandlers()

    Menu.setApplicationMenu(buildAppMenu(currentMenuLocale))
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