import axios from 'axios'
import type { AxiosInstance, AxiosResponse } from 'axios'
import { ElMessage } from 'element-plus'
import { clearAuth, getAuthToken } from '@/utils/auth'

const isSilentErrorRequest = (config: any): boolean => {
  const headers = config?.headers
  if (!headers) return false

  if (typeof headers.get === 'function') {
    const value = headers.get('X-Silent-Error') ?? headers.get('x-silent-error')
    return String(value || '') === '1'
  }

  const value = headers['X-Silent-Error'] ?? headers['x-silent-error']
  return String(value || '') === '1'
}

const rewriteLegacyPhpRoute = (url?: string, method?: string, params?: any) => {
  if (!url) return url

  const streamMatch = url.match(/^\/stream\/query\/(101|102|103|page|stats)\/?$/)
  if (streamMatch) {
    const routeMap: Record<string, string> = {
      '101': '/charging-aiot-php/api/protocol-data/data-center/query-101.php',
      '102': '/charging-aiot-php/api/protocol-data/data-center/query-102.php',
      '103': '/charging-aiot-php/api/protocol-data/data-center/query-103.php',
      page: '/charging-aiot-php/api/protocol-data/data-center/page.php',
      stats: '/charging-aiot-php/api/protocol-data/data-center/stats.php'
    }
    return routeMap[streamMatch[1]] || url
  }

  const uploadMatch = url.match(/^\/upload\/(\d+)\/?$/)
  if (uploadMatch) {
    const routeMap: Record<string, string> = {
      '101': '/charging-aiot-php/api/protocol-data/data-center/upload-101.php',
      '102': '/charging-aiot-php/api/protocol-data/data-center/upload-102.php',
      '103': '/charging-aiot-php/api/protocol-data/data-center/upload-103.php'
    }
    return routeMap[uploadMatch[1]] || url
  }

  if (/^\/api\/upload_stream_records(\?|$)/.test(url)) {
    if (params?.action === 'frame') {
      return '/charging-aiot-php/api/protocol-data/data-center/frame.php'
    }
    if (params?.action === 'cameras') {
      return '/charging-aiot-php/api/protocol-data/data-center/cameras.php'
    }
    return '/charging-aiot-php/api/protocol-data/data-center/records.php'
  }

  if (/^\/api\/upload_stream(\?|$)/.test(url)) {
    return '/charging-aiot-php/api/protocol-data/data-center/upload-stream.php'
  }

  if (/^\/api\/storage_settings(\?|$)/.test(url)) {
    return (method || '').toUpperCase() === 'PUT'
      ? '/charging-aiot-php/api/information-management/storage/update.php'
      : '/charging-aiot-php/api/information-management/storage/list.php'
  }

  if (/^\/auth\/login(\?|$)/.test(url)) {
    return '/charging-aiot-php/api/auth.php?action=login'
  }

  if (/^\/auth\/me(\?|$)/.test(url)) {
    return '/charging-aiot-php/api/auth.php?action=me'
  }

  if (/^\/personnel\/page(\?|$)/.test(url)) {
    return '/charging-aiot-php/api/information-management/personnel/page.php'
  }

  if (/^\/personnel\/create(\?|$)/.test(url)) {
    return '/charging-aiot-php/api/information-management/personnel/create.php'
  }

  if (/^\/personnel\/update(\?|$)/.test(url)) {
    return '/charging-aiot-php/api/information-management/personnel/update.php'
  }

  if (/^\/personnel\/delete(\?|$)/.test(url)) {
    return '/charging-aiot-php/api/information-management/personnel/delete.php'
  }

  if (/^\/monitor\/syncCameraConfig\/?$/.test(url)) {
    return '/charging-aiot-php/api/monitor-center/device-center/sync-camera-config.php'
  }
  if (/^\/monitor\/mediamtx\/health\/?$/.test(url)) {
    return '/charging-aiot-php/api/monitor-center/device-center/media-mtx-health.php'
  }

  if (/^\/monitor\/page\/devices\/?$/.test(url)) {
    return '/charging-aiot-php/api/monitor-center/device-center/list.php'
  }

  if (/^\/monitor\/groups\/?$/.test(url)) {
    return '/charging-aiot-php/api/monitor-center/group-management/list.php'
  }

  if (/^\/monitor\/groups\/devices\/?$/.test(url)) {
    return '/charging-aiot-php/api/monitor-center/group-management/device-list.php'
  }

  if (/^\/monitor\/group\/?$/.test(url)) {
    const methodUpper = (method || '').toUpperCase()
    if (methodUpper === 'PUT') {
      return '/charging-aiot-php/api/monitor-center/group-management/update.php'
    }
    if (methodUpper === 'POST') {
      return '/charging-aiot-php/api/monitor-center/group-management/create.php'
    }
    return '/charging-aiot-php/api/monitor-center/group-management/list.php'
  }

  if (/^\/monitor\/workbench\/audit\/?$/.test(url)) {
    return '/charging-aiot-php/api/monitor-center/workbench/audit.php'
  }

  if (/^\/monitor\/playback\/list\/?$/.test(url)) {
    return '/charging-aiot-php/api/monitor-center/video-list/list.php'
  }

  const deviceFormMatch = url.match(/^\/monitor\/device\/form\/(\d+)\/?$/)
  if (deviceFormMatch) {
    return `/charging-aiot-php/api/monitor-center/device-center/form.php?id=${deviceFormMatch[1]}`
  }

  const deviceStreamsMatch = url.match(/^\/monitor\/device\/streams\/(\d+)\/?$/)
  if (deviceStreamsMatch) {
    return `/charging-aiot-php/api/monitor-center/device-center/streams.php?id=${deviceStreamsMatch[1]}`
  }

  const deleteCheckMatch = url.match(/^\/monitor\/device\/delete-check\/(\d+)\/?$/)
  if (deleteCheckMatch) {
    return `/charging-aiot-php/api/monitor-center/device-center/delete-check.php?id=${deleteCheckMatch[1]}`
  }

  if (/^\/monitor\/device\/?$/.test(url)) {
    const methodUpper = (method || '').toUpperCase()
    if (methodUpper === 'PUT') {
      return '/charging-aiot-php/api/monitor-center/device-center/update.php'
    }
    if (methodUpper === 'POST') {
      return '/charging-aiot-php/api/monitor-center/device-center/create.php'
    }
    return '/charging-aiot-php/api/monitor-center/device-center/delete.php'
  }

  return url
}

