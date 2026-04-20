<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import type {AccountSummary} from '../types/budget'
import {accountTypeLabel, formatMoney} from '../utils/budgetFormat'

defineProps<{
  accountSummaries: AccountSummary[]
}>()

const emit = defineEmits<{
  (e: 'create-account'): void
  (e: 'edit-account', account: AccountSummary): void
  (e: 'delete-account', account: AccountSummary): void
}>()

const {t} = useI18n()
</script>

<template>
  <section class="space-y-6">
    <div class="flex items-center justify-end">
      <button class="primary-btn" @click="emit('create-account')">
        {{ t('accounts.addAccount') }}
      </button>
    </div>

    <div v-if="accountSummaries.length" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <article
          v-for="account in accountSummaries"
          :key="account.id"
          class="panel p-6"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
              {{ accountTypeLabel(account.type) }}
            </p>
            <h3 class="mt-2 text-xl font-bold text-slate-900 dark:text-white">
              {{ account.name }}
            </h3>
          </div>

          <div class="card-toolbar">
            <button class="mini-action-btn" @click="emit('edit-account', account)">
              {{ t('common.update') }}
            </button>
            <button class="mini-danger-btn" @click="emit('delete-account', account)">
              {{ t('common.delete') }}
            </button>
          </div>
        </div>

        <div class="mt-3 flex items-center justify-between gap-3">
          <p class="text-sm text-slate-500 dark:text-slate-400">
            {{ account.description || t('accounts.noDescription') }}
          </p>

          <span class="soft-badge">
            {{ account.currency }}
          </span>
        </div>

        <div class="mt-6 grid grid-cols-2 gap-3">
          <div class="mini-card">
            <p class="mini-label">{{ t('accounts.income') }}</p>
            <p class="mini-value text-emerald-600 dark:text-emerald-400">
              {{ formatMoney(account.income, account.currency) }}
            </p>
          </div>

          <div class="mini-card">
            <p class="mini-label">{{ t('accounts.expense') }}</p>
            <p class="mini-value text-rose-600 dark:text-rose-400">
              {{ formatMoney(account.expense, account.currency) }}
            </p>
          </div>

          <div class="mini-card col-span-2">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="mini-label">{{ t('accounts.net') }}</p>
                <p
                    class="mini-value"
                    :class="account.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
                >
                  {{ formatMoney(account.net, account.currency) }}
                </p>
              </div>

              <span class="soft-badge">
                {{ account.transactionCount }} tx
              </span>
            </div>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="panel empty-state">
      {{ t('accounts.empty') }}
    </div>
  </section>
</template>