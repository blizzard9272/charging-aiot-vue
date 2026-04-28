import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: 'workbench',
    name: 'Workbench',
    component: () => import('@/views/Home.vue'),
    meta: { title: '工作台', parentTitle: '主导航' }
  }
]

export default routes
