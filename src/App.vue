<script setup lang="ts">
import {computed, onMounted, reactive, ref} from 'vue'

type SectionKey = 'overview' | 'transactions' | 'accounts' | 'categories'
type CreateTabKey = 'transaction' | 'account' | 'category'
type TransactionKind = 'INCOME' | 'EXPENSE' | 'TRANSFER'
type AccountType = 'CASH' | 'BANK' | 'SAVINGS' | 'CREDIT' | 'INVESTMENT' | 'OTHER'

interface Account {
  id: number
  name: string
  type: AccountType
  currency: string
  description: string | null
}

interface Category {
  id: number
  name: string
  kind: TransactionKind
  color: string | null
  description: string | null
}

interface Transaction {
  id: number
  label: string
  amount: number
  kind: TransactionKind
  date: string
  note: string | null
  accountId: number
  categoryId: number | null
  account?: Account | null
  category?: Category | null
}

const navigation = [
  {key: 'overview' as SectionKey, label: 'Vue d’ensemble', marker: 'OV', hint: 'KPI et activité'},
  {key: 'transactions' as SectionKey, label: 'Transactions', marker: 'TX', hint: 'Filtres et historique'},
  {key: 'accounts' as SectionKey, label: 'Comptes', marker: 'AC', hint: 'Sources de flux'},
  {key: 'categories' as SectionKey, label: 'Catégories', marker: 'CA', hint: 'Classement et volume'},
]

const sectionMeta: Record<SectionKey, { title: string; description: string }> = {
  overview: {
    title: 'Dashboard',
    description: 'Vue synthétique du budget, des flux et des dernières opérations.',
  },
  transactions: {
    title: 'Transactions',
    description: 'Recherche, filtres et historique des mouvements.',
  },
  accounts: {
    title: 'Comptes',
    description: 'Vue consolidée des comptes et de leur activité.',
  },
  categories: {
    title: 'Catégories',
    description: 'Regroupement des flux par nature de dépense ou revenu.',
  },
}

const accountTypeOptions: AccountType[] = [
  'BANK',
  'CASH',
  'SAVINGS',
  'CREDIT',
  'INVESTMENT',
  'OTHER',
]

const transactionKindOptions: TransactionKind[] = [
  'EXPENSE',
  'INCOME',
  'TRANSFER',
]

const accounts = ref<Account[]>([])
const categories = ref<Category[]>([])
const transactions = ref<Transaction[]>([])

const loading = ref(true)
const saving = ref(false)
const sidebarOpen = ref(false)
const createPanelOpen = ref(false)
const darkMode = ref(true)
const activeSection = ref<SectionKey>('overview')
const createTab = ref<CreateTabKey>('transaction')

const notice = ref<{ type: 'success' | 'error'; text: string } | null>(null)

const transactionSearch = ref('')
const transactionKindFilter = ref<'ALL' | TransactionKind>('ALL')
const transactionAccountFilter = ref('ALL')
const transactionCategoryFilter = ref('ALL')

const accountForm = reactive({
  name: '',
  type: 'BANK' as AccountType,
  currency: 'CAD',
  description: '',
})

const categoryForm = reactive({
  name: '',
  kind: 'EXPENSE' as TransactionKind,
  color: '#8b5cf6',
  description: '',
})

const transactionForm = reactive({
  label: '',
  amount: '',
  kind: 'EXPENSE' as TransactionKind,
  date: new Date().toISOString().slice(0, 10),
  note: '',
  accountId: '',
  categoryId: '',
})

function db() {
  return (window as Window & { db: any }).db
}

function showNotice(type: 'success' | 'error', text: string) {
  notice.value = {type, text}
  window.setTimeout(() => {
    if (notice.value?.text === text) {
      notice.value = null
    }
  }, 3200)
}

function normalizeError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Une erreur inconnue est survenue.'
}

function applyTheme() {
  document.documentElement.classList.toggle('dark', darkMode.value)
  localStorage.setItem('budget-theme', darkMode.value ? 'dark' : 'light')
}

function toggleTheme() {
  darkMode.value = !darkMode.value
  applyTheme()
}

function formatMoney(amount: number, currency = 'CAD') {
  try {
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency',
      currency: 'CAD',
      maximumFractionDigits: 2,
    }).format(amount)
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-CA', {dateStyle: 'medium'}).format(new Date(value))
}

