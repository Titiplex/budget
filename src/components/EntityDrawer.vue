<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
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

const {t} = useI18n()
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
              {{ mode === 'create' ? t('forms.modeCreate') : t('forms.modeEdit') }}
            </p>
            <h2 class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {{ panelTitle }}
            </h2>
            <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {{ panelDescription }}
            </p>

            <span v-if="mode === 'edit' && editingTarget" class="drawer-badge">
              {{ t('forms.editBadge') }}
            </span>
          </div>

          <button class="ghost-btn" @click="emit('close')">
            {{ t('common.close') }}
          </button>
        </div>

        <div v-if="mode === 'create'" class="mt-5 flex flex-wrap gap-2">
          <button
              class="tab-btn"
              :class="{ 'tab-btn-active': currentTab === 'transaction' }"
              @click="emit('set-tab', 'transaction')"
          >
            {{ t('entities.singular.transaction') }}
          </button>
          <button
              class="tab-btn"
              :class="{ 'tab-btn-active': currentTab === 'account' }"
              @click="emit('set-tab', 'account')"
          >
            {{ t('entities.singular.account') }}
          </button>
          <button
              class="tab-btn"
              :class="{ 'tab-btn-active': currentTab === 'category' }"
              @click="emit('set-tab', 'category')"
          >
            {{ t('entities.singular.category') }}
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
              <label class="field-label">{{ t('forms.fields.label') }}</label>
              <input
                  v-model="transactionForm.label"
                  type="text"
                  class="field-control"
                  :placeholder="t('forms.placeholders.transactionLabel')"
              >
            </div>

            <div class="field-block">
              <label class="field-label">{{ t('forms.fields.amount') }}</label>
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
              <label class="field-label">{{ t('forms.fields.date') }}</label>
              <input
                  v-model="transactionForm.date"
                  type="date"
                  class="field-control"
              >
            </div>

            <div class="field-block">
              <label class="field-label">{{ t('forms.fields.type') }}</label>
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
              <label class="field-label">{{ t('forms.fields.account') }}</label>
              <select v-model="transactionForm.accountId" class="field-control">
                <option value="">{{ t('forms.placeholders.selectAccount') }}</option>
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
              <label class="field-label">{{ t('forms.fields.category') }}</label>
              <select v-model="transactionForm.categoryId" class="field-control">
                <option value="">{{ t('common.none') }}</option>
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
              <label class="field-label">{{ t('forms.fields.note') }}</label>
              <textarea
                  v-model="transactionForm.note"
                  rows="4"
                  class="field-control field-textarea"
                  :placeholder="t('common.optional')"
              ></textarea>
            </div>
          </div>

          <div v-if="!accounts.length" class="inline-warning">
            {{ t('forms.noAccountWarning') }}
          </div>

          <div class="form-actions">
            <button type="button" class="ghost-btn" @click="emit('reset-transaction')">
              {{ t('common.reset') }}
            </button>

            <button
                v-if="canDeleteCurrent"
                type="button"
                class="danger-btn"
                @click="emit('request-delete')"
            >
              {{ t('common.delete') }}
            </button>

            <button type="submit" class="primary-btn" :disabled="saving">
              {{ saving ? t('common.loading') : panelSubmitLabel }}
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
              <label class="field-label">{{ t('forms.fields.name') }}</label>
              <input
                  v-model="accountForm.name"
                  type="text"
                  class="field-control"
                  :placeholder="t('forms.placeholders.accountName')"
              >
            </div>

            <div class="field-block">
              <label class="field-label">{{ t('forms.fields.type') }}</label>
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
              <label class="field-label">{{ t('forms.fields.currency') }}</label>
              <input
                  v-model="accountForm.currency"
                  type="text"
                  maxlength="6"
                  class="field-control"
                  placeholder="CAD"
              >
            </div>

            <div class="field-block md:col-span-2">
              <label class="field-label">{{ t('forms.fields.description') }}</label>
              <textarea
                  v-model="accountForm.description"
                  rows="4"
                  class="field-control field-textarea"
                  :placeholder="t('common.optional')"
              ></textarea>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="ghost-btn" @click="emit('reset-account')">
              {{ t('common.reset') }}
            </button>

            <button
                v-if="canDeleteCurrent"
                type="button"
                class="danger-btn"
                @click="emit('request-delete')"
            >
              {{ t('common.delete') }}
            </button>

            <button type="submit" class="primary-btn" :disabled="saving">
              {{ saving ? t('common.loading') : panelSubmitLabel }}
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
              <label class="field-label">{{ t('forms.fields.name') }}</label>
              <input
                  v-model="categoryForm.name"
                  type="text"
                  class="field-control"
                  :placeholder="t('forms.placeholders.categoryName')"
              >
            </div>

            <div class="field-block">
              <label class="field-label">{{ t('forms.fields.type') }}</label>
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
              <label class="field-label">{{ t('forms.fields.color') }}</label>
              <input
                  v-model="categoryForm.color"
                  type="color"
                  class="field-color"
              >
            </div>

            <div class="field-block md:col-span-2">
              <label class="field-label">{{ t('forms.fields.description') }}</label>
              <textarea
                  v-model="categoryForm.description"
                  rows="4"
                  class="field-control field-textarea"
                  :placeholder="t('common.optional')"
              ></textarea>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="ghost-btn" @click="emit('reset-category')">
              {{ t('common.reset') }}
            </button>

            <button
                v-if="canDeleteCurrent"
                type="button"
                class="danger-btn"
                @click="emit('request-delete')"
            >
              {{ t('common.delete') }}
            </button>

            <button type="submit" class="primary-btn" :disabled="saving">
              {{ saving ? t('common.loading') : panelSubmitLabel }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>