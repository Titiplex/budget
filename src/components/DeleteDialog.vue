<script setup lang="ts">
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
</script>

<template>
  <div
      v-if="open"
      class="dialog-backdrop"
      @click.self="emit('close')"
  >
    <div class="dialog-card">
      <p class="soft-kicker">
        Suppression
      </p>
      <h3 class="dialog-title">
        Supprimer {{ entityLabel(type) }}
      </h3>
      <p class="dialog-text">
        <span class="font-semibold text-slate-800 dark:text-slate-100">{{ label }}</span><br>
        {{ message }}
      </p>

      <div class="form-actions mt-6">
        <button class="ghost-btn" :disabled="busy" @click="emit('close')">
          Annuler
        </button>
        <button class="danger-btn" :disabled="busy" @click="emit('confirm')">
          {{ busy ? 'Suppression…' : 'Confirmer la suppression' }}
        </button>
      </div>
    </div>
  </div>
</template>