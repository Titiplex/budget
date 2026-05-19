import {CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection} from '@capacitor-community/sqlite'
import type {Account, Category, Transaction} from '../../types/budget'
import type {
    BudgetRepository,
    CreateAccountInput,
    CreateCategoryInput,
    CreateTransactionInput,
    UpdateAccountInput,
    UpdateCategoryInput,
    UpdateTransactionInput,
} from './budgetRepository'

const DATABASE_NAME = 'budget'
const DATABASE_VERSION = 1

let dbPromise: Promise<SQLiteDBConnection> | null = null

function nowIso() {
    return new Date().toISOString()
}

function normalizeText(value: unknown) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function requireText(value: unknown, fieldName: string) {
    const normalized = normalizeText(value)
    if (!normalized) throw new Error(`${fieldName} est obligatoire.`)
    return normalized
}

function normalizeCurrency(value: unknown) {
    return (normalizeText(value) || 'CAD').toUpperCase()
}

function requirePositiveNumber(value: unknown, fieldName: string) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${fieldName} doit être un nombre strictement positif.`)
    }
    return parsed
}

function requireId(value: unknown, fieldName: string) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${fieldName} est invalide.`)
    }
    return parsed
}

function requireDate(value: unknown) {
    const normalized = requireText(value, 'La date')
    const date = new Date(normalized)
    if (Number.isNaN(date.getTime())) throw new Error('La date est invalide.')
    return normalized.length === 10 ? normalized : date.toISOString()
}

function normalizeConversionMode(value: unknown, sourceCurrency: string, accountCurrency: string) {
    const normalized = normalizeText(value)?.toUpperCase()

    if (sourceCurrency === accountCurrency) return 'NONE'
    if (normalized === 'MANUAL' || normalized === 'AUTOMATIC') return normalized

    throw new Error('Le mode de conversion est invalide.')
}

function ensureUuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }

    return `transfer-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function openDatabase() {
    if (!dbPromise) {
        dbPromise = (async () => {
            const sqlite = new SQLiteConnection(CapacitorSQLite)
            const connection = await sqlite.createConnection(DATABASE_NAME, false, 'no-encryption', DATABASE_VERSION, false)
            await connection.open()
            await runMigrations(connection)
            return connection
        })()
    }

    return dbPromise
}

async function runMigrations(db: SQLiteDBConnection) {
    await db.execute(`
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            currency TEXT NOT NULL DEFAULT 'CAD',
            description TEXT,
            institutionCountry TEXT,
            institutionRegion TEXT,
            taxReportingType TEXT NOT NULL DEFAULT 'STANDARD',
            openedAt TEXT,
            closedAt TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            kind TEXT NOT NULL,
            color TEXT,
            description TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL,
            amount REAL NOT NULL,
            sourceAmount REAL,
            sourceCurrency TEXT,
            conversionMode TEXT NOT NULL DEFAULT 'NONE',
            exchangeRate REAL,
            exchangeProvider TEXT,
            exchangeDate TEXT,
            kind TEXT NOT NULL,
            date TEXT NOT NULL,
            note TEXT,
            taxCategory TEXT,
            taxSourceCountry TEXT,
            taxSourceRegion TEXT,
            taxTreatment TEXT NOT NULL DEFAULT 'UNKNOWN',
            taxWithheldAmount REAL,
            taxWithheldCurrency TEXT,
            taxWithheldCountry TEXT,
            taxDocumentRef TEXT,
            accountId INTEGER NOT NULL,
            categoryId INTEGER,
            transferGroup TEXT,
            transferDirection TEXT,
            transferPeerAccountId INTEGER,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE,
            FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL,
            FOREIGN KEY (transferPeerAccountId) REFERENCES accounts(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_transactions_accountId ON transactions(accountId);
        CREATE INDEX IF NOT EXISTS idx_transactions_categoryId ON transactions(categoryId);
        CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
        CREATE INDEX IF NOT EXISTS idx_transactions_transferGroup ON transactions(transferGroup);
    `)
}

function accountFromRow(row: Record<string, unknown>, prefix = ''): Account | null {
    const id = Number(row[`${prefix}id`])
    if (!Number.isFinite(id) || id <= 0) return null

    return {
        id,
        name: String(row[`${prefix}name`] ?? ''),
        type: row[`${prefix}type`] as Account['type'],
        currency: String(row[`${prefix}currency`] ?? 'CAD'),
        description: row[`${prefix}description`] == null ? null : String(row[`${prefix}description`]),
        institutionCountry: row[`${prefix}institutionCountry`] == null ? null : String(row[`${prefix}institutionCountry`]),
        institutionRegion: row[`${prefix}institutionRegion`] == null ? null : String(row[`${prefix}institutionRegion`]),
        taxReportingType: row[`${prefix}taxReportingType`] as Account['taxReportingType'],
        openedAt: row[`${prefix}openedAt`] == null ? null : String(row[`${prefix}openedAt`]),
        closedAt: row[`${prefix}closedAt`] == null ? null : String(row[`${prefix}closedAt`]),
    }
}

function categoryFromRow(row: Record<string, unknown>, prefix = ''): Category | null {
    const id = Number(row[`${prefix}id`])
    if (!Number.isFinite(id) || id <= 0) return null

    return {
        id,
        name: String(row[`${prefix}name`] ?? ''),
        kind: row[`${prefix}kind`] as Category['kind'],
        color: row[`${prefix}color`] == null ? null : String(row[`${prefix}color`]),
        description: row[`${prefix}description`] == null ? null : String(row[`${prefix}description`]),
    }
}

function transactionFromRow(row: Record<string, unknown>): Transaction {
    const transaction: Transaction = {
        id: Number(row.id),
        label: String(row.label ?? ''),
        amount: Number(row.amount ?? 0),
        sourceAmount: row.sourceAmount == null ? null : Number(row.sourceAmount),
        sourceCurrency: row.sourceCurrency == null ? null : String(row.sourceCurrency),
        conversionMode: row.conversionMode as Transaction['conversionMode'],
        exchangeRate: row.exchangeRate == null ? null : Number(row.exchangeRate),
        exchangeProvider: row.exchangeProvider == null ? null : String(row.exchangeProvider),
        exchangeDate: row.exchangeDate == null ? null : String(row.exchangeDate),
        kind: row.kind as Transaction['kind'],
        date: String(row.date ?? ''),
        note: row.note == null ? null : String(row.note),
        taxCategory: row.taxCategory == null ? null : row.taxCategory as Transaction['taxCategory'],
        taxSourceCountry: row.taxSourceCountry == null ? null : String(row.taxSourceCountry),
        taxSourceRegion: row.taxSourceRegion == null ? null : String(row.taxSourceRegion),
        taxTreatment: row.taxTreatment as Transaction['taxTreatment'],
        taxWithheldAmount: row.taxWithheldAmount == null ? null : Number(row.taxWithheldAmount),
        taxWithheldCurrency: row.taxWithheldCurrency == null ? null : String(row.taxWithheldCurrency),
        taxWithheldCountry: row.taxWithheldCountry == null ? null : String(row.taxWithheldCountry),
        taxDocumentRef: row.taxDocumentRef == null ? null : String(row.taxDocumentRef),
        accountId: Number(row.accountId),
        categoryId: row.categoryId == null ? null : Number(row.categoryId),
        transferGroup: row.transferGroup == null ? null : String(row.transferGroup),
        transferDirection: row.transferDirection == null ? null : row.transferDirection as Transaction['transferDirection'],
        transferPeerAccountId: row.transferPeerAccountId == null ? null : Number(row.transferPeerAccountId),
    }

    transaction.account = accountFromRow(row, 'account_')
    transaction.category = categoryFromRow(row, 'category_')
    transaction.transferPeerAccount = accountFromRow(row, 'peer_')

    return transaction
}

async function getAccountOrThrow(db: SQLiteDBConnection, id: number, label = 'Le compte') {
    const result = await db.query('SELECT * FROM accounts WHERE id = ?', [id])
    const row = result.values?.[0]
    const account = row ? accountFromRow(row) : null
    if (!account) throw new Error(`${label} est introuvable.`)
    return account
}

function accountPayload(data: CreateAccountInput | UpdateAccountInput) {
    return {
        name: requireText(data?.name, 'Le nom du compte'),
        type: data?.type,
        currency: normalizeCurrency(data?.currency),
        description: normalizeText(data?.description),
    }
}

function categoryPayload(data: CreateCategoryInput | UpdateCategoryInput) {
    return {
        name: requireText(data?.name, 'Le nom de la catégorie'),
        kind: data?.kind,
        color: normalizeText(data?.color),
        description: normalizeText(data?.description),
    }
}

async function buildTransactionPayload(db: SQLiteDBConnection, data: CreateTransactionInput | UpdateTransactionInput) {
    const accountId = requireId(data?.accountId, 'Le compte')
    const account = await getAccountOrThrow(db, accountId, 'Le compte sélectionné')
    const accountCurrency = normalizeCurrency(account.currency)
    const sourceAmount = requirePositiveNumber(data?.sourceAmount ?? data?.amount, 'Le montant')
    const sourceCurrency = normalizeCurrency(data?.sourceCurrency ?? accountCurrency)
    const conversionMode = normalizeConversionMode(data?.conversionMode, sourceCurrency, accountCurrency)

    let bookedAmount = sourceAmount
    let exchangeRate = 1
    let exchangeProvider = 'ACCOUNT'
    let exchangeDate = requireDate(data?.exchangeDate || data?.date)

    if (sourceCurrency !== accountCurrency) {
        bookedAmount = requirePositiveNumber(data?.amount, 'Le montant converti dans la devise du compte')

        if (conversionMode === 'AUTOMATIC') {
            exchangeRate = requirePositiveNumber(data?.exchangeRate, 'Le taux de change')
            exchangeProvider = requireText(data?.exchangeProvider, 'La source du taux')
        } else if (conversionMode === 'MANUAL') {
            exchangeRate = requirePositiveNumber(data?.exchangeRate ?? bookedAmount / sourceAmount, 'Le taux de change')
            exchangeProvider = normalizeText(data?.exchangeProvider) || 'MANUAL'
        }
    }

    return {
        label: requireText(data?.label, 'Le libellé'),
        amount: bookedAmount,
        sourceAmount,
        sourceCurrency,
        conversionMode,
        exchangeRate,
        exchangeProvider,
        exchangeDate,
        kind: data?.kind,
        date: requireDate(data?.date),
        note: normalizeText(data?.note),
        accountId,
        categoryId: data?.kind === 'TRANSFER'
            ? null
            : (data?.categoryId ? requireId(data.categoryId, 'La catégorie') : null),
        transferGroup: null,
        transferDirection: null,
        transferPeerAccountId: null,
    }
}

async function buildInternalTransferPayload(db: SQLiteDBConnection, data: CreateTransactionInput | UpdateTransactionInput, transferGroup?: string | null) {
    const sourceAccountId = requireId(data?.accountId, 'Le compte source')
    const targetAccountId = requireId(data?.transferTargetAccountId, 'Le compte destination')

    if (sourceAccountId === targetAccountId) {
        throw new Error('Le compte source et le compte destination doivent être différents.')
    }

    const sourceAccount = await getAccountOrThrow(db, sourceAccountId, 'Le compte source')
    const targetAccount = await getAccountOrThrow(db, targetAccountId, 'Le compte destination')
    const label = requireText(data?.label, 'Le libellé')
    const date = requireDate(data?.date)
    const note = normalizeText(data?.note)
    const debitAmount = requirePositiveNumber(data?.sourceAmount ?? data?.amount, 'Le montant transféré')
    const sourceCurrency = normalizeCurrency(sourceAccount.currency)
    const targetCurrency = normalizeCurrency(targetAccount.currency)
    const conversionMode = normalizeConversionMode(data?.conversionMode, sourceCurrency, targetCurrency)

    let creditedAmount = debitAmount
    let exchangeRate = 1
    let exchangeProvider = 'ACCOUNT'
    const exchangeDate = requireDate(data?.exchangeDate || data?.date)

    if (sourceCurrency !== targetCurrency) {
        creditedAmount = requirePositiveNumber(data?.amount, 'Le montant crédité dans la devise du compte destination')
        if (conversionMode === 'AUTOMATIC') {
            exchangeRate = requirePositiveNumber(data?.exchangeRate, 'Le taux de change')
            exchangeProvider = requireText(data?.exchangeProvider, 'La source du taux')
        } else if (conversionMode === 'MANUAL') {
            exchangeRate = requirePositiveNumber(data?.exchangeRate ?? creditedAmount / debitAmount, 'Le taux de change')
            exchangeProvider = normalizeText(data?.exchangeProvider) || 'MANUAL'
        }
    }

    const group = transferGroup || ensureUuid()

    return {
        group,
        outgoing: {
            label,
            amount: debitAmount,
            sourceAmount: debitAmount,
            sourceCurrency,
            conversionMode: 'NONE' as const,
            exchangeRate: 1,
            exchangeProvider: 'ACCOUNT',
            exchangeDate,
            kind: 'TRANSFER' as const,
            date,
            note,
            accountId: sourceAccount.id,
            categoryId: null,
            transferGroup: group,
            transferDirection: 'OUT' as const,
            transferPeerAccountId: targetAccount.id,
        },
        incoming: {
            label,
            amount: creditedAmount,
            sourceAmount: debitAmount,
            sourceCurrency,
            conversionMode,
            exchangeRate,
            exchangeProvider,
            exchangeDate,
            kind: 'TRANSFER' as const,
            date,
            note,
            accountId: targetAccount.id,
            categoryId: null,
            transferGroup: group,
            transferDirection: 'IN' as const,
            transferPeerAccountId: sourceAccount.id,
        },
    }
}

async function listTransactions(db: SQLiteDBConnection) {
    const result = await db.query(`
        SELECT
            t.*,
            a.id AS account_id,
            a.name AS account_name,
            a.type AS account_type,
            a.currency AS account_currency,
            a.description AS account_description,
            a.institutionCountry AS account_institutionCountry,
            a.institutionRegion AS account_institutionRegion,
            a.taxReportingType AS account_taxReportingType,
            a.openedAt AS account_openedAt,
            a.closedAt AS account_closedAt,
            c.id AS category_id,
            c.name AS category_name,
            c.kind AS category_kind,
            c.color AS category_color,
            c.description AS category_description,
            p.id AS peer_id,
            p.name AS peer_name,
            p.type AS peer_type,
            p.currency AS peer_currency,
            p.description AS peer_description,
            p.institutionCountry AS peer_institutionCountry,
            p.institutionRegion AS peer_institutionRegion,
            p.taxReportingType AS peer_taxReportingType,
            p.openedAt AS peer_openedAt,
            p.closedAt AS peer_closedAt
        FROM transactions t
        LEFT JOIN accounts a ON a.id = t.accountId
        LEFT JOIN categories c ON c.id = t.categoryId
        LEFT JOIN accounts p ON p.id = t.transferPeerAccountId
        ORDER BY t.date DESC, t.createdAt DESC
    `)

    return (result.values || []).map(transactionFromRow)
}

async function getTransaction(db: SQLiteDBConnection, id: number) {
    const rows = await listTransactions(db)
    const transaction = rows.find((entry) => entry.id === id)
    if (!transaction) throw new Error('La transaction est introuvable.')
    return transaction
}

async function insertTransaction(db: SQLiteDBConnection, payload: Record<string, unknown>) {
    const createdAt = nowIso()
    const result = await db.run(`
        INSERT INTO transactions (
            label, amount, sourceAmount, sourceCurrency, conversionMode, exchangeRate, exchangeProvider, exchangeDate,
            kind, date, note, taxTreatment, accountId, categoryId, transferGroup, transferDirection, transferPeerAccountId,
            createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNKNOWN', ?, ?, ?, ?, ?, ?, ?)
    `, [
        payload.label,
        payload.amount,
        payload.sourceAmount,
        payload.sourceCurrency,
        payload.conversionMode,
        payload.exchangeRate,
        payload.exchangeProvider,
        payload.exchangeDate,
        payload.kind,
        payload.date,
        payload.note,
        payload.accountId,
        payload.categoryId,
        payload.transferGroup,
        payload.transferDirection,
        payload.transferPeerAccountId,
        createdAt,
        createdAt,
    ])

    const id = Number(result.changes?.lastId)
    return getTransaction(db, id)
}

async function updateTransactionRow(db: SQLiteDBConnection, id: number, payload: Record<string, unknown>) {
    await db.run(`
        UPDATE transactions SET
            label = ?, amount = ?, sourceAmount = ?, sourceCurrency = ?, conversionMode = ?, exchangeRate = ?,
            exchangeProvider = ?, exchangeDate = ?, kind = ?, date = ?, note = ?, accountId = ?, categoryId = ?,
            transferGroup = ?, transferDirection = ?, transferPeerAccountId = ?, updatedAt = ?
        WHERE id = ?
    `, [
        payload.label,
        payload.amount,
        payload.sourceAmount,
        payload.sourceCurrency,
        payload.conversionMode,
        payload.exchangeRate,
        payload.exchangeProvider,
        payload.exchangeDate,
        payload.kind,
        payload.date,
        payload.note,
        payload.accountId,
        payload.categoryId,
        payload.transferGroup,
        payload.transferDirection,
        payload.transferPeerAccountId,
        nowIso(),
        id,
    ])

    return getTransaction(db, id)
}

export async function createMobileSqliteBudgetRepository(): Promise<BudgetRepository> {
    const db = await openDatabase()

    return {
        accounts: {
            async list() {
                const result = await db.query('SELECT * FROM accounts ORDER BY createdAt DESC')
                return (result.values || []).map((row) => accountFromRow(row)).filter(Boolean) as Account[]
            },
            async create(data) {
                const payload = accountPayload(data)
                const createdAt = nowIso()
                const result = await db.run(`
                    INSERT INTO accounts (name, type, currency, description, taxReportingType, createdAt, updatedAt)
                    VALUES (?, ?, ?, ?, 'STANDARD', ?, ?)
                `, [payload.name, payload.type, payload.currency, payload.description, createdAt, createdAt])
                return getAccountOrThrow(db, Number(result.changes?.lastId))
            },
            async update(id, data) {
                const accountId = requireId(id, 'Le compte')
                const payload = accountPayload(data)
                await db.run(`
                    UPDATE accounts SET name = ?, type = ?, currency = ?, description = ?, updatedAt = ? WHERE id = ?
                `, [payload.name, payload.type, payload.currency, payload.description, nowIso(), accountId])
                return getAccountOrThrow(db, accountId)
            },
            async delete(id) {
                const accountId = requireId(id, 'Le compte')
                const existing = await getAccountOrThrow(db, accountId)
                await db.run('DELETE FROM accounts WHERE id = ?', [accountId])
                return existing
            },
        },
        categories: {
            async list() {
                const result = await db.query('SELECT * FROM categories ORDER BY name ASC')
                return (result.values || []).map((row) => categoryFromRow(row)).filter(Boolean) as Category[]
            },
            async create(data) {
                const payload = categoryPayload(data)
                const createdAt = nowIso()
                const result = await db.run(`
                    INSERT INTO categories (name, kind, color, description, createdAt, updatedAt)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [payload.name, payload.kind, payload.color, payload.description, createdAt, createdAt])
                const category = categoryFromRow((await db.query('SELECT * FROM categories WHERE id = ?', [Number(result.changes?.lastId)])).values?.[0] || {})
                if (!category) throw new Error('La catégorie est introuvable.')
                return category
            },
            async update(id, data) {
                const categoryId = requireId(id, 'La catégorie')
                const payload = categoryPayload(data)
                await db.run(`
                    UPDATE categories SET name = ?, kind = ?, color = ?, description = ?, updatedAt = ? WHERE id = ?
                `, [payload.name, payload.kind, payload.color, payload.description, nowIso(), categoryId])
                const category = categoryFromRow((await db.query('SELECT * FROM categories WHERE id = ?', [categoryId])).values?.[0] || {})
                if (!category) throw new Error('La catégorie est introuvable.')
                return category
            },
            async delete(id) {
                const categoryId = requireId(id, 'La catégorie')
                const category = categoryFromRow((await db.query('SELECT * FROM categories WHERE id = ?', [categoryId])).values?.[0] || {})
                if (!category) throw new Error('La catégorie est introuvable.')
                await db.run('DELETE FROM categories WHERE id = ?', [categoryId])
                return category
            },
        },
        transactions: {
            list: () => listTransactions(db),
            async create(data) {
                if (data.kind === 'TRANSFER' && data.transferTargetAccountId) {
                    const payload = await buildInternalTransferPayload(db, data)
                    const outgoing = await insertTransaction(db, payload.outgoing)
                    await insertTransaction(db, payload.incoming)
                    return outgoing
                }

                return insertTransaction(db, await buildTransactionPayload(db, data))
            },
            async update(id, data) {
                const transactionId = requireId(id, 'La transaction')
                const existing = await getTransaction(db, transactionId)
                const wantsInternalTransfer = data.kind === 'TRANSFER' && data.transferTargetAccountId

                if (existing.transferGroup) {
                    await db.run('DELETE FROM transactions WHERE transferGroup = ? AND id != ?', [existing.transferGroup, transactionId])

                    if (wantsInternalTransfer) {
                        const payload = await buildInternalTransferPayload(db, data, existing.transferGroup)
                        const updated = await updateTransactionRow(db, transactionId, payload.outgoing)
                        await insertTransaction(db, payload.incoming)
                        return updated
                    }

                    return updateTransactionRow(db, transactionId, await buildTransactionPayload(db, data))
                }

                if (wantsInternalTransfer) {
                    const payload = await buildInternalTransferPayload(db, data)
                    const updated = await updateTransactionRow(db, transactionId, payload.outgoing)
                    await insertTransaction(db, payload.incoming)
                    return updated
                }

                return updateTransactionRow(db, transactionId, await buildTransactionPayload(db, data))
            },
            async delete(id) {
                const transactionId = requireId(id, 'La transaction')
                const existing = await getTransaction(db, transactionId)
                if (existing.transferGroup) {
                    await db.run('DELETE FROM transactions WHERE transferGroup = ?', [existing.transferGroup])
                } else {
                    await db.run('DELETE FROM transactions WHERE id = ?', [transactionId])
                }
                return existing
            },
        },
        fx: {
            async quoteHistorical() {
                throw new Error('Le taux de change automatique n’est pas encore disponible sur mobile. Utilise la conversion manuelle pour cette version mobile.')
            },
        },
    }
}
