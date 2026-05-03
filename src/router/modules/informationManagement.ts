import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: 'info-management',
    redirect: '/info-management/personnel'
  },
  {
    path: 'info-management/personnel',
    name: 'Personnel',
    component: () => import('@/features/information-management/index.vue'),
    meta: { title: '信息管理-人员管理', parentTitle: '信息管理' }
  },
  {
    path: 'info-management/storage',
    name: 'StorageManagement',
    component: () => import('@/features/information-management/StorageManagement.vue'),
    meta: { title: '信息管理-存储管理', parentTitle: '信息管理' }
  },
  {
    path: 'snapshot-center/info-management',
    redirect: '/info-management/personnel'
  },
  {
    path: 'personnel',
    redirect: '/info-management/personnel'
  }
]

export default routes
