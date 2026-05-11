const {createAuditLogService} = require('../audit/auditLogService')
const {getPrisma} = require('../db')

const LEVELS = Object.freeze(['info', 'warning', 'error', 'critical'])
const CURRENCY_RE = /^[A-Z]{3}$/
const TRANSFER_DIRECTIONS = new Set(['OUT', 'IN'])
const TRANSACTION_KINDS = new Set(['INCOME', 'EXPENSE', 'TRANSFER'])

function isValidCurrency(value) {
    return typeof value === 'string' && CURRENCY_RE.test(value.trim().toUpperCase())
}

function isValidDate(value) {
    if (value == null || value === '') return false
    const date = value instanceof Date ? value : new Date(value)
    return !Number.isNaN(date.getTime())
}

function isNumber(value) {
    return typeof value === 'number' && Number.isFinite(value)
}

function isPositive(value) {
    return isNumber(value) && value > 0
}

function isNonNegative(value) {
    return isNumber(value) && value >= 0
}

function dateTime(value) {
    return (value instanceof Date ? value : new Date(value)).getTime()
}

function createIssue(level, code, message, entityType = 'system', entityId = null, details = {}) {
    if (!LEVELS.includes(level)) throw new Error(`Niveau d’intégrité invalide: ${level}`)
    return {
        level,
        code,
        message,
        entityType,
        entityId,
        details: Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined)),
    }
}

function ids(rows) {
    return new Set((rows || []).map((row) => row.id).filter((id) => id != null))
}

function groupBy(rows, field) {
    const groups = new Map()
    for (const row of rows || []) {
        const key = row?.[field]
        if (key == null || key === '') continue
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(row)
    }
    return groups
}

function label(type, row) {
    const id = row?.id ?? 'inconnu'
    const name = row?.label || row?.name || row?.sourceKey || row?.instrumentKey || row?.fileName || ''
    return name ? `${type} ${id} (${name})` : `${type} ${id}`
}

function addReferenceIssue(issues, row, field, lookup, target, entityType, level = 'error') {
    const value = row?.[field]
    if (value == null) return
    if (!lookup.has(value)) {
        issues.push(createIssue(level, 'MISSING_REFERENCE', `${label(entityType, row)} référence ${target} introuvable (${value}).`, entityType, row?.id, {field, referencedId: value}))
    }
}

function addCurrencyIssue(issues, row, field, entityType, level = 'error') {
    const value = row?.[field]
    if (!isValidCurrency(value)) {
        issues.push(createIssue(level, 'INVALID_CURRENCY', `${label(entityType, row)} utilise une devise invalide.`, entityType, row?.id, {field, value}))
    }
}

function addOptionalCurrencyIssue(issues, row, field, entityType, level = 'error') {
    const value = row?.[field]
    if (value != null && value !== '' && !isValidCurrency(value)) addCurrencyIssue(issues, row, field, entityType, level)
}

function addDateIssue(issues, row, field, entityType, level = 'error') {
    const value = row?.[field]
    if (!isValidDate(value)) {
        issues.push(createIssue(level, 'INVALID_DATE', `${label(entityType, row)} contient une date invalide.`, entityType, row?.id, {field, value}))
    }
}

function addOptionalDateIssue(issues, row, field, entityType, level = 'error') {
    const value = row?.[field]
    if (value != null && value !== '' && !isValidDate(value)) addDateIssue(issues, row, field, entityType, level)
}

function addPositiveIssue(issues, row, field, entityType, level = 'error') {
    const value = row?.[field]
    if (!isPositive(value)) {
        issues.push(createIssue(level, 'INVALID_AMOUNT', `${label(entityType, row)} contient un montant invalide.`, entityType, row?.id, {field, value}))
    }
}

function addOptionalPositiveIssue(issues, row, field, entityType, level = 'error') {
    const value = row?.[field]
    if (value != null && !isPositive(value)) addPositiveIssue(issues, row, field, entityType, level)
}

