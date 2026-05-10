<script setup lang="ts">
import {useI18n} from 'vue-i18n'

defineProps<{
  open: boolean
  title: string
  subtitle?: string
  lines: string[]
  warnings?: string[]
  blockingErrors?: string[]
  confirmLabel: string
  confirmDisabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm'): void
}>()

const {t} = useI18n()
</script>

<template>
  <div
      v-if="open"
      class="dialog-backdrop"
      @click.self="emit('close')"
  >
    <div class="dialog-card">
      <p class="soft-kicker">
        {{ subtitle || t('common.settings') }}
      </p>
      <h3 class="dialog-title">
        {{ title }}
      </h3>

      <div class="mt-5 space-y-3">
        <div
            v-for="line in lines"
            :key="line"
            class="mini-card"
        >
          <p class="text-sm text-slate-700 dark:text-slate-200">
            {{ line }}
          </p>
        </div>
      </div>

      <div v-if="blockingErrors && blockingErrors.length" class="mt-5 space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-rose-500">
          Erreurs bloquantes
        </p>
        <div
            v-for="error in blockingErrors"
            :key="error"
            class="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200"
        >
          {{ error }}
        </div>
      </div>

      <div v-if="warnings && warnings.length" class="mt-5 space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-500">
          Warnings
        </p>
        <div
            v-for="warning in warnings"
            :key="warning"
            class="inline-warning"
        >
          {{ warning }}
        </div>
      </div>

      <div class="form-actions mt-6">
        <button class="ghost-btn" @click="emit('close')">
          {{ t('common.cancel') }}
        </button>
        <button class="primary-btn disabled:cursor-not-allowed disabled:opacity-50" :disabled="confirmDisabled" @click="emit('confirm')">
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>