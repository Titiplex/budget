import {describe, expect, it} from 'vitest'
import {useTheme} from '../../composables/useTheme'

describe('useTheme', () => {
    it('initializes to dark mode by default and persists it', () => {
        const theme = useTheme()

        theme.initTheme()

        expect(theme.darkMode.value).toBe(true)
        expect(document.documentElement.classList.contains('dark')).toBe(true)
        expect(localStorage.getItem('budget-theme')).toBe('dark')
    })

    it('restores a saved light theme', () => {
        localStorage.setItem('budget-theme', 'light')
        const theme = useTheme()

        theme.initTheme()

        expect(theme.darkMode.value).toBe(false)
        expect(document.documentElement.classList.contains('dark')).toBe(false)
        expect(localStorage.getItem('budget-theme')).toBe('light')
    })

    it('toggles the current theme and writes the new preference', () => {
        const theme = useTheme()
        theme.initTheme()

        theme.toggleTheme()

        expect(theme.darkMode.value).toBe(false)
        expect(document.documentElement.classList.contains('dark')).toBe(false)
        expect(localStorage.getItem('budget-theme')).toBe('light')

        theme.toggleTheme()

        expect(theme.darkMode.value).toBe(true)
        expect(document.documentElement.classList.contains('dark')).toBe(true)
        expect(localStorage.getItem('budget-theme')).toBe('dark')
    })
})
