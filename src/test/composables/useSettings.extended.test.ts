import {beforeEach, describe, expect, it, vi} from 'vitest'
import {useSettings} from '../../composables/useSettings'
import {i18n} from '../../i18n'

describe('useSettings extended', () => {
    beforeEach(() => {
        Object.defineProperty(window.navigator, 'language', {
            value: 'fr-CA',
            configurable: true,
        })
        ;(window as any).appShell = {
            setLocale: vi.fn(),
        }
    })

    it('initializes locale from navigator and saved dark theme by default', () => {
        const settings = useSettings()

        settings.initSettings()

        expect(settings.locale.value).toBe('fr')
        expect(i18n.global.locale.value).toBe('fr')
        expect((window as any).appShell.setLocale).toHaveBeenCalledWith('fr')
        expect(settings.themeMode.value).toBe('dark')
        expect(settings.darkMode.value).toBe(true)
        expect(document.documentElement.classList.contains('dark')).toBe(true)
        expect(localStorage.getItem('budget-theme')).toBe('dark')
    })

    it('restores stored locale and light theme', () => {
        localStorage.setItem('budget-locale', 'en')
        localStorage.setItem('budget-theme', 'light')
        const settings = useSettings()

        settings.initSettings()

        expect(settings.locale.value).toBe('en')
        expect(i18n.global.locale.value).toBe('en')
        expect(settings.themeMode.value).toBe('light')
        expect(settings.darkMode.value).toBe(false)
        expect(document.documentElement.classList.contains('dark')).toBe(false)
    })

    it('sets locale, theme and toggles the settings modal', () => {
        const settings = useSettings()

        settings.openSettings()
        expect(settings.settingsOpen.value).toBe(true)

        settings.setLocale('en')
        expect(settings.locale.value).toBe('en')
        expect(localStorage.getItem('budget-locale')).toBe('en')
        expect((window as any).appShell.setLocale).toHaveBeenCalledWith('en')

        settings.setTheme('light')
        expect(settings.themeMode.value).toBe('light')
        expect(settings.darkMode.value).toBe(false)
        expect(localStorage.getItem('budget-theme')).toBe('light')

        settings.toggleTheme()
        expect(settings.themeMode.value).toBe('dark')
        expect(settings.darkMode.value).toBe(true)

        settings.closeSettings()
        expect(settings.settingsOpen.value).toBe(false)
    })

    it('does not require appShell when applying locale', () => {
        delete (window as any).appShell
        const settings = useSettings()

        settings.setLocale('fr')

        expect(settings.locale.value).toBe('fr')
        expect(localStorage.getItem('budget-locale')).toBe('fr')
    })
})
