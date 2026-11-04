import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const filePath = path.join(root, 'src', 'composables', 'useBudgetData.ts')

if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
}

let content = fs.readFileSync(filePath, 'utf8')
let changed = false

function replaceOnce(search, replacement, label) {
    if (content.includes(replacement)) return
    if (!content.includes(search)) {
        throw new Error(`Could not patch ${label}; expected text was not found.`)
    }
    content = content.replace(search, replacement)
    changed = true
}

replaceOnce(
    `import {collapseTransferTransactions} from "../utils/transferDisplay";\n`,
    `import {collapseTransferTransactions} from "../utils/transferDisplay";\nimport {getBudgetRepository} from '../platform/repositories'\n`,
    'repository import',
)

replaceOnce(
    `export function useBudgetData(\n    showNotice: (type: 'success' | 'error', text: string) => void,\n) {\n    const accountTypeOptions`,
    `export function useBudgetData(\n    showNotice: (type: 'success' | 'error', text: string) => void,\n) {\n    const budgetRepository = getBudgetRepository()\n\n    const accountTypeOptions`,
    'repository initialization',
)

const replacements = [
    ['window.db.account.', 'budgetRepository.accounts.'],
    ['window.db.category.', 'budgetRepository.categories.'],
    ['window.db.transaction.', 'budgetRepository.transactions.'],
    ['window.fx.', 'budgetRepository.fx.'],
]

for (const [search, replacement] of replacements) {
    if (content.includes(search)) {
        content = content.split(search).join(replacement)
        changed = true
    }
}

if (changed) {
    fs.writeFileSync(filePath, content)
    console.log('Patched src/composables/useBudgetData.ts to use the platform BudgetRepository adapter.')
} else {
    console.log('src/composables/useBudgetData.ts is already patched.')
}
