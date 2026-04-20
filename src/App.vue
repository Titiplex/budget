<script setup lang="ts">
import {computed, onMounted, reactive, ref, watch} from 'vue'
import AnalyticsToolbar from './components/AnalyticsToolbar.vue'
import DeleteDialog from './components/DeleteDialog.vue'
import EntityDrawer from './components/EntityDrawer.vue'
import type {
  Account,
  AccountSummary,
  AccountType,
  Category,
  CategorySummary,
  CreateTabKey,
  DeleteState,
  EditTarget,
  EntityType,
  PanelMode,
  SectionKey,
  Transaction,
  TransactionKind,
} from './types/budget'
import {
  accountTypeLabel,
  amountClass,
  categoryDotStyle,
  entityCollectionLabel,
  entityLabel,
  formatDate,
  formatMoney,
  kindLabel,
  kindPillClass,
  sectionToEntityType,
} from './utils/budgetFormat'
import {parseCsv, readCsvValue, toCsv, type CsvRecord} from './utils/csv'

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
    description: 'Recherche, filtres, édition, suppression et import/export CSV.',
  },
  accounts: {
    title: 'Comptes',
    description: 'Vue consolidée des comptes avec actions et import/export CSV.',
  },
  categories: {
    title: 'Catégories',
    description: 'Gestion complète des catégories avec import/export CSV.',
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
const panelMode = ref<PanelMode>('create')
const editingTarget = ref<EditTarget | null>(null)

const notice = ref<{ type: 'success' | 'error'; text: string } | null>(null)

const deleteDialog = reactive<DeleteState>({
  open: false,
  busy: false,
  type: 'transaction',
  id: 0,
  label: '',
  message: '',
})

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

function fileBridge() {
  return (window as unknown as Window & { file: any }).file
}

function showNotice(type: 'success' | 'error', text: string) {
  notice.value = {type, text}
  window.setTimeout(() => {
    if (notice.value?.text === text) {
      notice.value = null
    }
  }, 3600)
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

function resetAllForms() {
  resetAccountForm()
  resetCategoryForm()
  resetTransactionForm()
}

function selectSection(section: SectionKey) {
  activeSection.value = section
  sidebarOpen.value = false
}

function openCreatePanel(tab: CreateTabKey) {
  panelMode.value = 'create'
  editingTarget.value = null
  createTab.value = tab
  resetAllForms()

  if (tab === 'transaction' && accounts.value.length === 1) {
    transactionForm.accountId = String(accounts.value[0].id)
  }

  createPanelOpen.value = true
}

function openEditAccount(account: AccountSummary | Account) {
  panelMode.value = 'edit'
  editingTarget.value = {type: 'account', id: account.id}
  createTab.value = 'account'
  accountForm.name = account.name
  accountForm.type = account.type
  accountForm.currency = account.currency
  accountForm.description = account.description || ''
  createPanelOpen.value = true
}

function openEditCategory(category: CategorySummary | Category) {
  panelMode.value = 'edit'
  editingTarget.value = {type: 'category', id: category.id}
  createTab.value = 'category'
  categoryForm.name = category.name
  categoryForm.kind = category.kind
  categoryForm.color = category.color || '#8b5cf6'
  categoryForm.description = category.description || ''
  createPanelOpen.value = true
}

function openEditTransaction(transaction: Transaction) {
  panelMode.value = 'edit'
  editingTarget.value = {type: 'transaction', id: transaction.id}
  createTab.value = 'transaction'
  transactionForm.label = transaction.label
  transactionForm.amount = String(Math.abs(transaction.amount))
  transactionForm.kind = transaction.kind
  transactionForm.date = new Date(transaction.date).toISOString().slice(0, 10)
  transactionForm.note = transaction.note || ''
  transactionForm.accountId = String(transaction.accountId)
  transactionForm.categoryId = transaction.categoryId == null ? '' : String(transaction.categoryId)
  createPanelOpen.value = true
}

function closeCreatePanel() {
  createPanelOpen.value = false
  panelMode.value = 'create'
  editingTarget.value = null
  resetAllForms()
}

function openDeleteDialog(type: EntityType, entity: Transaction | AccountSummary | CategorySummary | Account | Category) {
  deleteDialog.type = type
  deleteDialog.id = entity.id
  deleteDialog.label = 'label' in entity ? entity.label : entity.name
  deleteDialog.open = true
  deleteDialog.busy = false

  if (type === 'account') {
    const count = 'transactionCount' in entity
        ? entity.transactionCount
        : transactions.value.filter((tx) => tx.accountId === entity.id).length

    deleteDialog.message = count > 0
        ? `Supprimer ce compte supprimera aussi ses ${count} transaction(s) liées.`
        : 'Supprimer ce compte le retirera définitivement de la base.'
    return
  }

  if (type === 'category') {
    const count = 'transactionCount' in entity
        ? entity.transactionCount
        : transactions.value.filter((tx) => tx.categoryId === entity.id).length

    deleteDialog.message = count > 0
        ? `Supprimer cette catégorie laissera ${count} transaction(s) en place, mais sans catégorie associée.`
        : 'Supprimer cette catégorie la retirera définitivement de la base.'
    return
  }

  deleteDialog.message = 'Cette transaction sera supprimée définitivement.'
}

function requestDeleteCurrentForm() {
  if (!editingTarget.value) return

  if (editingTarget.value.type === 'transaction') {
    openDeleteDialog('transaction', {
      id: editingTarget.value.id,
      label: transactionForm.label,
      amount: Number(transactionForm.amount) || 0,
      kind: transactionForm.kind,
      date: transactionForm.date,
      note: transactionForm.note || null,
      accountId: Number(transactionForm.accountId || 0),
      categoryId: transactionForm.categoryId ? Number(transactionForm.categoryId) : null,
    })
    return
  }

  if (editingTarget.value.type === 'account') {
    openDeleteDialog('account', {
      id: editingTarget.value.id,
      name: accountForm.name,
      type: accountForm.type,
      currency: accountForm.currency,
      description: accountForm.description || null,
    })
    return
  }

  openDeleteDialog('category', {
    id: editingTarget.value.id,
    name: categoryForm.name,
    kind: categoryForm.kind,
    color: categoryForm.color,
    description: categoryForm.description || null,
  })
}

function closeDeleteDialog() {
  deleteDialog.open = false
  deleteDialog.busy = false
  deleteDialog.id = 0
  deleteDialog.label = ''
  deleteDialog.message = ''
  deleteDialog.type = 'transaction'
}

async function confirmDelete() {
  deleteDialog.busy = true

  try {
    if (deleteDialog.type === 'account') {
      await db().account.delete(deleteDialog.id)
      showNotice('success', 'Compte supprimé.')
    } else if (deleteDialog.type === 'category') {
      await db().category.delete(deleteDialog.id)
      showNotice('success', 'Catégorie supprimée.')
    } else {
      await db().transaction.delete(deleteDialog.id)
      showNotice('success', 'Transaction supprimée.')
    }

    if (
        createPanelOpen.value &&
        editingTarget.value &&
        editingTarget.value.type === deleteDialog.type &&
        editingTarget.value.id === deleteDialog.id
    ) {
      closeCreatePanel()
    }

    closeDeleteDialog()
    await refreshData()
  } catch (error) {
    showNotice('error', normalizeError(error))
    deleteDialog.busy = false
  }
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
    const payload = {
      name,
      type: accountForm.type,
      currency,
      description: accountForm.description.trim() || null,
    }

    if (panelMode.value === 'edit' && editingTarget.value?.type === 'account') {
      await db().account.update(editingTarget.value.id, payload)
      showNotice('success', 'Compte mis à jour.')
    } else {
      await db().account.create(payload)
      showNotice('success', 'Compte créé.')
    }

    await refreshData()
    activeSection.value = 'accounts'
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
    const payload = {
      name,
      kind: categoryForm.kind,
      color: categoryForm.color.trim() || null,
      description: categoryForm.description.trim() || null,
    }

    if (panelMode.value === 'edit' && editingTarget.value?.type === 'category') {
      await db().category.update(editingTarget.value.id, payload)
      showNotice('success', 'Catégorie mise à jour.')
    } else {
      await db().category.create(payload)
      showNotice('success', 'Catégorie créée.')
    }

    await refreshData()
    activeSection.value = 'categories'
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
    const payload = {
      label,
      amount,
      kind: transactionForm.kind,
      date: transactionForm.date,
      note: transactionForm.note.trim() || null,
      accountId: Number(transactionForm.accountId),
      categoryId: transactionForm.categoryId ? Number(transactionForm.categoryId) : null,
    }

    if (panelMode.value === 'edit' && editingTarget.value?.type === 'transaction') {
      await db().transaction.update(editingTarget.value.id, payload)
      showNotice('success', 'Transaction mise à jour.')
    } else {
      await db().transaction.create(payload)
      showNotice('success', 'Transaction créée.')
    }

    await refreshData()
    activeSection.value = 'transactions'
    closeCreatePanel()
  } catch (error) {
    showNotice('error', normalizeError(error))
  } finally {
    saving.value = false
  }
}

function parseAccountTypeValue(value: string, fallback: AccountType = 'BANK'): AccountType {
  const normalized = value.trim().toUpperCase()
  return accountTypeOptions.includes(normalized as AccountType) ? normalized as AccountType : fallback
}

function parseTransactionKindValue(value: string, fallback: TransactionKind = 'EXPENSE'): TransactionKind {
  const normalized = value.trim().toUpperCase()
  return transactionKindOptions.includes(normalized as TransactionKind) ? normalized as TransactionKind : fallback
}

function parsePositiveCsvNumber(value: string) {
  const normalized = value.replace(/\s/g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function normalizeCurrencyCode(value: string, fallback = 'CAD') {
  const normalized = value.trim().toUpperCase()
  return normalized || fallback
}

function toDateKey(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function findAccountByName(list: Account[], name: string) {
  const target = name.trim().toLowerCase()
  return list.find((account) => account.name.trim().toLowerCase() === target)
}

function findCategoryByName(list: Category[], name: string) {
  const target = name.trim().toLowerCase()
  return list.find((category) => category.name.trim().toLowerCase() === target)
}

function currentEntityFileName(entity: EntityType) {
  if (entity === 'account') return 'budget-accounts.csv'
  if (entity === 'category') return 'budget-categories.csv'
  return 'budget-transactions.csv'
}

function buildAccountExportRows() {
  return accounts.value.map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    description: account.description || '',
  }))
}

function buildCategoryExportRows() {
  return categories.value.map((category) => ({
    id: category.id,
    name: category.name,
    kind: category.kind,
    color: category.color || '',
    description: category.description || '',
  }))
}

function buildTransactionExportRows() {
  return transactions.value.map((transaction) => ({
    id: transaction.id,
    label: transaction.label,
    amount: Math.abs(transaction.amount),
    kind: transaction.kind,
    date: toDateKey(transaction.date),
    note: transaction.note || '',
    accountId: transaction.accountId,
    accountName: transaction.account?.name || '',
    categoryId: transaction.categoryId || '',
    categoryName: transaction.category?.name || '',
    categoryKind: transaction.category?.kind || '',
    categoryColor: transaction.category?.color || '',
  }))
}

async function exportCurrentCsv() {
  const file = fileBridge()
  if (!file?.saveText) {
    showNotice('error', 'Le bridge fichier Electron est indisponible.')
    return
  }

  const entity = currentCsvEntity.value
  const headers = entity === 'account'
      ? ['id', 'name', 'type', 'currency', 'description']
      : entity === 'category'
          ? ['id', 'name', 'kind', 'color', 'description']
          : ['id', 'label', 'amount', 'kind', 'date', 'note', 'accountId', 'accountName', 'categoryId', 'categoryName', 'categoryKind', 'categoryColor']

  const rows = entity === 'account'
      ? buildAccountExportRows()
      : entity === 'category'
          ? buildCategoryExportRows()
          : buildTransactionExportRows()

  const content = toCsv(rows, headers)
  const result = await file.saveText({
    title: `Exporter ${entityCollectionLabel(entity)} en CSV`,
    defaultPath: currentEntityFileName(entity),
    content,
    filters: [{name: 'CSV', extensions: ['csv']}],
  })

  if (!result?.canceled) {
    showNotice('success', `Export ${entityCollectionLabel(entity)} terminé.`)
  }
}

async function importAccountsCsv(rows: CsvRecord[]) {
  const accountCache = [...accounts.value]
  let created = 0
  let updated = 0
  let skipped = 0

  for (const row of rows) {
    const name = readCsvValue(row, ['name', 'nom'])
    if (!name) {
      skipped += 1
      continue
    }

    const payload = {
      name,
      type: parseAccountTypeValue(readCsvValue(row, ['type']), 'BANK'),
      currency: normalizeCurrencyCode(readCsvValue(row, ['currency', 'devise']), 'CAD'),
      description: readCsvValue(row, ['description']),
    }

    const existing = findAccountByName(accountCache, name)

    if (existing) {
      await db().account.update(existing.id, payload)
      existing.type = payload.type
      existing.currency = payload.currency
      existing.description = payload.description || null
      updated += 1
    } else {
      const createdAccount = await db().account.create(payload)
      accountCache.push(createdAccount)
      created += 1
    }
  }

  return {created, updated, skipped}
}

async function importCategoriesCsv(rows: CsvRecord[]) {
  const categoryCache = [...categories.value]
  let created = 0
  let updated = 0
  let skipped = 0

  for (const row of rows) {
    const name = readCsvValue(row, ['name', 'nom'])
    if (!name) {
      skipped += 1
      continue
    }

    const payload = {
      name,
      kind: parseTransactionKindValue(readCsvValue(row, ['kind', 'type']), 'EXPENSE'),
      color: readCsvValue(row, ['color', 'couleur']) || null,
      description: readCsvValue(row, ['description']) || null,
    }

    const existing = findCategoryByName(categoryCache, name)

    if (existing) {
      await db().category.update(existing.id, payload)
      existing.kind = payload.kind
      existing.color = payload.color
      existing.description = payload.description
      updated += 1
    } else {
      const createdCategory = await db().category.create(payload)
      categoryCache.push(createdCategory)
      created += 1
    }
  }

  return {created, updated, skipped}
}

async function resolveAccountFromCsvRow(row: CsvRecord, accountCache: Account[]) {
  const explicitId = readCsvValue(row, ['accountId', 'compteId'])
  if (explicitId) {
    const byId = accountCache.find((account) => account.id === Number(explicitId))
    if (byId) return {account: byId, created: false}
  }

  const name = readCsvValue(row, ['accountName', 'account', 'compte', 'nomCompte'])
  if (!name) {
    throw new Error('Compte manquant pour la transaction.')
  }

  const existing = findAccountByName(accountCache, name)
  if (existing) return {account: existing, created: false}

  const createdAccount = await db().account.create({
    name,
    type: parseAccountTypeValue(readCsvValue(row, ['accountType', 'typeCompte']), 'BANK'),
    currency: normalizeCurrencyCode(readCsvValue(row, ['accountCurrency', 'currency', 'devise']), 'CAD'),
    description: readCsvValue(row, ['accountDescription', 'descriptionCompte']) || null,
  })

  accountCache.push(createdAccount)
  return {account: createdAccount, created: true}
}

async function resolveCategoryFromCsvRow(
    row: CsvRecord,
    categoryCache: Category[],
    fallbackKind: TransactionKind,
) {
  const explicitId = readCsvValue(row, ['categoryId', 'categorieId'])
  if (explicitId) {
    const byId = categoryCache.find((category) => category.id === Number(explicitId))
    if (byId) return {category: byId, created: false}
  }

  const name = readCsvValue(row, ['categoryName', 'category', 'categorie', 'nomCategorie'])
  if (!name) {
    return {category: null, created: false}
  }

  const existing = findCategoryByName(categoryCache, name)
  if (existing) return {category: existing, created: false}

  const createdCategory = await db().category.create({
    name,
    kind: parseTransactionKindValue(readCsvValue(row, ['categoryKind', 'kind', 'typeCategorie']), fallbackKind),
    color: readCsvValue(row, ['categoryColor', 'color', 'couleurCategorie']) || null,
    description: readCsvValue(row, ['categoryDescription', 'descriptionCategorie']) || null,
  })

  categoryCache.push(createdCategory)
  return {category: createdCategory, created: true}
}

async function importTransactionsCsv(rows: CsvRecord[]) {
  const accountCache = [...accounts.value]
  const categoryCache = [...categories.value]
  const transactionCache = [...transactions.value]

  let created = 0
  let skipped = 0
  let createdAccounts = 0
  let createdCategories = 0

  for (const row of rows) {
    try {
      const label = readCsvValue(row, ['label', 'libelle'])
      const amount = parsePositiveCsvNumber(readCsvValue(row, ['amount', 'montant']))
      const date = readCsvValue(row, ['date'])
      const kind = parseTransactionKindValue(readCsvValue(row, ['kind', 'type']), 'EXPENSE')

      if (!label || !amount || !date || !toDateKey(date)) {
        skipped += 1
        continue
      }

      const accountResult = await resolveAccountFromCsvRow(row, accountCache)
      if (accountResult.created) {
        createdAccounts += 1
      }

      const categoryResult = await resolveCategoryFromCsvRow(row, categoryCache, kind)
      if (categoryResult.created) {
        createdCategories += 1
      }

      const duplicate = transactionCache.some((transaction) =>
          transaction.label.trim().toLowerCase() === label.trim().toLowerCase()
          && Math.abs(transaction.amount) === amount
          && transaction.kind === kind
          && toDateKey(transaction.date) === toDateKey(date)
          && transaction.accountId === accountResult.account.id
          && (transaction.categoryId ?? null) === (categoryResult.category?.id ?? null),
      )

      if (duplicate) {
        skipped += 1
        continue
      }

      const createdTransaction = await db().transaction.create({
        label,
        amount,
        kind,
        date,
        note: readCsvValue(row, ['note', 'notes']) || null,
        accountId: accountResult.account.id,
        categoryId: categoryResult.category?.id ?? null,
      })

      transactionCache.push(createdTransaction)
      created += 1
    } catch {
      skipped += 1
    }
  }

  return {created, skipped, createdAccounts, createdCategories}
}

async function importCurrentCsv() {
  const file = fileBridge()
  if (!file?.openText) {
    showNotice('error', 'Le bridge fichier Electron est indisponible.')
    return
  }

  const entity = currentCsvEntity.value
  const result = await file.openText({
    title: `Importer ${entityCollectionLabel(entity)} depuis un CSV`,
    filters: [{name: 'CSV', extensions: ['csv']}],
  })

  if (!result || result.canceled || !result.content) {
    return
  }

  const rows = parseCsv(result.content)
  if (!rows.length) {
    showNotice('error', 'Le fichier CSV est vide ou invalide.')
    return
  }

  try {
    if (entity === 'account') {
      const summary = await importAccountsCsv(rows)
      await refreshData()
      showNotice(
          'success',
          `Import comptes terminé : ${summary.created} créé(s), ${summary.updated} mis à jour, ${summary.skipped} ignoré(s).`,
      )
      return
    }

    if (entity === 'category') {
      const summary = await importCategoriesCsv(rows)
      await refreshData()
      showNotice(
          'success',
          `Import catégories terminé : ${summary.created} créée(s), ${summary.updated} mise(s) à jour, ${summary.skipped} ignorée(s).`,
      )
      return
    }

    const summary = await importTransactionsCsv(rows)
    await refreshData()
    showNotice(
        'success',
        `Import transactions terminé : ${summary.created} créée(s), ${summary.createdAccounts} compte(s) créé(s), ${summary.createdCategories} catégorie(s) créée(s), ${summary.skipped} ligne(s) ignorée(s).`,
    )
  } catch (error) {
    showNotice('error', normalizeError(error))
  }
}

watch(() => transactionForm.kind, () => {
  if (!transactionForm.categoryId) return

  const stillAllowed = transactionFormCategories.value.some(
      (category) => String(category.id) === transactionForm.categoryId,
  )

  if (!stillAllowed) {
    transactionForm.categoryId = ''
  }
})

const viewTitle = computed(() => sectionMeta[activeSection.value].title)
const viewDescription = computed(() => sectionMeta[activeSection.value].description)
const summaryCurrency = computed(() => accounts.value[0]?.currency || 'CAD')
const currentCsvEntity = computed<EntityType>(() => sectionToEntityType(activeSection.value))

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

const accountSummaries = computed<AccountSummary[]>(() => {
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

const categorySummaries = computed<CategorySummary[]>(() => {
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

const panelTitle = computed(() => {
  if (panelMode.value === 'create') {
    if (createTab.value === 'transaction') return 'Ajouter une transaction'
    if (createTab.value === 'account') return 'Ajouter un compte'
    return 'Ajouter une catégorie'
  }

  if (editingTarget.value?.type === 'transaction') return 'Modifier la transaction'
  if (editingTarget.value?.type === 'account') return 'Modifier le compte'
  return 'Modifier la catégorie'
})

const panelDescription = computed(() => {
  if (panelMode.value === 'create') {
    return 'Crée rapidement des transactions, comptes ou catégories.'
  }

  return 'Édite les données existantes, puis enregistre, importe, exporte ou supprime si nécessaire.'
})

const panelSubmitLabel = computed(() => {
  if (panelMode.value === 'create') {
    if (createTab.value === 'transaction') return 'Créer la transaction'
    if (createTab.value === 'account') return 'Créer le compte'
    return 'Créer la catégorie'
  }

  if (editingTarget.value?.type === 'transaction') return 'Mettre à jour la transaction'
  if (editingTarget.value?.type === 'account') return 'Mettre à jour le compte'
  return 'Mettre à jour la catégorie'
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
              Scope CSV
            </p>
            <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Import/export actif sur : {{ entityCollectionLabel(currentCsvEntity) }}.
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
            <div class="notice" :class="notice.type === 'success' ? 'notice-success' : 'notice-error'">
              {{ notice.text }}
            </div>
          </div>

          <AnalyticsToolbar
              :active-section="activeSection"
              :loading="loading"
              :summary-currency="summaryCurrency"
              :net-flow="netFlow"
              :total-income="totalIncome"
              :total-expense="totalExpense"
              :transaction-count="transactions.length"
              :account-count="accounts.length"
              :category-count="categories.length"
              @refresh="refreshData"
              @import-csv="importCurrentCsv"
              @export-csv="exportCurrentCsv"
              @create-transaction="openCreatePanel('transaction')"
              @create-account="openCreatePanel('account')"
              @create-category="openCreatePanel('category')"
          />

          <section v-if="activeSection === 'overview'" class="space-y-6">
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
                  <table class="w-full min-w-[920px]">
                    <thead>
                    <tr class="table-head">
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

                      <td class="table-cell">
                        <div class="row-actions">
                          <button class="mini-action-btn" @click="openEditTransaction(transaction)">
                            Modifier
                          </button>
                          <button class="mini-danger-btn" @click="openDeleteDialog('transaction', transaction)">
                            Supprimer
                          </button>
                        </div>
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
                      <p class="panel-eyebrow">Scope CSV actif</p>
                      <h3 class="panel-title">
                        {{ entityCollectionLabel(currentCsvEntity) }}
                      </h3>
                    </div>
                  </div>

                  <div class="space-y-3 px-6 pb-6">
                    <button class="quick-panel-action" @click="importCurrentCsv">
                      Importer {{ entityCollectionLabel(currentCsvEntity) }}
                    </button>
                    <button class="quick-panel-action" @click="exportCurrentCsv">
                      Exporter {{ entityCollectionLabel(currentCsvEntity) }}
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

                <div class="flex items-center gap-2">
                  <span class="soft-badge">
                    {{ filteredTransactions.length }} ligne(s)
                  </span>
                  <button class="primary-btn" @click="openCreatePanel('transaction')">
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
                        <button class="mini-action-btn" @click="openEditTransaction(transaction)">
                          Modifier
                        </button>
                        <button class="mini-danger-btn" @click="openDeleteDialog('transaction', transaction)">
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

                  <div class="card-toolbar">
                    <button class="mini-action-btn" @click="openEditAccount(account)">
                      Modifier
                    </button>
                    <button class="mini-danger-btn" @click="openDeleteDialog('account', account)">
                      Supprimer
                    </button>
                  </div>
                </div>

                <div class="mt-3 flex items-center justify-between gap-3">
                  <p class="text-sm text-slate-500 dark:text-slate-400">
                    {{ account.description || 'Pas encore de description.' }}
                  </p>

                  <span class="soft-badge">
                    {{ account.currency }}
                  </span>
                </div>

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

                  <div class="card-toolbar">
                    <button class="mini-action-btn" @click="openEditCategory(category)">
                      Modifier
                    </button>
                    <button class="mini-danger-btn" @click="openDeleteDialog('category', category)">
                      Supprimer
                    </button>
                  </div>
                </div>

                <p class="mt-4 text-sm text-slate-500 dark:text-slate-400">
                  {{ category.description || 'Aucune description renseignée.' }}
                </p>

                <div
                    class="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="mini-label">Volume cumulé</p>
                      <p class="mini-value mt-1">
                        {{ formatMoney(category.total, summaryCurrency) }}
                      </p>
                    </div>

                    <span class="soft-badge">
                      {{ category.transactionCount }} tx
                    </span>
                  </div>
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

    <EntityDrawer
        :open="createPanelOpen"
        :mode="panelMode"
        :current-tab="createTab"
        :editing-target="editingTarget"
        :saving="saving"
        :panel-title="panelTitle"
        :panel-description="panelDescription"
        :panel-submit-label="panelSubmitLabel"
        :account-type-options="accountTypeOptions"
        :transaction-kind-options="transactionKindOptions"
        :accounts="accounts"
        :categories="categories"
        :transaction-form-categories="transactionFormCategories"
        :account-form="accountForm"
        :category-form="categoryForm"
        :transaction-form="transactionForm"
        @close="closeCreatePanel"
        @set-tab="createTab = $event"
        @submit-transaction="submitTransaction"
        @submit-account="submitAccount"
        @submit-category="submitCategory"
        @reset-transaction="resetTransactionForm"
        @reset-account="resetAccountForm"
        @reset-category="resetCategoryForm"
        @request-delete="requestDeleteCurrentForm"
    />

    <DeleteDialog
        :open="deleteDialog.open"
        :busy="deleteDialog.busy"
        :type="deleteDialog.type"
        :label="deleteDialog.label"
        :message="deleteDialog.message"
        @close="closeDeleteDialog"
        @confirm="confirmDelete"
    />
  </div>
</template>