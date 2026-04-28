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
    meta: { title: '淇℃伅绠＄悊-浜哄憳绠＄悊', parentTitle: '淇℃伅绠＄悊' }
  },
  {
    path: 'info-management/storage',
    name: 'StorageManagement',
    component: () => import('@/features/information-management/StorageManagement.vue'),
    meta: { title: '淇℃伅绠＄悊-瀛樺偍绠＄悊', parentTitle: '淇℃伅绠＄悊' }
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