const service: AxiosInstance = axios.create({
  baseURL: '/',
  timeout: 10000
})

service.interceptors.request.use(
  (config) => {
    config.url = rewriteLegacyPhpRoute(config.url, config.method, config.params)

    const token = getAuthToken()
    if (token) {
      if (typeof config.headers?.set === 'function') {
        config.headers.set('Authorization', `Bearer ${token}`)
      } else {
        ;(config.headers as any) = {
          ...(config.headers || {}),
          Authorization: `Bearer ${token}`
        }
      }
    }

    return config
  },
  (error) => Promise.reject(error)
)

service.interceptors.response.use(
  (response: AxiosResponse) => {
    const res = response.data
    const silentError = isSilentErrorRequest(response.config)

    if (res.code !== 1) {
      if (!silentError) {
        ElMessage.error(res.msg || 'Request failed')
      }
      return Promise.reject(new Error(res.msg || 'Error'))
    }

    return res
  },
  (error) => {
    const status = error?.response?.status
    if (status === 401) {
      clearAuth()
      if (window.location.pathname !== '/login') {
        const redirect = encodeURIComponent(window.location.pathname + window.location.search)
        window.location.href = `/login?redirect=${redirect}`
      }
    }

    const backendMsg = error?.response?.data?.msg
    const finalMsg = backendMsg || error.message || 'Network error'
    const silentError = isSilentErrorRequest(error?.config)
    if (!silentError) {
      ElMessage.error(finalMsg)
    }

    if (backendMsg) {
      return Promise.reject(new Error(backendMsg))
    }
    return Promise.reject(error)
  }
)

export default service
