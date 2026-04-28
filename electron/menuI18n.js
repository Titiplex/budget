function normalizeMenuLocale(value) {
    const normalized = String(value || '').toLowerCase()
    return normalized.startsWith('fr') ? 'fr' : 'en'
}

const messages = {
    fr: {
        app: {
            preferences: 'Préférences…',
        },
        menu: {
            file: 'Fichier',
            edit: 'Édition',
            view: 'Affichage',
            settings: 'Réglages',
            window: 'Fenêtre',
        },
        items: {
            newTransaction: 'Nouvelle transaction',
            newAccount: 'Nouveau compte',
            newCategory: 'Nouvelle catégorie',
            openBudgets: 'Ouvrir les budgets',
            openRecurring: 'Ouvrir les récurrences',
            generateDueRecurring: 'Générer les récurrences dues',
            openReports: 'Ouvrir les rapports', openWealth: 'Ouvrir le patrimoine',
            exportPeriodReport: 'Exporter le rapport de période',
            importCsv: 'Importer un CSV',
            exportCsv: 'Exporter un CSV',
            exportJsonBackup: 'Exporter une sauvegarde JSON',
            restoreJsonBackup: 'Restaurer une sauvegarde JSON',
            refreshData: 'Rafraîchir les données',
            toggleTheme: 'Basculer le thème',
            lightTheme: 'Thème clair',
            darkTheme: 'Thème sombre',
            french: 'Français',
            english: 'English',
        },
    },
    en: {
        app: {
            preferences: 'Preferences…',
        },
        menu: {
            file: 'File',
            edit: 'Edit',
            view: 'View',
            settings: 'Settings',
            window: 'Window',
        },
        items: {
            newTransaction: 'New Transaction',
            newAccount: 'New Account',
            newCategory: 'New Category',
            openBudgets: 'Open Budgets',
            openRecurring: 'Open Recurring',
            generateDueRecurring: 'Generate Due Recurring Transactions',
            openReports: 'Open Reports', openWealth: 'Open Wealth',
            exportPeriodReport: 'Export Period Report',
            importCsv: 'Import CSV',
            exportCsv: 'Export CSV',
            exportJsonBackup: 'Export JSON Backup',
            restoreJsonBackup: 'Restore JSON Backup',
            refreshData: 'Refresh Data',
            toggleTheme: 'Toggle Theme',
            lightTheme: 'Light Theme',
            darkTheme: 'Dark Theme',
            french: 'Français',
            english: 'English',
        },
    },
}

function getMenuMessages(locale) {
    return messages[normalizeMenuLocale(locale)]
}

module.exports = {
    normalizeMenuLocale,
    getMenuMessages,
}