function addNonNegativeIssue(issues, row, field, entityType, level = 'error') {
    const value = row?.[field]
    if (!isNonNegative(value)) {
        issues.push(createIssue(level, 'INVALID_AMOUNT', `${label(entityType, row)} contient une valeur négative ou invalide.`, entityType, row?.id, {field, value}))
    }
}

function addOptionalNonNegativeIssue(issues, row, field, entityType, level = 'error') {
    const value = row?.[field]
    if (value != null && !isNonNegative(value)) addNonNegativeIssue(issues, row, field, entityType, level)
}

async function readRows(prisma, model, issues, required = false) {
    const delegate = prisma?.[model]
    if (!delegate || typeof delegate.findMany !== 'function') return []
    try {
        return await delegate.findMany()
    } catch (error) {
        issues.push(createIssue(required ? 'critical' : 'warning', 'MODEL_QUERY_FAILED', `Lecture impossible pour ${model}.`, model, null, {reason: error instanceof Error ? error.message : String(error)}))
        return []
    }
}

function checkAccounts(issues, accounts) {
    for (const account of accounts) {
        addCurrencyIssue(issues, account, 'currency', 'account')
        addOptionalDateIssue(issues, account, 'openedAt', 'account', 'warning')
        addOptionalDateIssue(issues, account, 'closedAt', 'account', 'warning')
        if (isValidDate(account.openedAt) && isValidDate(account.closedAt) && dateTime(account.closedAt) < dateTime(account.openedAt)) {
            issues.push(createIssue('warning', 'ACCOUNT_CLOSED_BEFORE_OPENED', `${label('account', account)} est fermé avant son ouverture.`, 'account', account.id))
        }
    }
}

function checkTransactions(issues, transactions, accounts, categories) {
    const accountIds = ids(accounts)
    const categoryIds = ids(categories)
    const categoriesById = new Map(categories.map((category) => [category.id, category]))

    for (const transaction of transactions) {
        addReferenceIssue(issues, transaction, 'accountId', accountIds, 'un compte', 'transaction', 'critical')
        addPositiveIssue(issues, transaction, 'amount', 'transaction')
        addOptionalPositiveIssue(issues, transaction, 'sourceAmount', 'transaction')
        addOptionalPositiveIssue(issues, transaction, 'exchangeRate', 'transaction')
        addDateIssue(issues, transaction, 'date', 'transaction')
        addOptionalDateIssue(issues, transaction, 'exchangeDate', 'transaction', 'warning')
        addOptionalCurrencyIssue(issues, transaction, 'sourceCurrency', 'transaction')
        addOptionalCurrencyIssue(issues, transaction, 'taxWithheldCurrency', 'transaction', 'warning')

        if (!TRANSACTION_KINDS.has(transaction.kind)) {
            issues.push(createIssue('error', 'INVALID_TRANSACTION_KIND', `${label('transaction', transaction)} a un type invalide.`, 'transaction', transaction.id, {kind: transaction.kind}))
        }

        if (transaction.categoryId != null) {
            addReferenceIssue(issues, transaction, 'categoryId', categoryIds, 'une catégorie', 'transaction', 'error')
            const category = categoriesById.get(transaction.categoryId)
            if (category && transaction.kind !== 'TRANSFER' && category.kind !== transaction.kind) {
                issues.push(createIssue('warning', 'TRANSACTION_CATEGORY_KIND_MISMATCH', `${label('transaction', transaction)} utilise une catégorie ${category.kind} pour ${transaction.kind}.`, 'transaction', transaction.id, {categoryId: category.id}))
            }
        } else if (transaction.kind === 'INCOME' || transaction.kind === 'EXPENSE') {
            issues.push(createIssue('warning', 'TRANSACTION_CATEGORY_MISSING_OPTIONAL', `${label('transaction', transaction)} n’a pas de catégorie.`, 'transaction', transaction.id))
        }

        if (transaction.kind !== 'TRANSFER' && (transaction.transferGroup || transaction.transferDirection || transaction.transferPeerAccountId != null)) {
            issues.push(createIssue('error', 'NON_TRANSFER_WITH_TRANSFER_METADATA', `${label('transaction', transaction)} n’est pas un transfert mais contient des métadonnées de transfert.`, 'transaction', transaction.id))
        }
        if (transaction.kind === 'TRANSFER' && transaction.categoryId != null) {
            issues.push(createIssue('warning', 'TRANSFER_CATEGORY_PRESENT', `${label('transaction', transaction)} est un transfert avec une catégorie.`, 'transaction', transaction.id))
        }
    }

    checkTransfers(issues, transactions, accountIds)
}

