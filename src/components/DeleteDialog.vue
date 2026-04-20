<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import type {EntityType} from '../types/budget'
import {entityLabel} from '../utils/budgetFormat'

defineProps<{
  open: boolean
  busy: boolean
  type: EntityType
  label: string
  message: string
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
        {{ t('deleteDialog.title') }}
      </p>
      <h3 class="dialog-title">
        {{ t('common.delete') }} {{ entityLabel(type) }}
      </h3>
      <p class="dialog-text">
        <span class="font-semibold text-slate-800 dark:text-slate-100">{{ label }}</span><br>
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