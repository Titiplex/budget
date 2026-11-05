import { computed, ref } from 'vue'
import {
  i18n,
  persistLocale,
  resolveInitialLocale,
  type SupportedLocale,
} from '../i18n'

type ThemeMode = 'light' | 'dark'

const THEME_STORAGE_KEY = 'budget-theme'
const CURRENCY_STORAGE_KEY = 'budget-default-transaction-currency'

function normalizeCurrency(value: string) {
  const code = value.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : null
}

export function useSettings() {
  const settingsOpen = ref(false)
  const defaultTransactionCurrency = ref('CAD')
  const locale = ref<SupportedLocale>('fr')
  const themeMode = ref<ThemeMode>('dark')

  function applyTheme() {
    document.documentElement.classList.toggle(
      'dark',
      themeMode.value === 'dark',
    )
    localStorage.setItem(THEME_STORAGE_KEY, themeMode.value)
  }

  function applyLocale() {
    i18n.global.locale.value = locale.value
    document.documentElement.lang = locale.value
    persistLocale(locale.value)
    if (window.appShell) {
      window.appShell.setLocale(locale.value)
    }
  }

  function initSettings() {
    defaultTransactionCurrency.value =
      normalizeCurrency(localStorage.getItem(CURRENCY_STORAGE_KEY) || '') ||
      'CAD'
    locale.value = resolveInitialLocale()
    applyLocale()

    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
    themeMode.value = savedTheme === 'light' ? 'light' : 'dark'
    applyTheme()
  }

  function setLocale(nextLocale: SupportedLocale) {
    locale.value = nextLocale
    applyLocale()
  }

  function setTheme(nextTheme: ThemeMode) {
    themeMode.value = nextTheme
    applyTheme()
  }

  function setDefaultTransactionCurrency(value: string) {
    const code = normalizeCurrency(value)
    if (!code) return
    defaultTransactionCurrency.value = code
    localStorage.setItem(CURRENCY_STORAGE_KEY, code)
  }

  function toggleTheme() {
    setTheme(themeMode.value === 'dark' ? 'light' : 'dark')
  }

  function openSettings() {
    settingsOpen.value = true
  }

  function closeSettings() {
    settingsOpen.value = false
  }

  const darkMode = computed(() => themeMode.value === 'dark')

  return {
    settingsOpen,
    defaultTransactionCurrency,
    setDefaultTransactionCurrency,
    locale,
    themeMode,
    darkMode,
    initSettings,
    setLocale,
    setTheme,
    toggleTheme,
    openSettings,
    closeSettings,
  }
}
