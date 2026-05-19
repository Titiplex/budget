import type {BudgetRepository} from './budgetRepository'
import {createDesktopBudgetRepository} from './desktopBudgetRepository'
import {createMobileBudgetRepository} from './mobileBudgetRepository'

let repository: BudgetRepository | null = null

function isCapacitorNativeRuntime() {
    const capacitor = typeof window === 'undefined'
        ? null
        : (window as unknown as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor

    return Boolean(capacitor?.isNativePlatform?.())
}

export function getBudgetRepository(): BudgetRepository {
    if (!repository) {
        repository = isCapacitorNativeRuntime()
            ? createMobileBudgetRepository()
            : createDesktopBudgetRepository()
    }

    return repository
}

export type {BudgetRepository} from './budgetRepository'
