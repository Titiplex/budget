<script setup lang="ts">
import type {BudgetPeriod, BudgetProgressRow, Category} from '../types/budget'
import {formatDate, formatMoney} from '../utils/budgetFormat'

defineProps<{
  categories: Category[]
  rows: BudgetProgressRow[]
  summary: {
    count: number
    targetAmount: number
    spentAmount: number
    remainingAmount: number
    overCount: number
    nearCount: number
  }
  loading: boolean
  saving: boolean
  dialogOpen: boolean
  editingBudgetId: number | null
  budgetForm: {
    name: string
    amount: string
    period: BudgetPeriod
    startDate: string
    endDate: string
    currency: string
    isActive: boolean
    note: string
    categoryId: string
  }
}>()

const emit = defineEmits<{
  (e: 'open-create', categoryId?: number): void
  (e: 'open-edit', row: BudgetProgressRow): void
  (e: 'delete-budget', id: number): void
  (e: 'close-dialog'): void
  (e: 'submit-budget'): void
}>()

function statusPillClass(status: BudgetProgressRow['status']) {
  if (status === 'OVER') {
    return 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300'
  }
  if (status === 'NEAR') {
    return 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
  }
  return 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
}

function periodLabel(period: BudgetPeriod) {
  if (period === 'MONTHLY') return 'Mensuel'
  if (period === 'YEARLY') return 'Annuel'
  return 'Personnalisé'
}
</script>

