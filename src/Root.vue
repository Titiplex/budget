<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'

import App from './App.vue'
import GoalsProjectionDashboard from './components/GoalsProjectionDashboard.vue'

const {t} = useI18n()
const goalsOpen = ref(false)

function openGoals() {
  goalsOpen.value = true
}

function handleMenuCommand(rawCommand: unknown) {
  if (rawCommand === 'open-goals') {
    openGoals()
  }
}

onMounted(() => {
  window.addEventListener('budget:open-goals', openGoals)
  window.versions.on('app:menu-command', handleMenuCommand)
})

onBeforeUnmount(() => {
  window.removeEventListener('budget:open-goals', openGoals)
})
</script>

<template>
  <App />

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
              <p class="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">{{ t('goals.modalEyebrow') }}</p>
              <h2 class="mt-1 text-xl font-semibold text-white">{{ t('goals.modalTitle') }}</h2>
            </div>
            <button
                type="button"
                class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-slate-200 transition hover:bg-slate-800"
                :aria-label="t('goals.closeAria')"
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
