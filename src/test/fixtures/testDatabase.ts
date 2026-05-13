import type {DemoProfile} from './demoData'

export const DEFAULT_TEST_DATABASE_URL = 'file:./test-fixtures.db'

type PrismaLike = Record<string, any> & {
    $connect?: () => Promise<void>
    $disconnect?: () => Promise<void>
    $transaction: (operations: unknown[]) => Promise<unknown[]>
}

type SeededProfile = {
    accounts: Map<string, any>
    categories: Map<string, any>
    transactions: Map<string, any>
    budgets: Map<string, any>
    recurringTransactions: Map<string, any>
    assets: Map<string, any>
    portfolios: Map<string, any>
    liabilities: Map<string, any>
    netWorthSnapshots: Map<string, any>
    financialGoals: Map<string, any>
    projectionScenarios: Map<string, any>
    projectionSettings: Map<string, any>
    imports: Map<string, any>
}

export async function createTestPrismaClient(databaseUrl = DEFAULT_TEST_DATABASE_URL): Promise<PrismaLike> {
    process.env.DATABASE_URL = databaseUrl

    const {PrismaClient} = await import('@prisma/client')
    const prisma = new PrismaClient({
        datasources: {
            db: {url: databaseUrl},
        },
    }) as PrismaLike

    if (prisma.$connect) {
        await prisma.$connect()
    }

    return prisma
}

export async function resetTestDatabase(prisma: PrismaLike): Promise<void> {
    await prisma.$transaction([
        prisma.importAppliedLink.deleteMany(),
        prisma.importReconciliationDecision.deleteMany(),
        prisma.importError.deleteMany(),
        prisma.importNormalizedRow.deleteMany(),
        prisma.importRawRow.deleteMany(),
        prisma.importBatch.deleteMany(),
        prisma.importSource.deleteMany(),
        prisma.projectionResult.deleteMany(),
        prisma.projectionSetting.deleteMany(),
        prisma.projectionScenario.deleteMany(),
        prisma.financialGoal.deleteMany(),
        prisma.priceSnapshot.deleteMany(),
        prisma.investmentMovement.deleteMany(),
        prisma.investmentPosition.deleteMany(),
        prisma.investmentInstrument.deleteMany(),
        prisma.holdingLot.deleteMany(),
        prisma.marketInstrument.deleteMany(),
        prisma.liability.deleteMany(),
        prisma.portfolio.deleteMany(),
        prisma.asset.deleteMany(),
        prisma.netWorthSnapshot.deleteMany(),
        prisma.recurringTransactionTemplate.deleteMany(),
        prisma.budgetTarget.deleteMany(),
        prisma.transaction.deleteMany(),
        prisma.category.deleteMany(),
        prisma.account.deleteMany(),
        prisma.taxProfile.deleteMany(),
    ])
}

export async function createCleanTestDatabase(
    profile: DemoProfile,
    options: {databaseUrl?: string; prisma?: PrismaLike} = {},
): Promise<{prisma: PrismaLike; seeded: SeededProfile}> {
    const prisma = options.prisma ?? (await createTestPrismaClient(options.databaseUrl))

    await resetTestDatabase(prisma)

    return {prisma, seeded: await seedDemoProfile(prisma, profile)}
}

