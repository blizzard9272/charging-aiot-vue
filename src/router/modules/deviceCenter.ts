import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: 'device-center',
    name: 'DeviceCenter',
    component: () => import('@/features/monitor-center/components/device-center/index.vue'),
    meta: { title: '设备中心', parentTitle: '监控中心' }
  },
  {
    path: 'device-center/create',
    name: 'DeviceCreate',
    component: () => import('@/features/monitor-center/components/device-center/create.vue'),
    meta: { title: '新增摄像头', parentTitle: '监控中心' }
  },
  {
    path: 'video-list',
    name: 'VideoList',
    redirect: '/monitor-center/video-list',
    meta: { title: '视频列表', parentTitle: '监控中心' }
  },
  {
    path: 'aiot-realtime',
    name: 'AiotRealtime',
    component: () => import('@/views/AiotRealtime/index.vue'),
    meta: { title: 'AI实时监控', parentTitle: '监控中心' }
  }
]

export default routes
