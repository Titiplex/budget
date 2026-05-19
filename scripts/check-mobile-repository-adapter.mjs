import fs from 'node:fs'
import path from 'node:path'

const checks = [
    'src/platform/repositories/budgetRepository.ts',
    'src/platform/repositories/desktopBudgetRepository.ts',
    'src/platform/repositories/mobileBudgetRepository.ts',
    'src/platform/repositories/mobileSqliteBudgetRepository.ts',
    'src/platform/repositories/index.ts',
    'capacitor.config.ts',
]

let failed = false

for (const relativePath of checks) {
    const absolutePath = path.join(process.cwd(), relativePath)
    if (!fs.existsSync(absolutePath)) {
        console.error(`Missing ${relativePath}`)
        failed = true
    }
}

const budgetDataPath = path.join(process.cwd(), 'src/composables/useBudgetData.ts')
const budgetData = fs.existsSync(budgetDataPath) ? fs.readFileSync(budgetDataPath, 'utf8') : ''

if (!budgetData.includes('getBudgetRepository')) {
    console.error('src/composables/useBudgetData.ts is not using getBudgetRepository(). Run npm run mobile:apply-adapter.')
    failed = true
}

if (budgetData.includes('window.db.account.') || budgetData.includes('window.db.category.') || budgetData.includes('window.db.transaction.')) {
    console.error('src/composables/useBudgetData.ts still calls window.db directly for budget core data.')
    failed = true
}

if (failed) process.exit(1)
console.log('Mobile repository adapter wiring looks OK.')
