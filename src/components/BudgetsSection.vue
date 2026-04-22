<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import type {BudgetPeriod, BudgetProgressRow, Category} from '../types/budget'
import {formatDate, formatMoney} from '../utils/budgetFormat'

const props = defineProps<{
  categories: Category[]
  rows: BudgetProgressRow[]
  summary: {
    count: number
    targetAmount: number
    spentAmount: number
    remainingAmount: number
    overCount: number
    nearCount: number
  }
  loading: boolean
  saving: boolean
  dialogOpen: boolean
  editingBudgetId: number | null
  budgetForm: {
    name: string
    amount: string
    period: BudgetPeriod
    startDate: string
    endDate: string
    currency: string
    isActive: boolean
    note: string
    categoryId: string
  }
}>()

const emit = defineEmits<{
  (e: 'open-create', categoryId?: number): void
  (e: 'open-edit', row: BudgetProgressRow): void
  (e: 'delete-budget', id: number): void
  (e: 'close-dialog'): void
  (e: 'submit-budget'): void
}>()

const {t} = useI18n()

function statusPillClass(status: BudgetProgressRow['status']) {
  if (status === 'OVER') {
    return 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300'
  }
  if (status === 'NEAR') {
    return 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
  }
  return 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
}

function periodLabel(period: BudgetPeriod) {
  if (period === 'MONTHLY') return t('budgets.period.monthly')
  if (period === 'YEARLY') return t('budgets.period.yearly')
  return t('budgets.period.custom')
}

function statusLabel(status: BudgetProgressRow['status']) {
  if (status === 'OVER') return t('budgets.status.over')
  if (status === 'NEAR') return t('budgets.status.near')
  return t('budgets.status.under')
}
</script>