function checkTransfers(issues, transactions, accountIds) {
    const grouped = groupBy(transactions.filter((transaction) => transaction.kind === 'TRANSFER' || transaction.transferGroup), 'transferGroup')

    for (const transaction of transactions) {
        if (transaction.kind !== 'TRANSFER' || !transaction.transferGroup) continue
        if (!TRANSFER_DIRECTIONS.has(transaction.transferDirection)) {
            issues.push(createIssue('critical', 'TRANSFER_DIRECTION_INVALID', `${label('transaction', transaction)} a une direction de transfert invalide.`, 'transaction', transaction.id))
        }
        addReferenceIssue(issues, transaction, 'transferPeerAccountId', accountIds, 'le compte pair du transfert', 'transaction', 'critical')
        if (transaction.transferPeerAccountId === transaction.accountId) {
            issues.push(createIssue('critical', 'TRANSFER_PEER_SAME_ACCOUNT', `${label('transaction', transaction)} pointe vers le même compte.`, 'transaction', transaction.id))
        }
    }

    for (const [transferGroup, rows] of grouped.entries()) {
        if (rows.length !== 2) {
            issues.push(createIssue('critical', 'TRANSFER_GROUP_SIZE_INVALID', `Le transfert interne ${transferGroup} contient ${rows.length} ligne(s) au lieu de 2.`, 'transferGroup', transferGroup, {transactionIds: rows.map((row) => row.id)}))
            continue
        }
        const out = rows.find((row) => row.transferDirection === 'OUT')
        const input = rows.find((row) => row.transferDirection === 'IN')
        if (!out || !input) {
            issues.push(createIssue('critical', 'TRANSFER_GROUP_DIRECTION_PAIR_INVALID', `Le transfert interne ${transferGroup} doit avoir une ligne OUT et une ligne IN.`, 'transferGroup', transferGroup))
            continue
        }
        if (out.accountId === input.accountId) {
            issues.push(createIssue('critical', 'TRANSFER_GROUP_SAME_ACCOUNT', `Le transfert interne ${transferGroup} utilise deux fois le même compte.`, 'transferGroup', transferGroup))
        }
        if (out.transferPeerAccountId !== input.accountId || input.transferPeerAccountId !== out.accountId) {
            issues.push(createIssue('critical', 'TRANSFER_GROUP_PEER_MISMATCH', `Le transfert interne ${transferGroup} ne croise pas correctement les comptes.`, 'transferGroup', transferGroup))
        }
        if (isValidDate(out.date) && isValidDate(input.date) && dateTime(out.date) !== dateTime(input.date)) {
            issues.push(createIssue('warning', 'TRANSFER_GROUP_DATE_MISMATCH', `Le transfert interne ${transferGroup} a des dates différentes.`, 'transferGroup', transferGroup))
        }
    }
}

function checkBudgets(issues, budgets, categories) {
    const categoryIds = ids(categories)
    for (const budget of budgets) {
        addReferenceIssue(issues, budget, 'categoryId', categoryIds, 'une catégorie', 'budgetTarget', 'critical')
        addPositiveIssue(issues, budget, 'amount', 'budgetTarget')
        addCurrencyIssue(issues, budget, 'currency', 'budgetTarget')
        addDateIssue(issues, budget, 'startDate', 'budgetTarget')
        addOptionalDateIssue(issues, budget, 'endDate', 'budgetTarget')
        if (isValidDate(budget.startDate) && isValidDate(budget.endDate) && dateTime(budget.endDate) < dateTime(budget.startDate)) {
            issues.push(createIssue('error', 'BUDGET_DATE_RANGE_INVALID', `${label('budgetTarget', budget)} se termine avant son début.`, 'budgetTarget', budget.id))
        }
    }
}

