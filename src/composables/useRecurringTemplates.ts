import {computed, reactive, ref, type Ref} from 'vue'
import type {
    Account,
    Category,
    ConversionMode,
    RecurringFrequency,
    RecurringTemplateRow,
    RecurringTransactionTemplate,
    TransactionKind,
} from '../types/budget'
import {tr} from '../i18n'
import {buildRecurringForecast, summarizeRecurringForecast} from '../utils/recurringForecast'
import {
    addUtcDays,
    addUtcMonths,
    addUtcWeeks,
    addUtcYears,
    todayDateOnly,
    endOfUtcDay,
    toDateOnly,
    toUtcDate,
} from '../utils/date'

function normalizeCurrency(value: string | null | undefined) {
    return (value || '').trim().toUpperCase()
}

function addInterval(date: Date, frequency: RecurringFrequency, intervalCount: number) {
    if (frequency === 'DAILY') return addUtcDays(date, intervalCount)
    if (frequency === 'WEEKLY') return addUtcWeeks(date, intervalCount)
    if (frequency === 'MONTHLY') return addUtcMonths(date, intervalCount)
    return addUtcYears(date, intervalCount)
}

function countDueOccurrences(template: RecurringTransactionTemplate, asOfDate: Date) {
    if (!template.isActive) return 0

    let current = toUtcDate(template.nextOccurrenceDate)
    const endDate = template.endDate ? toUtcDate(template.endDate) : null
    let count = 0
    let guard = 0

    while (
        current.getTime() <= asOfDate.getTime()
        && (!endDate || current.getTime() <= endDate.getTime())
        ) {
        count += 1
        current = addInterval(current, template.frequency, template.intervalCount)
        guard += 1
        if (guard > 500) break
    }

    return count
}

interface UseRecurringTemplatesOptions {
    accounts: Ref<Account[]>
    categories: Ref<Category[]>
    showNotice: (type: 'success' | 'error', text: string) => void
    refreshTransactions: () => Promise<void>
}

