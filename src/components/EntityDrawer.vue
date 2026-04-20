<script setup lang="ts">
import {computed} from 'vue'
import type {
  Account,
  AccountType,
  Category,
  CreateTabKey,
  EditTarget,
  PanelMode,
  TransactionKind,
} from '../types/budget'
import {accountTypeLabel, kindLabel} from '../utils/budgetFormat'

interface AccountFormState {
  name: string
  type: AccountType
  currency: string
  description: string
}

interface CategoryFormState {
  name: string
  kind: TransactionKind
  color: string
  description: string
}

interface TransactionFormState {
  label: string
  amount: string
  kind: TransactionKind
  date: string
  note: string
  accountId: string
  categoryId: string
}

const props = defineProps<{
  open: boolean
  mode: PanelMode
  currentTab: CreateTabKey
  editingTarget: EditTarget | null
  saving: boolean
  panelTitle: string
  panelDescription: string
  panelSubmitLabel: string
  accountTypeOptions: AccountType[]
  transactionKindOptions: TransactionKind[]
  accounts: Account[]
  categories: Category[]
  transactionFormCategories: Category[]
  accountForm: AccountFormState
  categoryForm: CategoryFormState
  transactionForm: TransactionFormState
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'set-tab', tab: CreateTabKey): void
  (e: 'submit-transaction'): void
  (e: 'submit-account'): void
  (e: 'submit-category'): void
  (e: 'reset-transaction'): void
  (e: 'reset-account'): void
  (e: 'reset-category'): void
  (e: 'request-delete'): void
}>()

const canDeleteCurrent = computed(() => {
  if (props.mode !== 'edit' || !props.editingTarget) return false
  return props.editingTarget.type === props.currentTab
})
</script>