function checkRecurring(issues, templates, accounts, categories) {
    const accountIds = ids(accounts)
    const categoryIds = ids(categories)
    const categoriesById = new Map(categories.map((category) => [category.id, category]))
    for (const template of templates) {
        addReferenceIssue(issues, template, 'accountId', accountIds, 'un compte', 'recurringTemplate', 'critical')
        addReferenceIssue(issues, template, 'categoryId', categoryIds, 'une catégorie', 'recurringTemplate', 'error')
        const category = categoriesById.get(template.categoryId)
        if (category && template.kind !== 'TRANSFER' && category.kind !== template.kind) {
            issues.push(createIssue('warning', 'RECURRING_CATEGORY_KIND_MISMATCH', `${label('recurringTemplate', template)} utilise une catégorie ${category.kind} pour ${template.kind}.`, 'recurringTemplate', template.id))
        }
        addPositiveIssue(issues, template, 'sourceAmount', 'recurringTemplate')
        addOptionalPositiveIssue(issues, template, 'accountAmount', 'recurringTemplate')
        addOptionalPositiveIssue(issues, template, 'exchangeRate', 'recurringTemplate')
        addCurrencyIssue(issues, template, 'sourceCurrency', 'recurringTemplate')
        addDateIssue(issues, template, 'startDate', 'recurringTemplate')
        addDateIssue(issues, template, 'nextOccurrenceDate', 'recurringTemplate')
        addOptionalDateIssue(issues, template, 'endDate', 'recurringTemplate')
        if (!Number.isInteger(template.intervalCount) || template.intervalCount <= 0) {
            issues.push(createIssue('error', 'RECURRING_INTERVAL_INVALID', `${label('recurringTemplate', template)} a un intervalle invalide.`, 'recurringTemplate', template.id))
        }
        if (isValidDate(template.startDate) && isValidDate(template.nextOccurrenceDate) && dateTime(template.nextOccurrenceDate) < dateTime(template.startDate)) {
            issues.push(createIssue('error', 'RECURRING_NEXT_BEFORE_START', `${label('recurringTemplate', template)} a une prochaine occurrence avant son début.`, 'recurringTemplate', template.id))
        }
    }
}