export function useRecurringTemplates(options: UseRecurringTemplatesOptions) {
    const recurringTemplates = ref<RecurringTransactionTemplate[]>([])
    const recurringLoading = ref(false)
    const recurringSaving = ref(false)
    const recurringGenerating = ref(false)

    const recurringDialogOpen = ref(false)
    const editingRecurringId = ref<number | null>(null)

    const recurringForm = reactive({
        label: '',
        sourceAmount: '',
        sourceCurrency: 'CAD',
        accountAmount: '',
        conversionMode: 'NONE' as ConversionMode,
        exchangeRate: '',
        exchangeProvider: '',
        kind: 'EXPENSE' as TransactionKind,
        note: '',
        frequency: 'MONTHLY' as RecurringFrequency,
        intervalCount: '1',
        startDate: todayDateOnly(),
        nextOccurrenceDate: todayDateOnly(),
        endDate: '',
        isActive: true,
        accountId: '',
        categoryId: '',
    })

    function resetRecurringForm() {
        recurringForm.label = ''
        recurringForm.sourceAmount = ''
        recurringForm.sourceCurrency = 'CAD'
        recurringForm.accountAmount = ''
        recurringForm.conversionMode = 'NONE'
        recurringForm.exchangeRate = ''
        recurringForm.exchangeProvider = ''
        recurringForm.kind = 'EXPENSE'
        recurringForm.note = ''
        recurringForm.frequency = 'MONTHLY'
        recurringForm.intervalCount = '1'
        recurringForm.startDate = todayDateOnly()
        recurringForm.nextOccurrenceDate = todayDateOnly()
        recurringForm.endDate = ''
        recurringForm.isActive = true
        recurringForm.accountId = ''
        recurringForm.categoryId = ''
    }

    async function refreshRecurringTemplates() {
        recurringLoading.value = true
        try {
            recurringTemplates.value = await window.db.recurringTemplate.list()
        } catch (error) {
            options.showNotice('error', error instanceof Error ? error.message : tr('recurring.errors.load'))
        } finally {
            recurringLoading.value = false
        }
    }

    function openCreateRecurring() {
        editingRecurringId.value = null
        resetRecurringForm()

        if (options.accounts.value.length === 1) {
            recurringForm.accountId = String(options.accounts.value[0].id)
            recurringForm.sourceCurrency = options.accounts.value[0].currency
        }

        recurringDialogOpen.value = true
    }

    function openEditRecurring(template: RecurringTransactionTemplate) {
        editingRecurringId.value = template.id
        recurringForm.label = template.label
        recurringForm.sourceAmount = String(template.sourceAmount)
        recurringForm.sourceCurrency = template.sourceCurrency
        recurringForm.accountAmount = template.accountAmount == null ? '' : String(template.accountAmount)
        recurringForm.conversionMode = template.conversionMode
        recurringForm.exchangeRate = template.exchangeRate == null ? '' : String(template.exchangeRate)
        recurringForm.exchangeProvider = template.exchangeProvider || ''
        recurringForm.kind = template.kind
        recurringForm.note = template.note || ''
        recurringForm.frequency = template.frequency
        recurringForm.intervalCount = String(template.intervalCount)
        recurringForm.startDate = toDateOnly(template.startDate)
        recurringForm.nextOccurrenceDate = toDateOnly(template.nextOccurrenceDate)
        recurringForm.endDate = template.endDate ? toDateOnly(template.endDate) : ''
        recurringForm.isActive = template.isActive
        recurringForm.accountId = String(template.accountId)
        recurringForm.categoryId = template.categoryId == null ? '' : String(template.categoryId)
        recurringDialogOpen.value = true
    }

    function closeRecurringDialog() {
        recurringDialogOpen.value = false
        editingRecurringId.value = null
        resetRecurringForm()
    }

    const selectedRecurringAccountCurrency = computed(() => {
        const account = options.accounts.value.find((entry) => String(entry.id) === recurringForm.accountId)
        return account?.currency || 'CAD'
    })

    const recurringIsForeignCurrency = computed(() => {
        const sourceCurrency = normalizeCurrency(recurringForm.sourceCurrency)
        const accountCurrency = normalizeCurrency(selectedRecurringAccountCurrency.value)
        return Boolean(sourceCurrency && accountCurrency && sourceCurrency !== accountCurrency)
    })

    async function submitRecurring() {
        const label = recurringForm.label.trim()
        const sourceAmount = Number(recurringForm.sourceAmount)
        const intervalCount = Number(recurringForm.intervalCount)
        const accountId = Number(recurringForm.accountId)

        if (!label) {
            options.showNotice('error', tr('recurring.errors.labelRequired'))
            return
        }

        if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
            options.showNotice('error', tr('recurring.errors.sourceAmountPositive'))
            return
        }

        if (!Number.isInteger(intervalCount) || intervalCount <= 0) {
            options.showNotice('error', tr('recurring.errors.intervalPositive'))
            return
        }

        if (!Number.isInteger(accountId) || accountId <= 0) {
            options.showNotice('error', tr('recurring.errors.accountRequired'))
            return
        }

        recurringSaving.value = true
        try {
            const sourceCurrency = normalizeCurrency(recurringForm.sourceCurrency || selectedRecurringAccountCurrency.value)
            const accountCurrency = normalizeCurrency(selectedRecurringAccountCurrency.value)

            let conversionMode: ConversionMode = 'NONE'
            let accountAmount: number | null = sourceAmount
            let exchangeRate: number | null = 1
            let exchangeProvider: string | null = 'ACCOUNT'

            if (sourceCurrency !== accountCurrency) {
                if (recurringForm.conversionMode === 'MANUAL') {
                    accountAmount = Number(recurringForm.accountAmount)
                    if (!Number.isFinite(accountAmount) || accountAmount <= 0) {
                        throw new Error(tr('recurring.errors.accountAmountPositive'))
                    }
                    conversionMode = 'MANUAL'
                    exchangeRate = Number(recurringForm.exchangeRate || accountAmount / sourceAmount)
                    exchangeProvider = recurringForm.exchangeProvider.trim() || 'MANUAL'
                } else {
                    conversionMode = 'AUTOMATIC'
                    accountAmount = null
                    exchangeRate = null
                    exchangeProvider = recurringForm.exchangeProvider.trim() || 'ECB via Frankfurter'
                }
            }

            const payload = {
                label,
                sourceAmount,
                sourceCurrency,
                accountAmount,
                conversionMode,
                exchangeRate,
                exchangeProvider,
                kind: recurringForm.kind,
                note: recurringForm.note.trim() || null,
                frequency: recurringForm.frequency,
                intervalCount,
                startDate: recurringForm.startDate,
                nextOccurrenceDate: recurringForm.nextOccurrenceDate,
                endDate: recurringForm.endDate || null,
                isActive: recurringForm.isActive,
                accountId,
                categoryId: recurringForm.categoryId ? Number(recurringForm.categoryId) : null,
            }

            if (editingRecurringId.value) {
                await window.db.recurringTemplate.update(editingRecurringId.value, payload)
                options.showNotice('success', tr('recurring.success.updated'))
            } else {
                await window.db.recurringTemplate.create(payload)
                options.showNotice('success', tr('recurring.success.created'))
            }

            await refreshRecurringTemplates()
            closeRecurringDialog()
        } catch (error) {
            options.showNotice('error', error instanceof Error ? error.message : tr('recurring.errors.saveFailed'))
        } finally {
            recurringSaving.value = false
        }
    }

    async function deleteRecurring(id: number) {
        try {
            await window.db.recurringTemplate.delete(id)
            await refreshRecurringTemplates()
            options.showNotice('success', tr('recurring.success.deleted'))
        } catch (error) {
            options.showNotice('error', error instanceof Error ? error.message : tr('recurring.errors.deleteFailed'))
        }
    }

    async function generateDueRecurring(templateId?: number) {
        recurringGenerating.value = true
        try {
            const result = await window.db.recurringTemplate.generateDue({
                asOfDate: todayDateOnly(),
                ...(templateId ? {templateId} : {}),
            })

            await Promise.all([
                refreshRecurringTemplates(),
                options.refreshTransactions(),
            ])

            if (result.generatedTransactions > 0) {
                options.showNotice(
                    'success',
                    tr('recurring.success.generated', {
                        transactions: result.generatedTransactions,
                        templates: result.generatedTemplates,
                    }),
                )
            } else {
                options.showNotice('success', tr('recurring.success.noneDue'))
            }
        } catch (error) {
            options.showNotice('error', error instanceof Error ? error.message : tr('recurring.errors.generateFailed'))
        } finally {
            recurringGenerating.value = false
        }
    }

    const recurringRows = computed<RecurringTemplateRow[]>(() => {
        const todayKey = todayDateOnly()
        const today = endOfUtcDay(todayKey)

        return recurringTemplates.value
            .map((template) => {
                const dueCount = countDueOccurrences(template, today)
                const nextOccurrenceDate = toDateOnly(template.nextOccurrenceDate)

                return {
                    templateId: template.id,
                    label: template.label,
                    sourceAmount: template.sourceAmount,
                    sourceCurrency: template.sourceCurrency,
                    accountCurrency: template.account?.currency || 'CAD',
                    conversionMode: template.conversionMode,
                    kind: template.kind,
                    frequency: template.frequency,
                    intervalCount: template.intervalCount,
                    nextOccurrenceDate,
                    endDate: template.endDate ? toDateOnly(template.endDate) : null,
                    isActive: template.isActive,
                    dueCount,
                    overdue: dueCount > 0
                        && toUtcDate(nextOccurrenceDate).getTime() < toUtcDate(todayKey).getTime(),
                    accountName: template.account?.name || tr('recurring.unknownAccount'),
                    categoryName: template.category?.name || tr('recurring.noCategory'),
                    note: template.note,
                }
            })
            .sort((a, b) => {
                if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
                if (a.dueCount !== b.dueCount) return b.dueCount - a.dueCount
                return toUtcDate(a.nextOccurrenceDate).getTime() - toUtcDate(b.nextOccurrenceDate).getTime()
            })
    })

    const recurringSummary = computed(() => {
        const active = recurringRows.value.filter((row) => row.isActive)
        const dueTemplates = active.filter((row) => row.dueCount > 0)
        const overdueTemplates = dueTemplates.filter((row) => row.overdue)

        return {
            total: recurringRows.value.length,
            active: active.length,
            dueTemplates: dueTemplates.length,
            dueOccurrences: dueTemplates.reduce((sum, row) => sum + row.dueCount, 0),
            overdueTemplates: overdueTemplates.length,
        }
    })

    const recurringForecast = computed(() =>
        buildRecurringForecast(recurringTemplates.value, 30, new Date()),
    )

    const recurringInsights = computed(() =>
        summarizeRecurringForecast(recurringTemplates.value, recurringForecast.value),
    )

    const recurringUpcomingPreview = computed(() =>
        recurringForecast.value.slice(0, 8),
    )

    return {
        recurringTemplates,
        recurringLoading,
        recurringSaving,
        recurringGenerating,
        recurringDialogOpen,
        editingRecurringId,
        recurringForm,
        selectedRecurringAccountCurrency,
        recurringIsForeignCurrency,
        refreshRecurringTemplates,
        openCreateRecurring,
        openEditRecurring,
        closeRecurringDialog,
        submitRecurring,
        deleteRecurring,
        generateDueRecurring,
        recurringRows,
        recurringSummary,
        recurringForecast,
        recurringInsights,
        recurringUpcomingPreview,
    }
}