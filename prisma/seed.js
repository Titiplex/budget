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

    await prisma.transaction.createMany({
        data: [
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
        ],
        skipDuplicates: true,
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