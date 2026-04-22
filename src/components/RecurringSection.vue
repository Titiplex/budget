<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {
  Account,
  Category,
  ConversionMode,
  RecurringForecastOccurrence,
  RecurringFrequency,
  RecurringTemplateRow,
  TransactionKind,
} from '../types/budget'
import {formatDate, formatMoney, kindLabel} from '../utils/budgetFormat'

const props = defineProps<{
  accounts: Account[]
  categories: Category[]
  rows: RecurringTemplateRow[]
  summary: {
    total: number
    active: number
    dueTemplates: number
    dueOccurrences: number
    overdueTemplates: number
  }
  insights: {
    activeCount: number
    monthlyExpenseCommitment: number
    monthlyIncomeCommitment: number
    netMonthlyCommitment: number
    next30DaysExpense: number
    next30DaysIncome: number
    next30DaysNet: number
    upcomingCount: number
  }
  upcoming: RecurringForecastOccurrence[]
  loading: boolean
  saving: boolean
  generating: boolean
  dialogOpen: boolean
  editingRecurringId: number | null
  recurringForm: {
    label: string
    sourceAmount: string
    sourceCurrency: string
    accountAmount: string
    conversionMode: ConversionMode
    exchangeRate: string
    exchangeProvider: string
    kind: TransactionKind
    note: string
    frequency: RecurringFrequency
    intervalCount: string
    startDate: string
    nextOccurrenceDate: string
    endDate: string
    isActive: boolean
    accountId: string
    categoryId: string
  }
}>()

const emit = defineEmits<{
  (e: 'open-create'): void
  (e: 'open-edit', row: RecurringTemplateRow): void
  (e: 'delete-template', id: number): void
  (e: 'generate-template', id: number): void
  (e: 'generate-all'): void
  (e: 'close-dialog'): void
  (e: 'submit-template'): void
}>()

const {t} = useI18n()

function frequencyLabel(frequency: RecurringFrequency, intervalCount: number) {
  if (frequency === 'DAILY') {
    return intervalCount === 1
        ? t('recurring.frequency.dailyOnce')
        : t('recurring.frequency.dailyEvery', {count: intervalCount})
  }

  if (frequency === 'WEEKLY') {
    return intervalCount === 1
        ? t('recurring.frequency.weeklyOnce')
        : t('recurring.frequency.weeklyEvery', {count: intervalCount})
  }

  if (frequency === 'MONTHLY') {
    return intervalCount === 1
        ? t('recurring.frequency.monthlyOnce')
        : t('recurring.frequency.monthlyEvery', {count: intervalCount})
  }

  return intervalCount === 1
      ? t('recurring.frequency.yearlyOnce')
      : t('recurring.frequency.yearlyEvery', {count: intervalCount})
}

function statusPillClass(row: RecurringTemplateRow) {
  if (!row.isActive) {
    return 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300'
  }
  if (row.overdue) {
    return 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300'
  }
  if (row.dueCount > 0) {
    return 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
  }
  return 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
}

function statusLabel(row: RecurringTemplateRow) {
  if (!row.isActive) return t('recurring.status.inactive')
  if (row.overdue) return t('recurring.status.overdue')
  if (row.dueCount > 0) return t('recurring.status.due')
  return t('recurring.status.scheduled')
}

const selectedAccountCurrency = computed(() => {
  const account = props.accounts.find((entry) => String(entry.id) === props.recurringForm.accountId)
  return account?.currency || 'CAD'
})

