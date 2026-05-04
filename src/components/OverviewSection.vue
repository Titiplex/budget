<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {ExpenseBreakdownItem, MonthlyPoint, RecurringForecastOccurrence, Transaction} from '../types/budget'
import {amountClass, formatDate, formatMoney, kindLabel, kindPillClass} from '../utils/budgetFormat'
import {transferAccountHint, transferAmountHint, transferDirectionLabel, transferRoute} from '../utils/transferDisplay'

const props = defineProps<{
  recentTransactions: Transaction[]
  monthlyTrend: MonthlyPoint[]
  expenseBreakdown: ExpenseBreakdownItem[]
  totalExpense: number
  summaryCurrency: string
  recurringPreview?: RecurringForecastOccurrence[]
  recurringProjection?: {
    monthlyExpenseCommitment: number
    monthlyIncomeCommitment: number
    netMonthlyCommitment: number
    next30DaysExpense: number
    next30DaysIncome: number
    next30DaysNet: number
  } | null
}>()

const emit = defineEmits<{
  (e: 'open-transactions'): void
  (e: 'edit-transaction', value: Transaction): void
  (e: 'delete-transaction', value: Transaction): void
  (e: 'create-transaction'): void
  (e: 'create-account'): void
  (e: 'create-category'): void
}>()

const {t} = useI18n()

const maxTrendValue = computed(() =>
    Math.max(
        1,
        ...props.monthlyTrend.map((item) => Math.max(item.income, item.expense, 1)),
    ),
)

function barHeight(value: number, max: number) {
  if (max <= 0) return 12
  return Math.max(12, Math.round((value / max) * 140))
}

function accountLabel(transaction: Transaction) {
  if (transaction.kind !== 'TRANSFER') {
    return transaction.account?.name || '—'
  }

  return transferRoute(transaction) || transaction.account?.name || '—'
}

function categoryLabel(transaction: Transaction) {
  if (transaction.kind === 'TRANSFER') return t('transfer.internal')
  return transaction.category?.name || '—'
}
</script>

