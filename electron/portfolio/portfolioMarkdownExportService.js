function money(value, currency = 'CAD') {
    const amount = Number(value || 0)
    return new Intl.NumberFormat('fr-CA', {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0)
}

function percent(value) {
    if (value == null || !Number.isFinite(Number(value))) return '—'
    return `${Number(value).toFixed(2)}%`
}

function dateLabel(value) {
    if (!value) return '—'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return '—'
    return parsed.toISOString().slice(0, 10)
}

function table(headers, rows) {
    if (!rows.length) return '_Aucune donnée._\n'
    return [
        `| ${headers.join(' | ')} |`,
        `| ${headers.map(() => '---').join(' | ')} |`,
        ...rows.map((row) => `| ${row.join(' | ')} |`),
    ].join('\n') + '\n'
}

function allocationRows(groups = [], currency) {
    return groups.slice(0, 12).map((group) => [
        group.label || group.key || 'Non classé',
        money(group.marketValue, currency),
        percent(group.allocationPercent),
        String(group.positionsCount || 0),
        group.completenessStatus || 'unknown',
    ])
}

function historyRows(points = [], currency) {
    return points.slice(-12).map((point) => [
        dateLabel(point.snapshotDate),
        money(point.totalMarketValue, point.currency || currency),
        money(point.totalInvestedCost, point.currency || currency),
        money(point.totalUnrealizedGain, point.currency || currency),
        point.completenessStatus || 'UNKNOWN',
    ])
}

function warningRows(warnings = []) {
    return warnings.slice(0, 20).map((warning) => [
        warning.positionId == null ? '—' : String(warning.positionId),
        String(warning.warning || warning.message || warning),
    ])
}

function exportPortfolioDashboardMarkdown(dashboard = {}, options = {}) {
    const currency = dashboard.baseCurrency || options.currency || 'CAD'
    const generatedAt = options.generatedAt || dashboard.asOf || new Date().toISOString()
    const kpis = dashboard.kpis || {}
    const dataStatus = dashboard.dataStatus || {}
    const allocationBlocks = dashboard.allocationBlocks || {}
    const lines = []

    lines.push(`# Résumé Portfolio analytics`)
    lines.push('')
    lines.push(`Généré le ${dateLabel(generatedAt)} en ${currency}.`)
    lines.push('')
    lines.push('## KPI')
    lines.push('')
    lines.push(table(
        ['Indicateur', 'Valeur'],
        [
            ['Valeur totale du portefeuille', money(kpis.totalMarketValue, currency)],
            ['Coût total investi', money(kpis.totalInvestedCost, currency)],
            ['Plus-value latente', money(kpis.totalUnrealizedGain, currency)],
            ['Plus-value latente %', percent(kpis.totalUnrealizedGainPercent)],
            ['Revenus sur période', money(kpis.periodIncome, currency)],
            ['Frais sur période', money(kpis.periodFees, currency)],
            ['Revenu net', money(kpis.netIncome, currency)],
        ],
    ))

    lines.push('## Qualité des données')
    lines.push('')
    lines.push(table(
        ['Statut', 'Nombre'],
        [
            ['Prix frais', String(dataStatus.fresh || 0)],
            ['Prix stale', String(dataStatus.stale || 0)],
            ['Valeur manuelle', String(dataStatus.manual || 0)],
            ['Prix manquant', String(dataStatus.missing || 0)],
            ['Erreur', String(dataStatus.error || 0)],
        ],
    ))

    lines.push('## Allocations')
    for (const [title, key] of [
        ['Par actif', 'asset'],
        ['Par classe d’actifs', 'assetClass'],
        ['Par secteur', 'sector'],
        ['Par géographie', 'geography'],
        ['Par devise', 'currency'],
    ]) {
        lines.push(`### ${title}`)
        lines.push('')
        lines.push(table(['Groupe', 'Valeur', 'Allocation', 'Positions', 'Complétude'], allocationRows(allocationBlocks[key] || [], currency)))
    }

    lines.push('## Historique local')
    lines.push('')
    lines.push(table(['Date', 'Valeur', 'Coût investi', 'Plus-value', 'Statut'], historyRows(dashboard.history || [], currency)))

    lines.push('## Warnings')
    lines.push('')
    lines.push(table(['Position', 'Message'], warningRows(dashboard.warnings || [])))

    lines.push('## Limites MVP')
    lines.push('')
    lines.push('- Coût moyen pondéré simple, pas FIFO/LIFO fiscal.')
    lines.push('- Rendement brut simple, pas TWR/IRR/XIRR.')
    lines.push('- Les prix stale et valeurs manuelles sont affichés explicitement mais restent moins fiables qu’un prix frais.')
    lines.push('- Les positions sans prix restent visibles mais ne doivent pas être interprétées comme valorisées à zéro.')
    lines.push('')

    return lines.join('\n')
}

module.exports = {
    exportPortfolioDashboardMarkdown,
}
