<script setup lang="ts">
import {computed, toRefs} from 'vue'
import {useI18n} from 'vue-i18n'
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
import {accountTypeLabel, formatDate, formatMoney, kindLabel} from '../utils/budgetFormat'

const props = defineProps<{
  preset: ReportPreset
  startDate: string
  endDate: string
  summary: ReportSummary
  comparison: ReportComparisonSummary
  accountTypeRows: ReportAccountTypeRow[]
  accountRows: ReportAccountRow[]
  categoryRows: ReportCategoryRow[]
  incomeCategoryRows: ReportCategoryRow[]
  expenseCategoryRows: ReportCategoryRow[]
  foreignCurrencyRows: ReportCurrencyRow[]
  weekdayRows: ReportWeekdayRow[]
  insights: ReportInsight[]
}>()

const {
  preset,
  startDate,
  endDate,
  summary,
  comparison,
  accountTypeRows,
  accountRows,
  categoryRows,
  incomeCategoryRows,
  expenseCategoryRows,
  foreignCurrencyRows,
  weekdayRows,
  insights,
} = toRefs(props)

const emit = defineEmits<{
  (e: 'set-preset', value: ReportPreset): void
  (e: 'update:start-date', value: string): void
  (e: 'update:end-date', value: string): void
  (e: 'export-report'): void
}>()

const {t} = useI18n()

const PIE_COLORS = ['#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899']
const PIE_RADIUS = 54
const PIE_CIRCUMFERENCE = 2 * Math.PI * PIE_RADIUS
const PIE_VISIBLE_SLICE_LIMIT = 6

type CategoryPieSegment = {
  name: string
  total: number
  percent: number
  color: string
  dasharray: string
  dashoffset: string
}

type CategoryPieChart = {
  total: number
  segments: CategoryPieSegment[]
}

function categoryNatureLabel(kind: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'MIXED') {
  if (kind === 'MIXED') {
    return t('reports.mixedNature')
  }

  return kindLabel(kind)
}

