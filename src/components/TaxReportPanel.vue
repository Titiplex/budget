<script setup lang="ts">
import {computed, reactive, ref, watch} from 'vue'
import type {
  Account,
  AccountTaxReportingType,
  TaxIncomeCategory,
  TaxProfile,
  TaxTreatment,
  Transaction,
} from '../types/budget'
import {formatMoney} from '../utils/budgetFormat'
import {toDateOnly} from '../utils/date'
import {buildTaxReport, taxReportToMarkdown} from '../utils/taxReport'

const props = defineProps<{
  accounts: Account[]
  transactions: Transaction[]
  taxProfiles: TaxProfile[]
}>()

const emit = defineEmits<{
  (e: 'refresh-tax-profiles'): void
  (e: 'refresh-data'): void
}>()

const selectedTaxProfileId = ref('')
const savingProfile = ref(false)
const savingAccountId = ref<number | null>(null)
const savingTransactionId = ref<number | null>(null)
const notice = ref<{type: 'success' | 'error'; text: string} | null>(null)

const currentYear = new Date().getFullYear()

const taxProfileForm = reactive({
  year: String(currentYear),
  residenceCountry: 'CA',
  residenceRegion: 'QC',
  currency: 'CAD',
})

const accountForms = reactive<Record<number, {
  institutionCountry: string
  institutionRegion: string
  taxReportingType: AccountTaxReportingType
  openedAt: string
  closedAt: string
}>>({})

const transactionForms = reactive<Record<number, {
  taxCategory: TaxIncomeCategory | ''
  taxSourceCountry: string
  taxSourceRegion: string
  taxTreatment: TaxTreatment
  taxWithheldAmount: string
  taxWithheldCurrency: string
  taxWithheldCountry: string
  taxDocumentRef: string
}>>({})

const accountTaxReportingTypes: AccountTaxReportingType[] = [
  'STANDARD',
  'BANK',
  'CASH',
  'BROKERAGE',
  'CRYPTO',
  'LIFE_INSURANCE',
  'RETIREMENT',
  'LOAN',
  'OTHER',
]

const taxIncomeCategories: TaxIncomeCategory[] = [
  'EMPLOYMENT',
  'BUSINESS',
  'INTEREST',
  'DIVIDEND',
  'CAPITAL_GAIN',
  'RENTAL',
  'PENSION',
  'BENEFIT',
  'GIFT',
  'REFUND',
  'OTHER',
]

const taxTreatments: TaxTreatment[] = [
  'UNKNOWN',
  'NOT_TAXABLE',
  'TAXABLE_NO_WITHHOLDING',
  'TAX_WITHHELD_AT_SOURCE',
  'FOREIGN_TAX_CREDIT_CANDIDATE',
  'TREATY_EXEMPT_CANDIDATE',
  'REVIEW_REQUIRED',
]

function showNotice(type: 'success' | 'error', text: string) {
  notice.value = {type, text}
  window.setTimeout(() => {
    if (notice.value?.text === text) {
      notice.value = null
    }
  }, 3200)
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase()
}

function normalizeOptionalCode(value: string) {
  const normalized = normalizeCode(value)
  return normalized || null
}

function toDateInput(value: string | null | undefined) {
  return value ? toDateOnly(value) : ''
}

function hydrateAccountForms() {
  for (const account of props.accounts) {
    accountForms[account.id] = {
      institutionCountry: account.institutionCountry || '',
      institutionRegion: account.institutionRegion || '',
      taxReportingType: account.taxReportingType || 'STANDARD',
      openedAt: toDateInput(account.openedAt),
      closedAt: toDateInput(account.closedAt),
    }
  }
}

