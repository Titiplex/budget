import {createRequire} from 'node:module'
import {describe, expect, it} from 'vitest'

const require = createRequire(import.meta.url)
const {
  buildAssetPayload,
  createAsset,
  createLiability,
  createPortfolio,
  deletePortfolio,
  listLiabilities,
  listPortfolios,
  updateAsset,
  updateLiability,
  updatePortfolio,
} = require('../../../electron/ipc/wealthHandlers.js')

type Row = Record<string, any>

type FakeDb = {
  accounts: Row[]
  assets: Row[]
  portfolios: Row[]
  liabilities: Row[]
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function matchesContains(row: Row, fieldName: string, expected: string) {
  return typeof row[fieldName] === 'string' && row[fieldName].includes(expected)
}

function matchesWhere(row: Row, where: Row = {}) {
  return Object.entries(where).every(([fieldName, expected]) => {
    if (fieldName === 'OR' && Array.isArray(expected)) {
      return expected.some((entry) => matchesWhere(row, entry))
    }

    if (expected && typeof expected === 'object' && 'contains' in expected) {
      return matchesContains(row, fieldName, String(expected.contains))
    }

    return row[fieldName] === expected
  })
}

function sortRows(rows: Row[], orderBy: Row[] = []) {
  return [...rows].sort((a, b) => {
    for (const order of orderBy) {
      const [fieldName, direction] = Object.entries(order)[0]
      if (a[fieldName] === b[fieldName]) continue
      const result = a[fieldName] > b[fieldName] ? 1 : -1
      return direction === 'desc' ? -result : result
    }
    return 0
  })
}

function createDelegate(rows: Row[], nextIdRef: {value: number}, withRelations: (row: Row, include?: Row) => Row) {
  return {
    findUnique: async ({where, include}: {where: {id: number}; include?: Row}) => {
      const row = rows.find((entry) => entry.id === where.id)
      return row ? withRelations(row, include) : null
    },
    findMany: async ({where = {}, orderBy = [], include}: {where?: Row; orderBy?: Row[]; include?: Row} = {}) => {
      return sortRows(rows.filter((row) => matchesWhere(row, where)), orderBy).map((row) => withRelations(row, include))
    },
    create: async ({data, include}: {data: Row; include?: Row}) => {
      const now = new Date('2026-04-27T12:00:00.000Z')
      const row = {id: nextIdRef.value, ...data, createdAt: now, updatedAt: now}
      nextIdRef.value += 1
      rows.push(row)
      return withRelations(row, include)
    },
    update: async ({where, data, include}: {where: {id: number}; data: Row; include?: Row}) => {
      const index = rows.findIndex((row) => row.id === where.id)
      if (index < 0) throw new Error('Not found')
      rows[index] = {...rows[index], ...data, updatedAt: new Date('2026-04-27T12:01:00.000Z')}
      return withRelations(rows[index], include)
    },
    delete: async ({where}: {where: {id: number}}) => {
      const index = rows.findIndex((row) => row.id === where.id)
      if (index < 0) throw new Error('Not found')
      const [deleted] = rows.splice(index, 1)
      return withRelations(deleted)
    },
  }
}

function createFakePrisma(seed: Partial<FakeDb> = {}) {
  const db: FakeDb = {
    accounts: seed.accounts || [],
    assets: seed.assets || [],
    portfolios: seed.portfolios || [],
    liabilities: seed.liabilities || [],
  }
  const nextIdRef = {value: 1 + Math.max(0, ...Object.values(db).flat().map((row) => Number(row.id) || 0))}

  const prisma: any = {}
  prisma.account = createDelegate(db.accounts, nextIdRef, (row) => clone(row))
  prisma.asset = createDelegate(db.assets, nextIdRef, (row, include = {}) => ({
    ...clone(row),
    ...(include.securedLiabilities
      ? {securedLiabilities: db.liabilities.filter((liability) => liability.securedAssetId === row.id).map(clone)}
      : {}),
  }))
  prisma.portfolio = createDelegate(db.portfolios, nextIdRef, (row, include = {}) => ({
    ...clone(row),
    ...(include.account
      ? {account: db.accounts.find((account) => account.id === row.accountId) || null}
      : {}),
  }))
  prisma.liability = createDelegate(db.liabilities, nextIdRef, (row, include = {}) => ({
    ...clone(row),
    ...(include.account
      ? {account: db.accounts.find((account) => account.id === row.accountId) || null}
      : {}),
    ...(include.securedAsset
      ? {securedAsset: db.assets.find((asset) => asset.id === row.securedAssetId) || null}
      : {}),
  }))

  return {db, prisma}
}

describe('wealth IPC handler core', () => {
  it('creates assets with normalized payloads and relation includes', async () => {
    const {db, prisma} = createFakePrisma()

    const result = await createAsset(prisma, {
      name: '  Condo Montréal  ',
      type: 'real_estate',
      currency: 'cad',
      currentValue: '350000',
      acquisitionValue: '',
      acquiredAt: '2024-01-10',
      note: '  Résidence principale ',
    })

    expect(result.name).toBe('Condo Montréal')
    expect(result.type).toBe('REAL_ESTATE')
    expect(result.currency).toBe('CAD')
    expect(result.currentValue).toBe(350000)
    expect(result.acquisitionValue).toBeNull()
    expect(result.securedLiabilities).toEqual([])
    expect(db.assets).toHaveLength(1)
  })

  it('rejects invalid asset values before writing', async () => {
    const {db, prisma} = createFakePrisma()

    await expect(createAsset(prisma, {
      name: 'Voiture',
      currentValue: -1,
    })).rejects.toThrow('La valeur actuelle doit être positif ou nul.')

    expect(db.assets).toHaveLength(0)
  })

  it('updates assets partially without overwriting omitted fields', async () => {
    const {db, prisma} = createFakePrisma({
      assets: [{id: 1, name: 'Parts privées', type: 'BUSINESS', status: 'ACTIVE', currency: 'CAD', currentValue: 1000}],
    })

    expect(buildAssetPayload({currentValue: 1250}, {partial: true})).toEqual({currentValue: 1250})

    const result = await updateAsset(prisma, 1, {currentValue: 1250})

    expect(result.name).toBe('Parts privées')
    expect(result.currentValue).toBe(1250)
    expect(db.assets[0].type).toBe('BUSINESS')
  })

  it('covers portfolio create, list, update and delete', async () => {
    const {db, prisma} = createFakePrisma({
      accounts: [{id: 1, name: 'Courtage', type: 'BROKERAGE', currency: 'CAD'}],
    })

    const created = await createPortfolio(prisma, {
      name: '  Questrade  ',
      type: 'taxable_brokerage',
      currentValue: 10000,
      cashBalance: 500,
      accountId: 1,
    })

    expect(created.name).toBe('Questrade')
    expect(created.account?.name).toBe('Courtage')

    const listed = await listPortfolios(prisma, {portfolioType: 'TAXABLE_BROKERAGE'})
    expect(listed).toHaveLength(1)

    const updated = await updatePortfolio(prisma, created.id, {currentValue: 11000, cashBalance: 650})
    expect(updated.currentValue).toBe(11000)
    expect(updated.cashBalance).toBe(650)

    const deleted = await deletePortfolio(prisma, created.id)
    expect(deleted).toEqual({ok: true, id: created.id, entityType: 'portfolio'})
    expect(db.portfolios).toHaveLength(0)
  })

  it('validates liability links and lists filtered liabilities', async () => {
    const {prisma} = createFakePrisma({
      accounts: [{id: 1, name: 'Compte prêt', type: 'LOAN', currency: 'CAD'}],
      assets: [{id: 2, name: 'Maison', type: 'REAL_ESTATE', status: 'ACTIVE', currency: 'CAD', currentValue: 500000}],
    })

    await expect(createLiability(prisma, {
      name: 'Hypothèque fantôme',
      type: 'MORTGAGE',
      currentBalance: 100000,
      securedAssetId: 999,
    })).rejects.toThrow("L'actif garanti est introuvable.")

    const liability = await createLiability(prisma, {
      name: 'Hypothèque',
      type: 'mortgage',
      currency: 'cad',
      currentBalance: '250000',
      initialAmount: '300000',
      interestRate: 4.8,
      securedAssetId: 2,
      accountId: 1,
    })

    expect(liability.type).toBe('MORTGAGE')
    expect(liability.account?.name).toBe('Compte prêt')
    expect(liability.securedAsset?.name).toBe('Maison')

    const updated = await updateLiability(prisma, liability.id, {currentBalance: 245000})
    expect(updated.currentBalance).toBe(245000)

    const listed = await listLiabilities(prisma, {liabilityType: 'MORTGAGE', currency: 'CAD'})
    expect(listed.map((entry: Row) => entry.name)).toEqual(['Hypothèque'])
  })
})
