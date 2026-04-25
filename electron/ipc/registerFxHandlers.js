const {ipcMain} = require('electron')
const {requireDate, toDateOnly} = require('../utils/date')

function normalizeText(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function normalizeCurrency(value) {
    return (normalizeText(value) || '').toUpperCase()
}

function requirePositiveNumber(value, fieldName) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${fieldName} doit être un nombre strictement positif.`)
    }
    return parsed
}

function roundCurrency(value) {
    return Math.round(value * 100) / 100
}

function toIsoDay(date) {
    return toDateOnly(requireDate(date))
}

async function getHistoricalQuote(data) {
    const from = normalizeCurrency(data?.from)
    const to = normalizeCurrency(data?.to)
    const amount = requirePositiveNumber(data?.amount, 'Le montant')
    const date = toIsoDay(requireDate(data?.date))

    if (!from || !to) {
        throw new Error('Les devises sont obligatoires.')
    }

    if (from === to) {
        return {
            from,
            to,
            rate: 1,
            convertedAmount: roundCurrency(amount),
            provider: 'ACCOUNT',
            date,
        }
    }

    const url = new URL('https://api.frankfurter.dev/v2/rates')
    url.searchParams.set('base', from)
    url.searchParams.set('quotes', to)
    url.searchParams.set('date', date)
    url.searchParams.set('providers', 'ECB')

    const response = await fetch(url)
    if (!response.ok) {
        throw new Error('Impossible de récupérer le taux de change historique.')
    }

    const payload = await response.json()
    const first = Array.isArray(payload) ? payload[0] : null
    const rate = Number(first?.rate)

    if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error('Taux de change historique indisponible pour cette date.')
    }

    return {
        from,
        to,
        rate,
        convertedAmount: roundCurrency(amount * rate),
        provider: 'ECB via Frankfurter',
        date: first?.date || date,
    }
}

function registerFxHandlers() {
    ipcMain.handle('fx:quote-historical', async (_event, data) => {
        return getHistoricalQuote(data)
    })
}

module.exports = {
    registerFxHandlers,
    getHistoricalQuote,
}