function hydrateTransactionForms() {
  for (const transaction of props.transactions) {
    transactionForms[transaction.id] = {
      taxCategory: transaction.taxCategory || '',
      taxSourceCountry: transaction.taxSourceCountry || '',
      taxSourceRegion: transaction.taxSourceRegion || '',
      taxTreatment: transaction.taxTreatment || 'UNKNOWN',
      taxWithheldAmount: transaction.taxWithheldAmount == null ? '' : String(transaction.taxWithheldAmount),
      taxWithheldCurrency: transaction.taxWithheldCurrency || transaction.sourceCurrency || transaction.account?.currency || '',
      taxWithheldCountry: transaction.taxWithheldCountry || '',
      taxDocumentRef: transaction.taxDocumentRef || '',
    }
  }
}

watch(() => props.accounts, hydrateAccountForms, {immediate: true, deep: true})
watch(() => props.transactions, hydrateTransactionForms, {immediate: true, deep: true})
watch(() => props.taxProfiles, () => {
  if (!selectedTaxProfileId.value && props.taxProfiles.length) {
    selectedTaxProfileId.value = String(props.taxProfiles[0].id)
  }
}, {immediate: true, deep: true})

const selectedTaxProfile = computed(() =>
    props.taxProfiles.find((profile) => String(profile.id) === selectedTaxProfileId.value) || null,
)

const taxReport = computed(() => selectedTaxProfile.value
    ? buildTaxReport(selectedTaxProfile.value, props.accounts, props.transactions)
    : null,
)

const incomeTransactionsForSelectedYear = computed(() => {
  const profile = selectedTaxProfile.value
  if (!profile) return props.transactions.filter((transaction) => transaction.kind === 'INCOME').slice(0, 20)

  return props.transactions
      .filter((transaction) => {
        if (transaction.kind !== 'INCOME') return false
        return new Date(transaction.date).getUTCFullYear() === profile.year
      })
      .slice(0, 50)
})

async function submitTaxProfile() {
  const year = Number(taxProfileForm.year)
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    showNotice('error', "L'année fiscale est invalide.")
    return
  }

  if (!normalizeCode(taxProfileForm.residenceCountry)) {
    showNotice('error', 'Le pays de résidence fiscale est obligatoire.')
    return
  }

  savingProfile.value = true
  try {
    const created = await window.db.taxProfile.create({
      year,
      residenceCountry: normalizeCode(taxProfileForm.residenceCountry),
      residenceRegion: normalizeOptionalCode(taxProfileForm.residenceRegion),
      currency: normalizeCode(taxProfileForm.currency) || 'CAD',
    })
    selectedTaxProfileId.value = String(created.id)
    emit('refresh-tax-profiles')
    showNotice('success', 'Profil fiscal créé.')
  } catch (error) {
    showNotice('error', error instanceof Error ? error.message : 'Création du profil fiscal impossible.')
  } finally {
    savingProfile.value = false
  }
}

async function saveAccountTaxMetadata(account: Account) {
  const form = accountForms[account.id]
  if (!form) return

  savingAccountId.value = account.id
  try {
    await window.db.taxMetadata.updateAccount(account.id, {
      institutionCountry: normalizeOptionalCode(form.institutionCountry),
      institutionRegion: normalizeOptionalCode(form.institutionRegion),
      taxReportingType: form.taxReportingType,
      openedAt: form.openedAt || null,
      closedAt: form.closedAt || null,
    })
    emit('refresh-data')
    showNotice('success', `Métadonnées fiscales enregistrées pour ${account.name}.`)
  } catch (error) {
    showNotice('error', error instanceof Error ? error.message : 'Sauvegarde impossible.')
  } finally {
    savingAccountId.value = null
  }
}

