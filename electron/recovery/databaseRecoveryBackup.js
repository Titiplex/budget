function toIso(value) {
    if (!value) return null
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function toDateOnly(value) {
    const iso = toIso(value)
    return iso ? iso.slice(0, 10) : null
}

function mapAccount(row) {
    return {
        id: row.id,
        name: row.name,
        type: row.type,
        currency: row.currency,
        description: row.description || null,
        institutionCountry: row.institutionCountry || null,
        institutionRegion: row.institutionRegion || null,
        taxReportingType: row.taxReportingType || 'STANDARD',
        openedAt: toDateOnly(row.openedAt),
        closedAt: toDateOnly(row.closedAt),
    }
}

function mapCategory(row) {
    return {
        id: row.id,
        name: row.name,
        kind: row.kind,
        color: row.color || null,
        description: row.description || null,
    }
}

function mapTransaction(row) {
    return {
        id: row.id,
        label: row.label,
        amount: Number(row.amount || 0),
        sourceAmount: row.sourceAmount == null ? null : Number(row.sourceAmount),
        sourceCurrency: row.sourceCurrency || null,
        conversionMode: row.conversionMode || 'NONE',
        exchangeRate: row.exchangeRate == null ? null : Number(row.exchangeRate),
        exchangeProvider: row.exchangeProvider || null,
        exchangeDate: toDateOnly(row.exchangeDate),
        kind: row.kind,
        date: toDateOnly(row.date),
        note: row.note || null,
        taxCategory: row.taxCategory || null,
        taxSourceCountry: row.taxSourceCountry || null,
        taxSourceRegion: row.taxSourceRegion || null,
        taxTreatment: row.taxTreatment || 'UNKNOWN',
        taxWithheldAmount: row.taxWithheldAmount == null ? null : Number(row.taxWithheldAmount),
        taxWithheldCurrency: row.taxWithheldCurrency || null,
        taxWithheldCountry: row.taxWithheldCountry || null,
        taxDocumentRef: row.taxDocumentRef || null,
        accountId: row.accountId,
        categoryId: row.categoryId ?? null,
        transferGroup: row.transferGroup || null,
        transferDirection: row.transferDirection || null,
        transferPeerAccountId: row.transferPeerAccountId ?? null,
    }
}

function mapBudgetTarget(row) {
    return {
        id: row.id,
        name: row.name,
        amount: Number(row.amount || 0),
        period: row.period,
        startDate: toDateOnly(row.startDate),
        endDate: toDateOnly(row.endDate),
        currency: row.currency,
        isActive: row.isActive !== false,
        note: row.note || null,
        categoryId: row.categoryId,
    }
}

function mapRecurringTemplate(row) {
    return {
        id: row.id,
        label: row.label,
        sourceAmount: Number(row.sourceAmount || 0),
        sourceCurrency: row.sourceCurrency,
        accountAmount: row.accountAmount == null ? null : Number(row.accountAmount),
        conversionMode: row.conversionMode || 'NONE',
        exchangeRate: row.exchangeRate == null ? null : Number(row.exchangeRate),
        exchangeProvider: row.exchangeProvider || null,
        kind: row.kind,
        note: row.note || null,
        frequency: row.frequency,
        intervalCount: row.intervalCount || 1,
        startDate: toDateOnly(row.startDate),
        nextOccurrenceDate: toDateOnly(row.nextOccurrenceDate),
        endDate: toDateOnly(row.endDate),
        isActive: row.isActive !== false,
        accountId: row.accountId,
        categoryId: row.categoryId ?? null,
    }
}

function mapTaxProfile(row) {
    return {
        id: row.id,
        year: row.year,
        residenceCountry: row.residenceCountry,
        residenceRegion: row.residenceRegion || null,
        currency: row.currency,
    }
}

function emptyImportBackup(exportedAt) {
    return {
        schemaVersion: 1,
        documentation: {
            included: ['Snapshot local de récupération avant action destructive.'],
            excluded: ['Secrets locaux', 'Mots de passe', 'Tokens et clés API'],
            notes: ['Snapshot généré automatiquement dans le dossier userData local.'],
        },
        mappingTemplates: [],
        importSources: [],
        importHistory: [],
        metadata: {
            exportedAt,
            auditOnlyRestore: true,
            financialDataNotRestoredFromImportHistory: true,
        },
    }
}

async function findMany(prisma, model, options = {}) {
    const delegate = prisma?.[model]
    if (!delegate || typeof delegate.findMany !== 'function') return []
    return delegate.findMany(options)
}

async function buildRecoveryBackupContent(prisma, {exportedAt = new Date().toISOString(), reason = 'recovery-snapshot'} = {}) {
    const [accounts, categories, transactions, budgetTargets, recurringTemplates, taxProfiles] = await Promise.all([
        findMany(prisma, 'account', {orderBy: {id: 'asc'}}),
        findMany(prisma, 'category', {orderBy: {id: 'asc'}}),
        findMany(prisma, 'transaction', {orderBy: {id: 'asc'}}),
        findMany(prisma, 'budgetTarget', {orderBy: {id: 'asc'}}),
        findMany(prisma, 'recurringTransactionTemplate', {orderBy: {id: 'asc'}}),
        findMany(prisma, 'taxProfile', {orderBy: {id: 'asc'}}),
    ])

    return `${JSON.stringify({
        kind: 'budget-backup',
        version: 6,
        exportedAt,
        recoverySnapshot: {
            reason,
            secretsIncluded: false,
        },
        data: {
            accounts: accounts.map(mapAccount),
            categories: categories.map(mapCategory),
            budgetTargets: budgetTargets.map(mapBudgetTarget),
            recurringTemplates: recurringTemplates.map(mapRecurringTemplate),
            transactions: transactions.map(mapTransaction),
            taxProfiles: taxProfiles.map(mapTaxProfile),
            financialGoals: [],
            projectionScenarios: [],
            projectionSettings: null,
            importBackup: emptyImportBackup(exportedAt),
        },
    }, null, 2)}\n`
}

async function createDatabaseRecoverySnapshot({prisma, recoverySnapshots, operationType, reason, source}) {
    if (!recoverySnapshots || typeof recoverySnapshots.createSnapshot !== 'function') return null
    const content = await buildRecoveryBackupContent(prisma, {reason})
    return recoverySnapshots.createSnapshot({content, operationType, reason, source})
}

module.exports = {
    buildRecoveryBackupContent,
    createDatabaseRecoverySnapshot,
}
