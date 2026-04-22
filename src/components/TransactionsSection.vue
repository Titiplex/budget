<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {Account, Category, Transaction, TransactionKind} from '../types/budget'
import {
  amountClass,
  categoryDotStyle,
  formatDate,
  formatMoney,
  kindLabel,
  kindPillClass,
} from '../utils/budgetFormat'

const props = defineProps<{
  accounts: Account[]
  categories: Category[]
  filteredTransactions: Transaction[]
  search: string
  kindFilter: 'ALL' | TransactionKind
  accountFilter: string
  categoryFilter: string
}>()

const emit = defineEmits<{
  (e: 'update:search', value: string): void
  (e: 'update:kind-filter', value: 'ALL' | TransactionKind): void
  (e: 'update:account-filter', value: string): void
  (e: 'update:category-filter', value: string): void
  (e: 'create-transaction'): void
  (e: 'edit-transaction', transaction: Transaction): void
  (e: 'delete-transaction', transaction: Transaction): void
}>()

const {t} = useI18n()

const displayTransactions = computed(() => props.filteredTransactions)

function transferRoute(transaction: Transaction) {
  if (transaction.kind !== 'TRANSFER') return null

  const selfAccount = transaction.account?.name || 'Compte'
  const peerAccount = transaction.transferPeerAccount?.name || 'Compte lié'

  if (transaction.transferDirection === 'IN') {
    return `${peerAccount} → ${selfAccount}`
  }

  return `${selfAccount} → ${peerAccount}`
}

function transferDirectionLabel(transaction: Transaction) {
  if (transaction.kind !== 'TRANSFER') return null
  if (transaction.transferDirection === 'IN') return 'Entrée liée'
  if (transaction.transferDirection === 'OUT') return 'Sortie liée'
  return 'Mouvement lié'
}

function transferCategoryLabel(transaction: Transaction) {
  if (transaction.kind === 'TRANSFER') return 'Transfert interne'
  return transaction.category?.name || t('common.none')
}

function transferAmountHint(transaction: Transaction) {
  if (transaction.kind !== 'TRANSFER') return null

  if (transaction.transferDirection === 'IN' && transaction.sourceCurrency) {
    const accountCurrency = transaction.account?.currency || ''
    const sourceCurrency = transaction.sourceCurrency || ''

    if (accountCurrency && sourceCurrency && accountCurrency !== sourceCurrency && transaction.sourceAmount) {
      return `Origine : ${formatMoney(Math.abs(transaction.sourceAmount), sourceCurrency)}`
    }
  }

  if (transaction.transferDirection === 'IN') return 'Crédit interne'
  if (transaction.transferDirection === 'OUT') return 'Débit interne'
  return 'Mouvement interne'
}

function accountSubtitle(transaction: Transaction) {
  if (transaction.kind !== 'TRANSFER') return null
  if (transaction.transferDirection === 'IN') {
    return `depuis ${transaction.transferPeerAccount?.name || 'le compte lié'}`
  }
  return `vers ${transaction.transferPeerAccount?.name || 'le compte lié'}`
}
</script>