function deltaText(value: number, suffix = '') {
  if (value === 0) return t('reports.stable') + suffix
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}${suffix}`
}

function percentText(value: number | null) {
  if (value == null) return t('reports.previousBaseZero')
  if (value === 0) return t('reports.stable')
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function deltaClass(value: number, invert = false) {
  if (value === 0) return 'text-slate-500 dark:text-slate-400'
  const positive = invert ? value < 0 : value > 0
  return positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
}

function buildCategoryPieChart(rows: ReportCategoryRow[]): CategoryPieChart {
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  if (!total) {
    return {total: 0, segments: []}
  }

  const visibleRows = rows.slice(0, PIE_VISIBLE_SLICE_LIMIT)
  const hiddenRows = rows.slice(PIE_VISIBLE_SLICE_LIMIT)
  const combinedRows = [...visibleRows]

  if (hiddenRows.length) {
    combinedRows.push({
      categoryId: -1,
      name: t('reports.otherCategories'),
      transactionCount: hiddenRows.reduce((sum, row) => sum + row.transactionCount, 0),
      total: hiddenRows.reduce((sum, row) => sum + row.total, 0),
      kind: visibleRows[0]?.kind || 'EXPENSE',
    })
  }

  let offsetRatio = 0
  const segments = combinedRows.map((row, index) => {
    const percent = row.total / total
    const dashLength = percent * PIE_CIRCUMFERENCE
    const segment: CategoryPieSegment = {
      name: row.name,
      total: row.total,
      percent: percent * 100,
      color: PIE_COLORS[index % PIE_COLORS.length],
      dasharray: `${dashLength.toFixed(3)} ${(PIE_CIRCUMFERENCE - dashLength).toFixed(3)}`,
      dashoffset: `${(-offsetRatio * PIE_CIRCUMFERENCE).toFixed(3)}`,
    }
    offsetRatio += percent
    return segment
  })

  return {total, segments}
}

const expenseCategoryPieChart = computed(() => buildCategoryPieChart(props.expenseCategoryRows))
const incomeCategoryPieChart = computed(() => buildCategoryPieChart(props.incomeCategoryRows))

function pieChartAriaLabel(kindLabel: string, total: number) {
  return t('reports.categoryPieAria', {
    kind: kindLabel,
    amount: formatMoney(total),
  })
}
</script>

<template>
  <section class="space-y-6">
    <section class="panel p-6">
      <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p class="soft-kicker">{{ t('reports.sectionName') }}</p>
          <h2 class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {{ t('reports.title') }}
          </h2>
          <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {{ t('reports.description') }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <button class="ghost-btn" :class="{ 'tab-btn-active': preset === 'THIS_MONTH' }"
                  @click="emit('set-preset', 'THIS_MONTH')">
            {{ t('reports.presets.thisMonth') }}
          </button>
          <button class="ghost-btn" :class="{ 'tab-btn-active': preset === 'LAST_30_DAYS' }"
                  @click="emit('set-preset', 'LAST_30_DAYS')">
            {{ t('reports.presets.last30Days') }}
          </button>
          <button class="ghost-btn" :class="{ 'tab-btn-active': preset === 'THIS_YEAR' }"
                  @click="emit('set-preset', 'THIS_YEAR')">
            {{ t('reports.presets.thisYear') }}
          </button>
          <button class="ghost-btn" :class="{ 'tab-btn-active': preset === 'ALL' }" @click="emit('set-preset', 'ALL')">
            {{ t('reports.presets.all') }}
          </button>
          <button class="primary-btn" @click="emit('export-report')">
            {{ t('reports.exportReport') }}
          </button>
        </div>
      </div>

      <div class="mt-5 grid gap-4 md:grid-cols-2">
        <div class="field-block">
          <label class="field-label">{{ t('forms.fields.startDate') }}</label>
          <input
              :value="startDate"
              type="date"
              class="field-control"
              @input="emit('update:start-date', ($event.target as HTMLInputElement).value)"
          >
        </div>

        <div class="field-block">
          <label class="field-label">{{ t('forms.fields.endDate') }}</label>
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
        {{ t('reports.autoComparison') }}
        <strong>{{ formatDate(comparison.previousStartDate) }}</strong>
        →
        <strong>{{ formatDate(comparison.previousEndDate) }}</strong>
      </div>
    </section>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <div class="stat-card">
        <p class="stat-label">{{ t('reports.summary.transactions') }}</p>
        <p class="stat-value">{{ summary.transactionCount }}</p>
        <p class="stat-hint" :class="deltaClass(comparison.transactionCount.delta)">
          {{ percentText(comparison.transactionCount.deltaPercent) }} {{ t('reports.vsPrevious') }}
        </p>
      </div>
      <div class="stat-card">
        <p class="stat-label">{{ t('reports.summary.income') }}</p>
        <p class="stat-value">{{ formatMoney(summary.income) }}</p>
        <p class="stat-hint" :class="deltaClass(comparison.income.delta)">
          {{ percentText(comparison.income.deltaPercent) }}
        </p>
      </div>
      <div class="stat-card">
        <p class="stat-label">{{ t('reports.summary.expense') }}</p>
        <p class="stat-value">{{ formatMoney(summary.expense) }}</p>
        <p class="stat-hint" :class="deltaClass(comparison.expense.delta, true)">
          {{ percentText(comparison.expense.deltaPercent) }}
        </p>
      </div>
      <div class="stat-card">
        <p class="stat-label">{{ t('reports.summary.netSavings') }}</p>
        <p class="stat-value">{{ formatMoney(summary.net) }}</p>
        <p class="stat-hint" :class="deltaClass(comparison.net.delta)">
          {{ deltaText(comparison.savingsRate.delta, ` ${t('reports.pointsSuffix')}`) }}
        </p>
      </div>
      <div class="stat-card">
        <p class="stat-label">{{ t('reports.summary.internalTransfers') }}</p>
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
            <p class="panel-eyebrow">{{ t('reports.comparisons') }}</p>
            <h3 class="panel-title">{{ t('reports.periodVsPrevious') }}</h3>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[760px]">
            <thead>
            <tr class="table-head">
              <th class="table-cell-head text-left">{{ t('reports.metric') }}</th>
              <th class="table-cell-head text-right">{{ t('reports.current') }}</th>
              <th class="table-cell-head text-right">{{ t('reports.previous') }}</th>
              <th class="table-cell-head text-right">{{ t('reports.delta') }}</th>
              <th class="table-cell-head text-right">{{ t('reports.deltaPercent') }}</th>
            </tr>
            </thead>
            <tbody>
            <tr class="table-row">
              <td class="table-cell">{{ t('reports.summary.income') }}</td>
              <td class="table-cell text-right">{{ formatMoney(comparison.income.current) }}</td>
              <td class="table-cell text-right">{{ formatMoney(comparison.income.previous) }}</td>
              <td class="table-cell text-right" :class="deltaClass(comparison.income.delta)">
                {{ formatMoney(comparison.income.delta) }}
              </td>
              <td class="table-cell text-right">{{ percentText(comparison.income.deltaPercent) }}</td>
            </tr>
            <tr class="table-row">
              <td class="table-cell">{{ t('reports.summary.expense') }}</td>
              <td class="table-cell text-right">{{ formatMoney(comparison.expense.current) }}</td>
              <td class="table-cell text-right">{{ formatMoney(comparison.expense.previous) }}</td>
              <td class="table-cell text-right" :class="deltaClass(comparison.expense.delta, true)">
                {{ formatMoney(comparison.expense.delta) }}
              </td>
              <td class="table-cell text-right">{{ percentText(comparison.expense.deltaPercent) }}</td>
            </tr>
            <tr class="table-row">
              <td class="table-cell">{{ t('reports.summary.net') }}</td>
              <td class="table-cell text-right">{{ formatMoney(comparison.net.current) }}</td>
              <td class="table-cell text-right">{{ formatMoney(comparison.net.previous) }}</td>
              <td class="table-cell text-right" :class="deltaClass(comparison.net.delta)">
                {{ formatMoney(comparison.net.delta) }}
              </td>
              <td class="table-cell text-right">{{ percentText(comparison.net.deltaPercent) }}</td>
            </tr>
            <tr class="table-row">
              <td class="table-cell">{{ t('reports.summary.savingsRate') }}</td>
              <td class="table-cell text-right">{{ comparison.savingsRate.current.toFixed(1) }}%</td>
              <td class="table-cell text-right">{{ comparison.savingsRate.previous.toFixed(1) }}%</td>
              <td class="table-cell text-right" :class="deltaClass(comparison.savingsRate.delta)">
                {{ deltaText(comparison.savingsRate.delta, ` ${t('reports.pointsSuffix')}`) }}
              </td>
              <td class="table-cell text-right">{{ percentText(comparison.savingsRate.deltaPercent) }}</td>
            </tr>
            <tr class="table-row">
              <td class="table-cell">{{ t('reports.summary.internalTransfers') }}</td>
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
            <p class="panel-eyebrow">{{ t('reports.insights') }}</p>
            <h3 class="panel-title">{{ t('reports.highlights') }}</h3>
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
            <p class="panel-eyebrow">{{ t('reports.accountTypes') }}</p>
            <h3 class="panel-title">{{ t('reports.breakdownByAccountType') }}</h3>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[760px]">
            <thead>
            <tr class="table-head">
              <th class="table-cell-head text-left">{{ t('forms.fields.type') }}</th>
              <th class="table-cell-head text-right">{{ t('reports.accounts') }}</th>
              <th class="table-cell-head text-right">{{ t('reports.summary.transactions') }}</th>
              <th class="table-cell-head text-right">{{ t('reports.summary.income') }}</th>
              <th class="table-cell-head text-right">{{ t('reports.summary.expense') }}</th>
              <th class="table-cell-head text-right">{{ t('reports.summary.net') }}</th>
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
            <p class="panel-eyebrow">{{ t('reports.accountsSection') }}</p>
            <h3 class="panel-title">{{ t('reports.accountPerformance') }}</h3>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[760px]">
            <thead>
            <tr class="table-head">
              <th class="table-cell-head text-left">{{ t('forms.fields.account') }}</th>
              <th class="table-cell-head text-left">{{ t('forms.fields.type') }}</th>
              <th class="table-cell-head text-left">{{ t('forms.fields.currency') }}</th>
              <th class="table-cell-head text-right">{{ t('reports.txShort') }}</th>
              <th class="table-cell-head text-right">{{ t('reports.summary.net') }}</th>
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
            <p class="panel-eyebrow">{{ t('reports.categories') }}</p>
            <h3 class="panel-title">{{ t('reports.topCategories') }}</h3>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[680px]">
            <thead>
            <tr class="table-head">
              <th class="table-cell-head text-left">{{ t('forms.fields.category') }}</th>
              <th class="table-cell-head text-left">{{ t('reports.nature') }}</th>
              <th class="table-cell-head text-right">{{ t('reports.txShort') }}</th>
              <th class="table-cell-head text-right">{{ t('reports.total') }}</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="row in categoryRows.slice(0, 12)" :key="`${row.categoryId}-${row.name}`" class="table-row">
              <td class="table-cell">{{ row.name }}</td>
              <td class="table-cell">{{ categoryNatureLabel(row.kind) }}</td>
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
            <p class="panel-eyebrow">{{ t('reports.currencies') }}</p>
            <h3 class="panel-title">{{ t('reports.foreignCurrencyTransactions') }}</h3>
          </div>
        </div>

        <div v-if="foreignCurrencyRows.length" class="overflow-x-auto">
          <table class="w-full min-w-[680px]">
            <thead>
            <tr class="table-head">
              <th class="table-cell-head text-left">{{ t('forms.fields.currency') }}</th>
              <th class="table-cell-head text-right">{{ t('reports.txShort') }}</th>
              <th class="table-cell-head text-right">{{ t('reports.sourceTotal') }}</th>
              <th class="table-cell-head text-right">{{ t('reports.bookedTotal') }}</th>
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
          {{ t('reports.noForeignCurrencyTransactions') }}
        </div>
      </section>
    </div>

    <div class="grid gap-6 xl:grid-cols-12">
      <section class="panel xl:col-span-6">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">{{ t('reports.categoryDistribution') }}</p>
            <h3 class="panel-title">{{ t('reports.expenseByCategory') }}</h3>
            <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">{{ t('reports.expenseCategoryChartDescription') }}</p>
          </div>
        </div>

        <div v-if="expenseCategoryPieChart.segments.length" class="grid gap-6 px-6 pb-6 lg:grid-cols-[200px_1fr] lg:items-center">
          <div class="mx-auto flex w-full max-w-[200px] items-center justify-center">
            <svg viewBox="0 0 160 160" class="h-40 w-40" role="img" :aria-label="pieChartAriaLabel(t('reports.summary.expense'), expenseCategoryPieChart.total)">
              <circle cx="80" cy="80" :r="PIE_RADIUS" fill="none" stroke="rgba(148, 163, 184, 0.16)" stroke-width="28" />
              <circle
                  v-for="segment in expenseCategoryPieChart.segments"
                  :key="`expense-${segment.name}`"
                  cx="80"
                  cy="80"
                  :r="PIE_RADIUS"
                  fill="none"
                  :stroke="segment.color"
                  stroke-width="28"
                  :stroke-dasharray="segment.dasharray"
                  :stroke-dashoffset="segment.dashoffset"
                  transform="rotate(-90 80 80)"
              />
              <text x="80" y="74" text-anchor="middle" class="fill-slate-400 text-[10px] font-semibold uppercase tracking-[0.24em]">{{ t('reports.chartTotal') }}</text>
              <text x="80" y="92" text-anchor="middle" class="fill-slate-900 text-[12px] font-bold dark:fill-white">{{ formatMoney(expenseCategoryPieChart.total) }}</text>
            </svg>
          </div>

          <div class="space-y-3">
            <div
                v-for="segment in expenseCategoryPieChart.segments"
                :key="`expense-legend-${segment.name}`"
                class="mini-card flex items-center justify-between gap-4"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-3">
                  <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: segment.color }" />
                  <p class="truncate text-sm font-semibold text-slate-900 dark:text-white">{{ segment.name }}</p>
                </div>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ segment.percent.toFixed(1) }}% {{ t('reports.shareOfTotal') }}</p>
              </div>
              <p class="text-sm font-semibold text-slate-900 dark:text-white">{{ formatMoney(segment.total) }}</p>
            </div>
          </div>
        </div>

        <div v-else class="empty-state">
          {{ t('reports.noExpenseCategoryData') }}
        </div>
      </section>

      <section class="panel xl:col-span-6">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">{{ t('reports.categoryDistribution') }}</p>
            <h3 class="panel-title">{{ t('reports.incomeByCategory') }}</h3>
            <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">{{ t('reports.incomeCategoryChartDescription') }}</p>
          </div>
        </div>

        <div v-if="incomeCategoryPieChart.segments.length" class="grid gap-6 px-6 pb-6 lg:grid-cols-[200px_1fr] lg:items-center">
          <div class="mx-auto flex w-full max-w-[200px] items-center justify-center">
            <svg viewBox="0 0 160 160" class="h-40 w-40" role="img" :aria-label="pieChartAriaLabel(t('reports.summary.income'), incomeCategoryPieChart.total)">
              <circle cx="80" cy="80" :r="PIE_RADIUS" fill="none" stroke="rgba(148, 163, 184, 0.16)" stroke-width="28" />
              <circle
                  v-for="segment in incomeCategoryPieChart.segments"
                  :key="`income-${segment.name}`"
                  cx="80"
                  cy="80"
                  :r="PIE_RADIUS"
                  fill="none"
                  :stroke="segment.color"
                  stroke-width="28"
                  :stroke-dasharray="segment.dasharray"
                  :stroke-dashoffset="segment.dashoffset"
                  transform="rotate(-90 80 80)"
              />
              <text x="80" y="74" text-anchor="middle" class="fill-slate-400 text-[10px] font-semibold uppercase tracking-[0.24em]">{{ t('reports.chartTotal') }}</text>
              <text x="80" y="92" text-anchor="middle" class="fill-slate-900 text-[12px] font-bold dark:fill-white">{{ formatMoney(incomeCategoryPieChart.total) }}</text>
            </svg>
          </div>

          <div class="space-y-3">
            <div
                v-for="segment in incomeCategoryPieChart.segments"
                :key="`income-legend-${segment.name}`"
                class="mini-card flex items-center justify-between gap-4"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-3">
                  <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: segment.color }" />
                  <p class="truncate text-sm font-semibold text-slate-900 dark:text-white">{{ segment.name }}</p>
                </div>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ segment.percent.toFixed(1) }}% {{ t('reports.shareOfTotal') }}</p>
              </div>
              <p class="text-sm font-semibold text-slate-900 dark:text-white">{{ formatMoney(segment.total) }}</p>
            </div>
          </div>
        </div>

        <div v-else class="empty-state">
          {{ t('reports.noIncomeCategoryData') }}
        </div>
      </section>
    </div>

    <section class="panel xl:col-span-6">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">{{ t('reports.habits') }}</p>
          <h3 class="panel-title">{{ t('reports.expenseByWeekday') }}</h3>
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