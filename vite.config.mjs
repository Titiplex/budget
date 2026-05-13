import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import {resolve} from 'path'

export default defineConfig({
    base: './',
    plugins: [vue()],
    build: {
        outDir: 'dist/renderer',
        emptyOutDir: true,
        rollupOptions: {
            input: resolve(process.cwd(), 'index.html')
        }
    },
    test: {
        coverage: {
            provider: 'v8',
            reportsDirectory: 'coverage',
            reporter: ['text', 'text-summary', 'html', 'json-summary', 'lcov'],
            all: true,
            clean: true,
            skipFull: false,
            include: [
                'src/utils/**/*.{ts,js}',
                'src/composables/**/*.{ts,js}',
                'src/i18n/**/*.{ts,js}',
                'electron/audit/**/*.{js,ts}',
                'electron/backup/**/*.{js,ts}',
                'electron/db/**/*.{js,ts}',
                'electron/goals/**/*.{js,ts}',
                'electron/import/**/*.{js,ts}',
                'electron/integrity/**/*.{js,ts}',
                'electron/marketData/**/*.{js,ts}',
                'electron/portfolio/**/*.{js,ts}',
                'electron/recovery/**/*.{js,ts}',
                'electron/secrets/**/*.{js,ts}',
                'electron/security/**/*.{js,ts}',
                'electron/utils/**/*.{js,ts}',
                'electron/ipc/transactionHandlers.js',
                'electron/ipc/wealthHandlers.js',
                'electron/ipc/wealthOverviewHandlers.js',
            ],
            exclude: [
                '**/*.d.ts',
                '**/*.test.{js,ts,tsx}',
                '**/*.spec.{js,ts,tsx}',
                '**/__tests__/**',
                'src/test/**',
                'src/types/**',
                'src/env*.d.ts',
                'src/main.ts',
                'src/App.vue',
                'src/components/**',
                'electron/main.js',
                'electron/preload.js',
                'electron/db.js',
                'electron/ipc/register*.js',
                'electron/menuI18n.js',
                'prisma/**',
                'scripts/**',
                'assets/**',
                'dist/**',
                'out/**',
                'coverage/**',
                'node_modules/**',
            ],
        },
    },
})
