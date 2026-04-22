<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {EntityType} from '../types/budget'
import {entityLabel} from '../utils/budgetFormat'

const props = defineProps<{
  open: boolean
  busy: boolean
  type: EntityType
  label: string
  heading?: string
  message: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm'): void
}>()

const {t} = useI18n()

const resolvedHeading = computed(() => {
  if (props.heading?.trim()) return props.heading
  return `${t('common.delete')} ${entityLabel(props.type)}`
})

const toneClass = computed(() => {
  if (props.type === 'transaction') {
    return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300'
  }

  return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300'
})
</script>

<template>
  <div
      v-if="open"
      class="dialog-backdrop"
      @click.self="emit('close')"
  >
    <div class="dialog-card">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="soft-kicker">
            {{ t('deleteDialog.title') }}
          </p>
          <h3 class="dialog-title mt-2">
            {{ resolvedHeading }}
          </h3>
        </div>

        <span class="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold"
              :class="toneClass">
          {{ type === 'transaction' ? 'Action sensible' : 'Suppression définitive' }}
        </span>
      </div>

      <div
          class="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
        <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
          Élément concerné
        </p>
        <p class="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          {{ label }}
        </p>
      </div>

      <p class="dialog-text mt-4">
        {{ message }}
      </p>

      <div class="form-actions mt-6">
        <button class="ghost-btn" :disabled="busy" @click="emit('close')">
          {{ t('common.cancel') }}
        </button>
        <button class="danger-btn" :disabled="busy" @click="emit('confirm')">
          {{ busy ? t('common.loading') : t('deleteDialog.confirm') }}
        </button>
      </div>
    </div>
  </div>
</template>