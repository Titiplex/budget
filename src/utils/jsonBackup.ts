import type {
    Account,
    AccountTaxReportingType,
    AccountType,
    BudgetBackupAccount,
    BudgetBackupBudgetTarget,
    BudgetBackupCategory,
    BudgetBackupRecurringTransactionTemplate,
    BudgetBackupSnapshot,
    BudgetBackupTaxProfile,
    BudgetBackupTransaction,
    BudgetTarget,
    BudgetPeriod,
    Category,
    ConversionMode,
    RecurringFrequency,
    RecurringTransactionTemplate,
    TaxIncomeCategory,
    TaxProfile,
    TaxTreatment,
    Transaction,
    TransactionKind,
    TransferDirection,
} from '../types/budget'
import {toDateOnly} from './date'

export const BUDGET_BACKUP_KIND = 'budget-backup'
export const BUDGET_BACKUP_FORMAT_VERSION = 4
export const SUPPORTED_BUDGET_BACKUP_VERSIONS = [2, 3, 4] as const

export type BudgetBackupFormatVersion = typeof SUPPORTED_BUDGET_BACKUP_VERSIONS[number]

const INVALID_BACKUP_MESSAGE = 'Le fichier JSON ne correspond pas à un backup budget valide.'

const ACCOUNT_TYPES = ['CASH', 'BANK', 'SAVINGS', 'CREDIT', 'INVESTMENT', 'OTHER'] as const
const ACCOUNT_TAX_REPORTING_TYPES = ['STANDARD', 'BANK', 'CASH', 'BROKERAGE', 'CRYPTO', 'LIFE_INSURANCE', 'RETIREMENT', 'LOAN', 'OTHER'] as const
const TRANSACTION_KINDS = ['INCOME', 'EXPENSE', 'TRANSFER'] as const
const CONVERSION_MODES = ['NONE', 'MANUAL', 'AUTOMATIC'] as const
const TRANSFER_DIRECTIONS = ['OUT', 'IN'] as const
const BUDGET_PERIODS = ['MONTHLY', 'YEARLY', 'CUSTOM'] as const
const RECURRING_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const
const TAX_INCOME_CATEGORIES = ['EMPLOYMENT', 'BUSINESS', 'INTEREST', 'DIVIDEND', 'CAPITAL_GAIN', 'RENTAL', 'PENSION', 'BENEFIT', 'GIFT', 'REFUND', 'TRANSFER', 'OTHER'] as const
const TAX_TREATMENTS = ['UNKNOWN', 'NOT_TAXABLE', 'TAXABLE_NO_WITHHOLDING', 'TAX_WITHHELD_AT_SOURCE', 'FOREIGN_TAX_CREDIT_CANDIDATE', 'TREATY_EXEMPT_CANDIDATE', 'REVIEW_REQUIRED'] as const

export class BudgetBackupParseError extends Error {
    constructor(message = INVALID_BACKUP_MESSAGE) {
        super(message)
        this.name = 'BudgetBackupParseError'
    }
}

function fail(message = INVALID_BACKUP_MESSAGE): never {
    throw new BudgetBackupParseError(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
    if (!isRecord(value)) {
        fail(`${path} doit être un objet.`)
    }
    return value
}

function requireArray(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) {
        fail(`${path} doit être un tableau.`)
    }
    return value
}

function requireString(value: unknown, path: string): string {
    if (typeof value !== 'string') {
        fail(`${path} doit être une chaîne de caractères.`)
    }
    return value
}

function requireNonEmptyString(value: unknown, path: string): string {
    const normalized = requireString(value, path).trim()
    if (!normalized) {
        fail(`${path} ne peut pas être vide.`)
    }
    return normalized
}

function requireNullableString(value: unknown, path: string): string | null {
    if (value === null) return null
    return requireString(value, path)
}

function optionalNullableString(
    record: Record<string, unknown>,
    key: string,
    path: string,
    fallback: string | null = null,
): string | null {
    if (!(key in record) || record[key] === undefined || record[key] === null) {
        return fallback
    }
    return requireString(record[key], `${path}.${key}`)
}

function requireFiniteNumber(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        fail(`${path} doit être un nombre fini.`)
    }
    return value
}

function requirePositiveNumber(value: unknown, path: string): number {
    const parsed = requireFiniteNumber(value, path)
    if (parsed <= 0) {
        fail(`${path} doit être strictement positif.`)
    }
    return parsed
}

