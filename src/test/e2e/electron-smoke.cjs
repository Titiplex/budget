const {
    assert,
    launchElectronE2e,
    waitFor,
} = require('./electronE2eHarness.cjs')

function js(value) {
    return JSON.stringify(value)
}

async function navigateTo(cdp, marker) {
    const clicked = await cdp.evaluate(`(() => {
        const button = Array.from(document.querySelectorAll('nav button')).find((entry) =>
            String(entry.innerText || '').trim().startsWith(${js(marker)})
        )
        if (!button) return false
        button.click()
        return true
    })()`)

    assert(clicked, `Could not click navigation marker ${marker}`)

    await waitFor(async () => cdp.evaluate(`(() => {
        const active = document.querySelector('nav button.nav-item-active')
        return Boolean(active && String(active.innerText || '').trim().startsWith(${js(marker)}))
    })()`), {
        message: `Navigation did not activate marker ${marker}`,
    })
}

async function assertText(cdp, text, label = text) {
    await waitFor(async () => cdp.evaluate(`document.body.innerText.includes(${js(text)})`), {
        message: `Expected renderer text not found: ${label}`,
    })
}

async function runCoreDataFlow(cdp) {
    const result = await cdp.evaluate(`(async () => {
        const out = {steps: []}

        function assert(condition, message) {
            if (!condition) throw new Error(message)
        }

        function same(actual, expected, message) {
            if (actual !== expected) {
                throw new Error(message + ': expected ' + expected + ', got ' + actual)
            }
        }

        try {
            const accountBefore = await window.db.account.list()
            same(accountBefore.length, 0, 'E2E DB should start empty')
            out.steps.push('empty-db')

            const account = await window.db.account.create({
                name: 'E2E Chequing',
                type: 'BANK',
                currency: 'CAD',
                description: 'Created by Electron smoke E2E',
            })
            assert(account.id > 0, 'Created account should have an id')
            out.accountId = account.id
            out.steps.push('create-account')

            const category = await window.db.category.create({
                name: 'E2E Groceries',
                kind: 'EXPENSE',
                color: '#f59e0b',
                description: 'Created by Electron smoke E2E',
            })
            assert(category.id > 0, 'Created category should have an id')
            out.categoryId = category.id
            out.steps.push('create-category')

            const transaction = await window.db.transaction.create({
                label: 'E2E Grocery run',
                amount: 42.5,
                sourceAmount: 42.5,
                sourceCurrency: 'CAD',
                conversionMode: 'NONE',
                kind: 'EXPENSE',
                date: '2026-05-04',
                note: 'Initial transaction from E2E',
                accountId: account.id,
                categoryId: category.id,
            })
            assert(transaction.id > 0, 'Created transaction should have an id')
            same(transaction.account.id, account.id, 'Transaction should include account relation')
            same(transaction.category.id, category.id, 'Transaction should include category relation')
            out.transactionId = transaction.id
            out.steps.push('create-transaction')

            const updatedTransaction = await window.db.transaction.update(transaction.id, {
                label: 'E2E Grocery run edited',
                amount: 52.75,
                sourceAmount: 52.75,
                sourceCurrency: 'CAD',
                conversionMode: 'NONE',
                kind: 'EXPENSE',
                date: '2026-05-05',
                note: 'Edited transaction from E2E',
                accountId: account.id,
                categoryId: category.id,
            })
            same(updatedTransaction.label, 'E2E Grocery run edited', 'Transaction edit should persist label')
            same(Number(updatedTransaction.amount), 52.75, 'Transaction edit should persist amount')
            out.steps.push('edit-transaction')

            await window.db.transaction.delete(updatedTransaction.id)
            const afterDeleteTransactions = await window.db.transaction.list()
            assert(!afterDeleteTransactions.some((row) => row.id === updatedTransaction.id), 'Deleted transaction should be absent')
            out.steps.push('delete-transaction')

            const budget = await window.db.budgetTarget.create({
                name: 'E2E Monthly grocery budget',
                amount: 400,
                period: 'MONTHLY',
                startDate: '2026-05-01',
                endDate: null,
                currency: 'CAD',
                isActive: true,
                note: 'Created by Electron smoke E2E',
                categoryId: category.id,
            })
            assert(budget.id > 0, 'Created budget should have an id')
            same(budget.category.id, category.id, 'Budget should include category relation')
            out.budgetId = budget.id
            out.steps.push('create-budget')

            const recurring = await window.db.recurringTemplate.create({
                label: 'E2E Weekly grocery recurring',
                sourceAmount: 33,
                sourceCurrency: 'CAD',
                accountAmount: 33,
                conversionMode: 'NONE',
                kind: 'EXPENSE',
                note: 'Created by Electron smoke E2E',
                frequency: 'WEEKLY',
                intervalCount: 1,
                startDate: '2026-05-01',
                nextOccurrenceDate: '2026-05-01',
                endDate: '2026-05-15',
                isActive: true,
                accountId: account.id,
                categoryId: category.id,
            })
            assert(recurring.id > 0, 'Created recurring template should have an id')
            out.recurringId = recurring.id
            out.steps.push('create-recurring')

            const generated = await window.db.recurringTemplate.generateDue({
                templateId: recurring.id,
                asOfDate: '2026-05-31',
            })
            same(generated.generatedTemplates, 1, 'Recurring generation should touch one template')
            same(generated.generatedTransactions, 3, 'Recurring generation should create three weekly rows')
            out.steps.push('generate-recurring')

            const generatedRows = await window.db.transaction.list()
            same(generatedRows.length, 3, 'Only generated recurring transactions should remain')
            assert(
                generatedRows.every((row) => row.label === 'E2E Weekly grocery recurring'),
                'Generated recurring rows should keep the template label',
            )
            out.generatedTransactionCount = generatedRows.length

            assert(typeof window.file.openText === 'function', 'file.openText should be exposed for restore/import smoke')
            assert(typeof window.file.saveText === 'function', 'file.saveText should be exposed for backup export smoke')
            assert(typeof window.backupEncryption?.encrypt === 'function', 'backupEncryption.encrypt should be exposed')
            out.steps.push('backup-restore-preload-contract')

            return {ok: true, ...out}
        } catch (error) {
            return {
                ok: false,
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : null,
                steps: out.steps,
            }
        }
    })()`, {awaitPromise: true})

    assert(result && result.ok, `Core renderer/IPC data flow failed after ${result?.steps?.join(' > ') || 'no steps'}: ${result?.message}\n${result?.stack || ''}`)
    return result
}