<template>
  <section class="space-y-6">
    <div class="grid gap-6 xl:grid-cols-12">
      <section class="panel xl:col-span-7">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">{{ t('overview.cashflowTrend') }}</p>
            <h2 class="panel-title">{{ t('overview.lastMonths') }}</h2>
          </div>
          <button class="ghost-btn" @click="emit('open-transactions')">
            {{ t('overview.viewTransactions') }}
          </button>
        </div>

        <div class="px-6 pb-6">
          <div class="chart-shell overflow-x-auto">
            <div
                v-for="point in monthlyTrend"
                :key="point.key"
                class="chart-column min-w-[88px]"
            >
              <div class="chart-double-bars">
                <div
                    class="chart-bar chart-bar-income"
                    :style="{ height: `${barHeight(point.income, maxTrendValue)}px` }"
                    :title="`${t('analytics.income')}: ${formatMoney(point.income, summaryCurrency)}`"
                />
                <div
                    class="chart-bar chart-bar-expense"
                    :style="{ height: `${barHeight(point.expense, maxTrendValue)}px` }"
                    :title="`${t('analytics.expense')}: ${formatMoney(point.expense, summaryCurrency)}`"
                />
              </div>

              <span class="chart-label">{{ point.label }}</span>
              <span
                  class="chart-subvalue"
                  :class="point.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
              >
                {{ formatMoney(point.net, summaryCurrency) }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section class="panel xl:col-span-5">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">{{ t('overview.expenseSplit') }}</p>
            <h2 class="panel-title">{{ t('overview.topExpenseItems') }}</h2>
          </div>
        </div>

        <div v-if="expenseBreakdown.length" class="space-y-4 px-6 pb-6">
          <div
              v-for="item in expenseBreakdown"
              :key="item.name"
              class="expense-item"
          >
            <div class="expense-item-head">
              <div class="expense-item-label">
                <span
                    class="expense-item-dot"
                    :style="{ backgroundColor: item.color || '#8b5cf6' }"
                />
                <span>{{ item.name }}</span>
              </div>
              <div class="expense-item-values mt-1 flex items-baseline gap-2 text-sm">
                <span class="font-medium text-white">{{ formatMoney(item.total, summaryCurrency) }}</span>
                <span class="expense-item-percent text-slate-400">{{ item.percent.toFixed(1) }}%</span>
              </div>
            </div>

            <div class="expense-item-track">
              <div
                  class="expense-item-fill"
                  :style="{
                  width: `${item.percent}%`,
                  backgroundColor: item.color || '#8b5cf6',
                }"
              />
            </div>
          </div>
        </div>

        <div v-else class="empty-state">
          {{ t('overview.noCategorizedExpenseYet') }}
        </div>
      </section>
    </div>

    <div v-if="recurringProjection" class="grid gap-6 xl:grid-cols-12">
      <section class="panel xl:col-span-5">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">{{ t('recurring.sectionName') }}</p>
            <h2 class="panel-title">{{ t('overview.quickProjection') }}</h2>
          </div>
        </div>

        <div class="space-y-3 px-6 pb-6">
          <div class="mini-card">
            <p class="mini-label">{{ t('overview.recurringMonthlyExpenses') }}</p>
            <p class="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
              {{ formatMoney(recurringProjection.monthlyExpenseCommitment, summaryCurrency) }}
            </p>
          </div>

          <div class="mini-card">
            <p class="mini-label">{{ t('overview.recurringMonthlyIncome') }}</p>
            <p class="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
              {{ formatMoney(recurringProjection.monthlyIncomeCommitment, summaryCurrency) }}
            </p>
          </div>

          <div class="mini-card">
            <p class="mini-label">{{ t('overview.recurringMonthlyNet') }}</p>
            <p class="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
              {{ formatMoney(recurringProjection.netMonthlyCommitment, summaryCurrency) }}
            </p>
          </div>

          <div class="mini-card">
            <p class="mini-label">{{ t('overview.impact30Days') }}</p>
            <p class="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
              {{ formatMoney(recurringProjection.next30DaysNet, summaryCurrency) }}
            </p>
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {{ t('analytics.income') }}: {{ formatMoney(recurringProjection.next30DaysIncome, summaryCurrency) }}
              · {{ t('analytics.expense') }}: {{ formatMoney(recurringProjection.next30DaysExpense, summaryCurrency) }}
            </p>
          </div>
        </div>
      </section>

      <section class="panel xl:col-span-7">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">{{ t('overview.upcoming') }}</p>
            <h2 class="panel-title">{{ t('overview.nextRecurringOccurrences') }}</h2>
          </div>
        </div>

        <div v-if="recurringPreview && recurringPreview.length" class="overflow-x-auto">
          <table class="w-full min-w-[720px]">
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
            <tr
                v-for="item in recurringPreview"
                :key="`${item.templateId}-${item.plannedDate}-${item.label}`"
                class="table-row"
            >
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
          {{ t('overview.noUpcomingRecurring') }}
        </div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">{{ t('overview.recentActivity') }}</p>
          <h2 class="panel-title">{{ t('overview.latestTransactionsLabel') }}</h2>
        </div>

        <div class="flex gap-2">
          <button class="ghost-btn" @click="emit('create-account')">
            {{ t('accounts.addAccount') }}
          </button>
          <button class="ghost-btn" @click="emit('create-category')">
            {{ t('categories.addCategory') }}
          </button>
          <button class="primary-btn" @click="emit('create-transaction')">
            {{ t('forms.titles.createTransaction') }}
          </button>
        </div>
      </div>

      <div v-if="recentTransactions.length" class="overflow-x-auto">
        <table class="w-full min-w-[980px]">
          <thead>
          <tr class="table-head">
            <th class="table-cell-head text-left">{{ t('forms.fields.label') }}</th>
            <th class="table-cell-head text-left">{{ t('forms.fields.type') }}</th>
            <th class="table-cell-head text-left">{{ t('forms.fields.account') }}</th>
            <th class="table-cell-head text-left">{{ t('forms.fields.category') }}</th>
            <th class="table-cell-head text-left">{{ t('forms.fields.date') }}</th>
            <th class="table-cell-head text-right">{{ t('forms.fields.amount') }}</th>
            <th class="table-cell-head text-right">{{ t('overview.quickActions') }}</th>
          </tr>
          </thead>

          <tbody>
          <tr
              v-for="transaction in recentTransactions"
              :key="transaction.id"
              class="table-row"
          >
            <td class="table-cell align-top">
              <div class="space-y-1">
                <p class="font-semibold text-slate-800 dark:text-slate-100">
                  {{ transaction.label }}
                </p>
                <p
                    v-if="transaction.kind === 'TRANSFER' && transferRoute(transaction)"
                    class="text-xs font-medium text-sky-600 dark:text-sky-300"
                >
                  {{ transferRoute(transaction) }}
                </p>
                <p
                    v-if="transaction.note"
                    class="text-xs text-slate-500 dark:text-slate-400"
                >
                  {{ transaction.note }}
                </p>
              </div>
            </td>

            <td class="table-cell align-top">
              <div class="flex flex-col items-start gap-2">
                  <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                        :class="kindPillClass(transaction.kind)">
                    {{ kindLabel(transaction.kind) }}
                  </span>

                <span
                    v-if="transaction.kind === 'TRANSFER'"
                    class="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/50 dark:text-sky-300"
                >
                    {{ transferDirectionLabel(transaction) }}
                  </span>
              </div>
            </td>

            <td class="table-cell align-top">
              <div class="space-y-1">
                <p class="font-medium text-slate-800 dark:text-slate-100">
                  {{ accountLabel(transaction) }}
                </p>
                <p
                    v-if="transaction.kind === 'TRANSFER' && transferAccountHint(transaction)"
                    class="text-xs text-slate-500 dark:text-slate-400"
                >
                  {{ transferAccountHint(transaction) }}
                </p>
              </div>
            </td>

            <td class="table-cell align-top">
                <span
                    v-if="transaction.kind === 'TRANSFER'"
                    class="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/50 dark:text-sky-300"
                >
                  {{ categoryLabel(transaction) }}
                </span>
              <span v-else>
                  {{ categoryLabel(transaction) }}
                </span>
            </td>

            <td class="table-cell align-top">
              {{ formatDate(transaction.date) }}
            </td>

            <td class="table-cell align-top text-right">
              <div class="space-y-1">
                <p class="font-semibold" :class="amountClass(transaction.kind)">
                  {{ formatMoney(Math.abs(transaction.amount), transaction.account?.currency || summaryCurrency) }}
                </p>
                <p
                    v-if="transaction.kind === 'TRANSFER' && transferAmountHint(transaction)"
                    class="text-xs text-slate-500 dark:text-slate-400"
                >
                  {{ transferAmountHint(transaction) }}
                </p>
              </div>
            </td>

            <td class="table-cell align-top">
              <div class="row-actions">
                <button class="mini-action-btn" @click="emit('edit-transaction', transaction)">
                  {{ t('common.update') }}
                </button>
                <button class="mini-danger-btn" @click="emit('delete-transaction', transaction)">
                  {{ t('common.delete') }}
                </button>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="empty-state">
        {{ t('overview.noTransactions') }}
      </div>
    </section>
  </section>
</template>