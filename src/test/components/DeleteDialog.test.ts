import {mount} from '@vue/test-utils'
import {describe, expect, it} from 'vitest'
import DeleteDialog from '../../components/DeleteDialog.vue'
import {i18n} from '../../i18n'

describe('DeleteDialog', () => {
    it('renders a specific heading for transfer deletion', () => {
        const wrapper = mount(DeleteDialog, {
            props: {
                open: true,
                busy: false,
                type: 'transaction',
                label: 'Virer vers épargne',
                heading: 'Supprimer le transfert interne',
                message: 'Supprimer ce transfert interne supprimera aussi le mouvement lié dans l’autre compte.',
            },
            global: {
                plugins: [i18n],
            },
        })

        expect(wrapper.text()).toContain('Supprimer le transfert interne')
        expect(wrapper.text()).toContain('Virer vers épargne')
    })
})