function requireNonNegativeNumber(value: unknown, path: string): number {
    const parsed = requireFiniteNumber(value, path)
    if (parsed < 0) {
        fail(`${path} doit être positif ou nul.`)
    }
    return parsed
}

function requireIntegerId(value: unknown, path: string): number {
    const parsed = requireFiniteNumber(value, path)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        fail(`${path} doit être un identifiant entier positif.`)
    }
    return parsed
}

function optionalNullablePositiveNumber(
    record: Record<string, unknown>,
    key: string,
    path: string,
    fallback: number | null = null,
): number | null {
    if (!(key in record) || record[key] === undefined || record[key] === null) {
        return fallback
    }
    return requirePositiveNumber(record[key], `${path}.${key}`)
}

function optionalNullableNonNegativeNumber(
    record: Record<string, unknown>,
    key: string,
    path: string,
    fallback: number | null = null,
): number | null {
    if (!(key in record) || record[key] === undefined || record[key] === null) {
        return fallback
    }
    return requireNonNegativeNumber(record[key], `${path}.${key}`)
}

function requireBoolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') {
        fail(`${path} doit être un booléen.`)
    }
    return value
}

function optionalBoolean(
    record: Record<string, unknown>,
    key: string,
    path: string,
    fallback: boolean,
): boolean {
    if (!(key in record) || record[key] === undefined) {
        return fallback
    }
    return requireBoolean(record[key], `${path}.${key}`)
}

function requireOneOf<T extends readonly string[]>(value: unknown, path: string, allowed: T): T[number] {
    if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
        fail(`${path} contient une valeur non supportée.`)
    }
    return value as T[number]
}

function optionalOneOf<T extends readonly string[]>(
    record: Record<string, unknown>,
    key: string,
    path: string,
    allowed: T,
    fallback: T[number],
): T[number] {
    if (!(key in record) || record[key] === undefined || record[key] === null) {
        return fallback
    }
    return requireOneOf(record[key], `${path}.${key}`, allowed)
}

function requireDateOnly(value: unknown, path: string): string {
    const date = requireString(value, path)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        fail(`${path} doit être une date au format YYYY-MM-DD.`)
    }
    return date
}

function requireNullableDateOnly(value: unknown, path: string): string | null {
    if (value === null) return null
    return requireDateOnly(value, path)
}

function optionalNullableDateOnly(
    record: Record<string, unknown>,
    key: string,
    path: string,
    fallback: string | null = null,
): string | null {
    if (!(key in record) || record[key] === undefined || record[key] === null) {
        return fallback
    }
    return requireDateOnly(record[key], `${path}.${key}`)
}

function optionalNullableIsoDate(
    record: Record<string, unknown>,
    key: string,
    path: string,
    fallback: string | null = null,
): string | null {
    if (!(key in record) || record[key] === undefined || record[key] === null) {
        return fallback
    }

    const date = requireString(record[key], `${path}.${key}`)
    if (Number.isNaN(new Date(date).getTime())) {
        fail(`${path}.${key} doit être une date valide.`)
    }
    return date
}

function parseVersion(value: unknown): BudgetBackupFormatVersion {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        fail('Le backup JSON doit déclarer une version numérique explicite.')
    }

    if (!(SUPPORTED_BUDGET_BACKUP_VERSIONS as readonly number[]).includes(value)) {
        fail(`Version de backup JSON non supportée (${value}). Versions supportées : ${SUPPORTED_BUDGET_BACKUP_VERSIONS.join(', ')}.`)
    }

    return value as BudgetBackupFormatVersion
}

function requireExportedAt(value: unknown): string {
    const exportedAt = requireString(value, 'exportedAt')
    if (Number.isNaN(new Date(exportedAt).getTime())) {
        fail('exportedAt doit être une date valide.')
    }
    return exportedAt
}

function ensureUniqueIds(rows: {id: number}[], label: string) {
    const seen = new Set<number>()
    for (const row of rows) {
        if (seen.has(row.id)) {
            fail(`${label} contient un identifiant dupliqué (${row.id}).`)
        }
        seen.add(row.id)
    }
}