<template>
  <div
      v-if="open"
      class="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-sm"
      @click.self="emit('close')"
  >
    <div
        class="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div
          class="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="soft-kicker">
              {{ mode === 'create' ? 'Création' : 'Édition' }}
            </p>
            <h2 class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {{ panelTitle }}
            </h2>
            <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {{ panelDescription }}
            </p>

            <span v-if="mode === 'edit' && editingTarget" class="drawer-badge">
              Mode édition
            </span>
          </div>

          <button class="ghost-btn" @click="emit('close')">
            Fermer
          </button>
        </div>

        <div v-if="mode === 'create'" class="mt-5 flex flex-wrap gap-2">
          <button
              class="tab-btn"
              :class="{ 'tab-btn-active': currentTab === 'transaction' }"
              @click="emit('set-tab', 'transaction')"
          >
            Transaction
          </button>
          <button
              class="tab-btn"
              :class="{ 'tab-btn-active': currentTab === 'account' }"
              @click="emit('set-tab', 'account')"
          >
            Compte
          </button>
          <button
              class="tab-btn"
              :class="{ 'tab-btn-active': currentTab === 'category' }"
              @click="emit('set-tab', 'category')"
          >
            Catégorie
          </button>
        </div>
      </div>

      <div class="p-6">
        <form
            v-if="currentTab === 'transaction'"
            class="space-y-5"
            @submit.prevent="emit('submit-transaction')"
        >
          <div class="grid gap-5 md:grid-cols-2">
            <div class="field-block md:col-span-2">
              <label class="field-label">Libellé</label>
              <input
                  v-model="transactionForm.label"
                  type="text"
                  class="field-control"
                  placeholder="Courses, salaire, abonnement..."
              >
            </div>

            <div class="field-block">
              <label class="field-label">Montant</label>
              <input
                  v-model="transactionForm.amount"
                  type="number"
                  min="0"
                  step="0.01"
                  class="field-control"
                  placeholder="0.00"
              >
            </div>

            <div class="field-block">
              <label class="field-label">Date</label>
              <input
                  v-model="transactionForm.date"
                  type="date"
                  class="field-control"
              >
            </div>

            <div class="field-block">
              <label class="field-label">Type</label>
              <select v-model="transactionForm.kind" class="field-control">
                <option
                    v-for="kind in transactionKindOptions"
                    :key="kind"
                    :value="kind"
                >
                  {{ kindLabel(kind) }}
                </option>
              </select>
            </div>

            <div class="field-block">
              <label class="field-label">Compte</label>
              <select v-model="transactionForm.accountId" class="field-control">
                <option value="">Sélectionner un compte</option>
                <option
                    v-for="account in accounts"
                    :key="account.id"
                    :value="String(account.id)"
                >
                  {{ account.name }}
                </option>
              </select>
            </div>

            <div class="field-block">
              <label class="field-label">Catégorie</label>
              <select v-model="transactionForm.categoryId" class="field-control">
                <option value="">Aucune</option>
                <option
                    v-for="category in transactionFormCategories"
                    :key="category.id"
                    :value="String(category.id)"
                >
                  {{ category.name }}
                </option>
              </select>
            </div>

            <div class="field-block md:col-span-2">
              <label class="field-label">Note</label>
              <textarea
                  v-model="transactionForm.note"
                  rows="4"
                  class="field-control field-textarea"
                  placeholder="Détail optionnel"
              ></textarea>
            </div>
          </div>

          <div v-if="!accounts.length" class="inline-warning">
            Tu n’as encore aucun compte. Crée d’abord un compte.
          </div>

          <div class="form-actions">
            <button type="button" class="ghost-btn" @click="emit('reset-transaction')">
              Réinitialiser
            </button>

            <button
                v-if="canDeleteCurrent"
                type="button"
                class="danger-btn"
                @click="emit('request-delete')"
            >
              Supprimer
            </button>

            <button type="submit" class="primary-btn" :disabled="saving">
              {{ saving ? 'Enregistrement…' : panelSubmitLabel }}
            </button>
          </div>
        </form>

        <form
            v-else-if="currentTab === 'account'"
            class="space-y-5"
            @submit.prevent="emit('submit-account')"
        >
          <div class="grid gap-5 md:grid-cols-2">
            <div class="field-block md:col-span-2">
              <label class="field-label">Nom</label>
              <input
                  v-model="accountForm.name"
                  type="text"
                  class="field-control"
                  placeholder="Compte chèque, carte, cash..."
              >
            </div>

            <div class="field-block">
              <label class="field-label">Type</label>
              <select v-model="accountForm.type" class="field-control">
                <option
                    v-for="type in accountTypeOptions"
                    :key="type"
                    :value="type"
                >
                  {{ accountTypeLabel(type) }}
                </option>
              </select>
            </div>

            <div class="field-block">
              <label class="field-label">Devise</label>
              <input
                  v-model="accountForm.currency"
                  type="text"
                  maxlength="6"
                  class="field-control"
                  placeholder="CAD"
              >
            </div>

            <div class="field-block md:col-span-2">
              <label class="field-label">Description</label>
              <textarea
                  v-model="accountForm.description"
                  rows="4"
                  class="field-control field-textarea"
                  placeholder="Optionnel"
              ></textarea>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="ghost-btn" @click="emit('reset-account')">
              Réinitialiser
            </button>

            <button
                v-if="canDeleteCurrent"
                type="button"
                class="danger-btn"
                @click="emit('request-delete')"
            >
              Supprimer
            </button>

            <button type="submit" class="primary-btn" :disabled="saving">
              {{ saving ? 'Enregistrement…' : panelSubmitLabel }}
            </button>
          </div>
        </form>

        <form
            v-else
            class="space-y-5"
            @submit.prevent="emit('submit-category')"
        >
          <div class="grid gap-5 md:grid-cols-2">
            <div class="field-block md:col-span-2">
              <label class="field-label">Nom</label>
              <input
                  v-model="categoryForm.name"
                  type="text"
                  class="field-control"
                  placeholder="Loyer, alimentation, salaire..."
              >
            </div>

            <div class="field-block">
              <label class="field-label">Type</label>
              <select v-model="categoryForm.kind" class="field-control">
                <option
                    v-for="kind in transactionKindOptions"
                    :key="kind"
                    :value="kind"
                >
                  {{ kindLabel(kind) }}
                </option>
              </select>
            </div>

            <div class="field-block">
              <label class="field-label">Couleur</label>
              <input
                  v-model="categoryForm.color"
                  type="color"
                  class="field-color"
              >
            </div>

            <div class="field-block md:col-span-2">
              <label class="field-label">Description</label>
              <textarea
                  v-model="categoryForm.description"
                  rows="4"
                  class="field-control field-textarea"
                  placeholder="Optionnel"
              ></textarea>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="ghost-btn" @click="emit('reset-category')">
              Réinitialiser
            </button>

            <button
                v-if="canDeleteCurrent"
                type="button"
                class="danger-btn"
                @click="emit('request-delete')"
            >
              Supprimer
            </button>

            <button type="submit" class="primary-btn" :disabled="saving">
              {{ saving ? 'Enregistrement…' : panelSubmitLabel }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>