function checkWealth(issues, context) {
    const accountIds = ids(context.accounts)
    const assetIds = ids(context.assets)
    const portfolioIds = ids(context.portfolios)
    const liabilityIds = ids(context.liabilities)
    const marketInstrumentIds = ids(context.marketInstruments)
    const holdingLotIds = ids(context.holdingLots)
    const investmentInstrumentIds = ids(context.investmentInstruments)
    const investmentPositionIds = ids(context.investmentPositions)

    for (const asset of context.assets) {
        addCurrencyIssue(issues, asset, 'currency', 'asset')
        addNonNegativeIssue(issues, asset, 'currentValue', 'asset')
        addOptionalNonNegativeIssue(issues, asset, 'acquisitionValue', 'asset')
        addReferenceIssue(issues, asset, 'marketInstrumentId', marketInstrumentIds, 'un instrument de marché', 'asset', 'warning')
        if (!isNumber(asset.ownershipPercent) || asset.ownershipPercent < 0 || asset.ownershipPercent > 100) {
            issues.push(createIssue('warning', 'OWNERSHIP_PERCENT_INVALID', `${label('asset', asset)} a un pourcentage de propriété incohérent.`, 'asset', asset.id))
        }
    }
    for (const portfolio of context.portfolios) {
        addCurrencyIssue(issues, portfolio, 'currency', 'portfolio')
        addNonNegativeIssue(issues, portfolio, 'currentValue', 'portfolio')
        addNonNegativeIssue(issues, portfolio, 'cashBalance', 'portfolio')
        addReferenceIssue(issues, portfolio, 'accountId', accountIds, 'un compte', 'portfolio', 'error')
    }
    for (const liability of context.liabilities) {
        addCurrencyIssue(issues, liability, 'currency', 'liability')
        addNonNegativeIssue(issues, liability, 'currentBalance', 'liability')
        addOptionalNonNegativeIssue(issues, liability, 'initialAmount', 'liability')
        addOptionalNonNegativeIssue(issues, liability, 'minimumPayment', 'liability')
        addReferenceIssue(issues, liability, 'securedAssetId', assetIds, 'un actif garanti', 'liability', 'warning')
        addReferenceIssue(issues, liability, 'accountId', accountIds, 'un compte', 'liability', 'warning')
    }
    for (const holding of context.holdingLots) {
        addReferenceIssue(issues, holding, 'portfolioId', portfolioIds, 'un portfolio', 'holdingLot', 'critical')
        addReferenceIssue(issues, holding, 'marketInstrumentId', marketInstrumentIds, 'un instrument de marché', 'holdingLot', 'warning')
        addCurrencyIssue(issues, holding, 'currency', 'holdingLot')
        addNonNegativeIssue(issues, holding, 'quantity', 'holdingLot')
    }
    for (const position of context.investmentPositions) {
        addReferenceIssue(issues, position, 'portfolioId', portfolioIds, 'un portfolio', 'investmentPosition', 'critical')
        addReferenceIssue(issues, position, 'accountId', accountIds, 'un compte', 'investmentPosition', 'critical')
        addReferenceIssue(issues, position, 'instrumentId', investmentInstrumentIds, 'un instrument d’investissement', 'investmentPosition', 'critical')
        addNonNegativeIssue(issues, position, 'quantity', 'investmentPosition')
        addCurrencyIssue(issues, position, 'costCurrency', 'investmentPosition')
    }
    for (const movement of context.investmentMovements) {
        addReferenceIssue(issues, movement, 'portfolioId', portfolioIds, 'un portfolio', 'investmentMovement', 'critical')
        addReferenceIssue(issues, movement, 'accountId', accountIds, 'un compte', 'investmentMovement', 'critical')
        addReferenceIssue(issues, movement, 'instrumentId', investmentInstrumentIds, 'un instrument d’investissement', 'investmentMovement', 'warning')
        addReferenceIssue(issues, movement, 'positionId', investmentPositionIds, 'une position d’investissement', 'investmentMovement', 'warning')
        addCurrencyIssue(issues, movement, 'priceCurrency', 'investmentMovement')
        addCurrencyIssue(issues, movement, 'cashCurrency', 'investmentMovement')
        addCurrencyIssue(issues, movement, 'feeCurrency', 'investmentMovement')
        addDateIssue(issues, movement, 'operationDate', 'investmentMovement')
    }
    for (const snapshot of context.priceSnapshots) {
        addPositiveIssue(issues, snapshot, 'unitPrice', 'priceSnapshot')
        addCurrencyIssue(issues, snapshot, 'currency', 'priceSnapshot')
        addDateIssue(issues, snapshot, 'pricedAt', 'priceSnapshot')
        addReferenceIssue(issues, snapshot, 'holdingLotId', holdingLotIds, 'un lot', 'priceSnapshot', 'warning')
        addReferenceIssue(issues, snapshot, 'marketInstrumentId', marketInstrumentIds, 'un instrument', 'priceSnapshot', 'warning')
        addReferenceIssue(issues, snapshot, 'investmentPositionId', investmentPositionIds, 'une position', 'priceSnapshot', 'warning')
    }
    for (const instrument of context.marketInstruments) addCurrencyIssue(issues, instrument, 'quoteCurrency', 'marketInstrument')
    for (const instrument of context.investmentInstruments) {
        addCurrencyIssue(issues, instrument, 'currency', 'investmentInstrument')
        addReferenceIssue(issues, instrument, 'marketInstrumentId', marketInstrumentIds, 'un instrument de marché', 'investmentInstrument', 'warning')
    }
    for (const snapshot of context.netWorthSnapshots) {
        addCurrencyIssue(issues, snapshot, 'currency', 'netWorthSnapshot')
        addDateIssue(issues, snapshot, 'snapshotDate', 'netWorthSnapshot')
        for (const field of ['totalStandaloneAssets', 'totalPortfolios', 'totalAssets', 'totalLiabilities', 'netWorth']) {
            if (!isNumber(snapshot[field])) issues.push(createIssue('error', 'NET_WORTH_SNAPSHOT_VALUE_INVALID', `${label('netWorthSnapshot', snapshot)} contient une valeur non numérique.`, 'netWorthSnapshot', snapshot.id, {field}))
        }
    }
    return {assetIds, portfolioIds, liabilityIds, netWorthSnapshotIds: ids(context.netWorthSnapshots)}
}