export async function seedDemoProfile(prisma: PrismaLike, profile: DemoProfile): Promise<SeededProfile> {
    const seeded: SeededProfile = {
        accounts: new Map(),
        categories: new Map(),
        transactions: new Map(),
        budgets: new Map(),
        recurringTransactions: new Map(),
        assets: new Map(),
        portfolios: new Map(),
        liabilities: new Map(),
        netWorthSnapshots: new Map(),
        financialGoals: new Map(),
        projectionScenarios: new Map(),
        projectionSettings: new Map(),
        imports: new Map(),
    }

    for (const account of profile.accounts) {
        seeded.accounts.set(account.key, await prisma.account.create({data: withoutFixtureKeys(account)}))
    }

    for (const category of profile.categories) {
        seeded.categories.set(category.key, await prisma.category.create({data: withoutFixtureKeys(category)}))
    }

    for (const transaction of [...profile.transactions, ...profile.transfers]) {
        const {key, accountKey, categoryKey, transferPeerAccountKey, ...data} = transaction
        const created = await prisma.transaction.create({
            data: {
                ...data,
                accountId: requireMappedId(seeded.accounts, accountKey, `transaction ${key} account`),
                categoryId: optionalMappedId(seeded.categories, categoryKey),
                transferPeerAccountId: optionalMappedId(seeded.accounts, transferPeerAccountKey),
            },
        })

        seeded.transactions.set(key, created)
    }

    for (const budget of profile.budgets) {
        const {key, categoryKey, ...data} = budget
        seeded.budgets.set(
            key,
            await prisma.budgetTarget.create({
                data: {
                    ...data,
                    categoryId: requireMappedId(seeded.categories, categoryKey, `budget ${key} category`),
                },
            }),
        )
    }

    for (const recurring of profile.recurringTransactions) {
        const {key, accountKey, categoryKey, ...data} = recurring
        seeded.recurringTransactions.set(
            key,
            await prisma.recurringTransactionTemplate.create({
                data: {
                    ...data,
                    accountId: requireMappedId(seeded.accounts, accountKey, `recurring ${key} account`),
                    categoryId: optionalMappedId(seeded.categories, categoryKey),
                },
            }),
        )
    }

    for (const asset of profile.assets) {
        seeded.assets.set(asset.key, await prisma.asset.create({data: withoutFixtureKeys(asset)}))
    }

    for (const portfolio of profile.portfolios) {
        const {key, accountKey, ...data} = portfolio
        seeded.portfolios.set(
            key,
            await prisma.portfolio.create({
                data: {
                    ...data,
                    accountId: optionalMappedId(seeded.accounts, accountKey),
                },
            }),
        )
    }

    for (const liability of profile.liabilities) {
        const {key, accountKey, securedAssetKey, ...data} = liability
        seeded.liabilities.set(
            key,
            await prisma.liability.create({
                data: {
                    ...data,
                    accountId: optionalMappedId(seeded.accounts, accountKey),
                    securedAssetId: optionalMappedId(seeded.assets, securedAssetKey),
                },
            }),
        )
    }

    for (const snapshot of profile.netWorthSnapshots) {
        seeded.netWorthSnapshots.set(snapshot.key, await prisma.netWorthSnapshot.create({data: withoutFixtureKeys(snapshot)}))
    }

    for (const goal of profile.financialGoals) {
        const {
            key,
            trackedAssetKey,
            trackedPortfolioKey,
            trackedLiabilityKey,
            baselineSnapshotKey,
            ...data
        } = goal

        seeded.financialGoals.set(
            key,
            await prisma.financialGoal.create({
                data: {
                    ...data,
                    trackedAssetId: optionalMappedId(seeded.assets, trackedAssetKey),
                    trackedPortfolioId: optionalMappedId(seeded.portfolios, trackedPortfolioKey),
                    trackedLiabilityId: optionalMappedId(seeded.liabilities, trackedLiabilityKey),
                    baselineNetWorthSnapshotId: optionalMappedId(seeded.netWorthSnapshots, baselineSnapshotKey),
                },
            }),
        )
    }

    for (const scenario of profile.projectionScenarios) {
        seeded.projectionScenarios.set(scenario.key, await prisma.projectionScenario.create({data: withoutFixtureKeys(scenario)}))
    }

    for (const setting of profile.projectionSettings) {
        const {key, goalKey, scenarioKey, ...data} = setting
        seeded.projectionSettings.set(
            key,
            await prisma.projectionSetting.create({
                data: {
                    ...data,
                    goalId: requireMappedId(seeded.financialGoals, goalKey, `projection setting ${key} goal`),
                    scenarioId: requireMappedId(seeded.projectionScenarios, scenarioKey, `projection setting ${key} scenario`),
                },
            }),
        )
    }

    await seedImports(prisma, profile, seeded)

    return seeded
}

