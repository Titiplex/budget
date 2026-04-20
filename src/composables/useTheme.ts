import {ref} from 'vue'

export function useTheme() {
    const darkMode = ref(true)

    function applyTheme() {
        document.documentElement.classList.toggle('dark', darkMode.value)
        localStorage.setItem('budget-theme', darkMode.value ? 'dark' : 'light')
    }

    function initTheme() {
        const savedTheme = localStorage.getItem('budget-theme')
        darkMode.value = savedTheme ? savedTheme === 'dark' : true
        applyTheme()
    }

    function toggleTheme() {
        darkMode.value = !darkMode.value
        applyTheme()
    }

    return {
        darkMode,
        initTheme,
        toggleTheme,
    }
}