<template>
  <section class="space-y-6">
    <section class="panel p-6">
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div class="field-block xl:col-span-2">
          <label class="field-label">{{ t('common.search') }}</label>
          <input
              :value="search"
              type="text"
              class="field-control"
              :placeholder="t('transactions.searchPlaceholder')"
              @input="emit('update:search', ($event.target as HTMLInputElement).value)"
          >
        </div>

        <div class="field-block">
          <label class="field-label">{{ t('forms.fields.type') }}</label>
          <select
              :value="kindFilter"
              class="field-control"
              @change="emit('update:kind-filter', ($event.target as HTMLSelectElement).value as 'ALL' | TransactionKind)"
          >
            <option value="ALL">{{ t('common.all') }}</option>
            <option value="EXPENSE">{{ kindLabel('EXPENSE') }}</option>
            <option value="INCOME">{{ kindLabel('INCOME') }}</option>
            <option value="TRANSFER">{{ kindLabel('TRANSFER') }}</option>
          </select>
        </div>

        <div class="field-block">
          <label class="field-label">{{ t('forms.fields.account') }}</label>
          <select
              :value="accountFilter"
              class="field-control"
              @change="emit('update:account-filter', ($event.target as HTMLSelectElement).value)"
          >
            <option value="ALL">{{ t('common.all') }}</option>
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
          <select
              :value="categoryFilter"
              class="field-control"
              @change="emit('update:category-filter', ($event.target as HTMLSelectElement).value)"
          >
            <option value="ALL">{{ t('common.allFeminine') }}</option>
            <option value="NONE">{{ t('common.none') }}</option>
            <option
                v-for="category in categories"
                :key="category.id"
                :value="String(category.id)"
            >
              {{ category.name }}
            </option>
          </select>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">{{ t('transactions.fullHistory') }}</p>
          <h3 class="panel-title">{{ t('transactions.filteredTransactions') }}</h3>
        </div>

        <div class="flex items-center gap-2">
          <span class="soft-badge">
            {{ displayTransactions.length }} ligne(s)
          </span>
          <button class="primary-btn" @click="emit('create-transaction')">
            {{ t('common.add') }}
          </button>
        </div>
      </div>

      <div v-if="displayTransactions.length" class="overflow-x-auto">
        <table class="w-full min-w-[1120px]">
          <thead>
          <tr class="table-head">
            <th class="table-cell-head text-left">{{ t('forms.fields.type') }}</th>
            <th class="table-cell-head text-left">{{ t('forms.fields.label') }}</th>
            <th class="table-cell-head text-left">{{ t('forms.fields.account') }}</th>
            <th class="table-cell-head text-left">{{ t('forms.fields.category') }}</th>
            <th class="table-cell-head text-left">{{ t('forms.fields.date') }}</th>
            <th class="table-cell-head text-right">{{ t('forms.fields.amount') }}</th>
            <th class="table-cell-head text-right">{{ t('overview.quickActions') }}</th>
          </tr>
          </thead>

          <tbody>
          <tr
              v-for="transaction in displayTransactions"
              :key="transaction.id"
              class="table-row"
          >
            <td class="table-cell align-top">
              <div class="flex flex-col items-start gap-2">
                  <span
                      class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                      :class="kindPillClass(transaction.kind)"
                  >
                    {{ kindLabel(transaction.kind) }}
                  </span>

                <span
                    v-if="transaction.kind === 'TRANSFER'"
                    class="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/50 dark:text-sky-300"
                >
                    {{ transferDirectionLabel(transaction) }}
                  </span>
              </div>
            </td>

            <td class="table-cell align-top">
              <div class="space-y-1">
                <p class="font-semibold text-slate-800 dark:text-slate-100">
                  {{ transaction.label }}
                </p>

                <p
                    v-if="transaction.kind === 'TRANSFER' && transferRoute(transaction)"
                    class="text-xs font-medium text-sky-600 dark:text-sky-300"
                >
                  {{ transferRoute(transaction) }}
                </p>

                <p
                    v-if="transaction.note"
                    class="text-xs text-slate-500 dark:text-slate-400"
                >
                  {{ transaction.note }}
                </p>
              </div>
            </td>

            <td class="table-cell align-top">
              <div class="space-y-1">
                <p class="font-medium text-slate-800 dark:text-slate-100">
                  {{ transaction.account?.name || '—' }}
                </p>

                <p
                    v-if="accountSubtitle(transaction)"
                    class="text-xs text-slate-500 dark:text-slate-400"
                >
                  {{ accountSubtitle(transaction) }}
                </p>
              </div>
            </td>

            <td class="table-cell align-top">
              <div v-if="transaction.kind === 'TRANSFER'" class="space-y-1">
                  <span
                      class="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/50 dark:text-sky-300">
                    {{ transferCategoryLabel(transaction) }}
                  </span>
              </div>

              <div v-else class="flex items-center gap-2">
                <span class="h-2.5 w-2.5 rounded-full" :style="categoryDotStyle(transaction.category?.color)"/>
                <span>{{ transferCategoryLabel(transaction) }}</span>
              </div>
            </td>

            <td class="table-cell align-top">
              {{ formatDate(transaction.date) }}
            </td>

            <td class="table-cell align-top text-right">
              <div class="space-y-1">
                <p class="font-semibold" :class="amountClass(transaction.kind)">
                  {{ formatMoney(Math.abs(transaction.amount), transaction.account?.currency || 'CAD') }}
                </p>

                <p
                    v-if="transferAmountHint(transaction)"
                    class="text-xs text-slate-500 dark:text-slate-400"
                >
                  {{ transferAmountHint(transaction) }}
                </p>
              </div>
            </td>

            <td class="table-cell align-top">
              <div class="row-actions">
                <button class="mini-action-btn" @click="emit('edit-transaction', transaction)">
                  {{ t('common.update') }}
                </button>
                <button class="mini-danger-btn" @click="emit('delete-transaction', transaction)">
                  {{ t('common.delete') }}
                </button>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="empty-state">
        {{ t('transactions.noResults') }}
      </div>
    </section>
  </section>
</template>