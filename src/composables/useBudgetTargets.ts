import {computed, reactive, ref, type Ref} from 'vue'
import type {
    BudgetPeriod,
    BudgetProgressRow,
    BudgetStatus,
    BudgetTarget,
    Category,
    Transaction,
} from '../types/budget'
import {tr} from '../i18n'
import {todayDateOnly, toDateOnly, toUtcDate} from '../utils/date'

interface UseBudgetTargetsOptions {
    categories: Ref<Category[]>
    transactions: Ref<Transaction[]>
    showNotice: (type: 'success' | 'error', text: string) => void
}

function computeBudgetRange(period: BudgetPeriod, referenceDate: string, explicitEndDate: string | null) {
    const date = toUtcDate(referenceDate)

    if (period === 'MONTHLY') {
        return {
            startDate: toDateOnly(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))),
            endDate: toDateOnly(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))),
        }
    }

    if (period === 'YEARLY') {
        return {
            startDate: toDateOnly(new Date(Date.UTC(date.getUTCFullYear(), 0, 1))),
            endDate: toDateOnly(new Date(Date.UTC(date.getUTCFullYear(), 11, 31))),
        }
    }

    return {
        startDate: toDateOnly(referenceDate),
        endDate: explicitEndDate ? toDateOnly(explicitEndDate) : toDateOnly(referenceDate),
    }
}

function dateInRange(date: string, startDate: string, endDate: string) {
    const current = toUtcDate(date).getTime()
    const start = toUtcDate(startDate).getTime()
    const end = toUtcDate(endDate).getTime()
    return current >= start && current <= end
}

function round2(value: number) {
    return Math.round(value * 100) / 100
}

