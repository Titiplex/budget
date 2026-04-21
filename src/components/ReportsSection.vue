<script setup lang="ts">
import type {
  ReportAccountRow,
  ReportAccountTypeRow,
  ReportCategoryRow,
  ReportComparisonSummary,
  ReportCurrencyRow,
  ReportInsight,
  ReportPreset,
  ReportSummary,
  ReportWeekdayRow,
} from '../types/budget'
import {accountTypeLabel, formatDate, formatMoney} from '../utils/budgetFormat'

defineProps<{
  preset: ReportPreset
  startDate: string
  endDate: string
  summary: ReportSummary
  comparison: ReportComparisonSummary
  accountTypeRows: ReportAccountTypeRow[]
  accountRows: ReportAccountRow[]
  categoryRows: ReportCategoryRow[]
  foreignCurrencyRows: ReportCurrencyRow[]
  weekdayRows: ReportWeekdayRow[]
  insights: ReportInsight[]
}>()

const emit = defineEmits<{
  (e: 'set-preset', value: ReportPreset): void
  (e: 'update:start-date', value: string): void
  (e: 'update:end-date', value: string): void
  (e: 'export-report'): void
}>()

function deltaText(value: number, suffix = '') {
  if (value === 0) return `stable${suffix}`
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}${suffix}`
}

function percentText(value: number | null) {
  if (value == null) return 'base précédente nulle'
  if (value === 0) return 'stable'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function deltaClass(value: number, invert = false) {
  if (value === 0) return 'text-slate-500 dark:text-slate-400'
  const positive = invert ? value < 0 : value > 0
  return positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
}
</script>

<template>
  <section class="space-y-6">
    <section class="panel p-6">
      <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p class="soft-kicker">Rapports</p>
          <h2 class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            Rapports de période et analyses avancées
          </h2>
          <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Défini une période, inspecte les finances par type de compte, compte, catégorie et devise, puis exporte un
            rapport avec comparaison à la période précédente équivalente.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <button class="ghost-btn" :class="{ 'tab-btn-active': preset === 'THIS_MONTH' }"
                  @click="emit('set-preset', 'THIS_MONTH')">
            Ce mois
          </button>
          <button class="ghost-btn" :class="{ 'tab-btn-active': preset === 'LAST_30_DAYS' }"
                  @click="emit('set-preset', 'LAST_30_DAYS')">
            30 jours
          </button>
          <button class="ghost-btn" :class="{ 'tab-btn-active': preset === 'THIS_YEAR' }"
                  @click="emit('set-preset', 'THIS_YEAR')">
            Cette année
          </button>
          <button class="ghost-btn" :class="{ 'tab-btn-active': preset === 'ALL' }" @click="emit('set-preset', 'ALL')">
            Tout
          </button>
          <button class="primary-btn" @click="emit('export-report')">
            Exporter le rapport
          </button>
        </div>
      </div>

      <div class="mt-5 grid gap-4 md:grid-cols-2">
        <div class="field-block">
          <label class="field-label">Début</label>
          <input
              :value="startDate"
              type="date"
              class="field-control"
              @input="emit('update:start-date', ($event.target as HTMLInputElement).value)"
          >
        </div>

        <div class="field-block">
          <label class="field-label">Fin</label>
          <input
              :value="endDate"
              type="date"
              class="field-control"
              @input="emit('update:end-date', ($event.target as HTMLInputElement).value)"
          >
        </div>
      </div>

      <div
          class="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
        Comparaison automatique avec la période précédente équivalente :
        <strong>{{ formatDate(comparison.previousStartDate) }}</strong>
        →
        <strong>{{ formatDate(comparison.previousEndDate) }}</strong>
      </div>
    </section>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <div class="stat-card">
        <p class="stat-label">Transactions</p>
        <p class="stat-value">{{ summary.transactionCount }}</p>
        <p class="stat-hint" :class="deltaClass(comparison.transactionCount.delta)">
          {{ percentText(comparison.transactionCount.deltaPercent) }} vs période précédente
        </p>
      </div>
      <div class="stat-card">
        <p class="stat-label">Revenus</p>
        <p class="stat-value">{{ formatMoney(summary.income) }}</p>
        <p class="stat-hint" :class="deltaClass(comparison.income.delta)">
          {{ percentText(comparison.income.deltaPercent) }}
        </p>
      </div>
      <div class="stat-card">
        <p class="stat-label">Dépenses</p>
        <p class="stat-value">{{ formatMoney(summary.expense) }}</p>
        <p class="stat-hint" :class="deltaClass(comparison.expense.delta, true)">
          {{ percentText(comparison.expense.deltaPercent) }}
        </p>
      </div>
      <div class="stat-card">
        <p class="stat-label">Net / épargne</p>
        <p class="stat-value">{{ formatMoney(summary.net) }}</p>
        <p class="stat-hint" :class="deltaClass(comparison.net.delta)">
          {{ deltaText(comparison.savingsRate.delta, ' pts') }} de taux d’épargne
        </p>
      </div>
      <div class="stat-card">
        <p class="stat-label">Transferts internes</p>
        <p class="stat-value">{{ summary.internalTransferCount }}</p>
        <p class="stat-hint" :class="deltaClass(comparison.internalTransferCount.delta, true)">
          {{ percentText(comparison.internalTransferCount.deltaPercent) }}
        </p>
      </div>
    </div>

    <div class="grid gap-6 xl:grid-cols-12">
      <section class="panel xl:col-span-7">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">Comparaisons</p>
            <h3 class="panel-title">Période vs période précédente</h3>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[760px]">
            <thead>
            <tr class="table-head">
              <th class="table-cell-head text-left">Indicateur</th>
              <th class="table-cell-head text-right">Actuel</th>
              <th class="table-cell-head text-right">Précédent</th>
              <th class="table-cell-head text-right">Écart</th>
              <th class="table-cell-head text-right">Écart %</th>
            </tr>
            </thead>
            <tbody>
            <tr class="table-row">
              <td class="table-cell">Revenus</td>
              <td class="table-cell text-right">{{ formatMoney(comparison.income.current) }}</td>
              <td class="table-cell text-right">{{ formatMoney(comparison.income.previous) }}</td>
              <td class="table-cell text-right" :class="deltaClass(comparison.income.delta)">
                {{ formatMoney(comparison.income.delta) }}
              </td>
              <td class="table-cell text-right">{{ percentText(comparison.income.deltaPercent) }}</td>
            </tr>
            <tr class="table-row">
              <td class="table-cell">Dépenses</td>
              <td class="table-cell text-right">{{ formatMoney(comparison.expense.current) }}</td>
              <td class="table-cell text-right">{{ formatMoney(comparison.expense.previous) }}</td>
              <td class="table-cell text-right" :class="deltaClass(comparison.expense.delta, true)">
                {{ formatMoney(comparison.expense.delta) }}
              </td>
              <td class="table-cell text-right">{{ percentText(comparison.expense.deltaPercent) }}</td>
            </tr>
            <tr class="table-row">
              <td class="table-cell">Net</td>
              <td class="table-cell text-right">{{ formatMoney(comparison.net.current) }}</td>
              <td class="table-cell text-right">{{ formatMoney(comparison.net.previous) }}</td>
              <td class="table-cell text-right" :class="deltaClass(comparison.net.delta)">
                {{ formatMoney(comparison.net.delta) }}
              </td>
              <td class="table-cell text-right">{{ percentText(comparison.net.deltaPercent) }}</td>
            </tr>
            <tr class="table-row">
              <td class="table-cell">Taux d’épargne</td>
              <td class="table-cell text-right">{{ comparison.savingsRate.current.toFixed(1) }}%</td>
              <td class="table-cell text-right">{{ comparison.savingsRate.previous.toFixed(1) }}%</td>
              <td class="table-cell text-right" :class="deltaClass(comparison.savingsRate.delta)">
                {{ deltaText(comparison.savingsRate.delta, ' pts') }}
              </td>
              <td class="table-cell text-right">{{ percentText(comparison.savingsRate.deltaPercent) }}</td>
            </tr>
            <tr class="table-row">
              <td class="table-cell">Transferts internes</td>
              <td class="table-cell text-right">{{ comparison.internalTransferCount.current }}</td>
              <td class="table-cell text-right">{{ comparison.internalTransferCount.previous }}</td>
              <td class="table-cell text-right">{{ comparison.internalTransferCount.delta }}</td>
              <td class="table-cell text-right">{{ percentText(comparison.internalTransferCount.deltaPercent) }}</td>
            </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel xl:col-span-5">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">Insights</p>
            <h3 class="panel-title">Points saillants</h3>
          </div>
        </div>

        <div class="space-y-3 px-6 pb-6">
          <div v-for="insight in insights" :key="insight.title" class="mini-card">
            <p class="mini-label">{{ insight.title }}</p>
            <p class="mt-2 text-sm text-slate-700 dark:text-slate-200">{{ insight.text }}</p>
          </div>
        </div>
      </section>
    </div>

    <div class="grid gap-6 xl:grid-cols-12">
      <section class="panel xl:col-span-6">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">Types de comptes</p>
            <h3 class="panel-title">Répartition par type</h3>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[760px]">
            <thead>
            <tr class="table-head">
              <th class="table-cell-head text-left">Type</th>
              <th class="table-cell-head text-right">Comptes</th>
              <th class="table-cell-head text-right">Transactions</th>
              <th class="table-cell-head text-right">Revenus</th>
              <th class="table-cell-head text-right">Dépenses</th>
              <th class="table-cell-head text-right">Net</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="row in accountTypeRows" :key="row.type" class="table-row">
              <td class="table-cell">{{ accountTypeLabel(row.type) }}</td>
              <td class="table-cell text-right">{{ row.accountCount }}</td>
              <td class="table-cell text-right">{{ row.transactionCount }}</td>
              <td class="table-cell text-right">{{ formatMoney(row.income) }}</td>
              <td class="table-cell text-right">{{ formatMoney(row.expense) }}</td>
              <td class="table-cell text-right">{{ formatMoney(row.net) }}</td>
            </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel xl:col-span-6">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">Comptes</p>
            <h3 class="panel-title">Performance par compte</h3>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[760px]">
            <thead>
            <tr class="table-head">
              <th class="table-cell-head text-left">Compte</th>
              <th class="table-cell-head text-left">Type</th>
              <th class="table-cell-head text-left">Devise</th>
              <th class="table-cell-head text-right">Tx</th>
              <th class="table-cell-head text-right">Net</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="row in accountRows" :key="row.accountId" class="table-row">
              <td class="table-cell">{{ row.name }}</td>
              <td class="table-cell">{{ accountTypeLabel(row.type) }}</td>
              <td class="table-cell">{{ row.currency }}</td>
              <td class="table-cell text-right">{{ row.transactionCount }}</td>
              <td class="table-cell text-right">{{ formatMoney(row.net, row.currency) }}</td>
            </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <div class="grid gap-6 xl:grid-cols-12">
      <section class="panel xl:col-span-6">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">Catégories</p>
            <h3 class="panel-title">Top catégories</h3>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[680px]">
            <thead>
            <tr class="table-head">
              <th class="table-cell-head text-left">Catégorie</th>
              <th class="table-cell-head text-left">Nature</th>
              <th class="table-cell-head text-right">Tx</th>
              <th class="table-cell-head text-right">Total</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="row in categoryRows.slice(0, 12)" :key="`${row.categoryId}-${row.name}`" class="table-row">
              <td class="table-cell">{{ row.name }}</td>
              <td class="table-cell">{{ row.kind }}</td>
              <td class="table-cell text-right">{{ row.transactionCount }}</td>
              <td class="table-cell text-right">{{ formatMoney(row.total) }}</td>
            </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel xl:col-span-6">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">Devises</p>
            <h3 class="panel-title">Transactions en devise étrangère</h3>
          </div>
        </div>

        <div v-if="foreignCurrencyRows.length" class="overflow-x-auto">
          <table class="w-full min-w-[680px]">
            <thead>
            <tr class="table-head">
              <th class="table-cell-head text-left">Devise</th>
              <th class="table-cell-head text-right">Tx</th>
              <th class="table-cell-head text-right">Total source</th>
              <th class="table-cell-head text-right">Total compta</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="row in foreignCurrencyRows" :key="row.currency" class="table-row">
              <td class="table-cell">{{ row.currency }}</td>
              <td class="table-cell text-right">{{ row.transactionCount }}</td>
              <td class="table-cell text-right">{{ row.sourceTotal.toFixed(2) }} {{ row.currency }}</td>
              <td class="table-cell text-right">{{ formatMoney(row.bookedTotal) }}</td>
            </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="empty-state">
          Aucune transaction multidevise sur cette période.
        </div>
      </section>
    </div>

    <section class="panel xl:col-span-6">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">Habitudes</p>
          <h3 class="panel-title">Dépenses par jour de semaine</h3>
        </div>
      </div>

      <div class="space-y-3 px-6 pb-6">
        <div v-for="row in weekdayRows" :key="row.label">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ row.label }}</span>
            <span class="text-sm font-semibold text-slate-900 dark:text-white">{{ formatMoney(row.total) }}</span>
          </div>
          <div class="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
            <div
                class="h-2 rounded-full bg-violet-500"
                :style="{ width: `${Math.min(100, weekdayRows[0] && Math.max(...weekdayRows.map(item => item.total)) > 0 ? (row.total / Math.max(...weekdayRows.map(item => item.total))) * 100 : 0)}%` }"
            />
          </div>
        </div>
      </div>
    </section>
  </section>
</template>
