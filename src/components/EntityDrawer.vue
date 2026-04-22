<script setup lang="ts">
import {computed} from 'vue'
import type {
  Account,
  AccountType,
  Category,
  ConversionMode,
  CreateTabKey,
  EditTarget,
  PanelMode,
  TransactionKind,
} from '../types/budget'
import {accountTypeLabel, formatMoney, kindLabel} from '../utils/budgetFormat'
import {useI18n} from 'vue-i18n'

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
  currency: string
  accountAmount: string
  conversionMode: ConversionMode
  exchangeRate: string
  exchangeProvider: string
  exchangeDate: string
  kind: TransactionKind
  date: string
  note: string
  accountId: string
  transferTargetAccountId: string
  categoryId: string
}

const props = defineProps<{
  open: boolean
  mode: PanelMode
  currentTab: CreateTabKey
  editingTarget: EditTarget | null
  saving: boolean
  fxBusy: boolean
  fxPreview: { convertedAmount: number; rate: number; provider: string; date: string } | null
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
  (e: 'quote-transaction-fx'): void
}>()

const {t} = useI18n()

const canDeleteCurrent = computed(() => {
  if (props.mode !== 'edit' || !props.editingTarget) return false
  return props.editingTarget.type === props.currentTab
})

const selectedAccount = computed(() =>
    props.accounts.find((account) => String(account.id) === props.transactionForm.accountId) || null,
)

const isTransferMode = computed(() => props.transactionForm.kind === 'TRANSFER')

const selectedAccountCurrency = computed(() => selectedAccount.value?.currency || 'CAD')

const selectedTransferTargetAccount = computed(() =>
    props.accounts.find((account) => String(account.id) === props.transactionForm.transferTargetAccountId) || null,
)

const selectedTransferTargetCurrency = computed(() =>
    selectedTransferTargetAccount.value?.currency || selectedAccountCurrency.value,
)

const sourceCurrency = computed(() => {
  if (isTransferMode.value) return selectedAccountCurrency.value.trim().toUpperCase()
  return props.transactionForm.currency.trim().toUpperCase()
})

const targetCurrency = computed(() => {
  if (isTransferMode.value) return selectedTransferTargetCurrency.value.trim().toUpperCase()
  return selectedAccountCurrency.value.trim().toUpperCase()
})

const isForeignCurrency = computed(() => {
  return Boolean(sourceCurrency.value && targetCurrency.value && sourceCurrency.value !== targetCurrency.value)
})

