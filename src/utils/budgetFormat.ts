import type {AccountType, EntityType, SectionKey, TransactionKind,} from '../types/budget'

export function formatMoney(amount: number, currency = 'CAD') {
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

export function formatDate(value: string) {
    return new Intl.DateTimeFormat('fr-CA', {dateStyle: 'medium'}).format(new Date(value))
}

export function kindLabel(kind: TransactionKind) {
    if (kind === 'INCOME') return 'Revenu'
    if (kind === 'EXPENSE') return 'Dépense'
    return 'Transfert'
}

export function accountTypeLabel(type: AccountType) {
    if (type === 'BANK') return 'Banque'
    if (type === 'CASH') return 'Espèces'
    if (type === 'SAVINGS') return 'Épargne'
    if (type === 'CREDIT') return 'Crédit'
    if (type === 'INVESTMENT') return 'Investissement'
    return 'Autre'
}

export function entityLabel(type: EntityType) {
    if (type === 'transaction') return 'transaction'
    if (type === 'account') return 'compte'
    return 'catégorie'
}

export function entityCollectionLabel(type: EntityType) {
    if (type === 'transaction') return 'transactions'
    if (type === 'account') return 'comptes'
    return 'catégories'
}

export function sectionToEntityType(section: SectionKey): EntityType {
    if (section === 'accounts') return 'account'
    if (section === 'categories') return 'category'
    return 'transaction'
}

export function kindPillClass(kind: TransactionKind) {
    if (kind === 'INCOME') {
        return 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300'
    }
    if (kind === 'EXPENSE') {
        return 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300'
    }
    return 'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/50 dark:text-sky-300'
}

export function amountClass(kind: TransactionKind) {
    if (kind === 'INCOME') return 'text-emerald-600 dark:text-emerald-400'
    if (kind === 'EXPENSE') return 'text-rose-600 dark:text-rose-400'
    return 'text-sky-600 dark:text-sky-400'
}

export function categoryDotStyle(color: string | null | undefined) {
    return {backgroundColor: color || '#94a3b8'}
}