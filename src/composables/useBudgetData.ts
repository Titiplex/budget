import {computed, reactive, ref, watch} from 'vue'
import type {
    Account,
    AccountSummary,
    AccountType,
    Category,
    CategorySummary,
    ConversionMode,
    CreateTabKey,
    DeleteState,
    EditTarget,
    EntityType,
    ExpenseBreakdownItem,
    MonthlyPoint,
    PanelMode,
    SectionKey,
    Transaction,
    TransactionKind,
} from '../types/budget'
import {currentLocaleCode, tr} from '../i18n'
import {kindLabel} from '../utils/budgetFormat'
import {toDateOnly} from '../utils/date'
import {collapseTransferTransactions} from "../utils/transferDisplay";

export function useBudgetData(
    showNotice: (type: 'success' | 'error', text: string) => void,
) {
    const accountTypeOptions: AccountType[] = [
        'BANK',
        'CASH',
        'SAVINGS',
        'CREDIT',
        'INVESTMENT',
        'OTHER',
    ]

    const transactionKindOptions: TransactionKind[] = [
        'EXPENSE',
        'INCOME',
        'TRANSFER',
    ]

    const accounts = ref<Account[]>([])
    const categories = ref<Category[]>([])
    const transactions = ref<Transaction[]>([])

    const loading = ref(true)
    const saving = ref(false)
    const sidebarOpen = ref(false)
    const createPanelOpen = ref(false)
    const activeSection = ref<SectionKey>('overview')
    const createTab = ref<CreateTabKey>('transaction')
    const panelMode = ref<PanelMode>('create')
    const editingTarget = ref<EditTarget | null>(null)

    const fxBusy = ref(false)
    const fxPreview = ref<{ convertedAmount: number; rate: number; provider: string; date: string } | null>(null)

    const deleteDialog = reactive<DeleteState>({
        open: false,
        busy: false,
        type: 'transaction',
        id: 0,
        label: '',
        heading: '',
        message: '',
    })

    const transactionSearch = ref('')
    const transactionKindFilter = ref<'ALL' | TransactionKind>('ALL')
    const transactionAccountFilter = ref('ALL')
    const transactionCategoryFilter = ref('ALL')

    const accountForm = reactive({
        name: '',
        type: 'BANK' as AccountType,
        currency: 'CAD',
        description: '',
    })

    const categoryForm = reactive({
        name: '',
        kind: 'EXPENSE' as TransactionKind,
        color: '#8b5cf6',
        description: '',
    })

    const transactionForm = reactive({
        label: '',
        amount: '',
        currency: 'CAD',
        accountAmount: '',
        conversionMode: 'NONE' as ConversionMode,
        exchangeRate: '',
        exchangeProvider: '',
        exchangeDate: toDateOnly(new Date()),
        kind: 'EXPENSE' as TransactionKind,
        date: toDateOnly(new Date()),
        note: '',
        accountId: '',
        transferTargetAccountId: '',
        categoryId: '',
    })

    function normalizeError(error: unknown) {
        if (error instanceof Error && error.message) {
            return error.message
        }
        return tr('notices.unknownError')
    }

    function parsePositive(value: string | number, fieldLabel: string) {
        const parsed = Number(value)
        if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new Error(tr('notices.strictlyPositiveField', {field: fieldLabel}))
        }
        return parsed
    }

    function normalizedCurrency(value: string | null | undefined) {
        return (value || '').trim().toUpperCase()
    }

    function deleteDialogHeading(type: EntityType, entity: Transaction | AccountSummary | CategorySummary | Account | Category) {
        if (type === 'account') return tr('deleteDialog.deleteAccount')
        if (type === 'category') return tr('deleteDialog.deleteCategory')

        const transaction = entity as Transaction
        return transaction.kind === 'TRANSFER'
            ? tr('deleteDialog.deleteTransfer')
            : tr('deleteDialog.deleteTransaction')
    }

    function resetAccountForm() {
        accountForm.name = ''
        accountForm.type = 'BANK'
        accountForm.currency = 'CAD'
        accountForm.description = ''
    }

    function resetCategoryForm() {
        categoryForm.name = ''
        categoryForm.kind = 'EXPENSE'
        categoryForm.color = '#8b5cf6'
        categoryForm.description = ''
    }

    function resetTransactionForm() {
        transactionForm.label = ''
        transactionForm.amount = ''
        transactionForm.currency = selectedTransactionAccountCurrency.value || 'CAD'
        transactionForm.accountAmount = ''
        transactionForm.conversionMode = 'NONE'
        transactionForm.exchangeRate = ''
        transactionForm.exchangeProvider = ''
        transactionForm.exchangeDate = toDateOnly(new Date())
        transactionForm.kind = 'EXPENSE'
        transactionForm.date = toDateOnly(new Date())
        transactionForm.note = ''
        transactionForm.accountId = ''
        transactionForm.transferTargetAccountId = ''
        transactionForm.categoryId = ''
        fxPreview.value = null
    }

    function resetAllForms() {
        resetAccountForm()
        resetCategoryForm()
        resetTransactionForm()
    }

    function selectSection(section: SectionKey) {
        activeSection.value = section
        sidebarOpen.value = false
    }

    function openCreatePanel(tab: CreateTabKey) {
        panelMode.value = 'create'
        editingTarget.value = null
        createTab.value = tab
        resetAllForms()

        if (tab === 'transaction' && accounts.value.length === 1) {
            transactionForm.accountId = String(accounts.value[0].id)
            transactionForm.currency = accounts.value[0].currency
        }

        createPanelOpen.value = true
    }

    function openEditAccount(account: AccountSummary | Account) {
        panelMode.value = 'edit'
        editingTarget.value = {type: 'account', id: account.id}
        createTab.value = 'account'
        accountForm.name = account.name
        accountForm.type = account.type
        accountForm.currency = account.currency
        accountForm.description = account.description || ''
        createPanelOpen.value = true
    }

    function openEditCategory(category: CategorySummary | Category) {
        panelMode.value = 'edit'
        editingTarget.value = {type: 'category', id: category.id}
        createTab.value = 'category'
        categoryForm.name = category.name
        categoryForm.kind = category.kind
        categoryForm.color = category.color || '#8b5cf6'
        categoryForm.description = category.description || ''
        createPanelOpen.value = true
    }

    function openEditTransaction(transaction: Transaction) {
        panelMode.value = 'edit'
        editingTarget.value = {type: 'transaction', id: transaction.id}
        createTab.value = 'transaction'

        if (transaction.transferGroup) {
            const groupTransactions = transactions.value.filter((entry) => entry.transferGroup === transaction.transferGroup)
            const outgoing = groupTransactions.find((entry) => entry.transferDirection === 'OUT')
                || (transaction.transferDirection === 'OUT' ? transaction : null)
            const incoming = groupTransactions.find((entry) => entry.transferDirection === 'IN')
                || (transaction.transferDirection === 'IN' ? transaction : null)
            const sourceTransaction = outgoing || transaction
            const targetTransaction = incoming || transaction

            transactionForm.label = sourceTransaction.label
            transactionForm.amount = String(Math.abs(sourceTransaction.sourceAmount ?? sourceTransaction.amount))
            transactionForm.currency = normalizedCurrency(sourceTransaction.account?.currency || sourceTransaction.sourceCurrency || 'CAD')
            transactionForm.accountAmount = String(Math.abs(targetTransaction.amount))
            transactionForm.conversionMode = targetTransaction.conversionMode || 'NONE'
            transactionForm.exchangeRate = targetTransaction.exchangeRate ? String(targetTransaction.exchangeRate) : ''
            transactionForm.exchangeProvider = targetTransaction.exchangeProvider || ''
            transactionForm.exchangeDate = targetTransaction.exchangeDate
                ? toDateOnly(new Date(targetTransaction.exchangeDate))
                : toDateOnly(new Date(targetTransaction.date))
            transactionForm.kind = 'TRANSFER'
            transactionForm.date = toDateOnly(new Date(sourceTransaction.date))
            transactionForm.note = sourceTransaction.note || ''
            transactionForm.accountId = String(sourceTransaction.accountId)
            transactionForm.transferTargetAccountId = String(targetTransaction.accountId)
            transactionForm.categoryId = ''
            fxPreview.value = targetTransaction.exchangeRate && targetTransaction.conversionMode !== 'NONE'
                ? {
                    convertedAmount: Math.abs(targetTransaction.amount),
                    rate: targetTransaction.exchangeRate,
                    provider: targetTransaction.exchangeProvider || 'UNKNOWN',
                    date: targetTransaction.exchangeDate || targetTransaction.date,
                }
                : null
            createPanelOpen.value = true
            return
        }

        transactionForm.label = transaction.label
        transactionForm.amount = String(Math.abs(transaction.sourceAmount ?? transaction.amount))
        transactionForm.currency = normalizedCurrency(transaction.sourceCurrency || transaction.account?.currency || 'CAD')
        transactionForm.accountAmount = String(Math.abs(transaction.amount))
        transactionForm.conversionMode = transaction.conversionMode || 'NONE'
        transactionForm.exchangeRate = transaction.exchangeRate ? String(transaction.exchangeRate) : ''
        transactionForm.exchangeProvider = transaction.exchangeProvider || ''
        transactionForm.exchangeDate = transaction.exchangeDate
            ? toDateOnly(new Date(transaction.exchangeDate))
            : toDateOnly(new Date(transaction.date))
        transactionForm.kind = transaction.kind
        transactionForm.date = toDateOnly(new Date(transaction.date))
        transactionForm.note = transaction.note || ''
        transactionForm.accountId = String(transaction.accountId)
        transactionForm.transferTargetAccountId = ''
        transactionForm.categoryId = transaction.categoryId == null ? '' : String(transaction.categoryId)
        fxPreview.value = transaction.exchangeRate && transaction.conversionMode !== 'NONE'
            ? {
                convertedAmount: Math.abs(transaction.amount),
                rate: transaction.exchangeRate,
                provider: transaction.exchangeProvider || 'UNKNOWN',
                date: transaction.exchangeDate || transaction.date,
            }
            : null
        createPanelOpen.value = true
    }

    function closeCreatePanel() {
        createPanelOpen.value = false
        panelMode.value = 'create'
        editingTarget.value = null
        fxPreview.value = null
        resetAllForms()
    }

    function openDeleteDialog(type: EntityType, entity: Transaction | AccountSummary | CategorySummary | Account | Category) {
        deleteDialog.type = type
        deleteDialog.id = entity.id
        deleteDialog.label = 'label' in entity ? entity.label : entity.name
        deleteDialog.heading = deleteDialogHeading(type, entity)
        deleteDialog.open = true
        deleteDialog.busy = false

        if (type === 'account') {
            const count = 'transactionCount' in entity
                ? entity.transactionCount
                : transactions.value.filter((tx) => tx.accountId === entity.id).length

            deleteDialog.message = count > 0
                ? tr('deleteDialog.accountCascade', {count})
                : tr('deleteDialog.accountSimple')
            return
        }

        if (type === 'category') {
            const count = 'transactionCount' in entity
                ? entity.transactionCount
                : transactions.value.filter((tx) => tx.categoryId === entity.id).length

            deleteDialog.message = count > 0
                ? tr('deleteDialog.categoryCascade', {count})
                : tr('deleteDialog.categorySimple')
            return
        }

        const transaction = entity as Transaction
        deleteDialog.message = transaction.kind === 'TRANSFER'
            ? tr('deleteDialog.transferCascade')
            : tr('deleteDialog.transactionSimple')
    }

    function requestDeleteCurrentForm() {
        if (!editingTarget.value) return

        if (editingTarget.value.type === 'transaction') {
            const currentTransaction = transactions.value.find((entry) => entry.id === editingTarget.value?.id)

            if (currentTransaction) {
                openDeleteDialog('transaction', currentTransaction)
                return
            }

            openDeleteDialog('transaction', {
                id: editingTarget.value.id,
                label: transactionForm.label,
                amount: Number(transactionForm.accountAmount || transactionForm.amount || 0),
                sourceAmount: Number(transactionForm.amount || 0),
                sourceCurrency: transactionForm.currency || null,
                conversionMode: transactionForm.conversionMode,
                exchangeRate: transactionForm.exchangeRate ? Number(transactionForm.exchangeRate) : null,
                exchangeProvider: transactionForm.exchangeProvider || null,
                exchangeDate: transactionForm.exchangeDate || null,
                kind: transactionForm.kind,
                date: transactionForm.date,
                note: transactionForm.note || null,
                accountId: Number(transactionForm.accountId || 0),
                categoryId: transactionForm.categoryId ? Number(transactionForm.categoryId) : null,
            })
            return
        }

        if (editingTarget.value.type === 'account') {
            openDeleteDialog('account', {
                id: editingTarget.value.id,
                name: accountForm.name,
                type: accountForm.type,
                currency: accountForm.currency,
                description: accountForm.description || null,
            })
            return
        }

        openDeleteDialog('category', {
            id: editingTarget.value.id,
            name: categoryForm.name,
            kind: categoryForm.kind,
            color: categoryForm.color,
            description: categoryForm.description || null,
        })
    }

    function closeDeleteDialog() {
        deleteDialog.open = false
        deleteDialog.busy = false
        deleteDialog.id = 0
        deleteDialog.label = ''
        deleteDialog.heading = ''
        deleteDialog.message = ''
        deleteDialog.type = 'transaction'
    }

    async function refreshData() {
        loading.value = true

        try {
            const [nextAccounts, nextCategories, nextTransactions] = await Promise.all([
                window.db.account.list(),
                window.db.category.list(),
                window.db.transaction.list(),
            ])

            accounts.value = nextAccounts
            categories.value = nextCategories
            transactions.value = nextTransactions
        } catch (error) {
            showNotice('error', normalizeError(error))
        } finally {
            loading.value = false
        }
    }

    async function confirmDelete() {
        deleteDialog.busy = true

        try {
            if (deleteDialog.type === 'account') {
                await window.db.account.delete(deleteDialog.id)
                showNotice('success', tr('notices.accountDeleted'))
            } else if (deleteDialog.type === 'category') {
                await window.db.category.delete(deleteDialog.id)
                showNotice('success', tr('notices.categoryDeleted'))
            } else {
                await window.db.transaction.delete(deleteDialog.id)
                showNotice('success', tr('notices.transactionDeleted'))
            }

            if (
                createPanelOpen.value &&
                editingTarget.value &&
                editingTarget.value.type === deleteDialog.type &&
                editingTarget.value.id === deleteDialog.id
            ) {
                closeCreatePanel()
            }

            closeDeleteDialog()
            await refreshData()
        } catch (error) {
            showNotice('error', normalizeError(error))
            deleteDialog.busy = false
        }
    }

    async function submitAccount() {
        const name = accountForm.name.trim()
        const currency = accountForm.currency.trim().toUpperCase()

        if (!name) {
            showNotice('error', tr('notices.accountNameRequired'))
            return
        }

        if (!currency || currency.length < 3) {
            showNotice('error', tr('notices.currencyTooShort'))
            return
        }

        saving.value = true
        try {
            const payload = {
                name,
                type: accountForm.type,
                currency,
                description: accountForm.description.trim() || null,
            }

            if (panelMode.value === 'edit' && editingTarget.value?.type === 'account') {
                await window.db.account.update(editingTarget.value.id, payload)
                showNotice('success', tr('notices.accountUpdated'))
            } else {
                await window.db.account.create(payload)
                showNotice('success', tr('notices.accountCreated'))
            }

            await refreshData()
            activeSection.value = 'accounts'
            closeCreatePanel()
        } catch (error) {
            showNotice('error', normalizeError(error))
        } finally {
            saving.value = false
        }
    }

    async function submitCategory() {
        const name = categoryForm.name.trim()

        if (!name) {
            showNotice('error', tr('notices.categoryNameRequired'))
            return
        }

        saving.value = true
        try {
            const payload = {
                name,
                kind: categoryForm.kind,
                color: categoryForm.color.trim() || null,
                description: categoryForm.description.trim() || null,
            }

            if (panelMode.value === 'edit' && editingTarget.value?.type === 'category') {
                await window.db.category.update(editingTarget.value.id, payload)
                showNotice('success', tr('notices.categoryUpdated'))
            } else {
                await window.db.category.create(payload)
                showNotice('success', tr('notices.categoryCreated'))
            }

            await refreshData()
            activeSection.value = 'categories'
            closeCreatePanel()
        } catch (error) {
            showNotice('error', normalizeError(error))
        } finally {
            saving.value = false
        }
    }

    const selectedTransactionAccount = computed(() =>
        accounts.value.find((account) => String(account.id) === transactionForm.accountId) || null,
    )

    const selectedTransferTargetAccount = computed(() =>
        accounts.value.find((account) => String(account.id) === transactionForm.transferTargetAccountId) || null,
    )

    const selectedTransactionAccountCurrency = computed(() =>
        selectedTransactionAccount.value?.currency || 'CAD',
    )

    const selectedTransferTargetCurrency = computed(() =>
        selectedTransferTargetAccount.value?.currency || selectedTransactionAccountCurrency.value,
    )

    const transactionSourceCurrency = computed(() => {
        if (transactionForm.kind === 'TRANSFER') {
            return normalizedCurrency(selectedTransactionAccountCurrency.value)
        }
        return normalizedCurrency(transactionForm.currency || selectedTransactionAccountCurrency.value)
            || normalizedCurrency(selectedTransactionAccountCurrency.value)
    })

    const transactionTargetCurrency = computed(() => {
        if (transactionForm.kind === 'TRANSFER') {
            return normalizedCurrency(selectedTransferTargetCurrency.value)
        }
        return normalizedCurrency(selectedTransactionAccountCurrency.value)
    })

    const isTransactionForeignCurrency = computed(() =>
        transactionSourceCurrency.value !== transactionTargetCurrency.value,
    )

    async function quoteTransactionFx() {
        if (!transactionForm.accountId) {
            showNotice('error', tr('notices.accountRequiredBeforeFx'))
            return
        }

        if (transactionForm.kind === 'TRANSFER' && !transactionForm.transferTargetAccountId) {
            showNotice('error', tr('notices.transferTargetRequiredBeforeFx'))
            return
        }

        const sourceCurrency = transactionSourceCurrency.value
        const targetCurrency = transactionTargetCurrency.value
        const sourceAmount = parsePositive(transactionForm.amount, tr('forms.fields.enteredAmount'))

        fxBusy.value = true
        try {
            const quote = await window.fx.quoteHistorical({
                from: sourceCurrency,
                to: targetCurrency,
                amount: sourceAmount,
                date: transactionForm.date,
            })

            transactionForm.accountAmount = String(quote.convertedAmount)
            transactionForm.exchangeRate = String(quote.rate)
            transactionForm.exchangeProvider = quote.provider
            transactionForm.exchangeDate = quote.date
            transactionForm.conversionMode = sourceCurrency === targetCurrency ? 'NONE' : 'AUTOMATIC'
            fxPreview.value = quote
        } catch (error) {
            showNotice('error', normalizeError(error))
        } finally {
            fxBusy.value = false
        }
    }

    async function submitTransaction() {
        if (!accounts.value.length) {
            showNotice('error', tr('notices.accountNeededBeforeTransaction'))
            return
        }

        if (!transactionForm.accountId) {
            showNotice('error', tr('notices.accountRequired'))
            return
        }

        const label = transactionForm.label.trim()
        const sourceAmount = Number(transactionForm.amount)

        if (!label) {
            showNotice('error', tr('notices.transactionLabelRequired'))
            return
        }

        if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
            showNotice('error', tr('notices.positiveAmountRequired'))
            return
        }

        if (!transactionForm.date) {
            showNotice('error', tr('notices.dateRequired'))
            return
        }

        if (transactionForm.kind === 'TRANSFER') {
            if (!transactionForm.transferTargetAccountId) {
                showNotice('error', tr('notices.transferTargetRequired'))
                return
            }

            if (transactionForm.transferTargetAccountId === transactionForm.accountId) {
                showNotice('error', tr('notices.transferAccountsMustDiffer'))
                return
            }
        }

        const sourceCurrency = transactionSourceCurrency.value
        const targetCurrency = transactionTargetCurrency.value

        saving.value = true
        try {
            let bookedAmount = sourceAmount
            let conversionMode: ConversionMode = 'NONE'
            let exchangeRate = 1
            let exchangeProvider = 'ACCOUNT'
            let exchangeDate = transactionForm.date

            if (sourceCurrency !== targetCurrency) {
                if (transactionForm.conversionMode === 'AUTOMATIC') {
                    const quote = await window.fx.quoteHistorical({
                        from: sourceCurrency,
                        to: targetCurrency,
                        amount: sourceAmount,
                        date: transactionForm.date,
                    })

                    bookedAmount = quote.convertedAmount
                    conversionMode = 'AUTOMATIC'
                    exchangeRate = quote.rate
                    exchangeProvider = quote.provider
                    exchangeDate = quote.date
                    fxPreview.value = quote
                    transactionForm.accountAmount = String(quote.convertedAmount)
                    transactionForm.exchangeRate = String(quote.rate)
                    transactionForm.exchangeProvider = quote.provider
                    transactionForm.exchangeDate = quote.date
                } else {
                    bookedAmount = parsePositive(
                        transactionForm.accountAmount,
                        transactionForm.kind === 'TRANSFER'
                            ? tr('forms.fields.creditedAmountPlain')
                            : tr('forms.fields.accountAmountPlain'),
                    )
                    conversionMode = 'MANUAL'
                    exchangeRate = bookedAmount / sourceAmount
                    exchangeProvider = transactionForm.exchangeProvider.trim() || 'MANUAL'
                    exchangeDate = transactionForm.exchangeDate || transactionForm.date
                }
            } else {
                transactionForm.accountAmount = String(sourceAmount)
                transactionForm.exchangeRate = '1'
                transactionForm.exchangeProvider = 'ACCOUNT'
                transactionForm.exchangeDate = transactionForm.date
            }

            const payload = {
                label,
                amount: bookedAmount,
                sourceAmount,
                sourceCurrency,
                conversionMode,
                exchangeRate,
                exchangeProvider,
                exchangeDate,
                kind: transactionForm.kind,
                date: transactionForm.date,
                note: transactionForm.note.trim() || null,
                accountId: Number(transactionForm.accountId),
                categoryId: transactionForm.kind === 'TRANSFER'
                    ? null
                    : (transactionForm.categoryId ? Number(transactionForm.categoryId) : null),
                transferTargetAccountId: transactionForm.kind === 'TRANSFER'
                    ? Number(transactionForm.transferTargetAccountId)
                    : null,
            }

            if (panelMode.value === 'edit' && editingTarget.value?.type === 'transaction') {
                await window.db.transaction.update(editingTarget.value.id, payload)
                showNotice('success', tr('notices.transactionUpdated'))
            } else {
                await window.db.transaction.create(payload)
                showNotice('success', tr('notices.transactionCreated'))
            }

            await refreshData()
            activeSection.value = 'transactions'
            closeCreatePanel()
        } catch (error) {
            showNotice('error', normalizeError(error))
        } finally {
            saving.value = false
        }
    }

    watch(
        () => [selectedTransactionAccountCurrency.value, transactionForm.kind],
        ([currency, kind]) => {
            if (kind === 'TRANSFER') {
                transactionForm.currency = currency
                return
            }

            if (!transactionForm.currency) {
                transactionForm.currency = currency
            }
        },
        {immediate: true},
    )

    watch(
        () => [transactionForm.amount, transactionSourceCurrency.value, transactionTargetCurrency.value, transactionForm.date],
        () => {
            const sourceCurrency = transactionSourceCurrency.value
            const targetCurrency = transactionTargetCurrency.value
            if (sourceCurrency && sourceCurrency === targetCurrency) {
                transactionForm.conversionMode = 'NONE'
                transactionForm.accountAmount = transactionForm.amount
                transactionForm.exchangeRate = transactionForm.amount ? '1' : ''
                transactionForm.exchangeProvider = 'ACCOUNT'
                transactionForm.exchangeDate = transactionForm.date
                fxPreview.value = null
            }
        },
    )

    watch(() => transactionForm.kind, () => {
        if (transactionForm.kind === 'TRANSFER') {
            transactionForm.categoryId = ''
            return
        }

        if (!transactionForm.categoryId) return

        const stillAllowed = transactionFormCategories.value.some(
            (category) => String(category.id) === transactionForm.categoryId,
        )

        if (!stillAllowed) {
            transactionForm.categoryId = ''
        }
    })

    const summaryCurrency = computed(() => accounts.value[0]?.currency || 'CAD')

    const incomeTransactions = computed(() =>
        transactions.value.filter((tx) => tx.kind === 'INCOME'),
    )

    const expenseTransactions = computed(() =>
        transactions.value.filter((tx) => tx.kind === 'EXPENSE'),
    )

    const totalIncome = computed(() =>
        incomeTransactions.value.reduce((sum, tx) => sum + Math.abs(tx.amount), 0),
    )

    const totalExpense = computed(() =>
        expenseTransactions.value.reduce((sum, tx) => sum + Math.abs(tx.amount), 0),
    )

    const netFlow = computed(() => totalIncome.value - totalExpense.value)

    const recentTransactions = computed(() => {
        const ordered = [...transactions.value]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

        return collapseTransferTransactions(ordered).slice(0, 7)
    })

    const accountSummaries = computed<AccountSummary[]>(() => {
        return accounts.value
            .map((account) => {
                const related = transactions.value.filter((tx) => tx.accountId === account.id)
                const income = related
                    .filter((tx) => tx.kind === 'INCOME')
                    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
                const expense = related
                    .filter((tx) => tx.kind === 'EXPENSE')
                    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)

                return {
                    ...account,
                    transactionCount: related.length,
                    income,
                    expense,
                    net: income - expense,
                }
            })
            .sort((a, b) => b.transactionCount - a.transactionCount || b.net - a.net)
    })

    const categorySummaries = computed<CategorySummary[]>(() => {
        return categories.value
            .map((category) => {
                const related = transactions.value.filter((tx) => tx.categoryId === category.id)
                const total = related.reduce((sum, tx) => sum + Math.abs(tx.amount), 0)

                return {
                    ...category,
                    transactionCount: related.length,
                    total,
                }
            })
            .sort((a, b) => b.transactionCount - a.transactionCount || b.total - a.total)
    })

    const topExpenseCategories = computed(() => {
        const totals = new Map<string, { name: string; total: number; color: string | null }>()

        for (const tx of transactions.value) {
            if (tx.kind !== 'EXPENSE') continue

            const name = tx.category?.name || tr('common.none')
            const current = totals.get(name) || {
                name,
                total: 0,
                color: tx.category?.color || null,
            }

            current.total += Math.abs(tx.amount)
            if (!current.color && tx.category?.color) {
                current.color = tx.category.color
            }

            totals.set(name, current)
        }

        return [...totals.values()].sort((a, b) => b.total - a.total).slice(0, 5)
    })

    const expenseCategoryBreakdown = computed<ExpenseBreakdownItem[]>(() => {
        const total = totalExpense.value || 1
        return topExpenseCategories.value.map((item) => ({
            ...item,
            percent: Math.round((item.total / total) * 1000) / 10,
        }))
    })

    const monthlyTrend = computed<MonthlyPoint[]>(() => {
        const now = new Date()
        const buckets: MonthlyPoint[] = []

        for (let offset = 5; offset >= 0; offset -= 1) {
            const current = new Date(now.getFullYear(), now.getMonth() - offset, 1)
            const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`
            const label = new Intl.DateTimeFormat(currentLocaleCode(), {month: 'short'}).format(current)

            buckets.push({
                key,
                label,
                income: 0,
                expense: 0,
                net: 0,
            })
        }

        for (const tx of transactions.value) {
            const date = new Date(tx.date)
            if (Number.isNaN(date.getTime())) continue

            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
            const bucket = buckets.find((entry) => entry.key === key)
            if (!bucket) continue

            if (tx.kind === 'INCOME') {
                bucket.income += Math.abs(tx.amount)
            } else if (tx.kind === 'EXPENSE') {
                bucket.expense += Math.abs(tx.amount)
            }

            bucket.net = bucket.income - bucket.expense
        }

        return buckets
    })

    const filteredTransactions = computed(() => {
        const q = transactionSearch.value.trim().toLowerCase()

        const ordered = [...transactions.value]
            .filter((tx) => {
                if (transactionKindFilter.value !== 'ALL' && tx.kind !== transactionKindFilter.value) {
                    return false
                }

                if (transactionAccountFilter.value !== 'ALL' && String(tx.accountId) !== transactionAccountFilter.value) {
                    return false
                }

                const txCategoryId = tx.categoryId == null ? 'NONE' : String(tx.categoryId)
                if (transactionCategoryFilter.value === 'NONE') {
                    if (tx.categoryId != null) return false
                } else if (
                    transactionCategoryFilter.value !== 'ALL' &&
                    txCategoryId !== transactionCategoryFilter.value
                ) {
                    return false
                }

                if (!q) return true

                const haystack = [
                    tx.label,
                    tx.note || '',
                    tx.account?.name || '',
                    tx.transferPeerAccount?.name || '',
                    tx.category?.name || '',
                    tx.sourceCurrency || '',
                    kindLabel(tx.kind),
                ]
                    .join(' ')
                    .toLowerCase()

                return haystack.includes(q)
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

        return collapseTransferTransactions(ordered)
    })

    const transactionFormCategories = computed(() => {
        if (transactionForm.kind === 'TRANSFER') {
            return []
        }
        return categories.value.filter((category) => category.kind === transactionForm.kind)
    })

    const panelTitle = computed(() => {
        if (panelMode.value === 'create') {
            if (createTab.value === 'transaction') return tr('forms.titles.createTransaction')
            if (createTab.value === 'account') return tr('forms.titles.createAccount')
            return tr('forms.titles.createCategory')
        }

        if (editingTarget.value?.type === 'transaction') return tr('forms.titles.editTransaction')
        if (editingTarget.value?.type === 'account') return tr('forms.titles.editAccount')
        return tr('forms.titles.editCategory')
    })

    const panelDescription = computed(() => {
        if (createTab.value === 'transaction' && transactionForm.kind === 'TRANSFER') {
            return panelMode.value === 'create'
                ? tr('forms.descriptions.transferCreate')
                : tr('forms.descriptions.transferEdit')
        }

        if (panelMode.value === 'create') {
            return tr('forms.descriptions.createExtended')
        }

        return tr('forms.descriptions.edit')
    })

    const panelSubmitLabel = computed(() => {
        if (panelMode.value === 'create') {
            if (createTab.value === 'transaction') return tr('forms.submit.createTransaction')
            if (createTab.value === 'account') return tr('forms.submit.createAccount')
            return tr('forms.submit.createCategory')
        }

        if (editingTarget.value?.type === 'transaction') return tr('forms.submit.updateTransaction')
        if (editingTarget.value?.type === 'account') return tr('forms.submit.updateAccount')
        return tr('forms.submit.updateCategory')
    })

    const lastSyncLabel = computed(() => {
        const latest = recentTransactions.value[0]
        return latest
            ? tr('app.lastMovementOn', {date: new Intl.DateTimeFormat(currentLocaleCode(), {dateStyle: 'medium'}).format(new Date(latest.date))})
            : tr('app.noTransactionYet')
    })

    return {
        accountTypeOptions,
        transactionKindOptions,

        accounts,
        categories,
        transactions,

        loading,
        saving,
        sidebarOpen,
        createPanelOpen,
        activeSection,
        createTab,
        panelMode,
        editingTarget,
        deleteDialog,

        fxBusy,
        fxPreview,

        transactionSearch,
        transactionKindFilter,
        transactionAccountFilter,
        transactionCategoryFilter,

        accountForm,
        categoryForm,
        transactionForm,

        resetAccountForm,
        resetCategoryForm,
        resetTransactionForm,
        selectSection,
        openCreatePanel,
        openEditAccount,
        openEditCategory,
        openEditTransaction,
        closeCreatePanel,
        openDeleteDialog,
        requestDeleteCurrentForm,
        closeDeleteDialog,
        refreshData,
        confirmDelete,
        quoteTransactionFx,
        submitAccount,
        submitCategory,
        submitTransaction,

        summaryCurrency,
        selectedTransactionAccountCurrency,
        isTransactionForeignCurrency,
        incomeTransactions,
        expenseTransactions,
        totalIncome,
        totalExpense,
        netFlow,
        recentTransactions,
        accountSummaries,
        categorySummaries,
        topExpenseCategories,
        expenseCategoryBreakdown,
        monthlyTrend,
        filteredTransactions,
        transactionFormCategories,
        panelTitle,
        panelDescription,
        panelSubmitLabel,
        lastSyncLabel,
    }
}