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
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update-locale', value: SupportedLocale): void
  (e: 'update-theme', value: 'light' | 'dark'): void
  (e: 'notice', type: 'success' | 'error', text: string): void
}>()

const {t} = useI18n()
</script>

<template>
  <div
      v-if="open"
      class="dialog-backdrop"
      @click.self="emit('close')"
  >
    <div class="dialog-card max-h-[90vh] overflow-y-auto">
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

        <SecurityRecoveryPanel @notice="(type, text) => emit('notice', type, text)" />

        <section class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Confiance des données
          </p>
          <h4 class="mt-1 text-sm font-bold text-slate-900 dark:text-white">
            Provenance et fraîcheur
          </h4>
          <p class="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Les badges indiquent si une donnée vient d’une saisie manuelle, d’un import, d’un restore, d’un calcul ou d’un provider externe. Les tooltips affichent la source, la date observée et la raison d’un statut obsolète sans exposer de secrets.
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
        </section>
      </div>

      <div class="form-actions mt-6">
        <button class="ghost-btn" @click="emit('close')">
          {{ t('common.close') }}
        </button>
      </div>
    </div>
  </div>
</template>