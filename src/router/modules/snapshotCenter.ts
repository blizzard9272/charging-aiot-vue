import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: 'snapshot-center',
    redirect: '/snapshot-center/data-center',
    meta: { title: '\u534f\u8bae\u6570\u636e\u89e3\u6790', parentTitle: '\u534f\u8bae\u6570\u636e\u89e3\u6790' }
  },
  {
    path: 'snapshot-center/command-center',
    name: 'SnapshotCenter',
    component: () => import('@/features/snapshot-center/index.vue'),
    meta: { title: '\u5b9e\u65f6\u5c55\u793a', parentTitle: '\u534f\u8bae\u6570\u636e\u89e3\u6790' }
  },
  {
    path: 'snapshot-center/data-center',
    name: 'SnapshotDataCenter',
    component: () => import('@/features/snapshot-center/DataCenter.vue'),
    meta: { title: '101-103 \u6570\u636e\u5c55\u793a', parentTitle: '\u534f\u8bae\u6570\u636e\u89e3\u6790' }
  },
  {
    path: 'snapshot-center/data-center/101',
    name: 'SnapshotProtocol101',
    component: () => import('@/features/snapshot-center/ProtocolDataPage.vue'),
    meta: { title: '101 \u6570\u636e\u5c55\u793a', parentTitle: '\u534f\u8bae\u6570\u636e\u89e3\u6790', protocol: 101 }
  },
  {
    path: 'snapshot-center/data-center/102',
    name: 'SnapshotProtocol102',
    component: () => import('@/features/snapshot-center/ProtocolDataPage.vue'),
    meta: { title: '102 \u6570\u636e\u5c55\u793a', parentTitle: '\u534f\u8bae\u6570\u636e\u89e3\u6790', protocol: 102 }
  },
  {
    path: 'snapshot-center/data-center/103',
    name: 'SnapshotProtocol103',
    component: () => import('@/features/snapshot-center/ProtocolDataPage.vue'),
    meta: { title: '103 \u6570\u636e\u5c55\u793a', parentTitle: '\u534f\u8bae\u6570\u636e\u89e3\u6790', protocol: 103 }
  }
]

export default routes