<template>
  <section class="space-y-6">
    <div class="flex items-center justify-end">
      <button class="primary-btn" @click="emit('open-create')">
        Ajouter un budget
      </button>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div class="stat-card">
        <p class="stat-label">Budgets actifs</p>
        <p class="stat-value">{{ summary.count }}</p>
        <p class="stat-hint">Objectifs actuellement suivis</p>
      </div>

      <div class="stat-card">
        <p class="stat-label">Cible totale</p>
        <p class="stat-value">{{ formatMoney(summary.targetAmount) }}</p>
        <p class="stat-hint">Budget cumulé</p>
      </div>

      <div class="stat-card">
        <p class="stat-label">Consommé</p>
        <p class="stat-value">{{ formatMoney(summary.spentAmount) }}</p>
        <p class="stat-hint">Dépenses suivies</p>
      </div>

      <div class="stat-card">
        <p class="stat-label">Alertes</p>
        <p class="stat-value text-xl">{{ summary.overCount }} over · {{ summary.nearCount }} near</p>
        <p class="stat-hint">Budgets à surveiller</p>
      </div>
    </div>

    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">Pilotage budgétaire</p>
          <h3 class="panel-title">Suivi par catégorie</h3>
        </div>
      </div>

      <div v-if="rows.length" class="overflow-x-auto">
        <table class="w-full min-w-[1080px]">
          <thead>
          <tr class="table-head">
            <th class="table-cell-head text-left">Budget</th>
            <th class="table-cell-head text-left">Catégorie</th>
            <th class="table-cell-head text-left">Période</th>
            <th class="table-cell-head text-right">Cible</th>
            <th class="table-cell-head text-right">Consommé</th>
            <th class="table-cell-head text-right">Reste</th>
            <th class="table-cell-head text-right">% utilisé</th>
            <th class="table-cell-head text-left">Statut</th>
            <th class="table-cell-head text-right">Actions</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="row in rows" :key="row.budgetId" class="table-row">
            <td class="table-cell">
              <div>
                <p class="font-semibold text-slate-800 dark:text-slate-100">{{ row.name }}</p>
                <p v-if="row.note" class="text-xs text-slate-500 dark:text-slate-400">{{ row.note }}</p>
              </div>
            </td>
            <td class="table-cell">
              <div class="flex items-center gap-2">
                <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: row.categoryColor || '#94a3b8' }"/>
                <span>{{ row.categoryName }}</span>
              </div>
            </td>
            <td class="table-cell">
              <div>
                <p>{{ periodLabel(row.period) }}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {{ formatDate(row.startDate) }} → {{ formatDate(row.endDate) }}
                </p>
              </div>
            </td>
            <td class="table-cell text-right">{{ formatMoney(row.targetAmount, row.currency) }}</td>
            <td class="table-cell text-right">{{ formatMoney(row.spentAmount, row.currency) }}</td>
            <td class="table-cell text-right">
                <span
                    :class="row.remainingAmount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'">
                  {{ formatMoney(row.remainingAmount, row.currency) }}
                </span>
            </td>
            <td class="table-cell text-right">{{ row.progressPercent.toFixed(1) }}%</td>
            <td class="table-cell">
                <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                      :class="statusPillClass(row.status)">
                  {{ row.status }}
                </span>
            </td>
            <td class="table-cell">
              <div class="row-actions">
                <button class="mini-action-btn" @click="emit('open-edit', row)">Modifier</button>
                <button class="mini-danger-btn" @click="emit('delete-budget', row.budgetId)">Supprimer</button>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="empty-state">
        Aucun budget défini pour le moment.
      </div>
    </section>

    <div
        v-if="dialogOpen"
        class="dialog-backdrop"
        @click.self="emit('close-dialog')"
    >
      <div class="dialog-card">
        <p class="soft-kicker">Budgets</p>
        <h3 class="dialog-title">
          {{ editingBudgetId ? 'Modifier le budget' : 'Créer un budget' }}
        </h3>
        <p class="dialog-text">
          Définis un objectif par catégorie, puis suis la consommation réelle sur sa période.
        </p>

        <form class="mt-6 space-y-5" @submit.prevent="emit('submit-budget')">
          <div class="grid gap-4 md:grid-cols-2">
            <label class="field-block md:col-span-2">
              <span class="field-label">Nom</span>
              <input v-model="budgetForm.name" type="text" class="field-control" placeholder="Budget alimentation"/>
            </label>

            <label class="field-block">
              <span class="field-label">Montant cible</span>
              <input v-model="budgetForm.amount" type="number" min="0" step="0.01" class="field-control"
                     placeholder="0.00"/>
            </label>

            <label class="field-block">
              <span class="field-label">Devise</span>
              <input v-model="budgetForm.currency" type="text" maxlength="6" class="field-control" placeholder="CAD"/>
            </label>

            <label class="field-block">
              <span class="field-label">Période</span>
              <select v-model="budgetForm.period" class="field-control">
                <option value="MONTHLY">Mensuel</option>
                <option value="YEARLY">Annuel</option>
                <option value="CUSTOM">Personnalisé</option>
              </select>
            </label>

            <label class="field-block">
              <span class="field-label">Catégorie</span>
              <select v-model="budgetForm.categoryId" class="field-control">
                <option value="">Sélectionner une catégorie</option>
                <option
                    v-for="category in categories.filter((item) => item.kind === 'EXPENSE')"
                    :key="category.id"
                    :value="String(category.id)"
                >
                  {{ category.name }}
                </option>
              </select>
            </label>

            <label class="field-block">
              <span class="field-label">Début</span>
              <input v-model="budgetForm.startDate" type="date" class="field-control"/>
            </label>

            <label class="field-block">
              <span class="field-label">Fin</span>
              <input
                  v-model="budgetForm.endDate"
                  type="date"
                  class="field-control"
                  :disabled="budgetForm.period !== 'CUSTOM'"
              />
            </label>

            <label class="field-block md:col-span-2">
              <span class="field-label">Note</span>
              <textarea v-model="budgetForm.note" rows="3" class="field-control field-textarea"
                        placeholder="Optionnel"/>
            </label>

            <label class="field-block md:col-span-2">
              <span class="field-label">Actif</span>
              <select v-model="budgetForm.isActive" class="field-control">
                <option :value="true">Oui</option>
                <option :value="false">Non</option>
              </select>
            </label>
          </div>

          <div class="form-actions">
            <button type="button" class="ghost-btn" @click="emit('close-dialog')">
              Annuler
            </button>
            <button type="submit" class="primary-btn" :disabled="saving">
              {{ saving ? 'Enregistrement…' : (editingBudgetId ? 'Mettre à jour' : 'Créer') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>