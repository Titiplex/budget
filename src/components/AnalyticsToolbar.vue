<script setup lang="ts">
import type {EntityType} from '../types/budget'
import {entityCollectionLabel, formatMoney} from '../utils/budgetFormat'

defineProps<{
  loading: boolean
  summaryCurrency: string
  netFlow: number
  totalIncome: number
  totalExpense: number
  transactionCount: number
  accountCount: number
  categoryCount: number
  currentCsvEntity: EntityType
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'create-transaction'): void
  (e: 'create-account'): void
  (e: 'create-category'): void
}>()
</script>

<template>
  <section class="panel mb-6 overflow-hidden p-6">
    <div class="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
      <div class="max-w-3xl">
        <p class="soft-kicker">
          Lots 5 · 6 · 7
        </p>
        <h2 class="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Structure, analytics et sauvegarde complète.
        </h2>
        <p class="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Scope CSV actif :
          <span class="font-semibold text-slate-800 dark:text-slate-100">
            {{ entityCollectionLabel(currentCsvEntity) }}
          </span>.
          Les imports / exports sont maintenant pensés pour passer par le menu natif de l’application.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button class="ghost-btn" @click="emit('refresh')">
          {{ loading ? 'Chargement…' : 'Rafraîchir' }}
        </button>
      </div>
    </div>

    <div class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div class="stat-card">
        <p class="stat-label">Flux net</p>
        <p class="stat-value">
          {{ formatMoney(netFlow, summaryCurrency) }}
        </p>
        <p class="stat-hint">
          Vue d’ensemble du budget.
        </p>
      </div>

      <div class="stat-card">
        <p class="stat-label">Revenus</p>
        <p class="stat-value">
          {{ formatMoney(totalIncome, summaryCurrency) }}
        </p>
        <p class="stat-hint">
          Total des entrées.
        </p>
      </div>

      <div class="stat-card">
        <p class="stat-label">Dépenses</p>
        <p class="stat-value">
          {{ formatMoney(totalExpense, summaryCurrency) }}
        </p>
        <p class="stat-hint">
          Total des sorties.
        </p>
      </div>

      <div class="stat-card">
        <p class="stat-label">Volumes</p>
        <p class="stat-value text-xl">
          {{ transactionCount }} tx · {{ accountCount }} cpt · {{ categoryCount }} cat
        </p>
        <p class="stat-hint">
          Densité actuelle des données.
        </p>
      </div>
    </div>

    <div class="mt-6 flex flex-wrap items-center gap-2">
      <button class="quick-panel-action" @click="emit('create-transaction')">
        Nouvelle transaction
      </button>
      <button class="quick-panel-action" @click="emit('create-account')">
        Nouveau compte
      </button>
      <button class="quick-panel-action" @click="emit('create-category')">
        Nouvelle catégorie
      </button>
    </div>
  </section>
</template>