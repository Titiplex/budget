import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
    globalIgnores(['dist', 'dist-server']),
    {
        files: ['**/*.{ts}'],
        ignores: ["**/node_modules/**", "**/dist/**", "**/e2e-artifacts/**", "**/coverage/**", "**/src/styles/**"],
        extends: [
            js.configs.recommended,
            tseslint.configs.recommended
        ],
        languageOptions: {
            globals: globals.browser,
        },
    },
])