function normalizeAccount(value: unknown, index: number): BudgetBackupAccount {
    const path = `data.accounts[${index}]`
    const account = requireRecord(value, path)

    return {
        id: requireIntegerId(account.id, `${path}.id`),
        name: requireNonEmptyString(account.name, `${path}.name`),
        type: requireOneOf(account.type, `${path}.type`, ACCOUNT_TYPES) as AccountType,
        currency: requireNonEmptyString(account.currency, `${path}.currency`).toUpperCase(),
        description: requireNullableString(account.description, `${path}.description`),
        institutionCountry: optionalNullableString(account, 'institutionCountry', path),
        institutionRegion: optionalNullableString(account, 'institutionRegion', path),
        taxReportingType: optionalOneOf(account, 'taxReportingType', path, ACCOUNT_TAX_REPORTING_TYPES, 'STANDARD') as AccountTaxReportingType,
        openedAt: optionalNullableIsoDate(account, 'openedAt', path),
        closedAt: optionalNullableIsoDate(account, 'closedAt', path),
    }
}

function normalizeCategory(value: unknown, index: number): BudgetBackupCategory {
    const path = `data.categories[${index}]`
    const category = requireRecord(value, path)

    return {
        id: requireIntegerId(category.id, `${path}.id`),
        name: requireNonEmptyString(category.name, `${path}.name`),
        kind: requireOneOf(category.kind, `${path}.kind`, TRANSACTION_KINDS) as TransactionKind,
        color: requireNullableString(category.color, `${path}.color`),
        description: requireNullableString(category.description, `${path}.description`),
    }
}

function normalizeBudgetTarget(value: unknown, index: number): BudgetBackupBudgetTarget {
    const path = `data.budgetTargets[${index}]`
    const budgetTarget = requireRecord(value, path)

    return {
        id: requireIntegerId(budgetTarget.id, `${path}.id`),
        name: requireNonEmptyString(budgetTarget.name, `${path}.name`),
        amount: requirePositiveNumber(budgetTarget.amount, `${path}.amount`),
        period: requireOneOf(budgetTarget.period, `${path}.period`, BUDGET_PERIODS) as BudgetPeriod,
        startDate: requireDateOnly(budgetTarget.startDate, `${path}.startDate`),
        endDate: requireNullableDateOnly(budgetTarget.endDate, `${path}.endDate`),
        currency: requireNonEmptyString(budgetTarget.currency, `${path}.currency`).toUpperCase(),
        isActive: optionalBoolean(budgetTarget, 'isActive', path, true),
        note: requireNullableString(budgetTarget.note, `${path}.note`),
        categoryId: requireIntegerId(budgetTarget.categoryId, `${path}.categoryId`),
    }
}

function normalizeRecurringTemplate(value: unknown, index: number): BudgetBackupRecurringTransactionTemplate {
    const path = `data.recurringTemplates[${index}]`
    const template = requireRecord(value, path)
    const sourceAmount = requirePositiveNumber(template.sourceAmount, `${path}.sourceAmount`)

    return {
        id: requireIntegerId(template.id, `${path}.id`),
        label: requireNonEmptyString(template.label, `${path}.label`),
        sourceAmount,
        sourceCurrency: requireNonEmptyString(template.sourceCurrency, `${path}.sourceCurrency`).toUpperCase(),
        accountAmount: optionalNullablePositiveNumber(template, 'accountAmount', path),
        conversionMode: optionalOneOf(template, 'conversionMode', path, CONVERSION_MODES, 'NONE') as ConversionMode,
        exchangeRate: optionalNullablePositiveNumber(template, 'exchangeRate', path, 1),
        exchangeProvider: optionalNullableString(template, 'exchangeProvider', path, 'ACCOUNT'),
        kind: requireOneOf(template.kind, `${path}.kind`, TRANSACTION_KINDS) as TransactionKind,
        note: requireNullableString(template.note, `${path}.note`),
        frequency: requireOneOf(template.frequency, `${path}.frequency`, RECURRING_FREQUENCIES) as RecurringFrequency,
        intervalCount: requireIntegerId(template.intervalCount, `${path}.intervalCount`),
        startDate: requireDateOnly(template.startDate, `${path}.startDate`),
        nextOccurrenceDate: requireDateOnly(template.nextOccurrenceDate, `${path}.nextOccurrenceDate`),
        endDate: requireNullableDateOnly(template.endDate, `${path}.endDate`),
        isActive: optionalBoolean(template, 'isActive', path, true),
        accountId: requireIntegerId(template.accountId, `${path}.accountId`),
        categoryId: template.categoryId == null ? null : requireIntegerId(template.categoryId, `${path}.categoryId`),
    }
}

