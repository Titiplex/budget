import {computed, reactive, ref, watch} from 'vue'
import type {
    Account,
    AccountSummary,
    AccountType,
    Category,
    CategorySummary,
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
import {kindLabel} from '../utils/budgetFormat'

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

    const deleteDialog = reactive<DeleteState>({
        open: false,
        busy: false,
        type: 'transaction',
        id: 0,
        label: '',
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
        kind: 'EXPENSE' as TransactionKind,
        date: new Date().toISOString().slice(0, 10),
        note: '',
        accountId: '',
        categoryId: '',
    })

    function normalizeError(error: unknown) {
        if (error instanceof Error && error.message) {
            return error.message
        }
        return 'Une erreur inconnue est survenue.'
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
        transactionForm.kind = 'EXPENSE'
        transactionForm.date = new Date().toISOString().slice(0, 10)
        transactionForm.note = ''
        transactionForm.accountId = ''
        transactionForm.categoryId = ''
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
        transactionForm.label = transaction.label
        transactionForm.amount = String(Math.abs(transaction.amount))
        transactionForm.kind = transaction.kind
        transactionForm.date = new Date(transaction.date).toISOString().slice(0, 10)
        transactionForm.note = transaction.note || ''
        transactionForm.accountId = String(transaction.accountId)
        transactionForm.categoryId = transaction.categoryId == null ? '' : String(transaction.categoryId)
        createPanelOpen.value = true
    }

    function closeCreatePanel() {
        createPanelOpen.value = false
        panelMode.value = 'create'
        editingTarget.value = null
        resetAllForms()
    }

    function openDeleteDialog(type: EntityType, entity: Transaction | AccountSummary | CategorySummary | Account | Category) {
        deleteDialog.type = type
        deleteDialog.id = entity.id
        deleteDialog.label = 'label' in entity ? entity.label : entity.name
        deleteDialog.open = true
        deleteDialog.busy = false

        if (type === 'account') {
            const count = 'transactionCount' in entity
                ? entity.transactionCount
                : transactions.value.filter((tx) => tx.accountId === entity.id).length

            deleteDialog.message = count > 0
                ? `Supprimer ce compte supprimera aussi ses ${count} transaction(s) liées.`
                : 'Supprimer ce compte le retirera définitivement de la base.'
            return
        }

        if (type === 'category') {
            const count = 'transactionCount' in entity
                ? entity.transactionCount
                : transactions.value.filter((tx) => tx.categoryId === entity.id).length

            deleteDialog.message = count > 0
                ? `Supprimer cette catégorie laissera ${count} transaction(s) en place, mais sans catégorie associée.`
                : 'Supprimer cette catégorie la retirera définitivement de la base.'
            return
        }

        deleteDialog.message = 'Cette transaction sera supprimée définitivement.'
    }

    function requestDeleteCurrentForm() {
        if (!editingTarget.value) return

        if (editingTarget.value.type === 'transaction') {
            openDeleteDialog('transaction', {
                id: editingTarget.value.id,
                label: transactionForm.label,
                amount: Number(transactionForm.amount) || 0,
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
                showNotice('success', 'Compte supprimé.')
            } else if (deleteDialog.type === 'category') {
                await window.db.category.delete(deleteDialog.id)
                showNotice('success', 'Catégorie supprimée.')
            } else {
                await window.db.transaction.delete(deleteDialog.id)
                showNotice('success', 'Transaction supprimée.')
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
            showNotice('error', 'Le nom du compte est obligatoire.')
            return
        }

        if (!currency || currency.length < 3) {
            showNotice('error', 'La devise doit contenir au moins 3 caractères.')
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
                showNotice('success', 'Compte mis à jour.')
            } else {
                await window.db.account.create(payload)
                showNotice('success', 'Compte créé.')
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
            showNotice('error', 'Le nom de la catégorie est obligatoire.')
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
                showNotice('success', 'Catégorie mise à jour.')
            } else {
                await window.db.category.create(payload)
                showNotice('success', 'Catégorie créée.')
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

    async function submitTransaction() {
        if (!accounts.value.length) {
            showNotice('error', 'Il faut créer au moins un compte avant une transaction.')
            return
        }

        const label = transactionForm.label.trim()
        const amount = Number(transactionForm.amount)

        if (!label) {
            showNotice('error', 'Le libellé de la transaction est obligatoire.')
            return
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            showNotice('error', 'Le montant doit être un nombre strictement positif.')
            return
        }

        if (!transactionForm.date) {
            showNotice('error', 'La date est obligatoire.')
            return
        }

        if (!transactionForm.accountId) {
            showNotice('error', 'Il faut sélectionner un compte.')
            return
        }

        saving.value = true
        try {
            const payload = {
                label,
                amount,
                kind: transactionForm.kind,
                date: transactionForm.date,
                note: transactionForm.note.trim() || null,
                accountId: Number(transactionForm.accountId),
                categoryId: transactionForm.categoryId ? Number(transactionForm.categoryId) : null,
            }

            if (panelMode.value === 'edit' && editingTarget.value?.type === 'transaction') {
                await window.db.transaction.update(editingTarget.value.id, payload)
                showNotice('success', 'Transaction mise à jour.')
            } else {
                await window.db.transaction.create(payload)
                showNotice('success', 'Transaction créée.')
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

    watch(() => transactionForm.kind, () => {
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
        return [...transactions.value]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 7)
    })

    const largestExpense = computed(() => {
        return [...expenseTransactions.value].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0] || null
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

            const name = tx.category?.name || 'Sans catégorie'
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
            const label = new Intl.DateTimeFormat('fr-CA', {month: 'short'}).format(current)

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

        return [...transactions.value]
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
                    tx.category?.name || '',
                    kindLabel(tx.kind),
                ]
                    .join(' ')
                    .toLowerCase()

                return haystack.includes(q)
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    })

    const transactionFormCategories = computed(() => {
        if (transactionForm.kind === 'TRANSFER') {
            return categories.value
        }
        return categories.value.filter((category) => category.kind === transactionForm.kind)
    })

    const panelTitle = computed(() => {
        if (panelMode.value === 'create') {
            if (createTab.value === 'transaction') return 'Ajouter une transaction'
            if (createTab.value === 'account') return 'Ajouter un compte'
            return 'Ajouter une catégorie'
        }

        if (editingTarget.value?.type === 'transaction') return 'Modifier la transaction'
        if (editingTarget.value?.type === 'account') return 'Modifier le compte'
        return 'Modifier la catégorie'
    })

    const panelDescription = computed(() => {
        if (panelMode.value === 'create') {
            return 'Crée rapidement des transactions, comptes ou catégories.'
        }

        return 'Édite les données existantes, puis enregistre, importe, exporte ou supprime si nécessaire.'
    })

    const panelSubmitLabel = computed(() => {
        if (panelMode.value === 'create') {
            if (createTab.value === 'transaction') return 'Créer la transaction'
            if (createTab.value === 'account') return 'Créer le compte'
            return 'Créer la catégorie'
        }

        if (editingTarget.value?.type === 'transaction') return 'Mettre à jour la transaction'
        if (editingTarget.value?.type === 'account') return 'Mettre à jour le compte'
        return 'Mettre à jour la catégorie'
    })

    const lastSyncLabel = computed(() => {
        const latest = recentTransactions.value[0]
        return latest ? `Dernier mouvement le ${new Intl.DateTimeFormat('fr-CA', {dateStyle: 'medium'}).format(new Date(latest.date))}` : 'Aucune transaction enregistrée'
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
        submitAccount,
        submitCategory,
        submitTransaction,

        summaryCurrency,
        incomeTransactions,
        expenseTransactions,
        totalIncome,
        totalExpense,
        netFlow,
        recentTransactions,
        largestExpense,
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