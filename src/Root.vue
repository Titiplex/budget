<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref} from 'vue'

import App from './App.vue'
import GoalsProjectionDashboard from './components/GoalsProjectionDashboard.vue'
import WealthGoalsSummaryCard from './components/WealthGoalsSummaryCard.vue'

const goalsOpen = ref(false)
const wealthGoalsSummaryOpen = ref(false)

function openGoals() {
  goalsOpen.value = true
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

  <div class="fixed bottom-5 left-5 z-40 hidden w-[min(420px,calc(100vw-2.5rem))] lg:block">
    <button
        v-if="!wealthGoalsSummaryOpen"
        type="button"
        class="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/95 px-4 py-3 text-sm font-semibold text-slate-100 shadow-xl shadow-slate-950/30 backdrop-blur transition hover:bg-slate-900"
        aria-label="Afficher le résumé patrimoine et objectifs"
        @click="wealthGoalsSummaryOpen = true"
    >
      <span class="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-violet-600 text-xs font-bold text-white">NW</span>
      Résumé objectifs patrimoine
    </button>

    <div v-else class="relative max-h-[78vh] overflow-y-auto rounded-[2rem] border border-slate-800 bg-slate-950/95 p-3 shadow-2xl shadow-slate-950/40 backdrop-blur">
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
  </div>

  <button
      type="button"
      class="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-2xl border border-violet-500/80 bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-violet-950/30 transition hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-300"
      aria-label="Ouvrir les objectifs financiers"
      @click="openGoals"
  >
    <span class="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 text-xs font-bold">GO</span>
    Objectifs
  </button>

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
