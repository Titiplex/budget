<script setup lang="ts">
import type {
  ReportAccountRow,
  ReportAccountTypeRow,
  ReportCategoryRow,
  ReportCurrencyRow,
  ReportInsight,
  ReportPreset,
  ReportSummary,
  ReportWeekdayRow,
} from '../types/budget'
import {accountTypeLabel, formatMoney} from '../utils/budgetFormat'

defineProps<{
  preset: ReportPreset
  startDate: string
  endDate: string
  summary: ReportSummary
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
            rapport.
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
    </section>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div class="stat-card">
        <p class="stat-label">Transactions</p>
        <p class="stat-value">{{ summary.transactionCount }}</p>
        <p class="stat-hint">Volume total sur la période</p>
      </div>
      <div class="stat-card">
        <p class="stat-label">Revenus</p>
        <p class="stat-value">{{ formatMoney(summary.income) }}</p>
        <p class="stat-hint">Entrées cumulées</p>
      </div>
      <div class="stat-card">
        <p class="stat-label">Dépenses</p>
        <p class="stat-value">{{ formatMoney(summary.expense) }}</p>
        <p class="stat-hint">Sorties cumulées</p>
      </div>
      <div class="stat-card">
        <p class="stat-label">Net / épargne</p>
        <p class="stat-value">{{ formatMoney(summary.net) }}</p>
        <p class="stat-hint">Taux d’épargne : {{ summary.savingsRate.toFixed(1) }}%</p>
      </div>
    </div>

    <div class="grid gap-6 xl:grid-cols-12">
      <section class="panel xl:col-span-7">
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
    </div>

    <div class="grid gap-6 xl:grid-cols-12">
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
    </div>
  </section>
</template>