function checkGoalsAndProjections(issues, context, lookups) {
    const goalIds = ids(context.financialGoals)
    const scenarioIds = ids(context.projectionScenarios)
    const settingIds = ids(context.projectionSettings)
    for (const goal of context.financialGoals) {
        addPositiveIssue(issues, goal, 'targetAmount', 'financialGoal')
        addCurrencyIssue(issues, goal, 'currency', 'financialGoal')
        addOptionalNonNegativeIssue(issues, goal, 'startingAmount', 'financialGoal')
        addReferenceIssue(issues, goal, 'trackedAssetId', lookups.assetIds, 'un actif', 'financialGoal', 'warning')
        addReferenceIssue(issues, goal, 'trackedPortfolioId', lookups.portfolioIds, 'un portfolio', 'financialGoal', 'warning')
        addReferenceIssue(issues, goal, 'trackedLiabilityId', lookups.liabilityIds, 'un passif', 'financialGoal', 'warning')
        addReferenceIssue(issues, goal, 'baselineNetWorthSnapshotId', lookups.netWorthSnapshotIds, 'un snapshot', 'financialGoal', 'warning')
    }
    for (const setting of context.projectionSettings) {
        addReferenceIssue(issues, setting, 'goalId', goalIds, 'un objectif', 'projectionSetting', 'critical')
        addReferenceIssue(issues, setting, 'scenarioId', scenarioIds, 'un scénario', 'projectionSetting', 'critical')
        addCurrencyIssue(issues, setting, 'displayCurrency', 'projectionSetting')
        if (!Number.isInteger(setting.projectionHorizonMonths) || setting.projectionHorizonMonths <= 0) issues.push(createIssue('error', 'PROJECTION_HORIZON_INVALID', `${label('projectionSetting', setting)} a un horizon invalide.`, 'projectionSetting', setting.id))
    }
    for (const result of context.projectionResults) {
        addReferenceIssue(issues, result, 'goalId', goalIds, 'un objectif', 'projectionResult', 'critical')
        addReferenceIssue(issues, result, 'scenarioId', scenarioIds, 'un scénario', 'projectionResult', 'critical')
        addReferenceIssue(issues, result, 'settingId', settingIds, 'un réglage', 'projectionResult', 'warning')
        addDateIssue(issues, result, 'projectionMonth', 'projectionResult')
        for (const field of ['projectedValue', 'remainingAmount', 'progressPercent']) {
            if (!isNumber(result[field])) issues.push(createIssue('error', 'PROJECTION_RESULT_VALUE_INVALID', `${label('projectionResult', result)} contient une valeur non numérique.`, 'projectionResult', result.id, {field}))
        }
    }
}

