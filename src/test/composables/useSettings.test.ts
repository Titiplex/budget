import {describe, expect, it} from 'vitest'
import {useSettings} from '../../composables/useSettings'

describe('useSettings', () => {
    it('toggles theme', () => {
        const settings = useSettings()
        settings.initSettings()

        const initial = settings.themeMode.value
        settings.toggleTheme()

        expect(settings.themeMode.value).not.toBe(initial)
    })

    it('stores locale', () => {
        const settings = useSettings()
        settings.initSettings()
        settings.setLocale('en')

        expect(settings.locale.value).toBe('en')
        expect(localStorage.getItem('budget-locale')).toBe('en')
    })
})