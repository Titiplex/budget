<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import FreshnessBadge from './provenance/FreshnessBadge.vue'
import ProvenanceBadge from './provenance/ProvenanceBadge.vue'
import SecurityRecoveryPanel from './SecurityRecoveryPanel.vue'
import type {SupportedLocale} from '../i18n'

const props = defineProps<{
  open: boolean
  currentLocale: SupportedLocale
  currentTheme: 'light' | 'dark'
  defaultTransactionCurrency: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update-default-transaction-currency', value: string): void
  (e: 'update-locale', value: SupportedLocale): void
  (e: 'update-theme', value: 'light' | 'dark'): void
  (e: 'notice', type: 'success' | 'error', text: string): void
}>()

const {t} = useI18n()

function updateCurrency(event: Event) {
  const input = event.target as HTMLInputElement
  input.value = input.value.trim().toUpperCase()
  if (input.reportValidity()) {
    emit('update-default-transaction-currency', input.value)
  }
}
</script>

<template>
  <div
      v-if="open"
      class="dialog-backdrop"
      @click.self="emit('close')"
  >
    <div class="dialog-card max-h-[90vh] overflow-y-auto">
      <h3 class="dialog-title">
        {{ t('settings.title') }}
      </h3>
      <p class="dialog-text">
        {{ t('settings.description') }}
      </p>

      <div class="mt-6 space-y-5">
        <div class="field-block">
          <label for="settings-language" class="field-label">{{ t('common.language') }}</label>
          <select
              id="settings-language"
              :value="props.currentLocale"
              class="field-control"
              @change="emit('update-locale', ($event.target as HTMLSelectElement).value as SupportedLocale)"
          >
            <option value="fr">{{ t('settings.languageFrench') }}</option>
            <option value="en">{{ t('settings.languageEnglish') }}</option>
          </select>
        </div>

        <div class="field-block">
          <label for="settings-theme" class="field-label">{{ t('common.theme') }}</label>
          <select
              id="settings-theme"
              :value="props.currentTheme"
              class="field-control"
              @change="emit('update-theme', ($event.target as HTMLSelectElement).value as 'light' | 'dark')"
          >
            <option value="light">{{ t('settings.themeLight') }}</option>
            <option value="dark">{{ t('settings.themeDark') }}</option>
          </select>
        </div>

        <div class="field-block">
          <label for="default-transaction-currency" class="field-label">{{ t('settings.defaultTransactionCurrency') }}</label>
          <input
              id="default-transaction-currency"
              :value="props.defaultTransactionCurrency"
              type="text"
              required
              pattern="[A-Za-z]{3}"
              maxlength="3"
              class="field-control uppercase"
              aria-describedby="default-transaction-currency-help"
              @change="updateCurrency"
          />
          <p id="default-transaction-currency-help" class="text-xs text-slate-500 dark:text-slate-400">
            {{ t('settings.defaultTransactionCurrencyHelp') }}
          </p>
        </div>

        <details class="panel p-4">
          <summary class="cursor-pointer font-semibold">{{ t('interfaceText.securityRecoveryPanel.securityAndRecovery') }}</summary>
          <SecurityRecoveryPanel class="mt-3" @notice="(type, text) => emit('notice', type, text)" />
        </details>

        <details class="panel p-4">
          <summary class="cursor-pointer font-semibold">{{ t('interfaceText.settingsDialog.sourceAndFreshness') }}</summary>
          <p class="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {{ t('interfaceText.settingsDialog.badgesShowWhereAValueCameFrom') }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <ProvenanceBadge origin="manual" />
            <ProvenanceBadge origin="csvImport" />
            <ProvenanceBadge origin="backupRestore" />
            <ProvenanceBadge origin="calculated" />
            <ProvenanceBadge origin="marketDataProvider" />
            <FreshnessBadge status="fresh" />
            <FreshnessBadge status="stale" />
            <FreshnessBadge status="unknown" />
          </div>
        </details>
      </div>

      <div class="form-actions mt-6">
        <button class="ghost-btn" @click="emit('close')">
          {{ t('common.close') }}
        </button>
      </div>
    </div>
  </div>
</template>