<template>
  <section class="space-y-6">
    <div class="flex items-center justify-end">
      <button class="primary-btn" @click="emit('open-create')">
        {{ t('budgets.addBudget') }}
      </button>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div class="stat-card">
        <p class="stat-label">{{ t('budgets.activeBudgets') }}</p>
        <p class="stat-value">{{ summary.count }}</p>
        <p class="stat-hint">{{ t('budgets.activeBudgetsHint') }}</p>
      </div>

      <div class="stat-card">
        <p class="stat-label">{{ t('budgets.totalTarget') }}</p>
        <p class="stat-value">{{ formatMoney(summary.targetAmount) }}</p>
        <p class="stat-hint">{{ t('budgets.totalTargetHint') }}</p>
      </div>

      <div class="stat-card">
        <p class="stat-label">{{ t('budgets.spent') }}</p>
        <p class="stat-value">{{ formatMoney(summary.spentAmount) }}</p>
        <p class="stat-hint">{{ t('budgets.spentHint') }}</p>
      </div>

      <div class="stat-card">
        <p class="stat-label">{{ t('budgets.alerts') }}</p>
        <p class="stat-value text-xl">{{
            t('budgets.alertsValue', {over: summary.overCount, near: summary.nearCount})
          }}</p>
        <p class="stat-hint">{{ t('budgets.alertsHint') }}</p>
      </div>
    </div>

    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">{{ t('budgets.control') }}</p>
          <h3 class="panel-title">{{ t('budgets.byCategory') }}</h3>
        </div>
      </div>

      <div v-if="rows.length" class="overflow-x-auto">
        <table class="w-full min-w-[1080px]">
          <thead>
          <tr class="table-head">
            <th class="table-cell-head text-left">{{ t('budgets.budget') }}</th>
            <th class="table-cell-head text-left">{{ t('forms.fields.category') }}</th>
            <th class="table-cell-head text-left">{{ t('budgets.periodLabel') }}</th>
            <th class="table-cell-head text-right">{{ t('budgets.target') }}</th>
            <th class="table-cell-head text-right">{{ t('budgets.spent') }}</th>
            <th class="table-cell-head text-right">{{ t('budgets.remaining') }}</th>
            <th class="table-cell-head text-right">{{ t('budgets.usedPercent') }}</th>
            <th class="table-cell-head text-left">{{ t('budgets.statusLabel') }}</th>
            <th class="table-cell-head text-right">{{ t('overview.quickActions') }}</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="row in rows" :key="row.budgetId" class="table-row">
            <td class="table-cell">
              <div>
                <p class="font-semibold text-slate-800 dark:text-slate-100">{{ row.name }}</p>
                <p v-if="row.note" class="text-xs text-slate-500 dark:text-slate-400">{{ row.note }}</p>
              </div>
            </td>
            <td class="table-cell">
              <div class="flex items-center gap-2">
                <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: row.categoryColor || '#94a3b8' }"/>
                <span>{{ row.categoryName }}</span>
              </div>
            </td>
            <td class="table-cell">
              <div>
                <p>{{ periodLabel(row.period) }}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {{ formatDate(row.startDate) }} → {{ formatDate(row.endDate) }}
                </p>
              </div>
            </td>
            <td class="table-cell text-right">{{ formatMoney(row.targetAmount, row.currency) }}</td>
            <td class="table-cell text-right">{{ formatMoney(row.spentAmount, row.currency) }}</td>
            <td class="table-cell text-right">
                <span
                    :class="row.remainingAmount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'">
                  {{ formatMoney(row.remainingAmount, row.currency) }}
                </span>
            </td>
            <td class="table-cell text-right">{{ row.progressPercent.toFixed(1) }}%</td>
            <td class="table-cell">
                <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                      :class="statusPillClass(row.status)">
                  {{ statusLabel(row.status) }}
                </span>
            </td>
            <td class="table-cell">
              <div class="row-actions">
                <button class="mini-action-btn" @click="emit('open-edit', row)">{{ t('common.update') }}</button>
                <button class="mini-danger-btn" @click="emit('delete-budget', row.budgetId)">{{
                    t('common.delete')
                  }}
                </button>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="empty-state">
        {{ t('budgets.empty') }}
      </div>
    </section>

    <div
        v-if="dialogOpen"
        class="dialog-backdrop"
        @click.self="emit('close-dialog')"
    >
      <div class="dialog-card">
        <p class="soft-kicker">{{ t('budgets.sectionName') }}</p>
        <h3 class="dialog-title">
          {{ editingBudgetId ? t('budgets.editBudget') : t('budgets.createBudget') }}
        </h3>
        <p class="dialog-text">
          {{ t('budgets.dialogDescription') }}
        </p>

        <form class="mt-6 space-y-5" @submit.prevent="emit('submit-budget')">
          <div class="grid gap-4 md:grid-cols-2">
            <label class="field-block md:col-span-2">
              <span class="field-label">{{ t('forms.fields.name') }}</span>
              <input v-model="budgetForm.name" type="text" class="field-control"
                     :placeholder="t('budgets.placeholders.name')"/>
            </label>

            <label class="field-block">
              <span class="field-label">{{ t('budgets.target') }}</span>
              <input v-model="budgetForm.amount" type="number" min="0" step="0.01" class="field-control"
                     placeholder="0.00"/>
            </label>

            <label class="field-block">
              <span class="field-label">{{ t('forms.fields.currency') }}</span>
              <input v-model="budgetForm.currency" type="text" maxlength="6" class="field-control" placeholder="CAD"/>
            </label>

            <label class="field-block">
              <span class="field-label">{{ t('budgets.periodLabel') }}</span>
              <select v-model="budgetForm.period" class="field-control">
                <option value="MONTHLY">{{ t('budgets.period.monthly') }}</option>
                <option value="YEARLY">{{ t('budgets.period.yearly') }}</option>
                <option value="CUSTOM">{{ t('budgets.period.custom') }}</option>
              </select>
            </label>

            <label class="field-block">
              <span class="field-label">{{ t('forms.fields.category') }}</span>
              <select v-model="budgetForm.categoryId" class="field-control">
                <option value="">{{ t('budgets.placeholders.selectCategory') }}</option>
                <option
                    v-for="category in categories.filter((item) => item.kind === 'EXPENSE')"
                    :key="category.id"
                    :value="String(category.id)"
                >
                  {{ category.name }}
                </option>
              </select>
            </label>

            <label class="field-block">
              <span class="field-label">{{ t('forms.fields.startDate') }}</span>
              <input v-model="budgetForm.startDate" type="date" class="field-control"/>
            </label>

            <label class="field-block">
              <span class="field-label">{{ t('forms.fields.endDate') }}</span>
              <input
                  v-model="budgetForm.endDate"
                  type="date"
                  class="field-control"
                  :disabled="budgetForm.period !== 'CUSTOM'"
              />
            </label>

            <label class="field-block md:col-span-2">
              <span class="field-label">{{ t('forms.fields.note') }}</span>
              <textarea v-model="budgetForm.note" rows="3" class="field-control field-textarea"
                        :placeholder="t('common.optional')"/>
            </label>

            <label class="field-block md:col-span-2">
              <span class="field-label">{{ t('forms.fields.active') }}</span>
              <select v-model="budgetForm.isActive" class="field-control">
                <option :value="true">{{ t('common.yes') }}</option>
                <option :value="false">{{ t('common.no') }}</option>
              </select>
            </label>
          </div>

          <div class="form-actions">
            <button type="button" class="ghost-btn" @click="emit('close-dialog')">
              {{ t('common.cancel') }}
            </button>
            <button type="submit" class="primary-btn" :disabled="saving">
              {{ saving ? t('common.loading') : (editingBudgetId ? t('common.update') : t('common.create')) }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>