async function verifyUiReflectsData(cdp) {
    await navigateTo(cdp, 'AC')
    await assertText(cdp, 'E2E Chequing', 'created account')

    await navigateTo(cdp, 'CA')
    await assertText(cdp, 'E2E Groceries', 'created category')

    await navigateTo(cdp, 'BG')
    await assertText(cdp, 'E2E Monthly grocery budget', 'created budget')

    await navigateTo(cdp, 'RC')
    await assertText(cdp, 'E2E Weekly grocery recurring', 'created recurring template')

    await navigateTo(cdp, 'TX')
    await assertText(cdp, 'E2E Weekly grocery recurring', 'generated recurring transaction')

    await navigateTo(cdp, 'RP')
    await waitFor(async () => cdp.evaluate(`(() => {
        const text = document.body.innerText
        return text.includes('E2E Chequing') && text.includes('E2E Groceries')
    })()`), {
        message: 'Reports section did not render account/category rows from generated data',
    })

    const reportStats = await cdp.evaluate(`(() => {
        const text = document.body.innerText
        return {
            hasTransactionsLabel: /transactions|opérations/i.test(text),
            hasExpenseLabel: /expense|dépense/i.test(text),
            hasGeneratedAmount: text.includes('99') || text.includes('99.00') || text.includes('99,00'),
        }
    })()`)

    assert(reportStats.hasTransactionsLabel, 'Report summary should mention transactions')
    assert(reportStats.hasExpenseLabel, 'Report summary should mention expenses')
    assert(reportStats.hasGeneratedAmount, 'Report should include generated recurring total')
}

async function runSmokeTest() {
    const harness = await launchElectronE2e({
        prefix: 'budget-core-smoke-e2e',
        dbFileName: 'core-smoke.db',
        port: process.env.BUDGET_E2E_CDP_PORT || 9333,
    })

    const {cdp, logs} = harness

    try {
        await waitFor(async () => cdp.evaluate('Boolean(window.versions && window.appShell && window.db)'), {
            message: 'Preload APIs were not exposed to the renderer',
        })

        const ping = await cdp.evaluate('window.versions.ping()', {awaitPromise: true})
        assert(ping === 'pong', 'Expected IPC ping to return pong')

        const version = await cdp.evaluate('window.appShell.getVersion()', {awaitPromise: true})
        assert(typeof version === 'string' && version.length > 0, 'Expected app version to be readable')

        await waitFor(async () => cdp.evaluate('document.body.innerText.includes("Budget")'), {
            message: 'Budget shell did not render',
        })

        const navMarkers = await cdp.evaluate(`Array.from(document.querySelectorAll('nav button')).map((button) => button.innerText.trim().split(/\\s+/)[0])`)
        for (const marker of ['OV', 'TX', 'AC', 'CA', 'BG', 'RC', 'RP', 'WL', 'IM']) {
            assert(navMarkers.includes(marker), `Expected navigation marker ${marker} to be rendered`)
        }

        for (const marker of ['TX', 'AC', 'CA', 'BG', 'RC', 'RP', 'OV']) {
            await navigateTo(cdp, marker)
        }

        const flow = await runCoreDataFlow(cdp)
        await verifyUiReflectsData(cdp)

        console.log(
            `Desktop E2E smoke test passed against app version ${version}. Steps=${flow.steps.join(', ')}. Generated rows=${flow.generatedTransactionCount}`,
        )
    } catch (error) {
        const artifacts = await harness.captureFailureArtifacts('electron-core-smoke-failure')
        console.error('\nElectron output before failure:\n')
        console.error(logs.join('\n'))
        console.error(`\nE2E artifacts written to ${artifacts.artifactsDir}`)
        throw error
    } finally {
        await harness.cleanup()
    }
}

runSmokeTest().catch((error) => {
    console.error(error)
    process.exit(1)
})