function checkImports(issues, context) {
    const accountIds = ids(context.accounts)
    const batchIds = ids(context.importBatches)
    const rawIds = ids(context.importRawRows)
    const normalizedIds = ids(context.importNormalizedRows)
    const decisionIds = ids(context.importReconciliationDecisions)
    const transactionIds = ids(context.transactions)
    const assetIds = ids(context.assets)
    const sourceIds = ids(context.importSources)
    const rawByBatch = groupBy(context.importRawRows, 'batchId')
    const errorsByBatch = groupBy(context.importErrors, 'batchId')

    for (const source of context.importSources) {
        addCurrencyIssue(issues, source, 'defaultCurrency', 'importSource')
        addReferenceIssue(issues, source, 'defaultAccountId', accountIds, 'un compte par défaut', 'importSource', 'warning')
    }
    for (const batch of context.importBatches) {
        addCurrencyIssue(issues, batch, 'defaultCurrency', 'importBatch')
        addReferenceIssue(issues, batch, 'sourceId', sourceIds, 'une source', 'importBatch', 'warning')
        addNonNegativeIssue(issues, batch, 'rowCount', 'importBatch', 'warning')
        addNonNegativeIssue(issues, batch, 'errorCount', 'importBatch', 'warning')
        const rawCount = (rawByBatch.get(batch.id) || []).length
        if (batch.rowCount !== 0 && rawCount !== 0 && batch.rowCount !== rawCount) issues.push(createIssue('warning', 'IMPORT_BATCH_ROW_COUNT_MISMATCH', `${label('importBatch', batch)} a un nombre de lignes incohérent.`, 'importBatch', batch.id))
        const errorCount = (errorsByBatch.get(batch.id) || []).length
        if (batch.errorCount !== errorCount) issues.push(createIssue('warning', 'IMPORT_BATCH_ERROR_COUNT_MISMATCH', `${label('importBatch', batch)} a un nombre d’erreurs incohérent.`, 'importBatch', batch.id))
    }
    for (const row of context.importRawRows) addReferenceIssue(issues, row, 'batchId', batchIds, 'un batch', 'importRawRow', 'critical')
    for (const row of context.importNormalizedRows) {
        addReferenceIssue(issues, row, 'batchId', batchIds, 'un batch', 'importNormalizedRow', 'critical')
        addReferenceIssue(issues, row, 'rawRowId', rawIds, 'une raw row', 'importNormalizedRow', 'warning')
        addOptionalCurrencyIssue(issues, row, 'currency', 'importNormalizedRow', 'warning')
        addOptionalDateIssue(issues, row, 'transactionDate', 'importNormalizedRow', 'warning')
        addOptionalPositiveIssue(issues, row, 'amount', 'importNormalizedRow', 'warning')
    }
    for (const error of context.importErrors) {
        addReferenceIssue(issues, error, 'batchId', batchIds, 'un batch', 'importError', 'critical')
        addReferenceIssue(issues, error, 'rawRowId', rawIds, 'une raw row', 'importError', 'warning')
        addReferenceIssue(issues, error, 'normalizedRowId', normalizedIds, 'une ligne normalisée', 'importError', 'warning')
    }
    for (const decision of context.importReconciliationDecisions) {
        addReferenceIssue(issues, decision, 'batchId', batchIds, 'un batch', 'importReconciliationDecision', 'critical')
        addReferenceIssue(issues, decision, 'normalizedRowId', normalizedIds, 'une ligne normalisée', 'importReconciliationDecision', 'critical')
        addReferenceIssue(issues, decision, 'candidateTransactionId', transactionIds, 'une transaction candidate', 'importReconciliationDecision', 'warning')
        addReferenceIssue(issues, decision, 'candidateAssetId', assetIds, 'un actif candidat', 'importReconciliationDecision', 'warning')
    }
    for (const link of context.importAppliedLinks) {
        addReferenceIssue(issues, link, 'batchId', batchIds, 'un batch', 'importAppliedLink', 'critical')
        addReferenceIssue(issues, link, 'normalizedRowId', normalizedIds, 'une ligne normalisée', 'importAppliedLink', 'warning')
        addReferenceIssue(issues, link, 'decisionId', decisionIds, 'une décision', 'importAppliedLink', 'warning')
        addReferenceIssue(issues, link, 'transactionId', transactionIds, 'une transaction', 'importAppliedLink', 'warning')
        addReferenceIssue(issues, link, 'assetId', assetIds, 'un actif', 'importAppliedLink', 'warning')
    }
}

function summarize(issues) {
    const totals = {info: 0, warning: 0, error: 0, critical: 0}
    for (const issue of issues) totals[issue.level] += 1
    const ok = totals.error === 0 && totals.critical === 0
    return {
        ok,
        totals,
        summary: ok
            ? (totals.warning > 0 ? `Contrôle d’intégrité terminé avec ${totals.warning} avertissement(s).` : 'Contrôle d’intégrité terminé sans anomalie.')
            : `Contrôle d’intégrité échoué: ${totals.error} erreur(s), ${totals.critical} critique(s).`,
    }
}

