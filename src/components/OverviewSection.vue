<script setup lang="ts">
import type {ExpenseBreakdownItem, MonthlyPoint, RecurringForecastOccurrence, Transaction} from '../types/budget'
import {formatDate, formatMoney, kindLabel} from '../utils/budgetFormat'

defineProps<{
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

function barHeight(value: number, max: number) {
  if (max <= 0) return 12
  return Math.max(12, Math.round((value / max) * 140))
}
</script>

<template>
  <section class="space-y-6">
    <div class="grid gap-6 xl:grid-cols-12">
      <section class="panel xl:col-span-7">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">Cashflow trend</p>
            <h2 class="panel-title">Derniers mois</h2>
          </div>
          <button class="ghost-btn" @click="emit('open-transactions')">
            Voir les transactions
          </button>
        </div>

        <div class="chart-card">
          <div class="trend-chart">
            <div
                v-for="point in monthlyTrend"
                :key="point.key"
                class="trend-column"
            >
              <div class="trend-bars">
                <div
                    class="trend-bar trend-bar-income"
                    :style="{ height: `${barHeight(point.income, Math.max(...monthlyTrend.map((item) => Math.max(item.income, item.expense, 1))))}px` }"
                    :title="`Revenus: ${formatMoney(point.income, summaryCurrency)}`"
                />
                <div
                    class="trend-bar trend-bar-expense"
                    :style="{ height: `${barHeight(point.expense, Math.max(...monthlyTrend.map((item) => Math.max(item.income, item.expense, 1))))}px` }"
                    :title="`Dépenses: ${formatMoney(point.expense, summaryCurrency)}`"
                />
              </div>
              <div class="trend-meta">
                <span class="trend-month">{{ point.label }}</span>
                <span class="trend-net"
                      :class="point.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'">
                  {{ formatMoney(point.net, summaryCurrency) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="panel xl:col-span-5">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">Expense split</p>
            <h2 class="panel-title">Postes majeurs</h2>
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
              <div class="expense-item-values">
                <span>{{ formatMoney(item.total, summaryCurrency) }}</span>
                <span class="expense-item-percent">{{ item.percent.toFixed(1) }}%</span>
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
          Aucune dépense catégorisée pour le moment.
        </div>
      </section>
    </div>

    <div v-if="recurringProjection" class="grid gap-6 xl:grid-cols-12">
      <section class="panel xl:col-span-5">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">Récurrences</p>
            <h2 class="panel-title">Projection rapide</h2>
          </div>
        </div>

        <div class="space-y-3 px-6 pb-6">
          <div class="mini-card">
            <p class="mini-label">Charges mensuelles récurrentes</p>
            <p class="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
              {{ formatMoney(recurringProjection.monthlyExpenseCommitment, summaryCurrency) }}
            </p>
          </div>

          <div class="mini-card">
            <p class="mini-label">Revenus mensuels récurrents</p>
            <p class="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
              {{ formatMoney(recurringProjection.monthlyIncomeCommitment, summaryCurrency) }}
            </p>
          </div>

          <div class="mini-card">
            <p class="mini-label">Net mensuel récurrent</p>
            <p class="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
              {{ formatMoney(recurringProjection.netMonthlyCommitment, summaryCurrency) }}
            </p>
          </div>

          <div class="mini-card">
            <p class="mini-label">Impact sur 30 jours</p>
            <p class="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
              {{ formatMoney(recurringProjection.next30DaysNet, summaryCurrency) }}
            </p>
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              revenus: {{ formatMoney(recurringProjection.next30DaysIncome, summaryCurrency) }}
              · dépenses: {{ formatMoney(recurringProjection.next30DaysExpense, summaryCurrency) }}
            </p>
          </div>
        </div>
      </section>

      <section class="panel xl:col-span-7">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">À venir</p>
            <h2 class="panel-title">Prochaines occurrences récurrentes</h2>
          </div>
        </div>

        <div v-if="recurringPreview && recurringPreview.length" class="overflow-x-auto">
          <table class="w-full min-w-[720px]">
            <thead>
            <tr class="table-head">
              <th class="table-cell-head text-left">Date</th>
              <th class="table-cell-head text-left">Libellé</th>
              <th class="table-cell-head text-left">Compte</th>
              <th class="table-cell-head text-left">Catégorie</th>
              <th class="table-cell-head text-right">Montant</th>
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
          Aucune occurrence récurrente à venir.
        </div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">Recent activity</p>
          <h2 class="panel-title">Derniers mouvements</h2>
        </div>

        <div class="flex gap-2">
          <button class="ghost-btn" @click="emit('create-account')">
            Nouveau compte
          </button>
          <button class="ghost-btn" @click="emit('create-category')">
            Nouvelle catégorie
          </button>
          <button class="primary-btn" @click="emit('create-transaction')">
            Nouvelle transaction
          </button>
        </div>
      </div>

      <div v-if="recentTransactions.length" class="overflow-x-auto">
        <table class="w-full min-w-[860px]">
          <thead>
          <tr class="table-head">
            <th class="table-cell-head text-left">Libellé</th>
            <th class="table-cell-head text-left">Type</th>
            <th class="table-cell-head text-left">Compte</th>
            <th class="table-cell-head text-left">Catégorie</th>
            <th class="table-cell-head text-left">Date</th>
            <th class="table-cell-head text-right">Montant</th>
            <th class="table-cell-head text-right">Actions</th>
          </tr>
          </thead>

          <tbody>
          <tr
              v-for="transaction in recentTransactions"
              :key="transaction.id"
              class="table-row"
          >
            <td class="table-cell">
              <div>
                <p class="font-semibold text-slate-800 dark:text-slate-100">
                  {{ transaction.label }}
                </p>
                <p
                    v-if="transaction.note"
                    class="text-xs text-slate-500 dark:text-slate-400"
                >
                  {{ transaction.note }}
                </p>
              </div>
            </td>

            <td class="table-cell">
                <span class="kind-pill" :class="`kind-pill-${transaction.kind.toLowerCase()}`">
                  {{ kindLabel(transaction.kind) }}
                </span>
            </td>

            <td class="table-cell">
              {{ transaction.account?.name || '—' }}
            </td>

            <td class="table-cell">
              {{ transaction.category?.name || '—' }}
            </td>

            <td class="table-cell">
              {{ formatDate(transaction.date) }}
            </td>

            <td class="table-cell text-right font-semibold">
              {{ formatMoney(transaction.amount, transaction.account?.currency || summaryCurrency) }}
            </td>

            <td class="table-cell">
              <div class="row-actions">
                <button class="mini-action-btn" @click="emit('edit-transaction', transaction)">
                  Modifier
                </button>
                <button class="mini-danger-btn" @click="emit('delete-transaction', transaction)">
                  Supprimer
                </button>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="empty-state">
        Aucune transaction enregistrée pour le moment.
      </div>
    </section>
  </section>
</template>