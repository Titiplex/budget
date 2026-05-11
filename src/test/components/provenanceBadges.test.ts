import {mount} from '@vue/test-utils'
import {describe, expect, it} from 'vitest'
import FreshnessBadge from '../../components/provenance/FreshnessBadge.vue'
import ProvenanceBadge from '../../components/provenance/ProvenanceBadge.vue'
import DataOriginTooltip from '../../components/provenance/DataOriginTooltip.vue'
import {provenanceTooltip} from '../../components/provenance/provenanceDisplay'
import type {DataProvenance} from '../../types/provenance'

const provenance: DataProvenance = {
    origin: 'csvImport',
    sourceType: 'csvFile',
    sourceLabel: 'checking.csv',
    importBatchId: 'batch-42',
    provider: 'bank-a',
    createdAt: '2026-05-11T10:00:00.000Z',
    updatedAt: '2026-05-11T10:05:00.000Z',
    observedAt: '2026-05-11T10:00:00.000Z',
    staleAfter: '30d',
    confidence: 'high',
    metadata: {fileName: 'checking.csv'},
}

describe('provenance UI badges', () => {
    it('renders a compact provenance badge with a safe tooltip', () => {
        const wrapper = mount(ProvenanceBadge, {props: {provenance, compact: true}})

        expect(wrapper.text()).toContain('Impo')
        expect(wrapper.attributes('title')).toContain('checking.csv')
        expect(wrapper.attributes('title')).not.toMatch(/token|password|apiKey/i)
    })

    it('renders freshness states with readable labels and stale reason', () => {
        const wrapper = mount(FreshnessBadge, {props: {status: 'stale', provenance}})

        expect(wrapper.text()).toContain('Obsolète')
        expect(wrapper.attributes('title')).toContain('Donnée considérée obsolète')
        expect(wrapper.attributes('title')).toContain('30d')
    })

    it('renders detailed origin tooltip content without exposing metadata secrets', () => {
        const wrapper = mount(DataOriginTooltip, {props: {provenance, freshnessStatus: 'fresh'}})

        expect(wrapper.text()).toContain('Provenance')
        expect(wrapper.text()).toContain('Importé')
        expect(wrapper.text()).toContain('checking.csv')
        expect(wrapper.text()).toContain('Fraîcheur')
        expect(wrapper.text()).not.toMatch(/token|password|apiKey/i)
    })

    it('builds plain tooltip text for title attributes', () => {
        const text = provenanceTooltip(provenance, 'stale')

        expect(text).toContain('Origine: Importé')
        expect(text).toContain('Batch import: batch-42')
        expect(text).toContain('Statut: Obsolète')
        expect(text).not.toMatch(/secret|password|token|api/i)
    })
})
