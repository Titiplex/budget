<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import type {SupportedLocale} from '../i18n'

const props = defineProps<{
  open: boolean
  currentLocale: SupportedLocale
  currentTheme: 'light' | 'dark'
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update-locale', value: SupportedLocale): void
  (e: 'update-theme', value: 'light' | 'dark'): void
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
        {{ t('settings.subtitle') }}
      </p>
      <h3 class="dialog-title">
        {{ t('settings.title') }}
      </h3>
      <p class="dialog-text">
        {{ t('settings.description') }}
      </p>

      <div class="mt-6 space-y-5">
        <div class="field-block">
          <label class="field-label">{{ t('common.language') }}</label>
          <select
              :value="props.currentLocale"
              class="field-control"
              @change="emit('update-locale', ($event.target as HTMLSelectElement).value as SupportedLocale)"
          >
            <option value="fr">{{ t('settings.languageFrench') }}</option>
            <option value="en">{{ t('settings.languageEnglish') }}</option>
          </select>
        </div>

        <div class="field-block">
          <label class="field-label">{{ t('common.theme') }}</label>
          <select
              :value="props.currentTheme"
              class="field-control"
              @change="emit('update-theme', ($event.target as HTMLSelectElement).value as 'light' | 'dark')"
          >
            <option value="light">{{ t('settings.themeLight') }}</option>
            <option value="dark">{{ t('settings.themeDark') }}</option>
          </select>
        </div>
      </div>

      <div class="form-actions mt-6">
        <button class="ghost-btn" @click="emit('close')">
          {{ t('common.close') }}
        </button>
      </div>
    </div>
  </div>
</template>