<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {
  ExpenseBreakdownItem,
  MonthlyPoint,
  Transaction,
} from '../types/budget'
import {
  amountClass,
  categoryDotStyle,
  formatDate,
  formatMoney,
  kindLabel,
  kindPillClass,
} from '../utils/budgetFormat'

const props = defineProps<{
  recentTransactions: Transaction[]
  monthlyTrend: MonthlyPoint[]
  expenseBreakdown: ExpenseBreakdownItem[]
  totalExpense: number
  summaryCurrency: string
}>()

const emit = defineEmits<{
  (e: 'open-transactions'): void
  (e: 'edit-transaction', transaction: Transaction): void
  (e: 'delete-transaction', transaction: Transaction): void
  (e: 'create-transaction'): void
  (e: 'create-account'): void
  (e: 'create-category'): void
}>()

const maxIncome = computed(() =>
    Math.max(...props.monthlyTrend.map((point) => point.income), 1),
)

const maxExpense = computed(() =>
    Math.max(...props.monthlyTrend.map((point) => point.expense), 1),
)

const {t} = useI18n()
</script>

<template>
  <section class="space-y-6">
    <div class="grid gap-6 xl:grid-cols-12">
      <section class="panel xl:col-span-8">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">{{ t('overview.recentActivity') }}</p>
            <h3 class="panel-title">{{ t('overview.latestTransactions') }}</h3>
          </div>

          <button class="ghost-btn" @click="emit('open-transactions')">
            {{ t('overview.seeAll') }}
          </button>
        </div>

        <div v-if="recentTransactions.length" class="overflow-x-auto">
          <table class="w-full min-w-[920px]">
            <thead>
            <tr class="table-head">
              <th class="table-cell-head text-left">{{ t('forms.fields.label') }}</th>
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
              <td class="table-cell">
                <div class="flex items-center gap-3">
                    <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                          :class="kindPillClass(transaction.kind)">
                      {{ kindLabel(transaction.kind) }}
                    </span>
                  <div>
                    <p class="font-semibold text-slate-800 dark:text-slate-100">
                      {{ transaction.label }}
                    </p>
                    <p v-if="transaction.note" class="text-xs text-slate-500 dark:text-slate-400">
                      {{ transaction.note }}
                    </p>
                  </div>
                </div>
              </td>

              <td class="table-cell">
                {{ transaction.account?.name || '—' }}
              </td>

              <td class="table-cell">
                <div class="flex items-center gap-2">
                  <span class="h-2.5 w-2.5 rounded-full" :style="categoryDotStyle(transaction.category?.color)"/>
                  <span>{{ transaction.category?.name || t('common.none') }}</span>
                </div>
              </td>

              <td class="table-cell">
                {{ formatDate(transaction.date) }}
              </td>

              <td class="table-cell text-right font-semibold" :class="amountClass(transaction.kind)">
                {{ formatMoney(Math.abs(transaction.amount), transaction.account?.currency || 'CAD') }}
              </td>

              <td class="table-cell">
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

      <div class="space-y-6 xl:col-span-4">
        <section class="panel">
          <div class="panel-header">
            <div>
              <p class="panel-eyebrow">{{ t('analytics.netFlow') }}</p>
              <h3 class="panel-title">{{ t('overview.monthlyTrend') }}</h3>
            </div>
          </div>

          <div class="px-6 pb-6">
            <div class="chart-shell">
              <div
                  v-for="point in monthlyTrend"
                  :key="point.key"
                  class="chart-column"
              >
                <div class="chart-double-bars">
                  <div class="chart-bar chart-bar-income" :style="{ height: `${(point.income / maxIncome) * 100}%` }"/>
                  <div class="chart-bar chart-bar-expense"
                       :style="{ height: `${(point.expense / maxExpense) * 100}%` }"/>
                </div>
                <p class="chart-label">{{ point.label }}</p>
                <p class="chart-subvalue">{{ formatMoney(point.net, summaryCurrency) }}</p>
              </div>
            </div>

            <div class="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
              <span class="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <span class="h-2.5 w-2.5 rounded-full bg-emerald-500"/>
                {{ t('analytics.income') }}
              </span>
              <span class="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <span class="h-2.5 w-2.5 rounded-full bg-rose-500"/>
                {{ t('analytics.expense') }}
              </span>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <div>
              <p class="panel-eyebrow">{{ t('overview.expenseWeight') }}</p>
              <h3 class="panel-title">{{ t('overview.breakdown') }}</h3>
            </div>
          </div>

          <div v-if="expenseBreakdown.length" class="space-y-4 px-6 pb-6">
            <div
                v-for="category in expenseBreakdown"
                :key="category.name"
            >
              <div class="mb-2 flex items-center justify-between gap-3">
                <div class="flex min-w-0 items-center gap-2">
                  <span class="h-2.5 w-2.5 rounded-full" :style="categoryDotStyle(category.color)"/>
                  <span class="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                    {{ category.name }}
                  </span>
                </div>

                <span class="text-sm font-semibold text-slate-900 dark:text-white">
                  {{ category.percent }}%
                </span>
              </div>

              <div class="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                    class="h-2 rounded-full bg-violet-500"
                    :style="{ width: `${category.percent}%` }"
                />
              </div>

              <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {{ formatMoney(category.total, summaryCurrency) }}
              </p>
            </div>
          </div>

          <div v-else class="empty-state">
            {{ t('overview.notEnoughBreakdown') }}
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <div>
              <p class="panel-eyebrow">{{ t('overview.quickActions') }}</p>
              <h3 class="panel-title">{{ t('overview.create') }}</h3>
            </div>
          </div>

          <div class="space-y-3 px-6 pb-6">
            <button class="quick-panel-action" @click="emit('create-transaction')">
              {{ t('forms.titles.createTransaction') }}
            </button>
            <button class="quick-panel-action" @click="emit('create-account')">
              {{ t('forms.titles.createAccount') }}
            </button>
            <button class="quick-panel-action" @click="emit('create-category')">
              {{ t('forms.titles.createCategory') }}
            </button>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>