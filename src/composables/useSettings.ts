import {computed, ref} from 'vue'
import {i18n, persistLocale, resolveInitialLocale, type SupportedLocale} from '../i18n'

type ThemeMode = 'light' | 'dark'

const THEME_STORAGE_KEY = 'budget-theme'

export function useSettings() {
    const settingsOpen = ref(false)
    const locale = ref<SupportedLocale>('fr')
    const themeMode = ref<ThemeMode>('dark')

    function applyTheme() {
        document.documentElement.classList.toggle('dark', themeMode.value === 'dark')
        localStorage.setItem(THEME_STORAGE_KEY, themeMode.value)
    }

    function applyLocale() {
        i18n.global.locale.value = locale.value
        persistLocale(locale.value)
    }

    function initSettings() {
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