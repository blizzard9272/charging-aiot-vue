import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://172.18.7.124'
  const videoTarget = env.VITE_DEV_VIDEO_TARGET || proxyTarget

  return {
    plugins: [vue()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('echarts')) return 'vendor-echarts'
            if (id.includes('element-plus') || id.includes('@element-plus')) return 'vendor-element-plus'
            if (id.includes('vue-router') || id.includes('pinia') || id.includes('/vue/')) return 'vendor-vue'
            if (id.includes('axios') || id.includes('dayjs')) return 'vendor-utils'
          }
        }
      }
    },
    server: {
      proxy: {
        '/charging-aiot-php': {
          target: proxyTarget,
          changeOrigin: true
        },
        '/videos': {
          target: videoTarget,
          changeOrigin: true
        }
      }
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    }
  }
})
