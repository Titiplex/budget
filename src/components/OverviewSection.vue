<script setup lang="ts">
import {computed} from 'vue'
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
</script>

<template>
  <section class="space-y-6">
    <div class="grid gap-6 xl:grid-cols-12">
      <section class="panel xl:col-span-8">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">Activité récente</p>
            <h3 class="panel-title">Dernières transactions</h3>
          </div>

          <button class="ghost-btn" @click="emit('open-transactions')">
            Tout voir
          </button>
        </div>

        <div v-if="recentTransactions.length" class="overflow-x-auto">
          <table class="w-full min-w-[920px]">
            <thead>
            <tr class="table-head">
              <th class="table-cell-head text-left">Libellé</th>
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
                  <span>{{ transaction.category?.name || 'Sans catégorie' }}</span>
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
          Aucune transaction pour le moment.
        </div>
      </section>

      <div class="space-y-6 xl:col-span-4">
        <section class="panel">
          <div class="panel-header">
            <div>
              <p class="panel-eyebrow">Vue analytique</p>
              <h3 class="panel-title">Tendance mensuelle</h3>
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
                Revenus
              </span>
              <span class="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <span class="h-2.5 w-2.5 rounded-full bg-rose-500"/>
                Dépenses
              </span>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <div>
              <p class="panel-eyebrow">Poids des dépenses</p>
              <h3 class="panel-title">Répartition</h3>
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
            Pas assez de données pour une répartition.
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <div>
              <p class="panel-eyebrow">Actions rapides</p>
              <h3 class="panel-title">Créer</h3>
            </div>
          </div>

          <div class="space-y-3 px-6 pb-6">
            <button class="quick-panel-action" @click="emit('create-transaction')">
              Nouvelle transaction
            </button>
            <button class="quick-panel-action" @click="emit('create-account')">
              Nouveau compte
            </button>
            <button class="quick-panel-action" @click="emit('create-category')">
              Nouvelle catégorie
            </button>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>