function normalizeTransaction(value: unknown, index: number): BudgetBackupTransaction {
    const path = `data.transactions[${index}]`
    const transaction = requireRecord(value, path)
    const amount = requirePositiveNumber(transaction.amount, `${path}.amount`)
    const date = requireDateOnly(transaction.date, `${path}.date`)

    return {
        id: requireIntegerId(transaction.id, `${path}.id`),
        label: requireNonEmptyString(transaction.label, `${path}.label`),
        amount,
        sourceAmount: optionalNullablePositiveNumber(transaction, 'sourceAmount', path, amount),
        sourceCurrency: optionalNullableString(transaction, 'sourceCurrency', path),
        conversionMode: optionalOneOf(transaction, 'conversionMode', path, CONVERSION_MODES, 'NONE') as ConversionMode,
        exchangeRate: optionalNullablePositiveNumber(transaction, 'exchangeRate', path, 1),
        exchangeProvider: optionalNullableString(transaction, 'exchangeProvider', path, 'ACCOUNT'),
        exchangeDate: optionalNullableDateOnly(transaction, 'exchangeDate', path, date),
        kind: requireOneOf(transaction.kind, `${path}.kind`, TRANSACTION_KINDS) as TransactionKind,
        date,
        note: requireNullableString(transaction.note, `${path}.note`),
        taxCategory: transaction.taxCategory == null
            ? null
            : requireOneOf(transaction.taxCategory, `${path}.taxCategory`, TAX_INCOME_CATEGORIES) as TaxIncomeCategory,
        taxSourceCountry: optionalNullableString(transaction, 'taxSourceCountry', path),
        taxSourceRegion: optionalNullableString(transaction, 'taxSourceRegion', path),
        taxTreatment: optionalOneOf(transaction, 'taxTreatment', path, TAX_TREATMENTS, 'UNKNOWN') as TaxTreatment,
        taxWithheldAmount: optionalNullableNonNegativeNumber(transaction, 'taxWithheldAmount', path),
        taxWithheldCurrency: optionalNullableString(transaction, 'taxWithheldCurrency', path),
        taxWithheldCountry: optionalNullableString(transaction, 'taxWithheldCountry', path),
        taxDocumentRef: optionalNullableString(transaction, 'taxDocumentRef', path),
        accountId: requireIntegerId(transaction.accountId, `${path}.accountId`),
        categoryId: transaction.categoryId == null ? null : requireIntegerId(transaction.categoryId, `${path}.categoryId`),
        transferGroup: optionalNullableString(transaction, 'transferGroup', path),
        transferDirection: transaction.transferDirection == null
            ? null
            : requireOneOf(transaction.transferDirection, `${path}.transferDirection`, TRANSFER_DIRECTIONS) as TransferDirection,
        transferPeerAccountId: transaction.transferPeerAccountId == null
            ? null
            : requireIntegerId(transaction.transferPeerAccountId, `${path}.transferPeerAccountId`),
    }
}

function normalizeTaxProfile(value: unknown, index: number): BudgetBackupTaxProfile {
    const path = `data.taxProfiles[${index}]`
    const taxProfile = requireRecord(value, path)
    const year = requireFiniteNumber(taxProfile.year, `${path}.year`)

    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
        fail(`${path}.year doit être une année fiscale valide.`)
    }

    return {
        id: requireIntegerId(taxProfile.id, `${path}.id`),
        year,
        residenceCountry: requireNonEmptyString(taxProfile.residenceCountry, `${path}.residenceCountry`).toUpperCase(),
        residenceRegion: optionalNullableString(taxProfile, 'residenceRegion', path),
        currency: requireNonEmptyString(taxProfile.currency, `${path}.currency`).toUpperCase(),
    }
}

function normalizeSnapshot(parsed: unknown): BudgetBackupSnapshot {
    const root = requireRecord(parsed, 'backup')

    if (root.kind !== BUDGET_BACKUP_KIND) {
        fail(INVALID_BACKUP_MESSAGE)
    }

    const version = parseVersion(root.version)
    const data = requireRecord(root.data, 'data')

    const snapshot: BudgetBackupSnapshot = {
        kind: BUDGET_BACKUP_KIND,
        version,
        exportedAt: requireExportedAt(root.exportedAt),
        data: {
            accounts: requireArray(data.accounts, 'data.accounts').map(normalizeAccount),
            categories: requireArray(data.categories, 'data.categories').map(normalizeCategory),
            budgetTargets: requireArray(data.budgetTargets, 'data.budgetTargets').map(normalizeBudgetTarget),
            recurringTemplates: requireArray(data.recurringTemplates, 'data.recurringTemplates').map(normalizeRecurringTemplate),
            transactions: requireArray(data.transactions, 'data.transactions').map(normalizeTransaction),
            taxProfiles: data.taxProfiles == null
                ? []
                : requireArray(data.taxProfiles, 'data.taxProfiles').map(normalizeTaxProfile),
        },
    }

    assertSnapshotConsistency(snapshot)
    return snapshot
}

