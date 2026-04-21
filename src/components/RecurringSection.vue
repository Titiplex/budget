<script setup lang="ts">
import {computed} from 'vue'
import type {
  Account,
  Category,
  ConversionMode,
  RecurringFrequency,
  RecurringTemplateRow,
  TransactionKind,
} from '../types/budget'
import {formatDate, formatMoney, kindLabel} from '../utils/budgetFormat'

const props = defineProps<{
  accounts: Account[]
  categories: Category[]
  rows: RecurringTemplateRow[]
  summary: {
    total: number
    active: number
    dueTemplates: number
    dueOccurrences: number
    overdueTemplates: number
  }
  loading: boolean
  saving: boolean
  generating: boolean
  dialogOpen: boolean
  editingRecurringId: number | null
  recurringForm: {
    label: string
    sourceAmount: string
    sourceCurrency: string
    accountAmount: string
    conversionMode: ConversionMode
    exchangeRate: string
    exchangeProvider: string
    kind: TransactionKind
    note: string
    frequency: RecurringFrequency
    intervalCount: string
    startDate: string
    nextOccurrenceDate: string
    endDate: string
    isActive: boolean
    accountId: string
    categoryId: string
  }
}>()

const emit = defineEmits<{
  (e: 'open-create'): void
  (e: 'open-edit', row: RecurringTemplateRow): void
  (e: 'delete-template', id: number): void
  (e: 'generate-template', id: number): void
  (e: 'generate-all'): void
  (e: 'close-dialog'): void
  (e: 'submit-template'): void
}>()

function frequencyLabel(frequency: RecurringFrequency, intervalCount: number) {
  const base =
      frequency === 'DAILY'
          ? 'jour'
          : frequency === 'WEEKLY'
              ? 'semaine'
              : frequency === 'MONTHLY'
                  ? 'mois'
                  : 'an'

  return intervalCount === 1 ? `Chaque ${base}` : `Tous les ${intervalCount} ${base}s`
}

function statusPillClass(row: RecurringTemplateRow) {
  if (!row.isActive) {
    return 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300'
  }
  if (row.overdue) {
    return 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300'
  }
  if (row.dueCount > 0) {
    return 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
  }
  return 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
}

function statusLabel(row: RecurringTemplateRow) {
  if (!row.isActive) return 'Inactive'
  if (row.overdue) return 'En retard'
  if (row.dueCount > 0) return 'À générer'
  return 'Planifiée'
}

const selectedAccountCurrency = computed(() => {
  const account = props.accounts.find((entry) => String(entry.id) === props.recurringForm.accountId)
  return account?.currency || 'CAD'
})

