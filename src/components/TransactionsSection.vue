<script setup lang="ts">
import type {Account, Category, Transaction, TransactionKind} from '../types/budget'
import {
  amountClass,
  categoryDotStyle,
  formatDate,
  formatMoney,
  kindLabel,
  kindPillClass,
} from '../utils/budgetFormat'

defineProps<{
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
</script>

<template>
  <section class="space-y-6">
    <section class="panel p-6">
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div class="field-block xl:col-span-2">
          <label class="field-label">Recherche</label>
          <input
              :value="search"
              type="text"
              class="field-control"
              placeholder="Libellé, compte, catégorie, note..."
              @input="emit('update:search', ($event.target as HTMLInputElement).value)"
          >
        </div>

        <div class="field-block">
          <label class="field-label">Type</label>
          <select
              :value="kindFilter"
              class="field-control"
              @change="emit('update:kind-filter', ($event.target as HTMLSelectElement).value as 'ALL' | TransactionKind)"
          >
            <option value="ALL">Tous</option>
            <option value="EXPENSE">Dépense</option>
            <option value="INCOME">Revenu</option>
            <option value="TRANSFER">Transfert</option>
          </select>
        </div>

        <div class="field-block">
          <label class="field-label">Compte</label>
          <select
              :value="accountFilter"
              class="field-control"
              @change="emit('update:account-filter', ($event.target as HTMLSelectElement).value)"
          >
            <option value="ALL">Tous</option>
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
          <select
              :value="categoryFilter"
              class="field-control"
              @change="emit('update:category-filter', ($event.target as HTMLSelectElement).value)"
          >
            <option value="ALL">Toutes</option>
            <option value="NONE">Sans catégorie</option>
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
          <p class="panel-eyebrow">Historique complet</p>
          <h3 class="panel-title">Transactions filtrées</h3>
        </div>

        <div class="flex items-center gap-2">
          <span class="soft-badge">
            {{ filteredTransactions.length }} ligne(s)
          </span>
          <button class="primary-btn" @click="emit('create-transaction')">
            Ajouter
          </button>
        </div>
      </div>

      <div v-if="filteredTransactions.length" class="overflow-x-auto">
        <table class="w-full min-w-[1020px]">
          <thead>
          <tr class="table-head">
            <th class="table-cell-head text-left">Type</th>
            <th class="table-cell-head text-left">Libellé</th>
            <th class="table-cell-head text-left">Compte</th>
            <th class="table-cell-head text-left">Catégorie</th>
            <th class="table-cell-head text-left">Date</th>
            <th class="table-cell-head text-right">Montant</th>
            <th class="table-cell-head text-right">Actions</th>
          </tr>
          </thead>
          <tbody>
          <tr
              v-for="transaction in filteredTransactions"
              :key="transaction.id"
              class="table-row"
          >
            <td class="table-cell">
                <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                      :class="kindPillClass(transaction.kind)">
                  {{ kindLabel(transaction.kind) }}
                </span>
            </td>

            <td class="table-cell">
              <div>
                <p class="font-semibold text-slate-800 dark:text-slate-100">
                  {{ transaction.label }}
                </p>
                <p v-if="transaction.note" class="text-xs text-slate-500 dark:text-slate-400">
                  {{ transaction.note }}
                </p>
              </div>
            </td>

            <td class="table-cell">
              {{ transaction.account?.name || '—' }}
            </td>

            <td class="table-cell">
              <div class="flex items-center gap-2">
                <span class="h-2.5 w-2.5 rounded-full" :style="categoryDotStyle(transaction.category?.color)"/>
                <span>{{ transaction.category?.name || 'Sans catégorie' }}</span>
              </div>
            </td>

            <td class="table-cell">
              {{ formatDate(transaction.date) }}
            </td>

            <td class="table-cell text-right font-semibold" :class="amountClass(transaction.kind)">
              {{ formatMoney(Math.abs(transaction.amount), transaction.account?.currency || 'CAD') }}
            </td>

            <td class="table-cell">
              <div class="row-actions">
                <button class="mini-action-btn" @click="emit('edit-transaction', transaction)">
                  Modifier
                </button>
                <button class="mini-danger-btn" @click="emit('delete-transaction', transaction)">
                  Supprimer
                </button>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="empty-state">
        Aucun résultat avec les filtres actuels.
      </div>
    </section>
  </section>
</template>