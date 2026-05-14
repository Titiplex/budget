import {createI18n} from 'vue-i18n'
import en from './locales/en'
import fr from './locales/fr'
import taxEn from './locales/tax.en'
import taxFr from './locales/tax.fr'
import uiEn from './locales/ui.en'
import uiFr from './locales/ui.fr'

export type SupportedLocale = 'fr' | 'en'

const LOCALE_STORAGE_KEY = 'budget-locale'

function mergeMessages<T extends Record<string, unknown>>(base: T, extension: Record<string, unknown>): T {
    return Object.entries(extension).reduce((acc, [key, value]) => {
        const baseValue = acc[key]

        if (
            baseValue
            && typeof baseValue === 'object'
            && !Array.isArray(baseValue)
            && value
            && typeof value === 'object'
            && !Array.isArray(value)
        ) {
            acc[key] = mergeMessages(baseValue as Record<string, unknown>, value as Record<string, unknown>)
        } else {
            acc[key] = value
        }

        return acc
    }, {...base} as Record<string, unknown>) as T
}

const frMessages = mergeMessages({
    ...fr,
    common: {
        ...fr.common,
        export: 'Exporter',
        import: 'Importer',
    },
    tax: taxFr,
}, uiFr)

const enMessages = mergeMessages({
    ...en,
    common: {
        ...en.common,
        export: 'Export',
        import: 'Import',
    },
    tax: taxEn,
}, uiEn)

export function normalizeLocale(value?: string | null): SupportedLocale {
    const normalized = (value || '').toLowerCase()
    return normalized.startsWith('fr') ? 'fr' : 'en'
}

export function resolveInitialLocale(): SupportedLocale {
    if (typeof window === 'undefined') {
        return 'fr'
    }

    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored) {
        return normalizeLocale(stored)
    }

    return normalizeLocale(window.navigator.language)
}

export function persistLocale(locale: SupportedLocale) {
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    }
}

export const i18n = createI18n({
    legacy: false,
    locale: resolveInitialLocale(),
    fallbackLocale: 'en',
    messages: {
        fr: frMessages,
        en: enMessages,
    },
})

export function currentLocaleCode() {
    return normalizeLocale(i18n.global.locale.value) === 'fr' ? 'fr-CA' : 'en-CA'
}

export function tr(key: string, values?: Record<string, unknown>) {
    i18n.global.locale.value
    return i18n.global.t(key, values ?? {}) as string
}
