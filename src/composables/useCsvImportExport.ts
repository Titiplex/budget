import {computed, ref, type Ref} from 'vue'
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
import {summarizeCsvRows, type ImportPreviewSummary} from '../utils/importValidation'
import {toDateOnly} from '../utils/date'

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

function absoluteAmount(value: number | null | undefined) {
    return Math.abs(value ?? 0)
}

export function useCsvImportExport(options: UseCsvImportExportOptions) {
    const currentCsvEntity = computed<EntityType>(() => sectionToEntityType(options.activeSection.value))

    const importPreviewOpen = ref(false)
    const pendingImportRows = ref<CsvRecord[] | null>(null)
    const pendingImportEntity = ref<EntityType>('transaction')
    const importPreviewSummary = ref<ImportPreviewSummary | null>(null)
    const pendingImportPath = ref<string | null>(null)

    function closeImportPreview() {
        importPreviewOpen.value = false
        pendingImportRows.value = null
        pendingImportPath.value = null
        importPreviewSummary.value = null
    }

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
        try {
            return toDateOnly(value)
        } catch {
            return ''
        }
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
        return options.transactions.value.map((transaction) => {
            const peerTransaction = transaction.transferGroup
                ? options.transactions.value.find((candidate) =>
                candidate.transferGroup === transaction.transferGroup && candidate.id !== transaction.id,
            ) || null
                : null

            const transferSourceTransaction = transaction.transferDirection === 'IN' ? peerTransaction : transaction
            const transferTargetTransaction = transaction.transferDirection === 'OUT' ? peerTransaction : transaction

            return {
                id: transaction.id,
                label: transaction.label,
                amount: absoluteAmount(transaction.amount),
                sourceAmount: absoluteAmount(transaction.sourceAmount ?? transaction.amount),
                sourceCurrency: transaction.sourceCurrency || '',
                conversionMode: transaction.conversionMode,
                exchangeRate: transaction.exchangeRate ?? '',
                exchangeProvider: transaction.exchangeProvider || '',
                exchangeDate: transaction.exchangeDate ? toDateKey(transaction.exchangeDate) : '',
                kind: transaction.kind,
                date: toDateKey(transaction.date),
                note: transaction.note || '',
                accountId: transaction.accountId,
                accountName: transaction.account?.name || '',
                categoryId: transaction.categoryId || '',
                categoryName: transaction.category?.name || '',
                categoryKind: transaction.category?.kind || '',
                categoryColor: transaction.category?.color || '',
                transferGroup: transaction.transferGroup || '',
                transferDirection: transaction.transferDirection || '',
                transferPeerAccountId: transaction.transferPeerAccountId || '',
                transferPeerAccountName: transaction.transferPeerAccount?.name || '',
                transferSourceAccountId: transferSourceTransaction?.accountId || '',
                transferSourceAccountName: transferSourceTransaction?.account?.name || '',
                transferTargetAccountId: transferTargetTransaction?.accountId || '',
                transferTargetAccountName: transferTargetTransaction?.account?.name || '',
                transferSourceAmount: absoluteAmount(transferSourceTransaction?.sourceAmount ?? transferSourceTransaction?.amount),
                transferTargetAmount: absoluteAmount(transferTargetTransaction?.amount),
            }
        })
    }

    async function exportCurrentCsv() {
        const entity = currentCsvEntity.value
        const headers = entity === 'account'
            ? ['id', 'name', 'type', 'currency', 'description']
            : entity === 'category'
                ? ['id', 'name', 'kind', 'color', 'description']
                : [
                    'id',
                    'label',
                    'amount',
                    'sourceAmount',
                    'sourceCurrency',
                    'conversionMode',
                    'exchangeRate',
                    'exchangeProvider',
                    'exchangeDate',
                    'kind',
                    'date',
                    'note',
                    'accountId',
                    'accountName',
                    'categoryId',
                    'categoryName',
                    'categoryKind',
                    'categoryColor',
                    'transferGroup',
                    'transferDirection',
                    'transferPeerAccountId',
                    'transferPeerAccountName',
                    'transferSourceAccountId',
                    'transferSourceAccountName',
                    'transferTargetAccountId',
                    'transferTargetAccountName',
                    'transferSourceAmount',
                    'transferTargetAmount',
                ]

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

    async function resolveAccountReference(
        row: CsvRecord,
        accountCache: Account[],
        lookup: {
            idKeys: string[]
            nameKeys: string[]
            typeKeys?: string[]
            currencyKeys?: string[]
            descriptionKeys?: string[]
            required?: boolean
        },
    ) {
        const explicitId = readCsvValue(row, lookup.idKeys)
        if (explicitId) {
            const byId = accountCache.find((account) => account.id === Number(explicitId))
            if (byId) return {account: byId, created: false}
        }

        const name = readCsvValue(row, lookup.nameKeys)
        if (!name) {
            if (lookup.required) {
                throw new Error(tr('notices.missingCsvTransactionAccount'))
            }
            return {account: null, created: false}
        }

        const existing = findAccountByName(accountCache, name)
        if (existing) return {account: existing, created: false}

        const createdAccount = await window.db.account.create({
            name,
            type: parseAccountTypeValue(readCsvValue(row, lookup.typeKeys || []), 'BANK'),
            currency: normalizeCurrencyCode(readCsvValue(row, lookup.currencyKeys || []), 'CAD'),
            description: readCsvValue(row, lookup.descriptionKeys || []) || null,
        })

        accountCache.push(createdAccount)
        return {account: createdAccount, created: true}
    }

    async function resolveAccountFromCsvRow(row: CsvRecord, accountCache: Account[]) {
        return resolveAccountReference(row, accountCache, {
            idKeys: ['accountId', 'compteId'],
            nameKeys: ['accountName', 'account', 'compte', 'nomCompte'],
            typeKeys: ['accountType', 'typeCompte'],
            currencyKeys: ['accountCurrency', 'currency', 'devise'],
            descriptionKeys: ['accountDescription', 'descriptionCompte'],
            required: true,
        })
    }

    async function resolveTransferTargetAccount(row: CsvRecord, accountCache: Account[]) {
        return resolveAccountReference(row, accountCache, {
            idKeys: ['transferTargetAccountId', 'transferPeerAccountId', 'compteDestinationId'],
            nameKeys: ['transferTargetAccountName', 'transferPeerAccountName', 'compteDestinationNom'],
            typeKeys: ['transferTargetAccountType'],
            currencyKeys: ['transferTargetAccountCurrency'],
            descriptionKeys: ['transferTargetAccountDescription'],
            required: false,
        })
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
        const transferGroups = new Map<string, CsvRecord[]>()
        const processedTransferGroups = new Set<string>()

        for (const row of rows) {
            const transferGroup = readCsvValue(row, ['transferGroup'])
            if (transferGroup) {
                const entries = transferGroups.get(transferGroup) || []
                entries.push(row)
                transferGroups.set(transferGroup, entries)
            }
        }

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
                const transferGroup = readCsvValue(row, ['transferGroup'])
                const transferDirection = readCsvValue(row, ['transferDirection']).toUpperCase()

                if (!label || !amount || !date || !toDateKey(date)) {
                    skipped += 1
                    continue
                }

                if (kind === 'TRANSFER') {
                    if (transferGroup && processedTransferGroups.has(transferGroup)) {
                        skipped += 1
                        continue
                    }

                    if (transferDirection === 'IN' && transferGroup) {
                        skipped += 1
                        continue
                    }
                }

                const accountResult = await resolveAccountFromCsvRow(row, accountCache)
                if (accountResult.created) createdAccounts += 1
                const sourceAccount = accountResult.account
                if (!sourceAccount) {
                    skipped += 1
                    continue
                }

                if (kind === 'TRANSFER') {
                    const groupedRows = transferGroup ? (transferGroups.get(transferGroup) || []) : []
                    const incomingRow = groupedRows.find((entry) => readCsvValue(entry, ['transferDirection']).toUpperCase() === 'IN') || null
                    const targetLookupRow = incomingRow || row
                    const targetAccountResult = await resolveTransferTargetAccount(targetLookupRow, accountCache)
                    if (targetAccountResult.created) createdAccounts += 1
                    const targetAccount = targetAccountResult.account

                    if (!targetAccount || targetAccount.id === sourceAccount.id) {
                        skipped += 1
                        continue
                    }

                    const transferSourceAmount = parsePositiveCsvNumber(
                        readCsvValue(row, ['transferSourceAmount', 'sourceAmount', 'montantSource']) || String(amount),
                    ) || amount
                    const transferTargetAmount = parsePositiveCsvNumber(
                        readCsvValue(targetLookupRow, ['transferTargetAmount', 'amount', 'montant']) || String(amount),
                    ) || amount
                    const sourceCurrency = normalizeCurrencyCode(
                        readCsvValue(row, ['sourceCurrency']) || sourceAccount.currency,
                        sourceAccount.currency,
                    )
                    const conversionMode = readCsvValue(targetLookupRow, ['conversionMode']).toUpperCase() || 'NONE'
                    const exchangeRateRaw = readCsvValue(targetLookupRow, ['exchangeRate'])
                    const exchangeRate = exchangeRateRaw ? Number(exchangeRateRaw.replace(',', '.')) : null

                    const duplicateTransfer = transactionCache.some((transaction) =>
                        transaction.kind === 'TRANSFER'
                        && transaction.transferDirection === 'OUT'
                        && transaction.accountId === sourceAccount.id
                        && transaction.transferPeerAccountId === targetAccount.id
                        && absoluteAmount(transaction.sourceAmount ?? transaction.amount) === transferSourceAmount
                        && toDateKey(transaction.date) === toDateKey(date)
                        && transaction.label.trim().toLowerCase() === label.trim().toLowerCase(),
                    )

                    if (duplicateTransfer) {
                        skipped += 1
                        if (transferGroup) processedTransferGroups.add(transferGroup)
                        continue
                    }

                    const createdTransaction = await window.db.transaction.create({
                        label,
                        amount: transferTargetAmount,
                        sourceAmount: transferSourceAmount,
                        sourceCurrency,
                        conversionMode: ['NONE', 'MANUAL', 'AUTOMATIC'].includes(conversionMode)
                            ? conversionMode as 'NONE' | 'MANUAL' | 'AUTOMATIC'
                            : 'NONE',
                        exchangeRate: Number.isFinite(exchangeRate ?? Number.NaN) ? exchangeRate : null,
                        exchangeProvider: readCsvValue(targetLookupRow, ['exchangeProvider']) || null,
                        exchangeDate: readCsvValue(targetLookupRow, ['exchangeDate']) || null,
                        kind: 'TRANSFER',
                        date,
                        note: readCsvValue(row, ['note', 'notes']) || null,
                        accountId: sourceAccount.id,
                        categoryId: null,
                        transferTargetAccountId: targetAccount.id,
                    })

                    transactionCache.push(createdTransaction)
                    created += 1
                    if (transferGroup) processedTransferGroups.add(transferGroup)
                    continue
                }

                const categoryResult = await resolveCategoryFromCsvRow(row, categoryCache, kind)
                if (categoryResult.created) createdCategories += 1

                const duplicate = transactionCache.some((transaction) =>
                    transaction.label.trim().toLowerCase() === label.trim().toLowerCase()
                    && absoluteAmount(transaction.amount) === amount
                    && transaction.kind === kind
                    && toDateKey(transaction.date) === toDateKey(date)
                    && transaction.accountId === sourceAccount.id
                    && (transaction.categoryId ?? null) === (categoryResult.category?.id ?? null),
                )

                if (duplicate) {
                    skipped += 1
                    continue
                }

                const sourceAmount = parsePositiveCsvNumber(readCsvValue(row, ['sourceAmount', 'montantSource']))
                const conversionMode = readCsvValue(row, ['conversionMode']).toUpperCase() || 'NONE'
                const exchangeRateRaw = readCsvValue(row, ['exchangeRate'])
                const exchangeRate = exchangeRateRaw ? Number(exchangeRateRaw.replace(',', '.')) : null

                const createdTransaction = await window.db.transaction.create({
                    label,
                    amount,
                    sourceAmount,
                    sourceCurrency: readCsvValue(row, ['sourceCurrency']) || null,
                    conversionMode: ['NONE', 'MANUAL', 'AUTOMATIC'].includes(conversionMode)
                        ? conversionMode as 'NONE' | 'MANUAL' | 'AUTOMATIC'
                        : 'NONE',
                    exchangeRate: Number.isFinite(exchangeRate ?? Number.NaN) ? exchangeRate : null,
                    exchangeProvider: readCsvValue(row, ['exchangeProvider']) || null,
                    exchangeDate: readCsvValue(row, ['exchangeDate']) || null,
                    kind,
                    date,
                    note: readCsvValue(row, ['note', 'notes']) || null,
                    accountId: sourceAccount.id,
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

    async function beginImportCurrentCsv() {
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

        pendingImportEntity.value = entity
        pendingImportRows.value = rows
        pendingImportPath.value = result.filePath
        importPreviewSummary.value = summarizeCsvRows(entity, rows)
        importPreviewOpen.value = true
    }

    async function confirmImportCurrentCsv() {
        if (!pendingImportRows.value) return

        const entity = pendingImportEntity.value
        const rows = pendingImportRows.value

        try {
            if (entity === 'account') {
                const summary = await importAccountsCsv(rows)
                await options.refreshData()
                options.showNotice('success', tr('notices.csvImportAccountsSummary', summary))
                closeImportPreview()
                return
            }

            if (entity === 'category') {
                const summary = await importCategoriesCsv(rows)
                await options.refreshData()
                options.showNotice('success', tr('notices.csvImportCategoriesSummary', summary))
                closeImportPreview()
                return
            }

            const summary = await importTransactionsCsv(rows)
            await options.refreshData()
            options.showNotice('success', tr('notices.csvImportTransactionsSummary', summary))
            closeImportPreview()
        } catch (error) {
            options.showNotice('error', error instanceof Error ? error.message : tr('notices.csvImportFailed'))
        }
    }

    return {
        currentCsvEntity,
        exportCurrentCsv,
        beginImportCurrentCsv,
        confirmImportCurrentCsv,
        closeImportPreview,
        importPreviewOpen,
        importPreviewSummary,
        pendingImportEntity,
        pendingImportPath,
    }
}