function assertSnapshotConsistency(snapshot: BudgetBackupSnapshot) {
    const accounts = snapshot.data.accounts
    const categories = snapshot.data.categories
    const budgetTargets = snapshot.data.budgetTargets
    const recurringTemplates = snapshot.data.recurringTemplates
    const transactions = snapshot.data.transactions
    const taxProfiles = snapshot.data.taxProfiles || []

    ensureUniqueIds(accounts, 'data.accounts')
    ensureUniqueIds(categories, 'data.categories')
    ensureUniqueIds(budgetTargets, 'data.budgetTargets')
    ensureUniqueIds(recurringTemplates, 'data.recurringTemplates')
    ensureUniqueIds(transactions, 'data.transactions')
    ensureUniqueIds(taxProfiles, 'data.taxProfiles')

    const accountIds = new Set(accounts.map((account) => account.id))
    const categoryIds = new Set(categories.map((category) => category.id))

    for (const account of accounts) {
        if (account.openedAt && account.closedAt && new Date(account.closedAt).getTime() < new Date(account.openedAt).getTime()) {
            fail(`Compte "${account.name}" : la date de fermeture précède la date d'ouverture.`)
        }
    }

    for (const budgetTarget of budgetTargets) {
        if (!categoryIds.has(budgetTarget.categoryId)) {
            fail(`Budget "${budgetTarget.name}" référence une catégorie absente (${budgetTarget.categoryId}).`)
        }
    }

    for (const template of recurringTemplates) {
        if (!accountIds.has(template.accountId)) {
            fail(`Récurrence "${template.label}" référence un compte absent (${template.accountId}).`)
        }

        if (template.categoryId != null && !categoryIds.has(template.categoryId)) {
            fail(`Récurrence "${template.label}" référence une catégorie absente (${template.categoryId}).`)
        }
    }

    const transferGroups = new Map<string, BudgetBackupTransaction[]>()

    for (const transaction of transactions) {
        if (!accountIds.has(transaction.accountId)) {
            fail(`Transaction "${transaction.label}" référence un compte absent (${transaction.accountId}).`)
        }

        if (transaction.categoryId != null && !categoryIds.has(transaction.categoryId)) {
            fail(`Transaction "${transaction.label}" référence une catégorie absente (${transaction.categoryId}).`)
        }

        if (transaction.transferPeerAccountId != null && !accountIds.has(transaction.transferPeerAccountId)) {
            fail(`Transaction "${transaction.label}" référence un compte pair absent (${transaction.transferPeerAccountId}).`)
        }

        if (transaction.kind === 'TRANSFER' && transaction.categoryId != null) {
            fail(`Transaction "${transaction.label}" est un transfert mais porte une catégorie (${transaction.categoryId}).`)
        }

        if (transaction.transferGroup) {
            const rows = transferGroups.get(transaction.transferGroup) || []
            rows.push(transaction)
            transferGroups.set(transaction.transferGroup, rows)
        }
    }

    for (const [group, rows] of transferGroups.entries()) {
        if (rows.length !== 2) {
            fail(`Le transfert interne ${group} doit contenir exactement deux jambes.`)
        }

        const outgoing = rows.find((transaction) => transaction.transferDirection === 'OUT')
        const incoming = rows.find((transaction) => transaction.transferDirection === 'IN')

        if (!outgoing || !incoming) {
            fail(`Le transfert interne ${group} doit contenir une jambe OUT et une jambe IN.`)
        }

        if (outgoing.kind !== 'TRANSFER' || incoming.kind !== 'TRANSFER') {
            fail(`Le transfert interne ${group} contient une transaction qui n'est pas un transfert.`)
        }

        if (
            outgoing.accountId === incoming.accountId ||
            outgoing.transferPeerAccountId !== incoming.accountId ||
            incoming.transferPeerAccountId !== outgoing.accountId
        ) {
            fail(`Le transfert interne ${group} est incohérent.`)
        }
    }
}