async function seedImports(prisma: PrismaLike, profile: DemoProfile, seeded: SeededProfile): Promise<void> {
    for (const importFixture of profile.imports) {
        const importedAt = new Date(profile.fixedNow)
        const source = await prisma.importSource.create({
            data: {
                sourceKey: `fixture:${importFixture.key}`,
                name: importFixture.fileName,
                provider: importFixture.provider,
                sourceType: 'CSV_FILE',
                importType: 'TRANSACTIONS',
                defaultCurrency: importFixture.defaultCurrency,
                defaultAccountId: requireMappedId(seeded.accounts, importFixture.accountKey, `import ${importFixture.key} account`),
                metadataJson: JSON.stringify({fixtureKey: importFixture.key, delimiter: ',', fixedNow: profile.fixedNow.toISOString()}),
                note: 'Generated from deterministic test fixture data.',
            },
        })

        const batch = await prisma.importBatch.create({
            data: {
                status: importFixture.rows.some((row) => row.error) ? 'PARTIALLY_APPLIED' : 'APPLIED',
                importType: 'TRANSACTIONS',
                provider: importFixture.provider,
                fileName: importFixture.fileName,
                fileHash: `fixture-${importFixture.key}`,
                defaultCurrency: importFixture.defaultCurrency,
                parserVersion: 'fixture-v1',
                sourceMetadataJson: JSON.stringify({fixtureKey: importFixture.key, rowCount: importFixture.rows.length}),
                retentionPolicyJson: JSON.stringify({strategy: 'fixture-local-only'}),
                rowCount: importFixture.rows.length,
                errorCount: importFixture.rows.filter((row) => row.error).length,
                duplicateCount: 0,
                importedAt,
                parsedAt: importedAt,
                previewedAt: importedAt,
                appliedAt: importedAt,
                sourceId: source.id,
            },
        })

        const importState = {source, batch, rows: new Map<number, any>(), normalizedRows: new Map<number, any>()}

        for (const row of importFixture.rows) {
            const rawRow = await prisma.importRawRow.create({
                data: {
                    batchId: batch.id,
                    rowNumber: row.rowNumber,
                    rawText: row.rawText,
                    rawJson: JSON.stringify(row.rawJson),
                    rawHash: `${importFixture.key}:${row.rowNumber}`,
                    status: row.status,
                },
            })

            importState.rows.set(row.rowNumber, rawRow)

            if (row.normalized) {
                const normalizedRow = await prisma.importNormalizedRow.create({
                    data: {
                        batchId: batch.id,
                        rawRowId: rawRow.id,
                        rowNumber: row.rowNumber,
                        status: row.status,
                        targetKind: 'TRANSACTION',
                        normalizedJson: JSON.stringify({
                            ...row.normalized,
                            transactionDate: row.normalized.transactionDate.toISOString(),
                        }),
                        transactionDate: row.normalized.transactionDate,
                        label: row.normalized.label,
                        amount: row.normalized.amount,
                        currency: row.normalized.currency,
                        accountName: seeded.accounts.get(importFixture.accountKey)?.name ?? null,
                        externalRef: row.normalized.externalRef,
                        duplicateKey: row.normalized.duplicateKey,
                        duplicateConfidence: row.normalized.duplicateConfidence,
                    },
                })

                importState.normalizedRows.set(row.rowNumber, normalizedRow)
            }

            if (row.error) {
                await prisma.importError.create({
                    data: {
                        batchId: batch.id,
                        rawRowId: rawRow.id,
                        stage: row.error.stage,
                        severity: row.error.severity,
                        code: row.error.code,
                        message: row.error.message,
                        field: row.error.field,
                        detailsJson: row.error.detailsJson,
                    },
                })
            }
        }

        seeded.imports.set(importFixture.key, importState)
    }
}

function withoutFixtureKeys<T extends Record<string, any>>(fixture: T): Record<string, any> {
    const clone: Record<string, any> = {...fixture}
    for (const key of Object.keys(clone)) {
        if (key === 'key' || key.endsWith('Key')) {
            delete clone[key]
        }
    }

    return clone
}

function requireMappedId(map: Map<string, any>, key: string, context: string): number {
    const row = map.get(key)

    if (!row || typeof row.id !== 'number') {
        throw new Error(`Missing fixture relation for ${context}: ${key}`)
    }

    return row.id
}

function optionalMappedId(map: Map<string, any>, key?: string): number | null {
    if (!key) return null
    return requireMappedId(map, key, 'optional relation')
}
