<script setup lang="ts">
import type {DataFreshnessStatus, DataProvenance} from '../../types/provenance'
import {FRESHNESS_LABELS, freshnessReason, freshnessTone} from './provenanceDisplay'

const props = withDefaults(defineProps<{
  status: DataFreshnessStatus
  provenance?: DataProvenance | null
  compact?: boolean
}>(), {
  compact: false,
  provenance: null,
})
</script>

<template>
  <span
      class="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-5 ring-1 ring-inset ring-transparent"
      :class="freshnessTone(props.status)"
      :title="freshnessReason(props.status, props.provenance)"
  >
    <span class="mr-1 h-1.5 w-1.5 rounded-full bg-current opacity-70" />
    {{ props.compact ? FRESHNESS_LABELS[props.status].slice(0, 3) : FRESHNESS_LABELS[props.status] }}
  </span>
</template>