export function useBudgetTargets(options: UseBudgetTargetsOptions) {
    const budgets = ref<BudgetTarget[]>([])
    const budgetLoading = ref(false)
    const budgetSaving = ref(false)

    const budgetDialogOpen = ref(false)
    const editingBudgetId = ref<number | null>(null)

    const budgetForm = reactive({
        name: '',
        amount: '',
        period: 'MONTHLY' as BudgetPeriod,
        startDate: todayDateOnly(),
        endDate: '',
        currency: 'CAD',
        isActive: true,
        note: '',
        categoryId: '',
    })

    function resetBudgetForm() {
        budgetForm.name = ''
        budgetForm.amount = ''
        budgetForm.period = 'MONTHLY'
        budgetForm.startDate = todayDateOnly()
        budgetForm.endDate = ''
        budgetForm.currency = 'CAD'
        budgetForm.isActive = true
        budgetForm.note = ''
        budgetForm.categoryId = ''
    }

    async function refreshBudgets() {
        budgetLoading.value = true
        try {
            budgets.value = await window.db.budgetTarget.list()
        } catch (error) {
            options.showNotice('error', error instanceof Error ? error.message : tr('budgets.errors.load'))
        } finally {
            budgetLoading.value = false
        }
    }

    function openCreateBudget(categoryId?: number) {
        editingBudgetId.value = null
        resetBudgetForm()

        if (categoryId) {
            budgetForm.categoryId = String(categoryId)
            const category = options.categories.value.find((entry) => entry.id === categoryId)
            if (category) {
                budgetForm.name = `${tr('budgets.budget')} ${category.name}`
            }
        }

        budgetDialogOpen.value = true
    }

    function openEditBudget(budget: BudgetTarget) {
        editingBudgetId.value = budget.id
        budgetForm.name = budget.name
        budgetForm.amount = String(budget.amount)
        budgetForm.period = budget.period
        budgetForm.startDate = toDateOnly(budget.startDate)
        budgetForm.endDate = budget.endDate ? toDateOnly(budget.endDate) : ''
        budgetForm.currency = budget.currency
        budgetForm.isActive = budget.isActive
        budgetForm.note = budget.note || ''
        budgetForm.categoryId = String(budget.categoryId)
        budgetDialogOpen.value = true
    }

    function closeBudgetDialog() {
        budgetDialogOpen.value = false
        editingBudgetId.value = null
        resetBudgetForm()
    }

    async function submitBudget() {
        const name = budgetForm.name.trim()
        const amount = Number(budgetForm.amount)
        const categoryId = Number(budgetForm.categoryId)

        if (!name) {
            options.showNotice('error', tr('budgets.errors.nameRequired'))
            return
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            options.showNotice('error', tr('budgets.errors.positiveAmount'))
            return
        }

        if (!Number.isInteger(categoryId) || categoryId <= 0) {
            options.showNotice('error', tr('budgets.errors.categoryRequired'))
            return
        }

        budgetSaving.value = true
        try {
            const payload = {
                name,
                amount,
                period: budgetForm.period,
                startDate: budgetForm.startDate,
                endDate: budgetForm.period === 'CUSTOM' ? (budgetForm.endDate || null) : null,
                currency: budgetForm.currency.trim().toUpperCase() || 'CAD',
                isActive: budgetForm.isActive,
                note: budgetForm.note.trim() || null,
                categoryId,
            }

            if (editingBudgetId.value) {
                await window.db.budgetTarget.update(editingBudgetId.value, payload)
                options.showNotice('success', tr('budgets.success.updated'))
            } else {
                await window.db.budgetTarget.create(payload)
                options.showNotice('success', tr('budgets.success.created'))
            }

            await refreshBudgets()
            closeBudgetDialog()
        } catch (error) {
            options.showNotice('error', error instanceof Error ? error.message : tr('budgets.errors.saveFailed'))
        } finally {
            budgetSaving.value = false
        }
    }

    async function deleteBudget(id: number) {
        try {
            await window.db.budgetTarget.delete(id)
            await refreshBudgets()
            options.showNotice('success', tr('budgets.success.deleted'))
        } catch (error) {
            options.showNotice('error', error instanceof Error ? error.message : tr('budgets.errors.deleteFailed'))
        }
    }

    const budgetProgressRows = computed<BudgetProgressRow[]>(() => {
        return budgets.value.map((budget) => {
            const range = computeBudgetRange(
                budget.period,
                toDateOnly(budget.startDate),
                budget.endDate ? toDateOnly(budget.endDate) : null,
            )

            const relatedTransactions = options.transactions.value.filter((transaction) =>
                transaction.kind === 'EXPENSE'
                && transaction.categoryId === budget.categoryId
                && dateInRange(transaction.date, range.startDate, range.endDate),
            )

            const spentAmount = round2(
                relatedTransactions.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
            )

            const remainingAmount = round2(budget.amount - spentAmount)
            const progressPercent = budget.amount > 0 ? round2((spentAmount / budget.amount) * 100) : 0

            let status: BudgetStatus = 'UNDER'
            if (spentAmount > budget.amount) {
                status = 'OVER'
            } else if (spentAmount >= budget.amount * 0.8) {
                status = 'NEAR'
            }

            return {
                budgetId: budget.id,
                name: budget.name,
                categoryId: budget.categoryId,
                categoryName: budget.category?.name || tr('budgets.unknownCategory'),
                categoryColor: budget.category?.color || null,
                period: budget.period,
                startDate: range.startDate,
                endDate: range.endDate,
                targetAmount: budget.amount,
                spentAmount,
                remainingAmount,
                progressPercent,
                status,
                transactionCount: relatedTransactions.length,
                currency: budget.currency,
                note: budget.note,
                isActive: budget.isActive,
            }
        }).sort((a, b) => {
            if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
            if (a.status !== b.status) {
                const order = {OVER: 0, NEAR: 1, UNDER: 2}
                return order[a.status] - order[b.status]
            }
            return b.progressPercent - a.progressPercent
        })
    })

    const budgetGlobalSummary = computed(() => {
        const activeRows = budgetProgressRows.value.filter((row) => row.isActive)
        const targetAmount = round2(activeRows.reduce((sum, row) => sum + row.targetAmount, 0))
        const spentAmount = round2(activeRows.reduce((sum, row) => sum + row.spentAmount, 0))
        const remainingAmount = round2(targetAmount - spentAmount)
        const overCount = activeRows.filter((row) => row.status === 'OVER').length
        const nearCount = activeRows.filter((row) => row.status === 'NEAR').length

        return {
            count: activeRows.length,
            targetAmount,
            spentAmount,
            remainingAmount,
            overCount,
            nearCount,
        }
    })

    return {
        budgets,
        budgetLoading,
        budgetSaving,
        budgetDialogOpen,
        editingBudgetId,
        budgetForm,
        refreshBudgets,
        openCreateBudget,
        openEditBudget,
        closeBudgetDialog,
        submitBudget,
        deleteBudget,
        budgetProgressRows,
        budgetGlobalSummary,
    }
}