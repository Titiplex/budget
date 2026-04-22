import type {Transaction} from '../types/budget'
import {formatMoney} from './budgetFormat'

export function collapseTransferTransactions(list: Transaction[]) {
    const seenGroups = new Set<string>()
    const grouped = new Map<string, Transaction[]>()

    for (const transaction of list) {
        if (!transaction.transferGroup) continue

        const bucket = grouped.get(transaction.transferGroup) || []
        bucket.push(transaction)
        grouped.set(transaction.transferGroup, bucket)
    }

    return list.filter((transaction) => {
        if (!transaction.transferGroup) return true
        if (seenGroups.has(transaction.transferGroup)) return false

        const group = grouped.get(transaction.transferGroup) || [transaction]
        const preferred = group.find((entry) => entry.transferDirection === 'OUT')
            || group.find((entry) => entry.transferDirection === 'IN')
            || group[0]

        if (preferred.id !== transaction.id) return false

        seenGroups.add(transaction.transferGroup)
        return true
    })
}

export function transferRoute(transaction: Transaction) {
    if (transaction.kind !== 'TRANSFER') return null

    const selfAccount = transaction.account?.name || 'Compte'
    const peerAccount = transaction.transferPeerAccount?.name || 'Compte lié'

    if (transaction.transferDirection === 'IN') {
        return `${peerAccount} → ${selfAccount}`
    }

    return `${selfAccount} → ${peerAccount}`
}

export function transferDirectionLabel(transaction: Transaction) {
    if (transaction.kind !== 'TRANSFER') return null
    if (transaction.transferDirection === 'IN') return 'Entrée liée'
    if (transaction.transferDirection === 'OUT') return 'Sortie liée'
    return 'Mouvement lié'
}

export function transferAccountHint(transaction: Transaction) {
    if (transaction.kind !== 'TRANSFER') return null
    if (transaction.transferDirection === 'IN') {
        return `depuis ${transaction.transferPeerAccount?.name || 'le compte lié'}`
    }
    return `vers ${transaction.transferPeerAccount?.name || 'le compte lié'}`
}

export function transferAmountHint(transaction: Transaction) {
    if (transaction.kind !== 'TRANSFER') return null

    if (transaction.transferDirection === 'IN' && transaction.sourceCurrency) {
        const accountCurrency = transaction.account?.currency || ''
        const sourceCurrency = transaction.sourceCurrency || ''

        if (accountCurrency && sourceCurrency && accountCurrency !== sourceCurrency && transaction.sourceAmount) {
            return `Origine : ${formatMoney(Math.abs(transaction.sourceAmount), sourceCurrency)}`
        }
    }

    if (transaction.transferDirection === 'IN') return 'Crédit interne'
    if (transaction.transferDirection === 'OUT') return 'Débit interne'
    return 'Mouvement interne'
}