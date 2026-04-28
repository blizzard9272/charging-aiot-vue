import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: 'settings',
    name: 'Settings',
    component: () => import('@/views/Home.vue'),
    meta: { title: '系统设置', parentTitle: '主导航' }
  },
  {
    path: 'monitor-center',
    redirect: '/monitor-center/workbench',
    meta: { title: '监控中心', parentTitle: '监控中心' }
  },
  {
    path: 'monitor-center/workbench',
    name: 'MonitorCenterWorkbench',
    component: () => import('@/features/monitor-center/index.vue'),
    meta: { title: '监控中心-综合看板', parentTitle: '监控中心' }
  },
  {
    path: 'monitor-center/group-management',
    name: 'MonitorCenterGroupManagement',
    component: () => import('@/features/monitor-center/index.vue'),
    meta: { title: '监控中心-分组管理', parentTitle: '监控中心' }
  },
  {
    path: 'monitor-center/device-center',
    name: 'MonitorCenterDeviceCenter',
    component: () => import('@/features/monitor-center/index.vue'),
    meta: { title: '监控中心-设备管理', parentTitle: '监控中心' }
  },
  {
    path: 'monitor-center/video-list',
    name: 'MonitorCenterVideoList',
    component: () => import('@/features/monitor-center/index.vue'),
    meta: { title: '监控中心-视频列表', parentTitle: '监控中心' }
  }
]

export default routes
