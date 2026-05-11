<script setup lang="ts">
import type {DataOrigin, DataProvenance} from '../../types/provenance'
import {ORIGIN_LABELS, originTone, provenanceTooltip} from './provenanceDisplay'

const props = withDefaults(defineProps<{
  provenance?: DataProvenance | null
  origin?: DataOrigin | null
  compact?: boolean
}>(), {
  provenance: null,
  origin: null,
  compact: false,
})

function resolvedOrigin() {
  return props.provenance?.origin || props.origin || 'manual'
}
</script>

<template>
  <span
      class="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-5 ring-1 ring-inset ring-transparent"
      :class="originTone(resolvedOrigin())"
      :title="provenanceTooltip(props.provenance)"
  >
    {{ props.compact ? ORIGIN_LABELS[resolvedOrigin()].slice(0, 4) : ORIGIN_LABELS[resolvedOrigin()] }}
  </span>
</template>
