import './styles/output.css'
import {createApp} from 'vue'
import Root from './Root.vue'
import {i18n} from './i18n'

createApp(Root).use(i18n).mount('#app')