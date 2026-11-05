<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatMoney } from '../utils/budgetFormat'

withDefaults(
  defineProps<{
    loading: boolean
    summaryCurrency: string
    netFlow: number
    totalIncome: number
    totalExpense: number
    transactionCount: number
    accountCount: number
    categoryCount: number
    compact?: boolean
  }>(),
  {
    compact: false,
  },
)

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'create-transaction'): void
  (e: 'create-account'): void
  (e: 'create-category'): void
}>()

const { t } = useI18n()
</script>

<template>
  <section
    class="panel overflow-hidden transition-colors duration-150 ease-out [contain:layout_paint]"
    :class="
      compact
        ? 'p-4 shadow-2xl shadow-slate-950/20 dark:bg-slate-900/95'
        : 'mb-6 p-6'
    "
  >
    <div
      class="flex flex-col"
      :class="
        compact ? 'gap-4' : 'gap-6 xl:flex-row xl:items-end xl:justify-between'
      "
    >
      <div :class="compact ? 'max-w-none' : 'max-w-3xl'">
        <h2
          class="mt-2 font-bold tracking-tight text-slate-900 dark:text-white"
          :class="compact ? 'text-xl' : 'text-3xl'"
        >
          {{ t('toolbar.title') }}
        </h2>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button class="ghost-btn" @click="emit('refresh')">
          {{ loading ? t('common.loading') : t('common.refresh') }}
        </button>
      </div>
    </div>

    <div
      class="grid grid-cols-1"
      :class="
        compact
          ? 'mt-4 gap-3 sm:grid-cols-2'
          : 'mt-6 gap-4 md:grid-cols-2 xl:grid-cols-4'
      "
    >
      <div class="stat-card" :class="compact ? '!rounded-2xl !p-4' : ''">
        <p class="stat-label">{{ t('analytics.netFlow') }}</p>
        <p class="stat-value" :class="compact ? '!text-2xl' : ''">
          {{ formatMoney(netFlow, summaryCurrency) }}
        </p>
      </div>

      <div class="stat-card" :class="compact ? '!rounded-2xl !p-4' : ''">
        <p class="stat-label">{{ t('analytics.income') }}</p>
        <p class="stat-value" :class="compact ? '!text-2xl' : ''">
          {{ formatMoney(totalIncome, summaryCurrency) }}
        </p>
      </div>

      <div class="stat-card" :class="compact ? '!rounded-2xl !p-4' : ''">
        <p class="stat-label">{{ t('analytics.expense') }}</p>
        <p class="stat-value" :class="compact ? '!text-2xl' : ''">
          {{ formatMoney(totalExpense, summaryCurrency) }}
        </p>
      </div>

      <div class="stat-card" :class="compact ? '!rounded-2xl !p-4' : ''">
        <p class="stat-label">{{ t('analytics.volumes') }}</p>
        <p class="stat-value whitespace-normal !text-base">
          {{
            t('appShell.countsShort', {
              transactions: transactionCount,
              accounts: accountCount,
              categories: categoryCount,
            })
          }}
        </p>
      </div>
    </div>

    <div
      class="grid items-center"
      :class="
        compact ? 'mt-4 gap-2 sm:grid-cols-3' : 'mt-6 gap-2 sm:grid-cols-3'
      "
    >
      <button
        class="quick-panel-action"
        :class="compact ? '!rounded-2xl !py-2.5' : ''"
        @click="emit('create-transaction')"
      >
        {{ t('forms.titles.createTransaction') }}
      </button>
      <button
        class="quick-panel-action"
        :class="compact ? '!rounded-2xl !py-2.5' : ''"
        @click="emit('create-account')"
      >
        {{ t('forms.titles.createAccount') }}
      </button>
      <button
        class="quick-panel-action"
        :class="compact ? '!rounded-2xl !py-2.5' : ''"
        @click="emit('create-category')"
      >
        {{ t('forms.titles.createCategory') }}
      </button>
    </div>
  </section>
</template>