function kindLabel(kind: TransactionKind) {
  if (kind === 'INCOME') return 'Revenu'
  if (kind === 'EXPENSE') return 'Dépense'
  return 'Transfert'
}

function accountTypeLabel(type: AccountType) {
  if (type === 'BANK') return 'Banque'
  if (type === 'CASH') return 'Espèces'
  if (type === 'SAVINGS') return 'Épargne'
  if (type === 'CREDIT') return 'Crédit'
  if (type === 'INVESTMENT') return 'Investissement'
  return 'Autre'
}

function kindPillClass(kind: TransactionKind) {
  if (kind === 'INCOME') {
    return 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300'
  }
  if (kind === 'EXPENSE') {
    return 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300'
  }
  return 'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/50 dark:text-sky-300'
}

function amountClass(kind: TransactionKind) {
  if (kind === 'INCOME') return 'text-emerald-600 dark:text-emerald-400'
  if (kind === 'EXPENSE') return 'text-rose-600 dark:text-rose-400'
  return 'text-sky-600 dark:text-sky-400'
}

function categoryDotStyle(color: string | null | undefined) {
  return {backgroundColor: color || '#94a3b8'}
}

function resetAccountForm() {
  accountForm.name = ''
  accountForm.type = 'BANK'
  accountForm.currency = 'CAD'
  accountForm.description = ''
}

function resetCategoryForm() {
  categoryForm.name = ''
  categoryForm.kind = 'EXPENSE'
  categoryForm.color = '#8b5cf6'
  categoryForm.description = ''
}

function resetTransactionForm() {
  transactionForm.label = ''
  transactionForm.amount = ''
  transactionForm.kind = 'EXPENSE'
  transactionForm.date = new Date().toISOString().slice(0, 10)
  transactionForm.note = ''
  transactionForm.accountId = ''
  transactionForm.categoryId = ''
}

function selectSection(section: SectionKey) {
  activeSection.value = section
  sidebarOpen.value = false
}

function openCreatePanel(tab: CreateTabKey) {
  createTab.value = tab
  createPanelOpen.value = true
}

function closeCreatePanel() {
  createPanelOpen.value = false
}

async function refreshData() {
  loading.value = true

  try {
    const [nextAccounts, nextCategories, nextTransactions] = await Promise.all([
      db().account.list(),
      db().category.list(),
      db().transaction.list(),
    ])

    accounts.value = nextAccounts
    categories.value = nextCategories
    transactions.value = nextTransactions
  } catch (error) {
    showNotice('error', normalizeError(error))
  } finally {
    loading.value = false
  }
}

async function submitAccount() {
  const name = accountForm.name.trim()
  const currency = accountForm.currency.trim().toUpperCase()

  if (!name) {
    showNotice('error', 'Le nom du compte est obligatoire.')
    return
  }

  if (!currency || currency.length < 3) {
    showNotice('error', 'La devise doit contenir au moins 3 caractères.')
    return
  }

  saving.value = true
  try {
    await db().account.create({
      name,
      type: accountForm.type,
      currency,
      description: accountForm.description.trim() || null,
    })

    await refreshData()
    resetAccountForm()
    activeSection.value = 'accounts'
    showNotice('success', 'Compte créé.')
    closeCreatePanel()
  } catch (error) {
    showNotice('error', normalizeError(error))
  } finally {
    saving.value = false
  }
}

async function submitCategory() {
  const name = categoryForm.name.trim()

  if (!name) {
    showNotice('error', 'Le nom de la catégorie est obligatoire.')
    return
  }

  saving.value = true
  try {
    await db().category.create({
      name,
      kind: categoryForm.kind,
      color: categoryForm.color.trim() || null,
      description: categoryForm.description.trim() || null,
    })

    await refreshData()
    resetCategoryForm()
    activeSection.value = 'categories'
    showNotice('success', 'Catégorie créée.')
    closeCreatePanel()
  } catch (error) {
    showNotice('error', normalizeError(error))
  } finally {
    saving.value = false
  }
}

