import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

// 引入 Vue Router 4
import router from './router'
// 引入 Pinia
import pinia from './store'
// 引入 Element Plus
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
// 引入中文包 (可选)
import zhCn from 'element-plus/es/locale/lang/zh-cn'

const app = createApp(App)

app.config.errorHandler = (error, instance, info) => {
  console.error('[app] runtime error:', error, info, instance)
}

window.addEventListener('error', (event) => {
  console.error('[window] error:', event.error || event.message)
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('[window] unhandled rejection:', event.reason)
})

// 注册插件
app.use(router)
app.use(pinia)
app.use(ElementPlus, {
  locale: zhCn,
})

app.mount('#app')
