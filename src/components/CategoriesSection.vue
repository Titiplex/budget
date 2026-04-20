<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import type {CategorySummary} from '../types/budget'
import {categoryDotStyle, formatMoney, kindLabel} from '../utils/budgetFormat'

defineProps<{
  categorySummaries: CategorySummary[]
  summaryCurrency: string
}>()

const emit = defineEmits<{
  (e: 'create-category'): void
  (e: 'edit-category', category: CategorySummary): void
  (e: 'delete-category', category: CategorySummary): void
}>()

const {t} = useI18n()
</script>

<template>
  <section class="space-y-6">
    <div class="flex items-center justify-end">
      <button class="primary-btn" @click="emit('create-category')">
        {{ t('categories.addCategory') }}
      </button>
    </div>

    <div v-if="categorySummaries.length" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <article
          v-for="category in categorySummaries"
          :key="category.id"
          class="panel p-6"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <span class="h-3 w-3 rounded-full" :style="categoryDotStyle(category.color)"/>
            <div>
              <p class="text-sm font-semibold text-slate-900 dark:text-white">
                {{ category.name }}
              </p>
              <p class="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                {{ kindLabel(category.kind) }}
              </p>
            </div>
          </div>

          <div class="card-toolbar">
            <button class="mini-action-btn" @click="emit('edit-category', category)">
              {{ t('common.update') }}
            </button>
            <button class="mini-danger-btn" @click="emit('delete-category', category)">
              {{ t('common.delete') }}
            </button>
          </div>
        </div>

        <p class="mt-4 text-sm text-slate-500 dark:text-slate-400">
          {{ category.description || t('categories.noDescription') }}
        </p>

        <div
            class="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="mini-label">{{ t('categories.volume') }}</p>
              <p class="mini-value mt-1">
                {{ formatMoney(category.total, summaryCurrency) }}
              </p>
            </div>

            <span class="soft-badge">
              {{ category.transactionCount }} tx
            </span>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="panel empty-state">
      {{ t('categories.empty') }}
    </div>
  </section>
</template>