async function submitTransaction() {
  if (!accounts.value.length) {
    showNotice('error', 'Il faut créer au moins un compte avant une transaction.')
    return
  }

  const label = transactionForm.label.trim()
  const amount = Number(transactionForm.amount)

  if (!label) {
    showNotice('error', 'Le libellé de la transaction est obligatoire.')
    return
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    showNotice('error', 'Le montant doit être un nombre strictement positif.')
    return
  }

  if (!transactionForm.date) {
    showNotice('error', 'La date est obligatoire.')
    return
  }

  if (!transactionForm.accountId) {
    showNotice('error', 'Il faut sélectionner un compte.')
    return
  }

  saving.value = true
  try {
    await db().transaction.create({
      label,
      amount,
      kind: transactionForm.kind,
      date: transactionForm.date,
      note: transactionForm.note.trim() || null,
      accountId: Number(transactionForm.accountId),
      categoryId: transactionForm.categoryId ? Number(transactionForm.categoryId) : null,
    })

    await refreshData()
    resetTransactionForm()
    activeSection.value = 'transactions'
    showNotice('success', 'Transaction créée.')
    closeCreatePanel()
  } catch (error) {
    showNotice('error', normalizeError(error))
  } finally {
    saving.value = false
  }
}

const viewTitle = computed(() => sectionMeta[activeSection.value].title)
const viewDescription = computed(() => sectionMeta[activeSection.value].description)

const summaryCurrency = computed(() => accounts.value[0]?.currency || 'CAD')

const incomeTransactions = computed(() =>
    transactions.value.filter((tx) => tx.kind === 'INCOME'),
)

const expenseTransactions = computed(() =>
    transactions.value.filter((tx) => tx.kind === 'EXPENSE'),
)

const totalIncome = computed(() =>
    incomeTransactions.value.reduce((sum, tx) => sum + Math.abs(tx.amount), 0),
)

const totalExpense = computed(() =>
    expenseTransactions.value.reduce((sum, tx) => sum + Math.abs(tx.amount), 0),
)

const netFlow = computed(() => totalIncome.value - totalExpense.value)

const recentTransactions = computed(() => {
  return [...transactions.value]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 7)
})

const largestExpense = computed(() => {
  return [...expenseTransactions.value].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0] || null
})

const accountSummaries = computed(() => {
  return accounts.value
      .map((account) => {
        const related = transactions.value.filter((tx) => tx.accountId === account.id)
        const income = related
            .filter((tx) => tx.kind === 'INCOME')
            .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
        const expense = related
            .filter((tx) => tx.kind === 'EXPENSE')
            .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)

        return {
          ...account,
          transactionCount: related.length,
          income,
          expense,
          net: income - expense,
        }
      })
      .sort((a, b) => b.transactionCount - a.transactionCount || b.net - a.net)
})

const categorySummaries = computed(() => {
  return categories.value
      .map((category) => {
        const related = transactions.value.filter((tx) => tx.categoryId === category.id)
        const total = related.reduce((sum, tx) => sum + Math.abs(tx.amount), 0)

        return {
          ...category,
          transactionCount: related.length,
          total,
        }
      })
      .sort((a, b) => b.transactionCount - a.transactionCount || b.total - a.total)
})

const topExpenseCategories = computed(() => {
  const totals = new Map<string, { name: string; total: number; color: string | null }>()

  for (const tx of transactions.value) {
    if (tx.kind !== 'EXPENSE') continue

    const name = tx.category?.name || 'Sans catégorie'
    const current = totals.get(name) || {
      name,
      total: 0,
      color: tx.category?.color || null,
    }

    current.total += Math.abs(tx.amount)
    if (!current.color && tx.category?.color) {
      current.color = tx.category.color
    }

    totals.set(name, current)
  }

  return [...totals.values()].sort((a, b) => b.total - a.total).slice(0, 5)
})