async function saveTransactionTaxMetadata(transaction: Transaction) {
  const form = transactionForms[transaction.id]
  if (!form) return

  const withheldAmount = form.taxWithheldAmount.trim() ? Number(form.taxWithheldAmount) : null
  if (withheldAmount != null && (!Number.isFinite(withheldAmount) || withheldAmount < 0)) {
    showNotice('error', "Le montant d'impôt retenu est invalide.")
    return
  }

  savingTransactionId.value = transaction.id
  try {
    await window.db.taxMetadata.updateTransaction(transaction.id, {
      taxCategory: form.taxCategory || null,
      taxSourceCountry: normalizeOptionalCode(form.taxSourceCountry),
      taxSourceRegion: normalizeOptionalCode(form.taxSourceRegion),
      taxTreatment: form.taxTreatment,
      taxWithheldAmount: withheldAmount,
      taxWithheldCurrency: withheldAmount == null ? null : (normalizeCode(form.taxWithheldCurrency) || transaction.sourceCurrency || transaction.account?.currency || 'CAD'),
      taxWithheldCountry: normalizeOptionalCode(form.taxWithheldCountry),
      taxDocumentRef: form.taxDocumentRef.trim() || null,
    })
    emit('refresh-data')
    showNotice('success', `Métadonnées fiscales enregistrées pour ${transaction.label}.`)
  } catch (error) {
    showNotice('error', error instanceof Error ? error.message : 'Sauvegarde impossible.')
  } finally {
    savingTransactionId.value = null
  }
}

async function exportTaxReport() {
  if (!taxReport.value) {
    showNotice('error', 'Crée ou sélectionne un profil fiscal avant export.')
    return
  }

  const profile = taxReport.value.profile
  const result = await window.file.saveText({
    title: 'Exporter le rapport fiscal',
    defaultPath: `budget-tax-report-${profile.year}-${profile.residenceCountry}${profile.residenceRegion ? `-${profile.residenceRegion}` : ''}.md`,
    content: taxReportToMarkdown(taxReport.value),
    filters: [{name: 'Markdown', extensions: ['md']}],
  })

  if (!result?.canceled) {
    showNotice('success', 'Rapport fiscal exporté.')
  }
}
</script>

