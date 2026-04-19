import './styles/output.css'
import {createApp} from 'vue'
import App from './App.vue'

createApp(App).mount('#app')

const func = async () => {
    const response = await window.versions.ping()
    console.log(response)
}

func()