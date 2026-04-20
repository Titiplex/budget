import {createI18n} from 'vue-i18n'
import en from './locales/en'
import fr from './locales/fr'

export type SupportedLocale = 'fr' | 'en'

const LOCALE_STORAGE_KEY = 'budget-locale'

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
        fr,
        en,
    },
})

export function currentLocaleCode() {
    return normalizeLocale(i18n.global.locale.value) === 'fr' ? 'fr-CA' : 'en-CA'
}

export function tr(key: string, values?: Record<string, unknown>) {
    i18n.global.locale.value
    return i18n.global.t(key, values ?? {}) as string
}