const filteredTransactions = computed(() => {
  const q = transactionSearch.value.trim().toLowerCase()

  return [...transactions.value]
      .filter((tx) => {
        if (transactionKindFilter.value !== 'ALL' && tx.kind !== transactionKindFilter.value) {
          return false
        }

        if (transactionAccountFilter.value !== 'ALL' && String(tx.accountId) !== transactionAccountFilter.value) {
          return false
        }

        const txCategoryId = tx.categoryId == null ? 'NONE' : String(tx.categoryId)
        if (transactionCategoryFilter.value === 'NONE') {
          if (tx.categoryId != null) return false
        } else if (
            transactionCategoryFilter.value !== 'ALL' &&
            txCategoryId !== transactionCategoryFilter.value
        ) {
          return false
        }

        if (!q) return true

        const haystack = [
          tx.label,
          tx.note || '',
          tx.account?.name || '',
          tx.category?.name || '',
          kindLabel(tx.kind),
        ]
            .join(' ')
            .toLowerCase()

        return haystack.includes(q)
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
})

const transactionFormCategories = computed(() => {
  if (transactionForm.kind === 'TRANSFER') {
    return categories.value
  }
  return categories.value.filter((category) => category.kind === transactionForm.kind)
})

const lastSyncLabel = computed(() => {
  const latest = recentTransactions.value[0]
  return latest ? `Dernier mouvement le ${formatDate(latest.date)}` : 'Aucune transaction enregistrée'
})

onMounted(async () => {
  const savedTheme = localStorage.getItem('budget-theme')
  darkMode.value = savedTheme ? savedTheme === 'dark' : true
  applyTheme()
  await refreshData()
})
</script>

<template>
  <div class="min-h-screen bg-slate-100 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
    <div class="flex min-h-screen">
      <div
          v-if="sidebarOpen"
          class="fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-sm lg:hidden"
          @click="sidebarOpen = false"
      />

      <aside
          class="fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white px-4 py-5 shadow-xl transition-transform dark:border-slate-800 dark:bg-slate-900 lg:static lg:translate-x-0 lg:shadow-none"
          :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
      >
        <div class="mb-8 flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
              Budget
            </p>
            <h2 class="mt-1 text-xl font-bold text-slate-900 dark:text-white">
              Cockpit
            </h2>
          </div>

          <button
              class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-white lg:hidden"
              @click="sidebarOpen = false"
          >
            ✕
          </button>
        </div>

        <div class="panel px-4 py-4">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
            État
          </p>
          <p class="mt-2 text-sm font-medium text-slate-800 dark:text-slate-100">
            {{ lastSyncLabel }}
          </p>
          <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {{ transactions.length }} transactions · {{ accounts.length }} comptes · {{ categories.length }} catégories
          </p>
        </div>

        <nav class="mt-6 space-y-2">
          <button
              v-for="item in navigation"
              :key="item.key"
              class="nav-item"
              :class="{ 'nav-item-active': activeSection === item.key }"
              @click="selectSection(item.key)"
          >
            <span class="nav-marker">
              {{ item.marker }}
            </span>

            <span class="min-w-0 flex-1 text-left">
              <span class="block truncate text-sm font-semibold">
                {{ item.label }}
              </span>
              <span class="block truncate text-xs text-slate-400 dark:text-slate-500">
                {{ item.hint }}
              </span>
            </span>
          </button>
        </nav>

        <div class="mt-6 space-y-2">
          <button class="quick-create-btn" @click="openCreatePanel('transaction')">
            + Nouvelle transaction
          </button>
          <button class="quick-create-btn-secondary" @click="openCreatePanel('account')">
            + Nouveau compte
          </button>
          <button class="quick-create-btn-secondary" @click="openCreatePanel('category')">
            + Nouvelle catégorie
          </button>
        </div>

        <div class="mt-auto pt-6">
          <div class="panel px-4 py-4">
            <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Direction
            </p>
            <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Le style est désormais crédible, et l’app permet enfin de créer ses données sans bricolage.
            </p>
          </div>
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header
            class="sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
          <div class="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <div class="flex min-w-0 items-center gap-3">
              <button
                  class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-white lg:hidden"
                  @click="sidebarOpen = true"
              >
                ☰
              </button>

              <div class="min-w-0">
                <p class="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
                  Finance locale
                </p>
                <h1 class="truncate text-2xl font-bold text-slate-900 dark:text-white">
                  {{ viewTitle }}
                </h1>
                <p class="truncate text-sm text-slate-500 dark:text-slate-400">
                  {{ viewDescription }}
                </p>
              </div>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <button class="ghost-btn" @click="refreshData">
                {{ loading ? 'Chargement…' : 'Rafraîchir' }}
              </button>
              <button class="ghost-btn" @click="toggleTheme">
                {{ darkMode ? 'Mode clair' : 'Mode sombre' }}
              </button>
              <button class="primary-btn" @click="openCreatePanel('transaction')">
                Ajouter
              </button>
            </div>
          </div>
        </header>

        <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div v-if="notice" class="mb-6">
            <div
                class="notice"
                :class="notice.type === 'success' ? 'notice-success' : 'notice-error'"
            >
              {{ notice.text }}
            </div>
          </div>

          <section class="panel mb-6 overflow-hidden p-6">
            <div class="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div class="max-w-2xl">
                <p class="soft-kicker">
                  Lot 2
                </p>
                <h2 class="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                  UI crédible + formulaires utiles.
                </h2>
                <p class="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Tu as maintenant un dashboard propre, une navigation interne claire, et surtout des formulaires stylés
                  pour créer comptes, catégories et transactions sans revenir au code.
                </p>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <span class="soft-badge">Electron</span>
                <span class="soft-badge">Vue 3</span>
                <span class="soft-badge">Prisma</span>
                <span class="soft-badge">SQLite</span>
                <span class="soft-badge">Tailwind</span>
              </div>
            </div>
          </section>

          <section v-if="activeSection === 'overview'" class="space-y-6">
            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div class="stat-card">
                <p class="stat-label">Flux net</p>
                <p class="stat-value">
                  {{ formatMoney(netFlow, summaryCurrency) }}
                </p>
                <p class="stat-hint">
                  Revenus moins dépenses.
                </p>
              </div>

              <div class="stat-card">
                <p class="stat-label">Revenus</p>
                <p class="stat-value">
                  {{ formatMoney(totalIncome, summaryCurrency) }}
                </p>
                <p class="stat-hint">
                  {{ incomeTransactions.length }} entrée(s).
                </p>
              </div>

              <div class="stat-card">
                <p class="stat-label">Dépenses</p>
                <p class="stat-value">
                  {{ formatMoney(totalExpense, summaryCurrency) }}
                </p>
                <p class="stat-hint">
                  {{ expenseTransactions.length }} sortie(s).
                </p>
              </div>

              <div class="stat-card">
                <p class="stat-label">Plus grosse dépense</p>
                <p class="stat-value text-xl">
                  {{
                    largestExpense
                        ? formatMoney(Math.abs(largestExpense.amount), largestExpense.account?.currency || summaryCurrency)
                        : '—'
                  }}
                </p>
                <p class="stat-hint">
                  {{ largestExpense ? largestExpense.label : 'Aucune dépense.' }}
                </p>
              </div>
            </div>

            <div class="grid gap-6 xl:grid-cols-12">
              <section class="panel xl:col-span-8">
                <div class="panel-header">
                  <div>
                    <p class="panel-eyebrow">Activité récente</p>
                    <h3 class="panel-title">Dernières transactions</h3>
                  </div>

                  <button class="ghost-btn" @click="selectSection('transactions')">
                    Tout voir
                  </button>
                </div>

                <div v-if="recentTransactions.length" class="overflow-x-auto">
                  <table class="w-full min-w-[760px]">
                    <thead>
                    <tr class="table-head">
                      <th class="table-cell-head text-left">Libellé</th>
                      <th class="table-cell-head text-left">Compte</th>
                      <th class="table-cell-head text-left">Catégorie</th>
                      <th class="table-cell-head text-left">Date</th>
                      <th class="table-cell-head text-right">Montant</th>
                    </tr>
                    </thead>
                    <tbody>
                    <tr
                        v-for="transaction in recentTransactions"
                        :key="transaction.id"
                        class="table-row"
                    >
                      <td class="table-cell">
                        <div class="flex items-center gap-3">
                            <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                                  :class="kindPillClass(transaction.kind)">
                              {{ kindLabel(transaction.kind) }}
                            </span>
                          <div>
                            <p class="font-semibold text-slate-800 dark:text-slate-100">
                              {{ transaction.label }}
                            </p>
                            <p v-if="transaction.note" class="text-xs text-slate-500 dark:text-slate-400">
                              {{ transaction.note }}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td class="table-cell">
                        {{ transaction.account?.name || '—' }}
                      </td>

                      <td class="table-cell">
                        <div class="flex items-center gap-2">
                          <span class="h-2.5 w-2.5 rounded-full"
                                :style="categoryDotStyle(transaction.category?.color)"/>
                          <span>{{ transaction.category?.name || 'Sans catégorie' }}</span>
                        </div>
                      </td>

                      <td class="table-cell">
                        {{ formatDate(transaction.date) }}
                      </td>

                      <td class="table-cell text-right font-semibold" :class="amountClass(transaction.kind)">
                        {{ formatMoney(Math.abs(transaction.amount), transaction.account?.currency || 'CAD') }}
                      </td>
                    </tr>
                    </tbody>
                  </table>
                </div>

                <div v-else class="empty-state">
                  Aucune transaction pour le moment.
                </div>
              </section>

              <div class="space-y-6 xl:col-span-4">
                <section class="panel">
                  <div class="panel-header">
                    <div>
                      <p class="panel-eyebrow">Dépenses dominantes</p>
                      <h3 class="panel-title">Top catégories</h3>
                    </div>
                  </div>

                  <div v-if="topExpenseCategories.length" class="space-y-4 px-6 pb-6">
                    <div
                        v-for="category in topExpenseCategories"
                        :key="category.name"
                    >
                      <div class="mb-2 flex items-center justify-between gap-3">
                        <div class="flex min-w-0 items-center gap-2">
                          <span class="h-2.5 w-2.5 rounded-full" :style="categoryDotStyle(category.color)"/>
                          <span class="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                            {{ category.name }}
                          </span>
                        </div>

                        <span class="text-sm font-semibold text-slate-900 dark:text-white">
                          {{ formatMoney(category.total, summaryCurrency) }}
                        </span>
                      </div>

                      <div class="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                            class="h-2 rounded-full bg-violet-500"
                            :style="{ width: `${totalExpense ? Math.max((category.total / totalExpense) * 100, 8) : 0}%` }"
                        />
                      </div>
                    </div>
                  </div>

                  <div v-else class="empty-state">
                    Pas assez de données.
                  </div>
                </section>

                <section class="panel">
                  <div class="panel-header">
                    <div>
                      <p class="panel-eyebrow">Actions rapides</p>
                      <h3 class="panel-title">Créer</h3>
                    </div>
                  </div>

                  <div class="space-y-3 px-6 pb-6">
                    <button class="quick-panel-action" @click="openCreatePanel('transaction')">
                      Nouvelle transaction
                    </button>
                    <button class="quick-panel-action" @click="openCreatePanel('account')">
                      Nouveau compte
                    </button>
                    <button class="quick-panel-action" @click="openCreatePanel('category')">
                      Nouvelle catégorie
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </section>

          <section v-else-if="activeSection === 'transactions'" class="space-y-6">
            <section class="panel p-6">
              <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div class="field-block xl:col-span-2">
                  <label class="field-label">Recherche</label>
                  <input
                      v-model="transactionSearch"
                      type="text"
                      class="field-control"
                      placeholder="Libellé, compte, catégorie, note..."
                  >
                </div>

                <div class="field-block">
                  <label class="field-label">Type</label>
                  <select v-model="transactionKindFilter" class="field-control">
                    <option value="ALL">Tous</option>
                    <option value="EXPENSE">Dépense</option>
                    <option value="INCOME">Revenu</option>
                    <option value="TRANSFER">Transfert</option>
                  </select>
                </div>

                <div class="field-block">
                  <label class="field-label">Compte</label>
                  <select v-model="transactionAccountFilter" class="field-control">
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
                  <select v-model="transactionCategoryFilter" class="field-control">
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

                <span class="soft-badge">
                  {{ filteredTransactions.length }} ligne(s)
                </span>
              </div>

              <div v-if="filteredTransactions.length" class="overflow-x-auto">
                <table class="w-full min-w-[940px]">
                  <thead>
                  <tr class="table-head">
                    <th class="table-cell-head text-left">Type</th>
                    <th class="table-cell-head text-left">Libellé</th>
                    <th class="table-cell-head text-left">Compte</th>
                    <th class="table-cell-head text-left">Catégorie</th>
                    <th class="table-cell-head text-left">Date</th>
                    <th class="table-cell-head text-right">Montant</th>
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
                  </tr>
                  </tbody>
                </table>
              </div>

              <div v-else class="empty-state">
                Aucun résultat avec les filtres actuels.
              </div>
            </section>
          </section>

          <section v-else-if="activeSection === 'accounts'" class="space-y-6">
            <div class="flex items-center justify-end">
              <button class="primary-btn" @click="openCreatePanel('account')">
                Ajouter un compte
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

                  <span class="soft-badge">
                    {{ account.currency }}
                  </span>
                </div>

                <p class="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  {{ account.description || 'Pas encore de description.' }}
                </p>

                <div class="mt-6 grid grid-cols-2 gap-3">
                  <div class="mini-card">
                    <p class="mini-label">Revenus</p>
                    <p class="mini-value text-emerald-600 dark:text-emerald-400">
                      {{ formatMoney(account.income, account.currency) }}
                    </p>
                  </div>

                  <div class="mini-card">
                    <p class="mini-label">Dépenses</p>
                    <p class="mini-value text-rose-600 dark:text-rose-400">
                      {{ formatMoney(account.expense, account.currency) }}
                    </p>
                  </div>

                  <div class="mini-card col-span-2">
                    <div class="flex items-center justify-between gap-3">
                      <div>
                        <p class="mini-label">Net</p>
                        <p class="mini-value"
                           :class="account.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'">
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
              Aucun compte pour le moment.
            </div>
          </section>

          <section v-else-if="activeSection === 'categories'" class="space-y-6">
            <div class="flex items-center justify-end">
              <button class="primary-btn" @click="openCreatePanel('category')">
                Ajouter une catégorie
              </button>
            </div>

            <div v-if="categorySummaries.length" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <article
                  v-for="category in categorySummaries"
                  :key="category.id"
                  class="panel p-6"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex items-center gap-3">
                    <span class="h-3 w-3 rounded-full" :style="categoryDotStyle(category.color)"/>
                    <div>
                      <p class="text-sm font-semibold text-slate-900 dark:text-white">
                        {{ category.name }}
                      </p>
                      <p class="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                        {{ kindLabel(category.kind) }}
                      </p>
                    </div>
                  </div>

                  <span class="soft-badge">
                    {{ category.transactionCount }} tx
                  </span>
                </div>

                <p class="mt-4 text-sm text-slate-500 dark:text-slate-400">
                  {{ category.description || 'Aucune description renseignée.' }}
                </p>

                <div
                    class="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                  <p class="mini-label">Volume cumulé</p>
                  <p class="mini-value mt-1">
                    {{ formatMoney(category.total, summaryCurrency) }}
                  </p>
                </div>
              </article>
            </div>

            <div v-else class="panel empty-state">
              Aucune catégorie pour le moment.
            </div>
          </section>
        </main>
      </div>
    </div>

    <div
        v-if="createPanelOpen"
        class="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-sm"
        @click.self="closeCreatePanel"
    >
      <div
          class="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div
            class="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="soft-kicker">Création</p>
              <h2 class="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                Ajouter des données
              </h2>
              <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Transactions, comptes et catégories dans un panneau unique.
              </p>
            </div>

            <button class="ghost-btn" @click="closeCreatePanel">
              Fermer
            </button>
          </div>

          <div class="mt-5 flex flex-wrap gap-2">
            <button
                class="tab-btn"
                :class="{ 'tab-btn-active': createTab === 'transaction' }"
                @click="createTab = 'transaction'"
            >
              Transaction
            </button>
            <button
                class="tab-btn"
                :class="{ 'tab-btn-active': createTab === 'account' }"
                @click="createTab = 'account'"
            >
              Compte
            </button>
            <button
                class="tab-btn"
                :class="{ 'tab-btn-active': createTab === 'category' }"
                @click="createTab = 'category'"
            >
              Catégorie
            </button>
          </div>
        </div>

        <div class="p-6">
          <form v-if="createTab === 'transaction'" class="space-y-5" @submit.prevent="submitTransaction">
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
                />
              </div>
            </div>

            <div v-if="!accounts.length" class="inline-warning">
              Tu n’as encore aucun compte. Crée d’abord un compte.
            </div>

            <div class="form-actions">
              <button type="button" class="ghost-btn" @click="resetTransactionForm">
                Réinitialiser
              </button>
              <button type="submit" class="primary-btn" :disabled="saving">
                {{ saving ? 'Enregistrement…' : 'Créer la transaction' }}
              </button>
            </div>
          </form>

          <form v-else-if="createTab === 'account'" class="space-y-5" @submit.prevent="submitAccount">
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
                />
              </div>
            </div>

            <div class="form-actions">
              <button type="button" class="ghost-btn" @click="resetAccountForm">
                Réinitialiser
              </button>
              <button type="submit" class="primary-btn" :disabled="saving">
                {{ saving ? 'Enregistrement…' : 'Créer le compte' }}
              </button>
            </div>
          </form>

          <form v-else class="space-y-5" @submit.prevent="submitCategory">
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
                />
              </div>
            </div>

            <div class="form-actions">
              <button type="button" class="ghost-btn" @click="resetCategoryForm">
                Réinitialiser
              </button>
              <button type="submit" class="primary-btn" :disabled="saving">
                {{ saving ? 'Enregistrement…' : 'Créer la catégorie' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>