const isForeignCurrency = computed(() => {
  const sourceCurrency = (props.recurringForm.sourceCurrency || '').trim().toUpperCase()
  const accountCurrency = selectedAccountCurrency.value.trim().toUpperCase()
  return Boolean(sourceCurrency && accountCurrency && sourceCurrency !== accountCurrency)
})
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-center justify-end gap-2">
      <button class="ghost-btn" :disabled="generating" @click="emit('generate-all')">
        {{ generating ? 'Génération…' : 'Générer toutes les occurrences dues' }}
      </button>
      <button class="primary-btn" @click="emit('open-create')">
        Ajouter une récurrence
      </button>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div class="stat-card">
        <p class="stat-label">Templates</p>
        <p class="stat-value">{{ summary.total }}</p>
        <p class="stat-hint">Récurrences configurées</p>
      </div>

      <div class="stat-card">
        <p class="stat-label">Actives</p>
        <p class="stat-value">{{ summary.active }}</p>
        <p class="stat-hint">Templates actuellement actifs</p>
      </div>

      <div class="stat-card">
        <p class="stat-label">À générer</p>
        <p class="stat-value">{{ summary.dueOccurrences }}</p>
        <p class="stat-hint">{{ summary.dueTemplates }} template(s) concerné(s)</p>
      </div>

      <div class="stat-card">
        <p class="stat-label">En retard</p>
        <p class="stat-value">{{ summary.overdueTemplates }}</p>
        <p class="stat-hint">Templates à rattraper</p>
      </div>
    </div>

    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">Automatisation</p>
          <h3 class="panel-title">Transactions récurrentes</h3>
        </div>
      </div>

      <div v-if="rows.length" class="overflow-x-auto">
        <table class="w-full min-w-[1180px]">
          <thead>
          <tr class="table-head">
            <th class="table-cell-head text-left">Libellé</th>
            <th class="table-cell-head text-left">Montant</th>
            <th class="table-cell-head text-left">Compte</th>
            <th class="table-cell-head text-left">Catégorie</th>
            <th class="table-cell-head text-left">Rythme</th>
            <th class="table-cell-head text-left">Prochaine occurrence</th>
            <th class="table-cell-head text-left">Statut</th>
            <th class="table-cell-head text-right">Actions</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="row in rows" :key="row.templateId" class="table-row">
            <td class="table-cell">
              <div>
                <p class="font-semibold text-slate-800 dark:text-slate-100">{{ row.label }}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {{ kindLabel(row.kind) }} · {{ row.conversionMode }}
                </p>
                <p v-if="row.note" class="text-xs text-slate-500 dark:text-slate-400">{{ row.note }}</p>
              </div>
            </td>

            <td class="table-cell">
              <div>
                <p class="font-semibold text-slate-800 dark:text-slate-100">
                  {{ formatMoney(row.sourceAmount, row.sourceCurrency) }}
                </p>
                <p v-if="row.sourceCurrency !== row.accountCurrency" class="text-xs text-slate-500 dark:text-slate-400">
                  compte: {{ row.accountCurrency }}
                </p>
              </div>
            </td>

            <td class="table-cell">
              {{ row.accountName }}
            </td>

            <td class="table-cell">
              {{ row.categoryName }}
            </td>

            <td class="table-cell">
              {{ frequencyLabel(row.frequency, row.intervalCount) }}
            </td>

            <td class="table-cell">
              <div>
                <p>{{ formatDate(row.nextOccurrenceDate) }}</p>
                <p v-if="row.endDate" class="text-xs text-slate-500 dark:text-slate-400">
                  fin: {{ formatDate(row.endDate) }}
                </p>
              </div>
            </td>

            <td class="table-cell">
              <div class="space-y-2">
                  <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                        :class="statusPillClass(row)">
                    {{ statusLabel(row) }}
                  </span>
                <p v-if="row.dueCount > 0" class="text-xs text-slate-500 dark:text-slate-400">
                  {{ row.dueCount }} occurrence(s) due(s)
                </p>
              </div>
            </td>

            <td class="table-cell">
              <div class="row-actions">
                <button
                    class="mini-action-btn"
                    :disabled="row.dueCount === 0 || generating"
                    @click="emit('generate-template', row.templateId)"
                >
                  Générer
                </button>
                <button class="mini-action-btn" @click="emit('open-edit', row)">
                  Modifier
                </button>
                <button class="mini-danger-btn" @click="emit('delete-template', row.templateId)">
                  Supprimer
                </button>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="empty-state">
        Aucune récurrence définie pour le moment.
      </div>
    </section>

    <div
        v-if="dialogOpen"
        class="dialog-backdrop"
        @click.self="emit('close-dialog')"
    >
      <div class="dialog-card max-w-3xl">
        <p class="soft-kicker">Récurrences</p>
        <h3 class="dialog-title">
          {{ editingRecurringId ? 'Modifier la récurrence' : 'Créer une récurrence' }}
        </h3>
        <p class="dialog-text">
          Configure un template, puis génère les occurrences dues quand tu le souhaites.
        </p>

        <form class="mt-6 space-y-5" @submit.prevent="emit('submit-template')">
          <div class="grid gap-4 md:grid-cols-2">
            <label class="field-block md:col-span-2">
              <span class="field-label">Libellé</span>
              <input v-model="recurringForm.label" type="text" class="field-control"
                     placeholder="Loyer, Spotify, Salaire..."/>
            </label>

            <label class="field-block">
              <span class="field-label">Montant source</span>
              <input v-model="recurringForm.sourceAmount" type="number" min="0" step="0.01" class="field-control"
                     placeholder="0.00"/>
            </label>

            <label class="field-block">
              <span class="field-label">Devise source</span>
              <input v-model="recurringForm.sourceCurrency" type="text" maxlength="6" class="field-control"
                     placeholder="CAD, EUR, USD..."/>
            </label>

            <label class="field-block">
              <span class="field-label">Type</span>
              <select v-model="recurringForm.kind" class="field-control">
                <option value="EXPENSE">Dépense</option>
                <option value="INCOME">Revenu</option>
                <option value="TRANSFER">Transfert</option>
              </select>
            </label>

            <label class="field-block">
              <span class="field-label">Compte</span>
              <select v-model="recurringForm.accountId" class="field-control">
                <option value="">Sélectionner un compte</option>
                <option v-for="account in accounts" :key="account.id" :value="String(account.id)">
                  {{ account.name }} ({{ account.currency }})
                </option>
              </select>
            </label>

            <label class="field-block">
              <span class="field-label">Fréquence</span>
              <select v-model="recurringForm.frequency" class="field-control">
                <option value="DAILY">Quotidienne</option>
                <option value="WEEKLY">Hebdomadaire</option>
                <option value="MONTHLY">Mensuelle</option>
                <option value="YEARLY">Annuelle</option>
              </select>
            </label>

            <label class="field-block">
              <span class="field-label">Intervalle</span>
              <input v-model="recurringForm.intervalCount" type="number" min="1" step="1" class="field-control"
                     placeholder="1"/>
            </label>

            <label class="field-block">
              <span class="field-label">Début</span>
              <input v-model="recurringForm.startDate" type="date" class="field-control"/>
            </label>

            <label class="field-block">
              <span class="field-label">Prochaine occurrence</span>
              <input v-model="recurringForm.nextOccurrenceDate" type="date" class="field-control"/>
            </label>

            <label class="field-block">
              <span class="field-label">Fin</span>
              <input v-model="recurringForm.endDate" type="date" class="field-control"/>
            </label>

            <label class="field-block">
              <span class="field-label">Catégorie</span>
              <select v-model="recurringForm.categoryId" class="field-control">
                <option value="">Sans catégorie</option>
                <option v-for="category in categories" :key="category.id" :value="String(category.id)">
                  {{ category.name }}
                </option>
              </select>
            </label>

            <label class="field-block md:col-span-2">
              <span class="field-label">Note</span>
              <textarea v-model="recurringForm.note" rows="3" class="field-control field-textarea"
                        placeholder="Optionnel"/>
            </label>

            <label class="field-block">
              <span class="field-label">Actif</span>
              <select v-model="recurringForm.isActive" class="field-control">
                <option :value="true">Oui</option>
                <option :value="false">Non</option>
              </select>
            </label>
          </div>

          <div v-if="recurringForm.accountId" class="mini-card">
            <p class="mini-label">Devise du compte</p>
            <p class="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {{ selectedAccountCurrency }}
            </p>
          </div>

          <div v-if="isForeignCurrency" class="mini-card space-y-4">
            <p class="mini-label">Conversion multidevise</p>

            <div class="grid gap-4 md:grid-cols-3">
              <label class="field-block">
                <span class="field-label">Mode</span>
                <select v-model="recurringForm.conversionMode" class="field-control">
                  <option value="AUTOMATIC">Automatique</option>
                  <option value="MANUAL">Manuel</option>
                </select>
              </label>

              <label class="field-block">
                <span class="field-label">Montant compte ({{ selectedAccountCurrency }})</span>
                <input
                    v-model="recurringForm.accountAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    class="field-control"
                    :readonly="recurringForm.conversionMode === 'AUTOMATIC'"
                />
              </label>

              <label class="field-block">
                <span class="field-label">Taux</span>
                <input
                    v-model="recurringForm.exchangeRate"
                    type="number"
                    min="0"
                    step="0.000001"
                    class="field-control"
                    :readonly="recurringForm.conversionMode === 'AUTOMATIC'"
                />
              </label>
            </div>

            <label class="field-block">
              <span class="field-label">Source du taux</span>
              <input
                  v-model="recurringForm.exchangeProvider"
                  type="text"
                  class="field-control"
                  :readonly="recurringForm.conversionMode === 'AUTOMATIC'"
                  placeholder="MANUAL / ECB via Frankfurter"
              />
            </label>

            <div v-if="recurringForm.conversionMode === 'AUTOMATIC'" class="inline-warning">
              Le taux sera recalculé à chaque occurrence, à sa date propre.
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="ghost-btn" @click="emit('close-dialog')">
              Annuler
            </button>
            <button type="submit" class="primary-btn" :disabled="saving">
              {{ saving ? 'Enregistrement…' : (editingRecurringId ? 'Mettre à jour' : 'Créer') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>