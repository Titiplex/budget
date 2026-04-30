const {PrismaClient} = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
    const account = await prisma.account.upsert({
        where: {id: 1},
        update: {},
        create: {
            name: 'Main account',
            type: 'BANK',
            currency: 'CAD',
            description: 'Default seeded account',
        },
    })

    const incomeCategory = await prisma.category.upsert({
        where: {name: 'Salary'},
        update: {},
        create: {
            name: 'Salary',
            kind: 'INCOME',
            color: '#22c55e',
        },
    })

    const expenseCategory = await prisma.category.upsert({
        where: {name: 'Groceries'},
        update: {},
        create: {
            name: 'Groceries',
            kind: 'EXPENSE',
            color: '#f59e0b',
        },
    })

    let investmentAccount = await prisma.account.findFirst({
        where: {name: 'Demo investment account'},
    })

    if (investmentAccount) {
        investmentAccount = await prisma.account.update({
            where: {id: investmentAccount.id},
            data: {
                type: 'INVESTMENT',
                currency: 'CAD',
                description: 'Default seeded investment account',
            },
        })
    } else {
        investmentAccount = await prisma.account.create({
            data: {
                name: 'Demo investment account',
                type: 'INVESTMENT',
                currency: 'CAD',
                description: 'Default seeded investment account',
            },
        })
    }

    let demoPortfolio = await prisma.portfolio.findFirst({
        where: {name: 'Seeded brokerage portfolio'},
    })

    const portfolioData = {
        name: 'Seeded brokerage portfolio',
        type: 'TAXABLE_BROKERAGE',
        status: 'ACTIVE',
        currency: 'CAD',
        taxWrapper: 'NONE',
        valuationMode: 'CALCULATED',
        currentValue: 0,
        includeInNetWorth: true,
        ownershipPercent: 100,
        cashBalance: 0,
        accountId: investmentAccount.id,
        note: 'Demo portfolio seeded for local-first investment movements',
    }

    if (demoPortfolio) {
        demoPortfolio = await prisma.portfolio.update({
            where: {id: demoPortfolio.id},
            data: portfolioData,
        })
    } else {
        demoPortfolio = await prisma.portfolio.create({data: portfolioData})
    }

    const marketInstrument = await prisma.marketInstrument.upsert({
        where: {instrumentKey: 'manual:XEQT:TSX:CAD'},
        update: {},
        create: {
            instrumentKey: 'manual:XEQT:TSX:CAD',
            symbol: 'XEQT',
            name: 'iShares Core Equity ETF Portfolio',
            instrumentType: 'ETF',
            exchange: 'TSX',
            quoteCurrency: 'CAD',
            provider: 'manual',
            currentPrice: 32.5,
            currentPriceCurrency: 'CAD',
            currentPriceQuotedAt: new Date('2026-04-30T00:00:00.000Z'),
            currentPriceProvider: 'manual',
            freshnessStatus: 'FRESH',
        },
    })

    const investmentInstrument = await prisma.investmentInstrument.upsert({
        where: {instrumentKey: 'manual:XEQT:TSX:CAD'},
        update: {
            marketInstrumentId: marketInstrument.id,
        },
        create: {
            instrumentKey: 'manual:XEQT:TSX:CAD',
            name: 'iShares Core Equity ETF Portfolio',
            symbol: 'XEQT',
            assetClass: 'ETF',
            geographicRegion: 'GLOBAL',
            sector: null,
            currency: 'CAD',
            exchange: 'TSX',
            issuer: 'iShares',
            marketInstrumentId: marketInstrument.id,
        },
    })

    const investmentPosition = await prisma.investmentPosition.upsert({
        where: {
            portfolioId_accountId_instrumentId: {
                portfolioId: demoPortfolio.id,
                accountId: investmentAccount.id,
                instrumentId: investmentInstrument.id,
            },
        },
        update: {
            quantity: 10,
            averageUnitCost: 30,
            costBasis: 300,
            costCurrency: 'CAD',
            valueAsOf: new Date('2026-04-30T00:00:00.000Z'),
        },
        create: {
            portfolioId: demoPortfolio.id,
            accountId: investmentAccount.id,
            instrumentId: investmentInstrument.id,
            quantity: 10,
            averageUnitCost: 30,
            costBasis: 300,
            costCurrency: 'CAD',
            openedAt: new Date('2026-04-01T00:00:00.000Z'),
            valueAsOf: new Date('2026-04-30T00:00:00.000Z'),
        },
    })

    await prisma.investmentMovement.upsert({
        where: {
            accountId_externalRef: {
                accountId: investmentAccount.id,
                externalRef: 'seed-xeqt-buy-2026-04-01',
            },
        },
        update: {},
        create: {
            type: 'BUY',
            quantity: 10,
            unitPrice: 30,
            priceCurrency: 'CAD',
            feeAmount: 1,
            feeCurrency: 'CAD',
            operationDate: new Date('2026-04-01T00:00:00.000Z'),
            externalRef: 'seed-xeqt-buy-2026-04-01',
            portfolioId: demoPortfolio.id,
            accountId: investmentAccount.id,
            instrumentId: investmentInstrument.id,
            positionId: investmentPosition.id,
        },
    })

    await prisma.investmentMovement.upsert({
        where: {
            accountId_externalRef: {
                accountId: investmentAccount.id,
                externalRef: 'seed-xeqt-dividend-2026-04-30',
            },
        },
        update: {},
        create: {
            type: 'DIVIDEND',
            cashAmount: 2.4,
            cashCurrency: 'CAD',
            feeAmount: 0,
            feeCurrency: 'CAD',
            operationDate: new Date('2026-04-30T00:00:00.000Z'),
            externalRef: 'seed-xeqt-dividend-2026-04-30',
            portfolioId: demoPortfolio.id,
            accountId: investmentAccount.id,
            instrumentId: investmentInstrument.id,
            positionId: investmentPosition.id,
        },
    })

    const seededSnapshotDate = new Date('2026-04-30T00:00:00.000Z')
    const existingSnapshot = await prisma.priceSnapshot.findFirst({
        where: {
            investmentPositionId: investmentPosition.id,
            pricedAt: seededSnapshotDate,
            currency: 'CAD',
            provider: 'manual',
        },
    })

    if (existingSnapshot) {
        await prisma.priceSnapshot.update({
            where: {id: existingSnapshot.id},
            data: {
                unitPrice: 32.5,
                source: 'MANUAL',
                freshnessStatus: 'FRESH',
                marketInstrumentId: marketInstrument.id,
            },
        })
    } else {
        await prisma.priceSnapshot.create({
            data: {
                unitPrice: 32.5,
                currency: 'CAD',
                pricedAt: seededSnapshotDate,
                provider: 'manual',
                source: 'MANUAL',
                freshnessStatus: 'FRESH',
                marketInstrumentId: marketInstrument.id,
                investmentPositionId: investmentPosition.id,
            },
        })
    }

    const seededTransactions = [
        {
            label: 'First income',
            amount: 2500,
            kind: 'INCOME',
            date: new Date(),
            accountId: account.id,
            categoryId: incomeCategory.id,
        },
        {
            label: 'First groceries',
            amount: 82.4,
            kind: 'EXPENSE',
            date: new Date(),
            accountId: account.id,
            categoryId: expenseCategory.id,
        },
    ]

    for (const transaction of seededTransactions) {
        const existingTransaction = await prisma.transaction.findFirst({
            where: {
                label: transaction.label,
                accountId: transaction.accountId,
                categoryId: transaction.categoryId,
                kind: transaction.kind,
            },
        })

        if (!existingTransaction) {
            await prisma.transaction.create({data: transaction})
        }
    }
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
