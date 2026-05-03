const {PrismaClient} = require('@prisma/client')

const prisma = new PrismaClient()

const demoFileHash = 'seed-import-demo-csv-2026-05-03'

async function ensureBaseData() {
    const account = await prisma.account.upsert({
        where: {id: 1},
        update: {},
        create: {
            name: 'Main account',
            type: 'BANK',
            currency: 'CAD',
            description: 'Default seeded account for import demo',
        },
    })

    const category = await prisma.category.upsert({
        where: {name: 'Groceries'},
        update: {},
        create: {
            name: 'Groceries',
            kind: 'EXPENSE',
            color: '#f59e0b',
        },
    })

    let transaction = await prisma.transaction.findFirst({
        where: {
            label: 'Imported demo groceries',
            accountId: account.id,
            categoryId: category.id,
        },
    })

    if (!transaction) {
        transaction = await prisma.transaction.create({
            data: {
                label: 'Imported demo groceries',
                amount: 42.5,
                kind: 'EXPENSE',
                date: new Date('2026-05-01T00:00:00.000Z'),
                sourceAmount: 42.5,
                sourceCurrency: 'CAD',
                note: 'Created from seeded import demo data',
                accountId: account.id,
                categoryId: category.id,
            },
        })
    }

    return {account, category, transaction}
}

async function main() {
    const {account, transaction} = await ensureBaseData()

    await prisma.importBatch.deleteMany({
        where: {fileHash: demoFileHash},
    })

    const source = await prisma.importSource.upsert({
        where: {sourceKey: 'seed:csv:main-account'},
        update: {
            name: 'Seed CSV import source',
            provider: 'seed-demo-bank',
            sourceType: 'CSV_FILE',
            importType: 'TRANSACTIONS',
            defaultCurrency: 'CAD',
            defaultAccountId: account.id,
            metadataJson: JSON.stringify({delimiter: ',', dateFormat: 'YYYY-MM-DD'}),
            note: 'Local-first demo source for the import pipeline data model.',
        },
        create: {
            sourceKey: 'seed:csv:main-account',
            name: 'Seed CSV import source',
            provider: 'seed-demo-bank',
            sourceType: 'CSV_FILE',
            importType: 'TRANSACTIONS',
            defaultCurrency: 'CAD',
            defaultAccountId: account.id,
            metadataJson: JSON.stringify({delimiter: ',', dateFormat: 'YYYY-MM-DD'}),
            note: 'Local-first demo source for the import pipeline data model.',
        },
    })

    const importedAt = new Date('2026-05-03T00:00:00.000Z')
    const batch = await prisma.importBatch.create({
        data: {
            status: 'PARTIALLY_APPLIED',
            importType: 'TRANSACTIONS',
            provider: source.provider,
            fileName: 'seed-transactions-demo.csv',
            fileHash: demoFileHash,
            defaultCurrency: 'CAD',
            parserVersion: 'seed-demo-v1',
            sourceMetadataJson: JSON.stringify({encoding: 'utf-8', originalColumns: ['date', 'label', 'amount', 'currency']}),
            retentionPolicyJson: JSON.stringify({strategy: 'deleteBatchCascadeKeepAppliedEntities', keepRawRowsUntil: 'manual-cleanup'}),
            rowCount: 2,
            errorCount: 1,
            duplicateCount: 0,
            importedAt,
            parsedAt: importedAt,
            previewedAt: importedAt,
            appliedAt: importedAt,
            note: 'Demo batch showing raw rows, normalized rows, one validation error and one applied transaction link.',
            sourceId: source.id,
        },
    })

    const validRawRow = await prisma.importRawRow.create({
        data: {
            batchId: batch.id,
            rowNumber: 1,
            rawText: '2026-05-01,Imported demo groceries,-42.50,CAD',
            rawJson: JSON.stringify({date: '2026-05-01', label: 'Imported demo groceries', amount: '-42.50', currency: 'CAD'}),
            rawHash: 'seed-row-1-valid',
            status: 'APPLIED',
        },
    })

    const invalidRawRow = await prisma.importRawRow.create({
        data: {
            batchId: batch.id,
            rowNumber: 2,
            rawText: 'not-a-date,Broken row,abc,CAD',
            rawJson: JSON.stringify({date: 'not-a-date', label: 'Broken row', amount: 'abc', currency: 'CAD'}),
            rawHash: 'seed-row-2-invalid',
            status: 'INVALID',
        },
    })

    const normalizedRow = await prisma.importNormalizedRow.create({
        data: {
            batchId: batch.id,
            rawRowId: validRawRow.id,
            rowNumber: 1,
            status: 'APPLIED',
            targetKind: 'TRANSACTION',
            normalizedJson: JSON.stringify({
                label: transaction.label,
                amount: transaction.amount,
                kind: transaction.kind,
                date: transaction.date.toISOString(),
                accountId: account.id,
                sourceCurrency: 'CAD',
            }),
            transactionDate: transaction.date,
            label: transaction.label,
            amount: transaction.amount,
            currency: 'CAD',
            accountName: account.name,
            externalRef: 'seed-row-1-valid',
            duplicateKey: `transaction:${account.id}:2026-05-01:42.5:Imported demo groceries`,
            duplicateConfidence: 0.98,
        },
    })

    await prisma.importError.create({
        data: {
            batchId: batch.id,
            rawRowId: invalidRawRow.id,
            stage: 'VALIDATION',
            severity: 'ERROR',
            code: 'INVALID_AMOUNT',
            message: 'Amount must be a finite number before normalization.',
            field: 'amount',
            detailsJson: JSON.stringify({received: 'abc', rowNumber: 2}),
        },
    })

    const decision = await prisma.importReconciliationDecision.create({
        data: {
            batchId: batch.id,
            normalizedRowId: normalizedRow.id,
            action: 'CREATE',
            status: 'APPLIED',
            confidence: 0.98,
            reason: 'No existing transaction matched the demo duplicate key at apply time.',
            decisionJson: JSON.stringify({duplicateCheck: 'strict-key', selectedTarget: 'transaction'}),
            decidedBy: 'seed',
            decidedAt: importedAt,
        },
    })

    await prisma.importAppliedLink.create({
        data: {
            batchId: batch.id,
            normalizedRowId: normalizedRow.id,
            decisionId: decision.id,
            entityType: 'TRANSACTION',
            operation: 'CREATED',
            transactionId: transaction.id,
            appliedAt: importedAt,
            entitySnapshotJson: JSON.stringify({
                id: transaction.id,
                label: transaction.label,
                amount: transaction.amount,
                kind: transaction.kind,
                date: transaction.date.toISOString(),
                accountId: transaction.accountId,
            }),
        },
    })
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (error) => {
        console.error(error)
        await prisma.$disconnect()
        process.exit(1)
    })
