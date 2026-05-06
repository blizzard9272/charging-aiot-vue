import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://172.18.7.124'
  const videoTarget = env.VITE_DEV_VIDEO_TARGET || proxyTarget

  return {
    plugins: [vue()],
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
