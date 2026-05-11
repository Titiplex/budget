<script setup lang="ts">
import type {DataFreshnessStatus, DataProvenance} from '../../types/provenance'
import {FRESHNESS_LABELS, ORIGIN_LABELS, formatProvenanceDate, freshnessReason} from './provenanceDisplay'

const props = defineProps<{
  provenance?: DataProvenance | null
  freshnessStatus?: DataFreshnessStatus | null
}>()
</script>

<template>
  <details class="group relative inline-block text-left">
    <summary
        class="inline-flex cursor-help list-none items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700"
        aria-label="Afficher la provenance"
    >
      i
    </summary>
    <div
        class="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 shadow-xl dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
    >
      <p class="font-bold text-slate-900 dark:text-white">Provenance</p>
      <dl class="mt-2 space-y-1">
        <div class="flex justify-between gap-3">
          <dt class="text-slate-400">Origine</dt>
          <dd class="text-right font-medium">{{ props.provenance ? ORIGIN_LABELS[props.provenance.origin] : 'Non disponible' }}</dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-slate-400">Source</dt>
          <dd class="text-right font-medium">{{ props.provenance?.sourceLabel || props.provenance?.provider || '—' }}</dd>
        </div>
        <div v-if="props.provenance?.importBatchId != null" class="flex justify-between gap-3">
          <dt class="text-slate-400">Batch</dt>
          <dd class="text-right font-medium">{{ props.provenance.importBatchId }}</dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-slate-400">Observé</dt>
          <dd class="text-right font-medium">{{ formatProvenanceDate(props.provenance?.observedAt) }}</dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-slate-400">Mis à jour</dt>
          <dd class="text-right font-medium">{{ formatProvenanceDate(props.provenance?.updatedAt) }}</dd>
        </div>
        <div v-if="props.freshnessStatus" class="flex justify-between gap-3">
          <dt class="text-slate-400">Fraîcheur</dt>
          <dd class="text-right font-medium">{{ FRESHNESS_LABELS[props.freshnessStatus] }}</dd>
        </div>
      </dl>
      <p v-if="props.freshnessStatus" class="mt-2 rounded-xl bg-slate-50 p-2 text-[11px] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
        {{ freshnessReason(props.freshnessStatus, props.provenance) }}
      </p>
    </div>
  </details>
</template>

<style scoped>
summary::-webkit-details-marker {
  display: none;
}
</style>
