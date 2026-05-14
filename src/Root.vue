<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref} from 'vue'

import App from './App.vue'
import GoalsProjectionDashboard from './components/GoalsProjectionDashboard.vue'
import WealthGoalsSummaryCard from './components/WealthGoalsSummaryCard.vue'

const goalsOpen = ref(false)
const wealthGoalsSummaryOpen = ref(false)

function openGoals() {
  wealthGoalsSummaryOpen.value = false
  goalsOpen.value = true
}

function toggleWealthGoalsSummary() {
  wealthGoalsSummaryOpen.value = !wealthGoalsSummaryOpen.value
}

onMounted(() => {
  window.addEventListener('budget:open-goals', openGoals)
})

onBeforeUnmount(() => {
  window.removeEventListener('budget:open-goals', openGoals)
})
</script>

<template>
  <App />

  <div class="fixed right-4 top-[4.75rem] z-30 w-[min(34rem,calc(100vw-2rem))] sm:right-6 lg:right-8">
    <div class="flex flex-wrap justify-end gap-2">
      <button
          type="button"
          class="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/95 px-4 py-2.5 text-sm font-semibold text-slate-100 shadow-xl shadow-slate-950/20 backdrop-blur transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-300"
          :aria-expanded="wealthGoalsSummaryOpen"
          aria-controls="wealth-goals-summary-panel"
          aria-label="Afficher le résumé patrimoine et objectifs"
          @click="toggleWealthGoalsSummary"
      >
        <span class="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-violet-600 text-xs font-bold text-white">NW</span>
        <span class="hidden sm:inline">Résumé patrimoine</span>
        <span class="sm:hidden">Résumé</span>
      </button>

      <button
          type="button"
          class="inline-flex items-center gap-2 rounded-2xl border border-violet-500/80 bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xl shadow-violet-950/25 transition hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-300"
          aria-label="Ouvrir les objectifs financiers"
          @click="openGoals"
      >
        <span class="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 text-xs font-bold">GO</span>
        Objectifs
      </button>
    </div>

    <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-y-2 opacity-0 scale-95"
        enter-to-class="translate-y-0 opacity-100 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="translate-y-0 opacity-100 scale-100"
        leave-to-class="translate-y-2 opacity-0 scale-95"
    >
      <div
          v-if="wealthGoalsSummaryOpen"
          id="wealth-goals-summary-panel"
          class="ml-auto mt-3 max-h-[calc(100vh-8rem)] w-full max-w-[420px] origin-top-right overflow-y-auto rounded-[2rem] border border-slate-800 bg-slate-950/95 p-3 shadow-2xl shadow-slate-950/40 backdrop-blur"
      >
        <button
            type="button"
            class="absolute right-5 top-5 z-10 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
            aria-label="Masquer le résumé patrimoine et objectifs"
            @click="wealthGoalsSummaryOpen = false"
        >
          ✕
        </button>
        <WealthGoalsSummaryCard />
      </div>
    </Transition>
  </div>

  <Teleport to="body">
    <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
    >
      <div v-if="goalsOpen" class="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/85 px-4 py-6 backdrop-blur">
        <div class="mx-auto max-w-7xl">
          <div class="mb-4 flex items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-slate-950 px-5 py-4 shadow-2xl">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">Objectifs</p>
              <h2 class="mt-1 text-xl font-semibold text-white">Pilotage des objectifs et projections</h2>
            </div>
            <button
                type="button"
                class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-slate-200 transition hover:bg-slate-800"
                aria-label="Fermer les objectifs"
                @click="goalsOpen = false"
            >
              ✕
            </button>
          </div>

          <GoalsProjectionDashboard />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