function parsePositive(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

const transferDebitAmount = computed(() => parsePositive(props.transactionForm.amount))

const transferCreditedAmount = computed(() => {
  if (!isTransferMode.value) return null
  if (!isForeignCurrency.value) return transferDebitAmount.value

  const manual = parsePositive(props.transactionForm.accountAmount)
  if (manual) return manual

  if (props.fxPreview?.convertedAmount && Number.isFinite(props.fxPreview.convertedAmount)) {
    return props.fxPreview.convertedAmount
  }

  return null
})

const transferRoute = computed(() => {
  if (!isTransferMode.value) return null
  if (!selectedAccount.value || !selectedTransferTargetAccount.value) return null
  return `${selectedAccount.value.name} → ${selectedTransferTargetAccount.value.name}`
})

const transferPreview = computed(() => {
  if (!isTransferMode.value || !selectedAccount.value || !selectedTransferTargetAccount.value || !transferDebitAmount.value) {
    return null
  }

  return {
    sourceAccountName: selectedAccount.value.name,
    targetAccountName: selectedTransferTargetAccount.value.name,
    debitLabel: formatMoney(transferDebitAmount.value, sourceCurrency.value || 'CAD'),
    creditLabel: transferCreditedAmount.value
        ? formatMoney(transferCreditedAmount.value, targetCurrency.value || 'CAD')
        : t('transfer.toBeSpecified'),
    sameCurrency: !isForeignCurrency.value,
  }
})

const transferModeSummary = computed(() => {
  if (!isTransferMode.value) return null
  if (!selectedAccount.value || !selectedTransferTargetAccount.value) {
    return t('transfer.summarySelectAccounts')
  }

  if (!isForeignCurrency.value) {
    return t('transfer.summarySameCurrency')
  }

  return t('transfer.summaryForeignCurrency')
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
              <label class="field-label">
                {{ t('forms.fields.label') }}
              </label>
              <input
                  v-model="transactionForm.label"
                  type="text"
                  class="field-control"
                  :placeholder="isTransferMode ? 'Virement vers épargne, déplacement de fonds...' : 'Courses, salaire, abonnement...'"
              >
            </div>

            <div class="field-block">
              <label class="field-label">
                {{ t('forms.fields.type') }}
              </label>
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
              <label class="field-label">
                {{ t('forms.fields.date') }}
              </label>
              <input
                  v-model="transactionForm.date"
                  type="date"
                  class="field-control"
              >
            </div>
          </div>

          <div
              v-if="isTransferMode"
              class="rounded-3xl border border-sky-200 bg-sky-50/80 p-5 dark:border-sky-900/60 dark:bg-sky-950/30"
          >
            <div class="flex flex-col gap-3">
              <div class="flex flex-wrap items-center gap-2">
                <span
                    class="inline-flex items-center rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-sky-700 dark:border-sky-900/60 dark:bg-slate-900 dark:text-sky-300">
                  {{ t('transfer.internal') }}
                </span>

                <span v-if="transferRoute"
                      class="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  {{ transferRoute }}
                </span>
              </div>

              <p class="text-sm leading-6 text-slate-600 dark:text-slate-300">
                {{ transferModeSummary }}
              </p>

              <p class="text-xs text-slate-500 dark:text-slate-400">
                {{ t('transfer.notCountedInReports') }}
              </p>
            </div>
          </div>

          <template v-if="isTransferMode">
            <div class="grid gap-5 md:grid-cols-2">
              <div
                  class="rounded-3xl border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-950/40">
                <div class="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p class="mini-label">
                      {{ t('transfer.sourceAccount') }}
                    </p>
                    <h3 class="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                      {{ t('transfer.outgoing') }}
                    </h3>
                  </div>

                  <span
                      class="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                    {{ t('transfer.debit') }}
                  </span>
                </div>

                <div class="space-y-4">
                  <label class="field-block">
                    <span class="field-label">
                      {{ t('transfer.accountToDebit') }}
                    </span>
                    <select v-model="transactionForm.accountId" class="field-control">
                      <option value="">
                        {{ t('forms.placeholders.selectAccount') }}
                      </option>
                      <option
                          v-for="account in accounts"
                          :key="account.id"
                          :value="String(account.id)"
                      >
                        {{ account.name }} ({{ account.currency }})
                      </option>
                    </select>
                  </label>

                  <label class="field-block">
                    <span class="field-label">
                      {{ t('transfer.debitedAmount') }}
                    </span>
                    <input
                        v-model="transactionForm.amount"
                        type="number"
                        min="0"
                        step="0.01"
                        class="field-control"
                        placeholder="0.00"
                    >
                  </label>

                  <label class="field-block">
                    <span class="field-label">
                      {{ t('forms.fields.sourceCurrency') }}
                    </span>
                    <input
                        :value="sourceCurrency || 'CAD'"
                        type="text"
                        class="field-control"
                        readonly
                    >
                  </label>
                </div>
              </div>

              <div
                  class="rounded-3xl border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-950/40">
                <div class="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p class="mini-label">
                      {{ t('transfer.targetAccount') }}
                    </p>
                    <h3 class="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                      {{ t('transfer.incoming') }}
                    </h3>
                  </div>

                  <span
                      class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                    {{ t('transfer.credit') }}
                  </span>
                </div>

                <div class="space-y-4">
                  <label class="field-block">
                    <span class="field-label">
                      {{ t('transfer.accountToCredit') }}
                    </span>
                    <select v-model="transactionForm.transferTargetAccountId" class="field-control">
                      <option value="">Sélectionner un compte</option>
                      <option
                          v-for="account in accounts.filter((entry) => String(entry.id) !== transactionForm.accountId)"
                          :key="account.id"
                          :value="String(account.id)"
                      >
                        {{ account.name }} ({{ account.currency }})
                      </option>
                    </select>
                  </label>

                  <label class="field-block">
                    <span class="field-label">
                      {{ t('forms.fields.targetCurrency') }}
                    </span>
                    <input
                        :value="targetCurrency || 'CAD'"
                        type="text"
                        class="field-control"
                        readonly
                    >
                  </label>

                  <div
                      class="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    <p class="font-medium text-slate-800 dark:text-slate-100">
                      {{
                        selectedTransferTargetAccount ? selectedTransferTargetAccount.name : t('transfer.chooseTargetAccount')
                      }}
                    </p>
                    <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {{ t('transfer.linkedMovementCreated') }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="isForeignCurrency" class="space-y-4">
              <div class="mini-card">
                <p class="mini-label">{{ t('transfer.currencyConversion') }}</p>

                <div class="mt-3 grid gap-4 md:grid-cols-3">
                  <label class="field-block">
                    <span class="field-label">{{ t('forms.fields.conversionMode') }}</span>
                    <select v-model="transactionForm.conversionMode" class="field-control">
                      <option value="AUTOMATIC">{{ t('common.automatic') }}</option>
                      <option value="MANUAL">{{ t('common.manual') }}</option>
                    </select>
                  </label>

                  <label class="field-block">
                    <span class="field-label">{{ t('forms.fields.creditedAmount', {currency: targetCurrency}) }}</span>
                    <input
                        v-model="transactionForm.accountAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        class="field-control"
                        placeholder="0.00"
                        :readonly="transactionForm.conversionMode === 'AUTOMATIC'"
                    >
                  </label>

                  <label class="field-block">
                    <span class="field-label">{{ t('forms.fields.exchangeRate') }}</span>
                    <input
                        v-model="transactionForm.exchangeRate"
                        type="number"
                        min="0"
                        step="0.000001"
                        class="field-control"
                        placeholder="1.000000"
                        :readonly="transactionForm.conversionMode === 'AUTOMATIC'"
                    >
                  </label>
                </div>

                <div class="mt-4 grid gap-4 md:grid-cols-2">
                  <label class="field-block">
                    <span class="field-label">{{ t('forms.fields.exchangeProvider') }}</span>
                    <input
                        v-model="transactionForm.exchangeProvider"
                        type="text"
                        class="field-control"
                        placeholder="MANUAL / ECB via Frankfurter"
                        :readonly="transactionForm.conversionMode === 'AUTOMATIC'"
                    >
                  </label>

                  <label class="field-block">
                    <span class="field-label">{{ t('forms.fields.exchangeDate') }}</span>
                    <input
                        v-model="transactionForm.exchangeDate"
                        type="date"
                        class="field-control"
                    >
                  </label>
                </div>

                <div v-if="transactionForm.conversionMode === 'AUTOMATIC'" class="mt-4">
                  <button
                      type="button"
                      class="ghost-btn"
                      :disabled="fxBusy"
                      @click="emit('quote-transaction-fx')"
                  >
                    {{ fxBusy ? t('transfer.fetchingRate') : t('transfer.fetchRateForDate') }}
                  </button>
                </div>

                <div v-if="fxPreview" class="mt-4 inline-warning">
                  {{ transactionForm.amount || '0' }} {{ sourceCurrency }}
                  ≈ {{ fxPreview.convertedAmount.toFixed(2) }} {{ targetCurrency }}
                  avec un taux de {{ fxPreview.rate.toFixed(6) }}
                  ({{ fxPreview.provider }}, {{ fxPreview.date }})
                </div>
              </div>
            </div>

            <div
                v-if="transferPreview"
                class="rounded-3xl border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-950/40"
            >
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="mini-label">{{ t('transfer.generatedPreview') }}</p>
                  <h3 class="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                    {{ transferRoute || t('transfer.internal') }}
                  </h3>
                </div>

                <span class="soft-badge">
                  {{ t('transfer.twoLinkedMovements') }}
                </span>
              </div>

              <div class="mt-4 grid gap-4 md:grid-cols-2">
                <div
                    class="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/60 dark:bg-rose-950/30">
                  <p class="text-xs font-semibold uppercase tracking-[0.14em] text-rose-600 dark:text-rose-300">
                    Débit
                  </p>
                  <p class="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                    {{ transferPreview.debitLabel }}
                  </p>
                  <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {{ t('transfer.fromAccount', {account: transferPreview.sourceAccountName}) }}
                  </p>
                </div>

                <div
                    class="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                  <p class="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-300">
                    Crédit
                  </p>
                  <p class="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                    {{ transferPreview.creditLabel }}
                  </p>
                  <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {{ t('transfer.toAccount', {account: transferPreview.targetAccountName}) }}
                  </p>
                </div>
              </div>

              <p class="mt-4 text-xs text-slate-500 dark:text-slate-400">
                {{
                  transferPreview.sameCurrency
                      ? t('transfer.sameCurrencyHint')
                      : t('transfer.foreignCurrencyHint')
                }}
              </p>
            </div>

            <div class="field-block">
              <label class="field-label">{{ t('forms.fields.note') }}</label>
              <textarea
                  v-model="transactionForm.note"
                  rows="4"
                  class="field-control field-textarea"
                  placeholder="{{ t('transfer.placeholders.note') }}"
              ></textarea>
            </div>
          </template>

          <template v-else>
            <div class="grid gap-5 md:grid-cols-2">
              <div class="field-block">
                <label class="field-label">{{ t('forms.fields.enteredAmount') }}</label>
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
                <label class="field-label">{{ t('forms.fields.enteredCurrency') }}</label>
                <input
                    v-model="transactionForm.currency"
                    type="text"
                    maxlength="6"
                    class="field-control"
                    placeholder="USD, EUR, CAD..."
                >
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
                    {{ account.name }} ({{ account.currency }})
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
                <label class="field-label">Note</label>
                <textarea
                    v-model="transactionForm.note"
                    rows="4"
                    class="field-control field-textarea"
                    placeholder="{{ t('forms.placeholders.optionalDetail') }}"
                ></textarea>
              </div>
            </div>

            <div v-if="selectedAccount" class="grid gap-4 md:grid-cols-2">
              <div class="mini-card">
                <p class="mini-label">{{ t('forms.fields.accountCurrency') }}</p>
                <p class="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {{ selectedAccountCurrency }}
                </p>
              </div>
            </div>

            <div v-if="isForeignCurrency" class="space-y-4">
              <div class="mini-card">
                <p class="mini-label">{{ t('transfer.currencyConversion') }}</p>
                <div class="mt-3 grid gap-4 md:grid-cols-3">
                  <label class="field-block">
                    <span class="field-label">{{ t('forms.fields.conversionMode') }}</span>
                    <select v-model="transactionForm.conversionMode" class="field-control">
                      <option value="AUTOMATIC">Automatique</option>
                      <option value="MANUAL">Manuel</option>
                    </select>
                  </label>

                  <label class="field-block">
                    <span class="field-label">{{ t('forms.fields.accountAmount', {currency: targetCurrency}) }}</span>
                    <input
                        v-model="transactionForm.accountAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        class="field-control"
                        placeholder="0.00"
                        :readonly="transactionForm.conversionMode === 'AUTOMATIC'"
                    >
                  </label>

                  <label class="field-block">
                    <span class="field-label">Taux mémorisé</span>
                    <input
                        v-model="transactionForm.exchangeRate"
                        type="number"
                        min="0"
                        step="0.000001"
                        class="field-control"
                        placeholder="1.000000"
                        :readonly="transactionForm.conversionMode === 'AUTOMATIC'"
                    >
                  </label>
                </div>

                <div class="mt-4 grid gap-4 md:grid-cols-2">
                  <label class="field-block">
                    <span class="field-label">Source du taux</span>
                    <input
                        v-model="transactionForm.exchangeProvider"
                        type="text"
                        class="field-control"
                        placeholder="MANUAL / ECB via Frankfurter"
                        :readonly="transactionForm.conversionMode === 'AUTOMATIC'"
                    >
                  </label>

                  <label class="field-block">
                    <span class="field-label">Date du taux</span>
                    <input
                        v-model="transactionForm.exchangeDate"
                        type="date"
                        class="field-control"
                    >
                  </label>
                </div>

                <div v-if="transactionForm.conversionMode === 'AUTOMATIC'" class="mt-4">
                  <button
                      type="button"
                      class="ghost-btn"
                      :disabled="fxBusy"
                      @click="emit('quote-transaction-fx')"
                  >
                    {{ fxBusy ? t('transfer.fetchingRate') : t('transfer.autoConvertForDate') }}
                  </button>
                </div>

                <div v-if="fxPreview" class="mt-4 inline-warning">
                  {{ transactionForm.amount || '0' }} {{ sourceCurrency }}
                  ≈ {{ fxPreview.convertedAmount.toFixed(2) }} {{ targetCurrency }}
                  avec un taux de {{ fxPreview.rate.toFixed(6) }}
                  ({{ fxPreview.provider }}, {{ fxPreview.date }})
                </div>
              </div>
            </div>
          </template>

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
                  placeholder="{{ t('forms.placeholders.accountName') }}"
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
                  placeholder="{{ t('common.optional') }}"
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
                  placeholder="{{ t('forms.placeholders.categoryName') }}"
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
              <label class="field-label">{{ t('forms.fields.color') }}</label>
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