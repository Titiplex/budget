<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import type {EntityType} from '../types/budget'
import {entityCollectionLabel, formatMoney} from '../utils/budgetFormat'

defineProps<{
  loading: boolean
  summaryCurrency: string
  netFlow: number
  totalIncome: number
  totalExpense: number
  transactionCount: number
  accountCount: number
  categoryCount: number
  currentCsvEntity: EntityType
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'create-transaction'): void
  (e: 'create-account'): void
  (e: 'create-category'): void
}>()

const {t} = useI18n()
</script>

<template>
  <section class="panel mb-6 overflow-hidden p-6">
    <div class="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
      <div class="max-w-3xl">
        <p class="soft-kicker">
          {{ t('settings.title') }} + i18n
        </p>
        <h2 class="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          {{ t('toolbar.title') }}
        </h2>
        <p class="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {{ t('toolbar.description') }}
          <span class="font-semibold text-slate-800 dark:text-slate-100">
            {{ entityCollectionLabel(currentCsvEntity) }}
          </span>.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button class="ghost-btn" @click="emit('refresh')">
          {{ loading ? t('common.loading') : t('common.refresh') }}
        </button>
      </div>
    </div>

    <div class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div class="stat-card">
        <p class="stat-label">{{ t('analytics.netFlow') }}</p>
        <p class="stat-value">
          {{ formatMoney(netFlow, summaryCurrency) }}
        </p>
        <p class="stat-hint">
          {{ t('analytics.overviewHint') }}
        </p>
      </div>

      <div class="stat-card">
        <p class="stat-label">{{ t('analytics.income') }}</p>
        <p class="stat-value">
          {{ formatMoney(totalIncome, summaryCurrency) }}
        </p>
        <p class="stat-hint">
          {{ t('analytics.incomeHint') }}
        </p>
      </div>

      <div class="stat-card">
        <p class="stat-label">{{ t('analytics.expense') }}</p>
        <p class="stat-value">
          {{ formatMoney(totalExpense, summaryCurrency) }}
        </p>
        <p class="stat-hint">
          {{ t('analytics.expenseHint') }}
        </p>
      </div>

      <div class="stat-card">
        <p class="stat-label">{{ t('analytics.volumes') }}</p>
        <p class="stat-value text-xl">
          {{ transactionCount }} tx · {{ accountCount }} cpt · {{ categoryCount }} cat
        </p>
        <p class="stat-hint">
          {{ t('analytics.densityHint') }}
        </p>
      </div>
    </div>

    <div class="mt-6 flex flex-wrap items-center gap-2">
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
</template>