function createIntegrityCheckService({prisma = null, auditLog = null, clock = () => new Date(), logger = console} = {}) {
    const db = prisma || getPrisma()
    const audit = auditLog || createAuditLogService({prisma: db})

    async function run(options = {}) {
        const issues = []
        const context = {
            accounts: await readRows(db, 'account', issues, true),
            categories: await readRows(db, 'category', issues, true),
            transactions: await readRows(db, 'transaction', issues, true),
            budgetTargets: await readRows(db, 'budgetTarget', issues, true),
            recurringTemplates: await readRows(db, 'recurringTransactionTemplate', issues, true),
            assets: await readRows(db, 'asset', issues),
            portfolios: await readRows(db, 'portfolio', issues),
            liabilities: await readRows(db, 'liability', issues),
            marketInstruments: await readRows(db, 'marketInstrument', issues),
            holdingLots: await readRows(db, 'holdingLot', issues),
            priceSnapshots: await readRows(db, 'priceSnapshot', issues),
            investmentInstruments: await readRows(db, 'investmentInstrument', issues),
            investmentPositions: await readRows(db, 'investmentPosition', issues),
            investmentMovements: await readRows(db, 'investmentMovement', issues),
            netWorthSnapshots: await readRows(db, 'netWorthSnapshot', issues),
            financialGoals: await readRows(db, 'financialGoal', issues),
            projectionScenarios: await readRows(db, 'projectionScenario', issues),
            projectionSettings: await readRows(db, 'projectionSetting', issues),
            projectionResults: await readRows(db, 'projectionResult', issues),
            importSources: await readRows(db, 'importSource', issues),
            importBatches: await readRows(db, 'importBatch', issues),
            importRawRows: await readRows(db, 'importRawRow', issues),
            importNormalizedRows: await readRows(db, 'importNormalizedRow', issues),
            importErrors: await readRows(db, 'importError', issues),
            importReconciliationDecisions: await readRows(db, 'importReconciliationDecision', issues),
            importAppliedLinks: await readRows(db, 'importAppliedLink', issues),
        }

        checkAccounts(issues, context.accounts)
        checkTransactions(issues, context.transactions, context.accounts, context.categories)
        checkBudgets(issues, context.budgetTargets, context.categories)
        checkRecurring(issues, context.recurringTemplates, context.accounts, context.categories)
        const wealthLookups = checkWealth(issues, context)
        checkGoalsAndProjections(issues, context, wealthLookups)
        checkImports(issues, context)

        const status = summarize(issues)
        const report = {
            ...status,
            generatedAt: clock().toISOString(),
            source: options.source || 'manual',
            reason: options.reason || null,
            issueCount: issues.length,
            issues,
        }

        if (report.totals.critical > 0 && options.auditCritical !== false) {
            try {
                if (typeof audit?.recordAuditEvent === 'function') {
                    await audit.recordAuditEvent({
                        eventType: 'integrityCheckFailed',
                        domain: 'integrity',
                        action: options.reason || 'check',
                        severity: 'CRITICAL',
                        status: 'FAILED',
                        summary: `Contrôle d’intégrité critique: ${report.totals.critical} anomalie(s) critique(s).`,
                        source: report.source,
                        entityIds: issues.filter((issue) => issue.level === 'critical').slice(0, 20).map((issue) => ({type: issue.entityType, id: issue.entityId})),
                        metadata: {
                            totals: report.totals,
                            issueCount: report.issueCount,
                            criticalCodes: issues.filter((issue) => issue.level === 'critical').slice(0, 20).map((issue) => issue.code),
                        },
                    })
                } else if (typeof audit?.logIntegrityCheck === 'function') {
                    await audit.logIntegrityCheck({ok: false, severity: 'CRITICAL', source: report.source, reason: report.reason, metadata: {totals: report.totals, issueCount: report.issueCount}})
                }
            } catch (error) {
                logger?.warn?.('[integrity] audit write failed', error)
            }
        }

        return report
    }

    return {run}
}

module.exports = {
    LEVELS,
    createIntegrityCheckService,
    createIssue,
    isValidCurrency,
    summarize,
}
