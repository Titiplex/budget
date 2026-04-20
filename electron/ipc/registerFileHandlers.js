const {BrowserWindow, dialog, ipcMain} = require('electron')
const fs = require('node:fs/promises')

function getDialogWindow() {
    return BrowserWindow.getFocusedWindow() || undefined
}

function normalizeFilters(filters, fallbackName = 'Text') {
    if (!Array.isArray(filters) || !filters.length) {
        return [{name: fallbackName, extensions: ['txt']}]
    }

    return filters
        .filter((filter) => filter && Array.isArray(filter.extensions) && filter.extensions.length)
        .map((filter) => ({
            name: typeof filter.name === 'string' && filter.name.trim() ? filter.name.trim() : fallbackName,
            extensions: filter.extensions.map((ext) => String(ext).replace(/^\./, '')).filter(Boolean),
        }))
}

function registerFileHandlers() {
    ipcMain.handle('file:open-text', async (_event, options = {}) => {
        const result = await dialog.showOpenDialog(getDialogWindow(), {
            title: options.title || 'Ouvrir un fichier texte',
            buttonLabel: options.buttonLabel || 'Ouvrir',
            properties: ['openFile'],
            filters: normalizeFilters(options.filters, 'Text'),
        })

        if (result.canceled || !result.filePaths?.length) {
            return {
                canceled: true,
                filePath: null,
                content: null,
            }
        }

        const filePath = result.filePaths[0]
        const content = await fs.readFile(filePath, 'utf8')

        return {
            canceled: false,
            filePath,
            content,
        }
    })

    ipcMain.handle('file:save-text', async (_event, options = {}) => {
        const result = await dialog.showSaveDialog(getDialogWindow(), {
            title: options.title || 'Enregistrer le fichier',
            buttonLabel: options.buttonLabel || 'Enregistrer',
            defaultPath: options.defaultPath,
            showOverwriteConfirmation: true,
            filters: normalizeFilters(options.filters, 'Text'),
        })

        if (result.canceled || !result.filePath) {
            return {
                canceled: true,
                filePath: null,
            }
        }

        await fs.writeFile(result.filePath, String(options.content ?? ''), 'utf8')

        return {
            canceled: false,
            filePath: result.filePath,
        }
    })
}

module.exports = {registerFileHandlers}