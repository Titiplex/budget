<script setup lang="ts">
import {computed, reactive, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {
  Account,
  AccountTaxReportingType,
  TaxIncomeCategory,
  TaxProfile,
  TaxReportItem,
  TaxReportSection,
  TaxTreatment,
  Transaction,
} from '../types/budget'
import {formatMoney} from '../utils/budgetFormat'
import {toDateOnly} from '../utils/date'
import {
  buildTaxReport,
  getApplicableTaxRuleSets,
  getTaxResidenceOption,
  SUPPORTED_TAX_RESIDENCES,
  taxReportToMarkdown,
  taxResidenceKey,
} from '../utils/taxReport'

const props = defineProps<{
  accounts: Account[]
  transactions: Transaction[]
  taxProfiles: TaxProfile[]
}>()

const emit = defineEmits<{
  (e: 'refresh-tax-profiles'): void
  (e: 'refresh-data'): void
}>()

const {t} = useI18n()

const selectedTaxProfileId = ref('')
const savingProfile = ref(false)
const savingAccountId = ref<number | null>(null)
const savingTransactionId = ref<number | null>(null)
const notice = ref<{type: 'success' | 'error'; text: string} | null>(null)

const currentYear = new Date().getFullYear()

const taxProfileForm = reactive({
  year: String(currentYear),
  residenceKey: 'CA-QC',
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

const residenceOptions = computed(() => SUPPORTED_TAX_RESIDENCES.map((option) => ({
  ...option,
  key: taxResidenceKey(option.country, option.region),
  label: t(option.labelKey),
})))

const selectedResidenceOption = computed(() =>
    residenceOptions.value.find((option) => option.key === taxProfileForm.residenceKey) || residenceOptions.value[0],
)

watch(() => taxProfileForm.residenceKey, () => {
  const option = selectedResidenceOption.value
  if (option?.currency) {
    taxProfileForm.currency = option.currency
  }
})

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

function optionLabel(scope: 'accountTaxType' | 'incomeCategory' | 'treatment', value: string) {
  return t(`tax.options.${scope}.${value}`)
}

function sectionTitle(section: TaxReportSection) {
  return section.titleKey ? t(section.titleKey) : section.title
}

function itemExplanation(item: TaxReportItem) {
  return item.explanationKey ? t(item.explanationKey, item.explanationValues ?? {}) : item.explanation
}

function severityLabel(value: TaxReportSection['severity']) {
  return t(`tax.severity.${value}`)
}

function confidenceLabel(value: TaxReportItem['confidence']) {
  return t(`tax.confidence.${value}`)
}

function jurisdictionLabel(jurisdiction: string) {
  const ruleSet = getApplicableTaxRuleSets(selectedTaxProfile.value || {
    id: 0,
    year: currentYear,
    residenceCountry: jurisdiction,
    residenceRegion: null,
    currency: taxProfileForm.currency,
  }).find((candidate) => candidate.jurisdiction === jurisdiction)

  return ruleSet ? t(ruleSet.labelKey) : jurisdiction
}

function residenceLabel(profile: TaxProfile) {
  const option = getTaxResidenceOption(profile.residenceCountry, profile.residenceRegion)
  if (option) return t(option.labelKey)
  return `${profile.residenceCountry}${profile.residenceRegion ? `-${profile.residenceRegion}` : ''}`
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

const reportItemCount = computed(() => taxReport.value?.sections.reduce((sum, section) => sum + section.items.length, 0) ?? 0)

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
    showNotice('error', t('tax.errors.invalidYear'))
    return
  }

  const residence = selectedResidenceOption.value
  if (!residence?.country) {
    showNotice('error', t('tax.errors.missingResidence'))
    return
  }

  savingProfile.value = true
  try {
    const created = await window.db.taxProfile.create({
      year,
      residenceCountry: residence.country,
      residenceRegion: residence.region,
      currency: normalizeCode(taxProfileForm.currency) || residence.currency,
    })
    selectedTaxProfileId.value = String(created.id)
    emit('refresh-tax-profiles')
    showNotice('success', t('tax.success.profileCreated'))
  } catch (error) {
    showNotice('error', error instanceof Error ? error.message : t('tax.errors.profileCreateFailed'))
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
    showNotice('success', t('tax.success.accountSaved', {name: account.name}))
  } catch (error) {
    showNotice('error', error instanceof Error ? error.message : t('tax.errors.saveFailed'))
  } finally {
    savingAccountId.value = null
  }
}

async function saveTransactionTaxMetadata(transaction: Transaction) {
  const form = transactionForms[transaction.id]
  if (!form) return

  const withheldAmount = form.taxWithheldAmount.trim() ? Number(form.taxWithheldAmount) : null
  if (withheldAmount != null && (!Number.isFinite(withheldAmount) || withheldAmount < 0)) {
    showNotice('error', t('tax.errors.invalidWithheldAmount'))
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
    showNotice('success', t('tax.success.transactionSaved', {label: transaction.label}))
  } catch (error) {
    showNotice('error', error instanceof Error ? error.message : t('tax.errors.saveFailed'))
  } finally {
    savingTransactionId.value = null
  }
}

async function exportTaxReport() {
  if (!taxReport.value) {
    showNotice('error', t('tax.errors.profileRequiredForExport'))
    return
  }

  const profile = taxReport.value.profile
  const result = await window.file.saveText({
    title: t('tax.exportDialogTitle'),
    defaultPath: `budget-tax-report-${profile.year}-${profile.residenceCountry}${profile.residenceRegion ? `-${profile.residenceRegion}` : ''}.md`,
    content: taxReportToMarkdown(taxReport.value),
    filters: [{name: 'Markdown', extensions: ['md']}],
  })

  if (!result?.canceled) {
    showNotice('success', t('tax.success.exported'))
  }
}
</script>

<template>
  <section class="panel p-6">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p class="soft-kicker">{{ t('tax.kicker') }}</p>
        <h3 class="mt-2 text-xl font-bold text-slate-900 dark:text-white">
          {{ t('tax.title') }}
        </h3>
        <p class="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          {{ t('tax.description') }}
        </p>
      </div>

      <button class="primary-btn" :disabled="!taxReport" @click="exportTaxReport">
        {{ t('tax.exportMarkdown') }}
      </button>
    </div>

    <div v-if="notice" class="mt-4 notice" :class="notice.type === 'success' ? 'notice-success' : 'notice-error'">
      {{ notice.text }}
    </div>

    <div class="mt-6 grid gap-5 xl:grid-cols-12">
      <section class="mini-card xl:col-span-5">
        <p class="mini-label">{{ t('tax.profile.title') }}</p>

        <div v-if="taxProfiles.length" class="mt-4 field-block">
          <label class="field-label">{{ t('tax.profile.reportProfile') }}</label>
          <select v-model="selectedTaxProfileId" class="field-control">
            <option v-for="profile in taxProfiles" :key="profile.id" :value="String(profile.id)">
              {{ profile.year }} · {{ residenceLabel(profile) }} · {{ profile.currency }}
            </option>
          </select>
        </div>

        <form class="mt-5 grid gap-4 md:grid-cols-2" @submit.prevent="submitTaxProfile">
          <label class="field-block">
            <span class="field-label">{{ t('tax.profile.year') }}</span>
            <input v-model="taxProfileForm.year" type="number" min="1900" max="2200" class="field-control">
          </label>

          <label class="field-block">
            <span class="field-label">{{ t('tax.profile.currency') }}</span>
            <input v-model="taxProfileForm.currency" type="text" maxlength="6" class="field-control" placeholder="CAD">
          </label>

          <label class="field-block md:col-span-2">
            <span class="field-label">{{ t('tax.profile.residence') }}</span>
            <select v-model="taxProfileForm.residenceKey" class="field-control">
              <option v-for="option in residenceOptions" :key="option.key" :value="option.key">
                {{ option.label }}
              </option>
            </select>
          </label>

          <div class="md:col-span-2">
            <button class="ghost-btn" type="submit" :disabled="savingProfile">
              {{ savingProfile ? t('tax.profile.creating') : t('tax.profile.create') }}
            </button>
          </div>
        </form>
      </section>

      <section class="mini-card xl:col-span-7">
        <p class="mini-label">{{ t('tax.summary.title') }}</p>

        <div v-if="taxReport" class="mt-4 grid gap-3 md:grid-cols-3">
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p class="text-xs text-slate-500 dark:text-slate-400">{{ t('tax.summary.sections') }}</p>
            <p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{{ taxReport.sections.length }}</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p class="text-xs text-slate-500 dark:text-slate-400">{{ t('tax.summary.itemsToReview') }}</p>
            <p class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {{ reportItemCount }}
            </p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p class="text-xs text-slate-500 dark:text-slate-400">{{ t('tax.summary.residence') }}</p>
            <p class="mt-2 text-lg font-bold text-slate-900 dark:text-white">
              {{ residenceLabel(taxReport.profile) }}
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
                [{{ jurisdictionLabel(section.jurisdiction) }}] {{ sectionTitle(section) }}
              </h4>
              <span class="soft-badge">{{ severityLabel(section.severity) }}</span>
            </div>
            <ul class="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <li v-for="entry in section.items" :key="`${entry.entityType}-${entry.entityId}-${entry.label}`">
                <strong>{{ entry.label }}</strong>
                <span v-if="entry.amount != null"> · {{ formatMoney(entry.amount, entry.currency || taxReport.profile.currency) }}</span>
                <br>
                {{ itemExplanation(entry) }}
                <br>
                <span class="text-xs text-slate-500 dark:text-slate-400">
                  {{ t('tax.report.verify') }} {{ entry.suggestedForms.join(', ') }} · {{ t('tax.report.confidence') }} {{ confidenceLabel(entry.confidence) }}
                </span>
              </li>
            </ul>
          </div>

          <div v-if="!taxReport.sections.length" class="empty-state">
            {{ t('tax.report.noSignal') }}
          </div>
        </div>

        <div v-else class="mt-4 empty-state">
          {{ t('tax.report.createProfileFirst') }}
        </div>
      </section>
    </div>

    <section class="mt-6">
      <div class="panel-header !px-0">
        <div>
          <p class="panel-eyebrow">{{ t('tax.accounts.eyebrow') }}</p>
          <h4 class="panel-title">{{ t('tax.accounts.title') }}</h4>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[960px]">
          <thead>
          <tr class="table-head">
            <th class="table-cell-head text-left">{{ t('tax.accounts.account') }}</th>
            <th class="table-cell-head text-left">{{ t('tax.accounts.country') }}</th>
            <th class="table-cell-head text-left">{{ t('tax.accounts.region') }}</th>
            <th class="table-cell-head text-left">{{ t('tax.accounts.taxNature') }}</th>
            <th class="table-cell-head text-left">{{ t('tax.accounts.openedAt') }}</th>
            <th class="table-cell-head text-left">{{ t('tax.accounts.closedAt') }}</th>
            <th class="table-cell-head text-right">{{ t('tax.accounts.action') }}</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="account in accounts" :key="account.id" class="table-row">
            <td class="table-cell font-medium">{{ account.name }}</td>
            <td class="table-cell"><input v-model="accountForms[account.id].institutionCountry" class="field-control" maxlength="12" :placeholder="t('tax.placeholders.country')"></td>
            <td class="table-cell"><input v-model="accountForms[account.id].institutionRegion" class="field-control" maxlength="12" :placeholder="t('tax.placeholders.region')"></td>
            <td class="table-cell">
              <select v-model="accountForms[account.id].taxReportingType" class="field-control">
                <option v-for="type in accountTaxReportingTypes" :key="type" :value="type">{{ optionLabel('accountTaxType', type) }}</option>
              </select>
            </td>
            <td class="table-cell"><input v-model="accountForms[account.id].openedAt" type="date" class="field-control"></td>
            <td class="table-cell"><input v-model="accountForms[account.id].closedAt" type="date" class="field-control"></td>
            <td class="table-cell text-right">
              <button class="ghost-btn" :disabled="savingAccountId === account.id" @click="saveAccountTaxMetadata(account)">
                {{ savingAccountId === account.id ? '...' : t('common.save') }}
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
          <p class="panel-eyebrow">{{ t('tax.income.eyebrow') }}</p>
          <h4 class="panel-title">{{ t('tax.income.title') }}</h4>
        </div>
      </div>

      <div v-if="incomeTransactionsForSelectedYear.length" class="overflow-x-auto">
        <table class="w-full min-w-[1180px]">
          <thead>
          <tr class="table-head">
            <th class="table-cell-head text-left">{{ t('tax.income.transaction') }}</th>
            <th class="table-cell-head text-left">{{ t('tax.income.category') }}</th>
            <th class="table-cell-head text-left">{{ t('tax.income.sourceCountry') }}</th>
            <th class="table-cell-head text-left">{{ t('tax.income.sourceRegion') }}</th>
            <th class="table-cell-head text-left">{{ t('tax.income.treatment') }}</th>
            <th class="table-cell-head text-left">{{ t('tax.income.withheldAmount') }}</th>
            <th class="table-cell-head text-left">{{ t('tax.income.currency') }}</th>
            <th class="table-cell-head text-left">{{ t('tax.income.withheldCountry') }}</th>
            <th class="table-cell-head text-left">{{ t('tax.income.document') }}</th>
            <th class="table-cell-head text-right">{{ t('tax.income.action') }}</th>
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
                <option v-for="category in taxIncomeCategories" :key="category" :value="category">{{ optionLabel('incomeCategory', category) }}</option>
              </select>
            </td>
            <td class="table-cell"><input v-model="transactionForms[transaction.id].taxSourceCountry" class="field-control" maxlength="12" :placeholder="t('tax.placeholders.country')"></td>
            <td class="table-cell"><input v-model="transactionForms[transaction.id].taxSourceRegion" class="field-control" maxlength="12" :placeholder="t('tax.placeholders.region')"></td>
            <td class="table-cell">
              <select v-model="transactionForms[transaction.id].taxTreatment" class="field-control">
                <option v-for="treatment in taxTreatments" :key="treatment" :value="treatment">{{ optionLabel('treatment', treatment) }}</option>
              </select>
            </td>
            <td class="table-cell"><input v-model="transactionForms[transaction.id].taxWithheldAmount" type="number" min="0" step="0.01" class="field-control" placeholder="0.00"></td>
            <td class="table-cell"><input v-model="transactionForms[transaction.id].taxWithheldCurrency" class="field-control" maxlength="6" placeholder="CAD"></td>
            <td class="table-cell"><input v-model="transactionForms[transaction.id].taxWithheldCountry" class="field-control" maxlength="12" :placeholder="t('tax.placeholders.withheldCountry')"></td>
            <td class="table-cell"><input v-model="transactionForms[transaction.id].taxDocumentRef" class="field-control" :placeholder="t('tax.placeholders.document')"></td>
            <td class="table-cell text-right">
              <button class="ghost-btn" :disabled="savingTransactionId === transaction.id" @click="saveTransactionTaxMetadata(transaction)">
                {{ savingTransactionId === transaction.id ? '...' : t('common.save') }}
              </button>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="empty-state">
        {{ t('tax.income.empty') }}
      </div>
    </section>
  </section>
</template>
