import {computed, type Ref} from 'vue'
import type {
    Account,
    AccountType,
    Category,
    EntityType,
    SectionKey,
    Transaction,
    TransactionKind,
} from '../types/budget'
import {tr} from '../i18n'
import {entityCollectionLabel, sectionToEntityType} from '../utils/budgetFormat'
import {parseCsv, readCsvValue, toCsv, type CsvRecord} from '../utils/csv'

interface UseCsvImportExportOptions {
    activeSection: Ref<SectionKey>
    accounts: Ref<Account[]>
    categories: Ref<Category[]>
    transactions: Ref<Transaction[]>
    accountTypeOptions: AccountType[]
    transactionKindOptions: TransactionKind[]
    refreshData: () => Promise<void>
    showNotice: (type: 'success' | 'error', text: string) => void
}

export function useCsvImportExport(options: UseCsvImportExportOptions) {
    const currentCsvEntity = computed<EntityType>(() => sectionToEntityType(options.activeSection.value))

    function parseAccountTypeValue(value: string, fallback: AccountType = 'BANK'): AccountType {
        const normalized = value.trim().toUpperCase()
        return options.accountTypeOptions.includes(normalized as AccountType) ? normalized as AccountType : fallback
    }

    function parseTransactionKindValue(value: string, fallback: TransactionKind = 'EXPENSE'): TransactionKind {
        const normalized = value.trim().toUpperCase()
        return options.transactionKindOptions.includes(normalized as TransactionKind)
            ? normalized as TransactionKind
            : fallback
    }

    function parsePositiveCsvNumber(value: string) {
        const normalized = value.replace(/\s/g, '').replace(',', '.')
        const parsed = Number(normalized)
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null
    }

    function normalizeCurrencyCode(value: string, fallback = 'CAD') {
        const normalized = value.trim().toUpperCase()
        return normalized || fallback
    }

    function toDateKey(value: string) {
        const parsed = new Date(value)
        if (Number.isNaN(parsed.getTime())) return ''
        return parsed.toISOString().slice(0, 10)
    }

    function findAccountByName(list: Account[], name: string) {
        const target = name.trim().toLowerCase()
        return list.find((account) => account.name.trim().toLowerCase() === target)
    }

    function findCategoryByName(list: Category[], name: string) {
        const target = name.trim().toLowerCase()
        return list.find((category) => category.name.trim().toLowerCase() === target)
    }

    function currentEntityFileName(entity: EntityType) {
        if (entity === 'account') return 'budget-accounts.csv'
        if (entity === 'category') return 'budget-categories.csv'
        return 'budget-transactions.csv'
    }

    function buildAccountExportRows() {
        return options.accounts.value.map((account) => ({
            id: account.id,
            name: account.name,
            type: account.type,
            currency: account.currency,
            description: account.description || '',
        }))
    }

    function buildCategoryExportRows() {
        return options.categories.value.map((category) => ({
            id: category.id,
            name: category.name,
            kind: category.kind,
            color: category.color || '',
            description: category.description || '',
        }))
    }

    function buildTransactionExportRows() {
        return options.transactions.value.map((transaction) => ({
            id: transaction.id,
            label: transaction.label,
            amount: Math.abs(transaction.amount),
            kind: transaction.kind,
            date: toDateKey(transaction.date),
            note: transaction.note || '',
            accountId: transaction.accountId,
            accountName: transaction.account?.name || '',
            categoryId: transaction.categoryId || '',
            categoryName: transaction.category?.name || '',
            categoryKind: transaction.category?.kind || '',
            categoryColor: transaction.category?.color || '',
        }))
    }

    async function exportCurrentCsv() {
        const entity = currentCsvEntity.value
        const headers = entity === 'account'
            ? ['id', 'name', 'type', 'currency', 'description']
            : entity === 'category'
                ? ['id', 'name', 'kind', 'color', 'description']
                : ['id', 'label', 'amount', 'kind', 'date', 'note', 'accountId', 'accountName', 'categoryId', 'categoryName', 'categoryKind', 'categoryColor']

        const rows = entity === 'account'
            ? buildAccountExportRows()
            : entity === 'category'
                ? buildCategoryExportRows()
                : buildTransactionExportRows()

        const content = toCsv(rows, headers)

        const result = await window.file.saveText({
            title: `${tr('common.export')} ${entityCollectionLabel(entity)} CSV`,
            defaultPath: currentEntityFileName(entity),
            content,
            filters: [{name: 'CSV', extensions: ['csv']}],
        })

        if (!result?.canceled) {
            options.showNotice('success', tr('notices.csvExportDone', {entity: entityCollectionLabel(entity)}))
        }
    }

    async function importAccountsCsv(rows: CsvRecord[]) {
        const accountCache = [...options.accounts.value]
        let created = 0
        let updated = 0
        let skipped = 0

        for (const row of rows) {
            const name = readCsvValue(row, ['name', 'nom'])
            if (!name) {
                skipped += 1
                continue
            }

            const payload = {
                name,
                type: parseAccountTypeValue(readCsvValue(row, ['type']), 'BANK'),
                currency: normalizeCurrencyCode(readCsvValue(row, ['currency', 'devise']), 'CAD'),
                description: readCsvValue(row, ['description']) || null,
            }

            const existing = findAccountByName(accountCache, name)

            if (existing) {
                await window.db.account.update(existing.id, payload)
                existing.type = payload.type
                existing.currency = payload.currency
                existing.description = payload.description
                updated += 1
            } else {
                const createdAccount = await window.db.account.create(payload)
                accountCache.push(createdAccount)
                created += 1
            }
        }

        return {created, updated, skipped}
    }

    async function importCategoriesCsv(rows: CsvRecord[]) {
        const categoryCache = [...options.categories.value]
        let created = 0
        let updated = 0
        let skipped = 0

        for (const row of rows) {
            const name = readCsvValue(row, ['name', 'nom'])
            if (!name) {
                skipped += 1
                continue
            }

            const payload = {
                name,
                kind: parseTransactionKindValue(readCsvValue(row, ['kind', 'type']), 'EXPENSE'),
                color: readCsvValue(row, ['color', 'couleur']) || null,
                description: readCsvValue(row, ['description']) || null,
            }

            const existing = findCategoryByName(categoryCache, name)

            if (existing) {
                await window.db.category.update(existing.id, payload)
                existing.kind = payload.kind
                existing.color = payload.color
                existing.description = payload.description
                updated += 1
            } else {
                const createdCategory = await window.db.category.create(payload)
                categoryCache.push(createdCategory)
                created += 1
            }
        }

        return {created, updated, skipped}
    }

    async function resolveAccountFromCsvRow(row: CsvRecord, accountCache: Account[]) {
        const explicitId = readCsvValue(row, ['accountId', 'compteId'])
        if (explicitId) {
            const byId = accountCache.find((account) => account.id === Number(explicitId))
            if (byId) return {account: byId, created: false}
        }

        const name = readCsvValue(row, ['accountName', 'account', 'compte', 'nomCompte'])
        if (!name) {
            throw new Error(tr('notices.missingCsvTransactionAccount'))
        }

        const existing = findAccountByName(accountCache, name)
        if (existing) return {account: existing, created: false}

        const createdAccount = await window.db.account.create({
            name,
            type: parseAccountTypeValue(readCsvValue(row, ['accountType', 'typeCompte']), 'BANK'),
            currency: normalizeCurrencyCode(readCsvValue(row, ['accountCurrency', 'currency', 'devise']), 'CAD'),
            description: readCsvValue(row, ['accountDescription', 'descriptionCompte']) || null,
        })

        accountCache.push(createdAccount)
        return {account: createdAccount, created: true}
    }

    async function resolveCategoryFromCsvRow(
        row: CsvRecord,
        categoryCache: Category[],
        fallbackKind: TransactionKind,
    ) {
        const explicitId = readCsvValue(row, ['categoryId', 'categorieId'])
        if (explicitId) {
            const byId = categoryCache.find((category) => category.id === Number(explicitId))
            if (byId) return {category: byId, created: false}
        }

        const name = readCsvValue(row, ['categoryName', 'category', 'categorie', 'nomCategorie'])
        if (!name) {
            return {category: null, created: false}
        }

        const existing = findCategoryByName(categoryCache, name)
        if (existing) return {category: existing, created: false}

        const createdCategory = await window.db.category.create({
            name,
            kind: parseTransactionKindValue(readCsvValue(row, ['categoryKind', 'kind', 'typeCategorie']), fallbackKind),
            color: readCsvValue(row, ['categoryColor', 'color', 'couleurCategorie']) || null,
            description: readCsvValue(row, ['categoryDescription', 'descriptionCategorie']) || null,
        })

        categoryCache.push(createdCategory)
        return {category: createdCategory, created: true}
    }

    async function importTransactionsCsv(rows: CsvRecord[]) {
        const accountCache = [...options.accounts.value]
        const categoryCache = [...options.categories.value]
        const transactionCache = [...options.transactions.value]

        let created = 0
        let skipped = 0
        let createdAccounts = 0
        let createdCategories = 0

        for (const row of rows) {
            try {
                const label = readCsvValue(row, ['label', 'libelle'])
                const amount = parsePositiveCsvNumber(readCsvValue(row, ['amount', 'montant']))
                const date = readCsvValue(row, ['date'])
                const kind = parseTransactionKindValue(readCsvValue(row, ['kind', 'type']), 'EXPENSE')

                if (!label || !amount || !date || !toDateKey(date)) {
                    skipped += 1
                    continue
                }

                const accountResult = await resolveAccountFromCsvRow(row, accountCache)
                if (accountResult.created) createdAccounts += 1

                const categoryResult = await resolveCategoryFromCsvRow(row, categoryCache, kind)
                if (categoryResult.created) createdCategories += 1

                const duplicate = transactionCache.some((transaction) =>
                    transaction.label.trim().toLowerCase() === label.trim().toLowerCase()
                    && Math.abs(transaction.amount) === amount
                    && transaction.kind === kind
                    && toDateKey(transaction.date) === toDateKey(date)
                    && transaction.accountId === accountResult.account.id
                    && (transaction.categoryId ?? null) === (categoryResult.category?.id ?? null),
                )

                if (duplicate) {
                    skipped += 1
                    continue
                }

                const createdTransaction = await window.db.transaction.create({
                    label,
                    amount,
                    kind,
                    date,
                    note: readCsvValue(row, ['note', 'notes']) || null,
                    accountId: accountResult.account.id,
                    categoryId: categoryResult.category?.id ?? null,
                })

                transactionCache.push(createdTransaction)
                created += 1
            } catch {
                skipped += 1
            }
        }

        return {created, skipped, createdAccounts, createdCategories}
    }

    async function importCurrentCsv() {
        const entity = currentCsvEntity.value
        const result = await window.file.openText({
            title: `${tr('common.import')} ${entityCollectionLabel(entity)} CSV`,
            filters: [{name: 'CSV', extensions: ['csv']}],
        })

        if (!result || result.canceled || !result.content) {
            return
        }

        const rows = parseCsv(result.content)
        if (!rows.length) {
            options.showNotice('error', tr('notices.csvEmptyInvalid'))
            return
        }

        try {
            if (entity === 'account') {
                const summary = await importAccountsCsv(rows)
                await options.refreshData()
                options.showNotice('success', tr('notices.csvImportAccountsSummary', summary))
                return
            }

            if (entity === 'category') {
                const summary = await importCategoriesCsv(rows)
                await options.refreshData()
                options.showNotice('success', tr('notices.csvImportCategoriesSummary', summary))
                return
            }

            const summary = await importTransactionsCsv(rows)
            await options.refreshData()
            options.showNotice('success', tr('notices.csvImportTransactionsSummary', summary))
        } catch (error) {
            options.showNotice('error', error instanceof Error ? error.message : tr('notices.csvImportFailed'))
        }
    }

    return {
        currentCsvEntity,
        exportCurrentCsv,
        importCurrentCsv,
    }
}