import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/test',
    name: 'Test',
    component: () => import('@/views/Test/test.vue'),
    meta: { title: '测试页面', parentTitle: '测试页面' }
  }
]

export default routes
