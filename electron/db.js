const {PrismaClient} = require('@prisma/client')
const {resolveDatabasePath} = require('./db/resolveDatabasePath')

let prisma = null

function toSqliteUrl(filePath) {
    return `file:${filePath.replace(/\\/g, '/')}`
}

function getPrisma() {
    if (!prisma) {
        const dbPath = resolveDatabasePath()
        process.env.DATABASE_URL = toSqliteUrl(dbPath)
        prisma = new PrismaClient()
    }

    return prisma
}

async function disconnectPrisma() {
    if (prisma) {
        await prisma.$disconnect()
        prisma = null
    }
}

module.exports = {
    getPrisma,
    disconnectPrisma,
}