<template>
  <section class="panel p-6">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p class="soft-kicker">Fiscalité</p>
        <h3 class="mt-2 text-xl font-bold text-slate-900 dark:text-white">
          Rapport déclaratif France / Canada / Québec
        </h3>
        <p class="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Ce module ne calcule pas l'impôt final. Il identifie les comptes, revenus, retenues à la source et formulaires à vérifier.
        </p>
      </div>

      <button class="primary-btn" :disabled="!taxReport" @click="exportTaxReport">
        Export fiscal Markdown
      </button>
    </div>

    <div v-if="notice" class="mt-4 notice" :class="notice.type === 'success' ? 'notice-success' : 'notice-error'">
      {{ notice.text }}
    </div>

    <div class="mt-6 grid gap-5 xl:grid-cols-12">
      <section class="mini-card xl:col-span-5">
        <p class="mini-label">Profil fiscal annuel</p>

        <div v-if="taxProfiles.length" class="mt-4 field-block">
          <label class="field-label">Profil utilisé pour le rapport</label>
          <select v-model="selectedTaxProfileId" class="field-control">
            <option v-for="profile in taxProfiles" :key="profile.id" :value="String(profile.id)">
              {{ profile.year }} · {{ profile.residenceCountry }}{{ profile.residenceRegion ? `-${profile.residenceRegion}` : '' }} · {{ profile.currency }}
            </option>
          </select>
        </div>

        <form class="mt-5 grid gap-4 md:grid-cols-2" @submit.prevent="submitTaxProfile">
          <label class="field-block">
            <span class="field-label">Année</span>
            <input v-model="taxProfileForm.year" type="number" min="1900" max="2200" class="field-control">
          </label>

          <label class="field-block">
            <span class="field-label">Devise</span>
            <input v-model="taxProfileForm.currency" type="text" maxlength="6" class="field-control" placeholder="CAD">
          </label>

          <label class="field-block">
            <span class="field-label">Pays résidence</span>
            <select v-model="taxProfileForm.residenceCountry" class="field-control">
              <option value="FR">France</option>
              <option value="CA">Canada</option>
            </select>
          </label>

          <label class="field-block">
            <span class="field-label">Région / province</span>
            <input v-model="taxProfileForm.residenceRegion" type="text" maxlength="12" class="field-control" placeholder="QC">
          </label>

          <div class="md:col-span-2">
            <button class="ghost-btn" type="submit" :disabled="savingProfile">
              {{ savingProfile ? 'Création…' : 'Créer le profil fiscal' }}
            </button>
          </div>
        </form>
      </section>

      <section class="mini-card xl:col-span-7">
        <p class="mini-label">Synthèse</p>

        <div v-if="taxReport" class="mt-4 grid gap-3 md:grid-cols-3">
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p class="text-xs text-slate-500 dark:text-slate-400">Sections</p>
            <p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{{ taxReport.sections.length }}</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p class="text-xs text-slate-500 dark:text-slate-400">Éléments à revoir</p>
            <p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {{ taxReport.sections.reduce((sum, section) => sum + section.items.length, 0) }}
            </p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p class="text-xs text-slate-500 dark:text-slate-400">Résidence</p>
            <p class="mt-2 text-lg font-bold text-slate-900 dark:text-white">
              {{ taxReport.profile.residenceCountry }}{{ taxReport.profile.residenceRegion ? `-${taxReport.profile.residenceRegion}` : '' }}
            </p>
          </div>
        </div>

        <div v-if="taxReport" class="mt-5 space-y-3">
          <div
              v-for="section in taxReport.sections"
              :key="`${section.jurisdiction}-${section.title}`"
              class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h4 class="font-semibold text-slate-900 dark:text-white">
                [{{ section.jurisdiction }}] {{ section.title }}
              </h4>
              <span class="soft-badge">{{ section.severity }}</span>
            </div>
            <ul class="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <li v-for="item in section.items" :key="`${item.entityType}-${item.entityId}-${item.label}`">
                <strong>{{ item.label }}</strong>
                <span v-if="item.amount != null"> · {{ formatMoney(item.amount, item.currency || taxReport.profile.currency) }}</span>
                <br>
                {{ item.explanation }}
                <br>
                <span class="text-xs text-slate-500 dark:text-slate-400">
                  À vérifier : {{ item.suggestedForms.join(', ') }} · confiance {{ item.confidence }}
                </span>
              </li>
            </ul>
          </div>

          <div v-if="!taxReport.sections.length" class="empty-state">
            Aucun signal fiscal détecté avec les règles configurées.
          </div>
        </div>

        <div v-else class="mt-4 empty-state">
          Crée un profil fiscal pour générer le rapport.
        </div>
      </section>
    </div>

    <section class="mt-6">
      <div class="panel-header !px-0">
        <div>
          <p class="panel-eyebrow">Comptes</p>
          <h4 class="panel-title">Pays, province et nature fiscale</h4>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[960px]">
          <thead>
          <tr class="table-head">
            <th class="table-cell-head text-left">Compte</th>
            <th class="table-cell-head text-left">Pays</th>
            <th class="table-cell-head text-left">Région</th>
            <th class="table-cell-head text-left">Nature fiscale</th>
            <th class="table-cell-head text-left">Ouverture</th>
            <th class="table-cell-head text-left">Fermeture</th>
            <th class="table-cell-head text-right">Action</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="account in accounts" :key="account.id" class="table-row">
            <td class="table-cell font-medium">{{ account.name }}</td>
            <td class="table-cell"><input v-model="accountForms[account.id].institutionCountry" class="field-control" maxlength="12" placeholder="FR / CA / US"></td>
            <td class="table-cell"><input v-model="accountForms[account.id].institutionRegion" class="field-control" maxlength="12" placeholder="QC"></td>
            <td class="table-cell">
              <select v-model="accountForms[account.id].taxReportingType" class="field-control">
                <option v-for="type in accountTaxReportingTypes" :key="type" :value="type">{{ type }}</option>
              </select>
            </td>
            <td class="table-cell"><input v-model="accountForms[account.id].openedAt" type="date" class="field-control"></td>
            <td class="table-cell"><input v-model="accountForms[account.id].closedAt" type="date" class="field-control"></td>
            <td class="table-cell text-right">
              <button class="ghost-btn" :disabled="savingAccountId === account.id" @click="saveAccountTaxMetadata(account)">
                {{ savingAccountId === account.id ? '...' : 'Sauver' }}
              </button>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="mt-6">
      <div class="panel-header !px-0">
        <div>
          <p class="panel-eyebrow">Rentrées d'argent</p>
          <h4 class="panel-title">Source, retenue à la source et justificatifs</h4>
        </div>
      </div>

      <div v-if="incomeTransactionsForSelectedYear.length" class="overflow-x-auto">
        <table class="w-full min-w-[1180px]">
          <thead>
          <tr class="table-head">
            <th class="table-cell-head text-left">Transaction</th>
            <th class="table-cell-head text-left">Catégorie fiscale</th>
            <th class="table-cell-head text-left">Pays source</th>
            <th class="table-cell-head text-left">Région source</th>
            <th class="table-cell-head text-left">Traitement</th>
            <th class="table-cell-head text-left">Impôt retenu</th>
            <th class="table-cell-head text-left">Devise</th>
            <th class="table-cell-head text-left">Pays retenue</th>
            <th class="table-cell-head text-left">Doc</th>
            <th class="table-cell-head text-right">Action</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="transaction in incomeTransactionsForSelectedYear" :key="transaction.id" class="table-row">
            <td class="table-cell">
              <div class="font-medium">{{ transaction.label }}</div>
              <div class="text-xs text-slate-500">{{ toDateOnly(transaction.date) }} · {{ formatMoney(Math.abs(transaction.sourceAmount ?? transaction.amount), transaction.sourceCurrency || transaction.account?.currency || 'CAD') }}</div>
            </td>
            <td class="table-cell">
              <select v-model="transactionForms[transaction.id].taxCategory" class="field-control">
                <option value="">—</option>
                <option v-for="category in taxIncomeCategories" :key="category" :value="category">{{ category }}</option>
              </select>
            </td>
            <td class="table-cell"><input v-model="transactionForms[transaction.id].taxSourceCountry" class="field-control" maxlength="12" placeholder="FR / CA / US"></td>
            <td class="table-cell"><input v-model="transactionForms[transaction.id].taxSourceRegion" class="field-control" maxlength="12" placeholder="QC"></td>
            <td class="table-cell">
              <select v-model="transactionForms[transaction.id].taxTreatment" class="field-control">
                <option v-for="treatment in taxTreatments" :key="treatment" :value="treatment">{{ treatment }}</option>
              </select>
            </td>
            <td class="table-cell"><input v-model="transactionForms[transaction.id].taxWithheldAmount" type="number" min="0" step="0.01" class="field-control" placeholder="0.00"></td>
            <td class="table-cell"><input v-model="transactionForms[transaction.id].taxWithheldCurrency" class="field-control" maxlength="6" placeholder="CAD"></td>
            <td class="table-cell"><input v-model="transactionForms[transaction.id].taxWithheldCountry" class="field-control" maxlength="12" placeholder="CA"></td>
            <td class="table-cell"><input v-model="transactionForms[transaction.id].taxDocumentRef" class="field-control" placeholder="T4/RL-1/IFU..."></td>
            <td class="table-cell text-right">
              <button class="ghost-btn" :disabled="savingTransactionId === transaction.id" @click="saveTransactionTaxMetadata(transaction)">
                {{ savingTransactionId === transaction.id ? '...' : 'Sauver' }}
              </button>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="empty-state">
        Aucune rentrée d'argent pour l'année fiscale sélectionnée.
      </div>
    </section>
  </section>
</template>