const isForeignCurrency = computed(() => {
  const sourceCurrency = (props.recurringForm.sourceCurrency || '').trim().toUpperCase()
  const accountCurrency = selectedAccountCurrency.value.trim().toUpperCase()
  return Boolean(sourceCurrency && accountCurrency && sourceCurrency !== accountCurrency)
})
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-center justify-end gap-2">
      <button class="ghost-btn" :disabled="generating" @click="emit('generate-all')">
        {{ generating ? t('recurring.generating') : t('recurring.generateAll') }}
      </button>
      <button class="primary-btn" @click="emit('open-create')">
        {{ t('recurring.addRecurring') }}
      </button>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div class="stat-card">
        <p class="stat-label">{{ t('recurring.templates') }}</p>
        <p class="stat-value">{{ summary.total }}</p>
        <p class="stat-hint">{{ t('recurring.templatesHint') }}</p>
      </div>

      <div class="stat-card">
        <p class="stat-label">{{ t('recurring.monthlyExpenseCommitment') }}</p>
        <p class="stat-value">{{ formatMoney(insights.monthlyExpenseCommitment) }}</p>
        <p class="stat-hint">{{ t('recurring.monthlyExpenseCommitmentHint') }}</p>
      </div>

      <div class="stat-card">
        <p class="stat-label">{{ t('recurring.monthlyIncomeCommitment') }}</p>
        <p class="stat-value">{{ formatMoney(insights.monthlyIncomeCommitment) }}</p>
        <p class="stat-hint">{{ t('recurring.monthlyIncomeCommitmentHint') }}</p>
      </div>

      <div class="stat-card">
        <p class="stat-label">{{ t('recurring.monthlyNetCommitment') }}</p>
        <p class="stat-value">{{ formatMoney(insights.netMonthlyCommitment) }}</p>
        <p class="stat-hint">{{ t('recurring.monthlyNetCommitmentHint') }}</p>
      </div>
    </div>

    <div class="grid gap-6 xl:grid-cols-12">
      <section class="panel xl:col-span-7">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">{{ t('recurring.shortTerm') }}</p>
            <h3 class="panel-title">{{ t('recurring.next30DaysOccurrences') }}</h3>
          </div>
        </div>

        <div v-if="upcoming.length" class="overflow-x-auto">
          <table class="w-full min-w-[760px]">
            <thead>
            <tr class="table-head">
              <th class="table-cell-head text-left">{{ t('forms.fields.date') }}</th>
              <th class="table-cell-head text-left">{{ t('forms.fields.label') }}</th>
              <th class="table-cell-head text-left">{{ t('forms.fields.account') }}</th>
              <th class="table-cell-head text-left">{{ t('forms.fields.category') }}</th>
              <th class="table-cell-head text-right">{{ t('forms.fields.amount') }}</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="item in upcoming" :key="`${item.templateId}-${item.plannedDate}-${item.label}`"
                class="table-row">
              <td class="table-cell">{{ formatDate(item.plannedDate) }}</td>
              <td class="table-cell">
                <div>
                  <p class="font-semibold text-slate-800 dark:text-slate-100">{{ item.label }}</p>
                  <p class="text-xs text-slate-500 dark:text-slate-400">{{ kindLabel(item.kind) }}</p>
                </div>
              </td>
              <td class="table-cell">{{ item.accountName }}</td>
              <td class="table-cell">{{ item.categoryName }}</td>
              <td class="table-cell text-right">{{ formatMoney(item.amount, item.currency) }}</td>
            </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="empty-state">
          {{ t('recurring.noUpcoming30Days') }}
        </div>
      </section>

      <section class="panel xl:col-span-5">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">{{ t('recurring.projection30Days') }}</p>
            <h3 class="panel-title">{{ t('recurring.expectedImpact') }}</h3>
          </div>
        </div>

        <div class="space-y-3 px-6 pb-6">
          <div class="mini-card">
            <p class="mini-label">{{ t('recurring.expectedExpenses') }}</p>
            <p class="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
              {{ formatMoney(insights.next30DaysExpense) }}
            </p>
          </div>

          <div class="mini-card">
            <p class="mini-label">{{ t('recurring.expectedIncome') }}</p>
            <p class="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
              {{ formatMoney(insights.next30DaysIncome) }}
            </p>
          </div>

          <div class="mini-card">
            <p class="mini-label">{{ t('recurring.expectedNet') }}</p>
            <p class="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
              {{ formatMoney(insights.next30DaysNet) }}
            </p>
          </div>

          <div class="mini-card">
            <p class="mini-label">{{ t('recurring.upcomingOccurrences') }}</p>
            <p class="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
              {{ insights.upcomingCount }}
            </p>
          </div>
        </div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">{{ t('recurring.automation') }}</p>
          <h3 class="panel-title">{{ t('recurring.recurringTransactions') }}</h3>
        </div>
      </div>

      <div v-if="rows.length" class="overflow-x-auto">
        <table class="w-full min-w-[1180px]">
          <thead>
          <tr class="table-head">
            <th class="table-cell-head text-left">{{ t('forms.fields.label') }}</th>
            <th class="table-cell-head text-left">{{ t('forms.fields.amount') }}</th>
            <th class="table-cell-head text-left">{{ t('forms.fields.account') }}</th>
            <th class="table-cell-head text-left">{{ t('forms.fields.category') }}</th>
            <th class="table-cell-head text-left">{{ t('recurring.frequencyLabel') }}</th>
            <th class="table-cell-head text-left">{{ t('forms.fields.nextOccurrenceDate') }}</th>
            <th class="table-cell-head text-left">{{ t('budgets.statusLabel') }}</th>
            <th class="table-cell-head text-right">{{ t('overview.quickActions') }}</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="row in rows" :key="row.templateId" class="table-row">
            <td class="table-cell">
              <div>
                <p class="font-semibold text-slate-800 dark:text-slate-100">{{ row.label }}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {{ kindLabel(row.kind) }} · {{ row.conversionMode }}
                </p>
                <p v-if="row.note" class="text-xs text-slate-500 dark:text-slate-400">{{ row.note }}</p>
              </div>
            </td>

            <td class="table-cell">
              <div>
                <p class="font-semibold text-slate-800 dark:text-slate-100">
                  {{ formatMoney(row.sourceAmount, row.sourceCurrency) }}
                </p>
                <p v-if="row.sourceCurrency !== row.accountCurrency" class="text-xs text-slate-500 dark:text-slate-400">
                  {{ t('recurring.accountCurrency') }}: {{ row.accountCurrency }}
                </p>
              </div>
            </td>

            <td class="table-cell">
              {{ row.accountName }}
            </td>

            <td class="table-cell">
              {{ row.categoryName }}
            </td>

            <td class="table-cell">
              {{ frequencyLabel(row.frequency, row.intervalCount) }}
            </td>

            <td class="table-cell">
              <div>
                <p>{{ formatDate(row.nextOccurrenceDate) }}</p>
                <p v-if="row.endDate" class="text-xs text-slate-500 dark:text-slate-400">
                  {{ t('forms.fields.endDate') }}: {{ formatDate(row.endDate) }}
                </p>
              </div>
            </td>

            <td class="table-cell">
              <div class="space-y-2">
                  <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                        :class="statusPillClass(row)">
                    {{ statusLabel(row) }}
                  </span>
                <p v-if="row.dueCount > 0" class="text-xs text-slate-500 dark:text-slate-400">
                  {{ t('recurring.dueOccurrencesCount', {count: row.dueCount}) }}
                </p>
              </div>
            </td>

            <td class="table-cell">
              <div class="row-actions">
                <button
                    class="mini-action-btn"
                    :disabled="row.dueCount === 0 || generating"
                    @click="emit('generate-template', row.templateId)"
                >
                  {{ t('recurring.generate') }}
                </button>
                <button class="mini-action-btn" @click="emit('open-edit', row)">
                  {{ t('common.update') }}
                </button>
                <button class="mini-danger-btn" @click="emit('delete-template', row.templateId)">
                  {{ t('common.delete') }}
                </button>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="empty-state">
        {{ t('recurring.empty') }}
      </div>
    </section>

    <div
        v-if="dialogOpen"
        class="dialog-backdrop"
        @click.self="emit('close-dialog')"
    >
      <div class="dialog-card max-w-3xl">
        <p class="soft-kicker">{{ t('recurring.sectionName') }}</p>
        <h3 class="dialog-title">
          {{ editingRecurringId ? t('recurring.editRecurring') : t('recurring.createRecurring') }}
        </h3>
        <p class="dialog-text">
          {{ t('recurring.dialogDescription') }}
        </p>

        <form class="mt-6 space-y-5" @submit.prevent="emit('submit-template')">
          <div class="grid gap-4 md:grid-cols-2">
            <label class="field-block md:col-span-2">
              <span class="field-label">{{ t('forms.fields.label') }}</span>
              <input v-model="recurringForm.label" type="text" class="field-control"
                     :placeholder="t('recurring.placeholders.label')"/>
            </label>

            <label class="field-block">
              <span class="field-label">{{ t('forms.fields.sourceAmount') }}</span>
              <input v-model="recurringForm.sourceAmount" type="number" min="0" step="0.01" class="field-control"
                     placeholder="0.00"/>
            </label>

            <label class="field-block">
              <span class="field-label">{{ t('forms.fields.sourceCurrency') }}</span>
              <input v-model="recurringForm.sourceCurrency" type="text" maxlength="6" class="field-control"
                     :placeholder="t('recurring.placeholders.sourceCurrency')"/>
            </label>

            <label class="field-block">
              <span class="field-label">{{ t('forms.fields.type') }}</span>
              <select v-model="recurringForm.kind" class="field-control">
                <option value="EXPENSE">{{ kindLabel('EXPENSE') }}</option>
                <option value="INCOME">{{ kindLabel('INCOME') }}</option>
                <option value="TRANSFER">{{ kindLabel('TRANSFER') }}</option>
              </select>
            </label>

            <label class="field-block">
              <span class="field-label">{{ t('forms.fields.account') }}</span>
              <select v-model="recurringForm.accountId" class="field-control">
                <option value="">{{ t('forms.placeholders.selectAccount') }}</option>
                <option v-for="account in accounts" :key="account.id" :value="String(account.id)">
                  {{ account.name }} ({{ account.currency }})
                </option>
              </select>
            </label>

            <label class="field-block">
              <span class="field-label">{{ t('forms.fields.frequency') }}</span>
              <select v-model="recurringForm.frequency" class="field-control">
                <option value="DAILY">{{ t('recurring.frequency.daily') }}</option>
                <option value="WEEKLY">{{ t('recurring.frequency.weekly') }}</option>
                <option value="MONTHLY">{{ t('recurring.frequency.monthly') }}</option>
                <option value="YEARLY">{{ t('recurring.frequency.yearly') }}</option>
              </select>
            </label>

            <label class="field-block">
              <span class="field-label">{{ t('forms.fields.intervalCount') }}</span>
              <input v-model="recurringForm.intervalCount" type="number" min="1" step="1" class="field-control"
                     placeholder="1"/>
            </label>

            <label class="field-block">
              <span class="field-label">{{ t('forms.fields.startDate') }}</span>
              <input v-model="recurringForm.startDate" type="date" class="field-control"/>
            </label>

            <label class="field-block">
              <span class="field-label">{{ t('forms.fields.nextOccurrenceDate') }}</span>
              <input v-model="recurringForm.nextOccurrenceDate" type="date" class="field-control"/>
            </label>

            <label class="field-block">
              <span class="field-label">{{ t('forms.fields.endDate') }}</span>
              <input v-model="recurringForm.endDate" type="date" class="field-control"/>
            </label>

            <label class="field-block">
              <span class="field-label">{{ t('forms.fields.category') }}</span>
              <select v-model="recurringForm.categoryId" class="field-control">
                <option value="">{{ t('recurring.noCategory') }}</option>
                <option v-for="category in categories" :key="category.id" :value="String(category.id)">
                  {{ category.name }}
                </option>
              </select>
            </label>

            <label class="field-block md:col-span-2">
              <span class="field-label">{{ t('forms.fields.note') }}</span>
              <textarea v-model="recurringForm.note" rows="3" class="field-control field-textarea"
                        :placeholder="t('common.optional')"/>
            </label>

            <label class="field-block">
              <span class="field-label">{{ t('forms.fields.active') }}</span>
              <select v-model="recurringForm.isActive" class="field-control">
                <option :value="true">{{ t('common.yes') }}</option>
                <option :value="false">{{ t('common.no') }}</option>
              </select>
            </label>
          </div>

          <div v-if="recurringForm.accountId" class="mini-card">
            <p class="mini-label">{{ t('recurring.accountCurrency') }}</p>
            <p class="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {{ selectedAccountCurrency }}
            </p>
          </div>

          <div v-if="isForeignCurrency" class="mini-card space-y-4">
            <p class="mini-label">{{ t('recurring.multicurrencyConversion') }}</p>

            <div class="grid gap-4 md:grid-cols-3">
              <label class="field-block">
                <span class="field-label">{{ t('forms.fields.conversionMode') }}</span>
                <select v-model="recurringForm.conversionMode" class="field-control">
                  <option value="AUTOMATIC">{{ t('common.automatic') }}</option>
                  <option value="MANUAL">{{ t('common.manual') }}</option>
                </select>
              </label>

              <label class="field-block">
                <span class="field-label">{{
                    t('forms.fields.accountAmount', {currency: selectedAccountCurrency})
                  }}</span>
                <input
                    v-model="recurringForm.accountAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    class="field-control"
                    :readonly="recurringForm.conversionMode === 'AUTOMATIC'"
                />
              </label>

              <label class="field-block">
                <span class="field-label">{{ t('forms.fields.exchangeRate') }}</span>
                <input
                    v-model="recurringForm.exchangeRate"
                    type="number"
                    min="0"
                    step="0.000001"
                    class="field-control"
                    :readonly="recurringForm.conversionMode === 'AUTOMATIC'"
                />
              </label>
            </div>

            <label class="field-block">
              <span class="field-label">{{ t('forms.fields.exchangeProvider') }}</span>
              <input
                  v-model="recurringForm.exchangeProvider"
                  type="text"
                  class="field-control"
                  :readonly="recurringForm.conversionMode === 'AUTOMATIC'"
                  :placeholder="t('recurring.placeholders.exchangeProvider')"
              />
            </label>

            <div v-if="recurringForm.conversionMode === 'AUTOMATIC'" class="inline-warning">
              {{ t('recurring.automaticFxNotice') }}
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="ghost-btn" @click="emit('close-dialog')">
              {{ t('common.cancel') }}
            </button>
            <button type="submit" class="primary-btn" :disabled="saving">
              {{ saving ? t('common.loading') : (editingRecurringId ? t('common.update') : t('common.create')) }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>