import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: 'snapshot-center',
    redirect: '/snapshot-center/data-center',
    meta: { title: '协议数据分析', parentTitle: '协议数据分析' }
  },
  {
    path: 'snapshot-center/command-center',
    name: 'SnapshotCenter',
    component: () => import('@/features/snapshot-center/index.vue'),
    meta: { title: '实时展示', parentTitle: '协议数据分析' }
  },
  {
    path: 'snapshot-center/data-center',
    name: 'SnapshotDataCenter',
    component: () => import('@/features/snapshot-center/DataCenter.vue'),
    meta: { title: '101-103 数据展示', parentTitle: '协议数据分析' }
  },
  {
    path: 'snapshot-center/data-center/101',
    name: 'SnapshotProtocol101',
    component: () => import('@/features/snapshot-center/ProtocolDataPage.vue'),
    meta: { title: '101 数据展示', parentTitle: '协议数据分析', protocol: 101 }
  },
  {
    path: 'snapshot-center/data-center/102',
    name: 'SnapshotProtocol102',
    component: () => import('@/features/snapshot-center/ProtocolDataPage.vue'),
    meta: { title: '102 数据展示', parentTitle: '协议数据分析', protocol: 102 }
  },
  {
    path: 'snapshot-center/data-center/103',
    name: 'SnapshotProtocol103',
    component: () => import('@/features/snapshot-center/ProtocolDataPage.vue'),
    meta: { title: '103 数据展示', parentTitle: '协议数据分析', protocol: 103 }
  }
]

export default routes