export function createBudgetBackupSnapshot(
    accounts: Account[],
    categories: Category[],
    budgetTargets: BudgetTarget[],
    recurringTemplates: RecurringTransactionTemplate[],
    transactions: Transaction[],
    taxProfiles: TaxProfile[] = [],
): BudgetBackupSnapshot {
    return {
        kind: BUDGET_BACKUP_KIND,
        version: BUDGET_BACKUP_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        data: {
            accounts: accounts.map((account) => ({
                id: account.id,
                name: account.name,
                type: account.type,
                currency: account.currency,
                description: account.description,
                institutionCountry: account.institutionCountry ?? null,
                institutionRegion: account.institutionRegion ?? null,
                taxReportingType: account.taxReportingType ?? 'STANDARD',
                openedAt: account.openedAt ? new Date(account.openedAt).toISOString() : null,
                closedAt: account.closedAt ? new Date(account.closedAt).toISOString() : null,
            })),
            categories: categories.map((category) => ({
                id: category.id,
                name: category.name,
                kind: category.kind,
                color: category.color,
                description: category.description,
            })),
            budgetTargets: budgetTargets.map((budgetTarget) => ({
                id: budgetTarget.id,
                name: budgetTarget.name,
                amount: budgetTarget.amount,
                period: budgetTarget.period,
                startDate: toDateOnly(budgetTarget.startDate),
                endDate: budgetTarget.endDate ? toDateOnly(budgetTarget.endDate) : null,
                currency: budgetTarget.currency,
                isActive: budgetTarget.isActive,
                note: budgetTarget.note,
                categoryId: budgetTarget.categoryId,
            })),
            recurringTemplates: recurringTemplates.map((template) => ({
                id: template.id,
                label: template.label,
                sourceAmount: template.sourceAmount,
                sourceCurrency: template.sourceCurrency,
                accountAmount: template.accountAmount,
                conversionMode: template.conversionMode,
                exchangeRate: template.exchangeRate,
                exchangeProvider: template.exchangeProvider,
                kind: template.kind,
                note: template.note,
                frequency: template.frequency,
                intervalCount: template.intervalCount,
                startDate: toDateOnly(template.startDate),
                nextOccurrenceDate: toDateOnly(template.nextOccurrenceDate),
                endDate: template.endDate ? toDateOnly(template.endDate) : null,
                isActive: template.isActive,
                accountId: template.accountId,
                categoryId: template.categoryId,
            })),
            transactions: transactions.map((transaction) => ({
                id: transaction.id,
                label: transaction.label,
                amount: Math.abs(transaction.amount),
                sourceAmount: transaction.sourceAmount == null ? null : Math.abs(transaction.sourceAmount),
                sourceCurrency: transaction.sourceCurrency,
                conversionMode: transaction.conversionMode,
                exchangeRate: transaction.exchangeRate,
                exchangeProvider: transaction.exchangeProvider,
                exchangeDate: transaction.exchangeDate ? toDateOnly(transaction.exchangeDate) : null,
                kind: transaction.kind,
                date: toDateOnly(transaction.date),
                note: transaction.note,
                taxCategory: transaction.taxCategory ?? null,
                taxSourceCountry: transaction.taxSourceCountry ?? null,
                taxSourceRegion: transaction.taxSourceRegion ?? null,
                taxTreatment: transaction.taxTreatment ?? 'UNKNOWN',
                taxWithheldAmount: transaction.taxWithheldAmount ?? null,
                taxWithheldCurrency: transaction.taxWithheldCurrency ?? null,
                taxWithheldCountry: transaction.taxWithheldCountry ?? null,
                taxDocumentRef: transaction.taxDocumentRef ?? null,
                accountId: transaction.accountId,
                categoryId: transaction.categoryId,
                transferGroup: transaction.transferGroup ?? null,
                transferDirection: transaction.transferDirection ?? null,
                transferPeerAccountId: transaction.transferPeerAccountId ?? null,
            })),
            taxProfiles: taxProfiles.map((profile) => ({
                id: profile.id,
                year: profile.year,
                residenceCountry: profile.residenceCountry,
                residenceRegion: profile.residenceRegion,
                currency: profile.currency,
            })),
        },
    }
}

export function serializeBudgetBackup(snapshot: BudgetBackupSnapshot) {
    return `${JSON.stringify(snapshot, null, 2)}\n`
}

export function parseBudgetBackup(content: string): BudgetBackupSnapshot {
    let parsed: unknown

    try {
        parsed = JSON.parse(content)
    } catch (_error) {
        fail('Le fichier JSON est invalide ou corrompu.')
    }

    return normalizeSnapshot(parsed)
}
