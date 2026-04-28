// 路由配置文件
import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import Layout from '@/layout/index.vue'
import { hasAuthToken } from '@/utils/auth'

// 导入各个功能模块的路由
import workbenchRoutes from './modules/workbench'
import informationManagementRoutes from './modules/informationManagement'
import monitorCenterRoutes from './modules/monitorCenter'
import deviceCenterRoutes from './modules/deviceCenter'
import snapshotCenterRoutes from './modules/snapshotCenter'
import testRoutes from './modules/test'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login/index.vue'),
    meta: { title: '管理员登录' }
  },
  {
    path: '/',
    component: Layout,
    redirect: '/monitor-center/workbench',
    children: [
      ...workbenchRoutes,
      ...informationManagementRoutes,
      ...monitorCenterRoutes,
      ...deviceCenterRoutes,
      ...snapshotCenterRoutes,
      ...testRoutes
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/monitor-center/workbench'
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

router.beforeEach((to, _from, next) => {
  if (to.meta.title) {
    document.title = to.meta.title as string
  }

  const loggedIn = hasAuthToken()
  if (to.path === '/login') {
    if (loggedIn) {
      next('/monitor-center/workbench')
      return
    }
    next()
    return
  }

  if (!loggedIn) {
    next({ path: '/login', query: { redirect: to.fullPath } })
    return
  }

  next()
})

router.onError((error) => {
  console.error('[router] navigation error:', error)
  const currentPath = router.currentRoute.value.path
  if (currentPath !== '/monitor-center/workbench') {
    router.replace('/monitor-center/workbench').catch(() => undefined)
  }
})

export default router
