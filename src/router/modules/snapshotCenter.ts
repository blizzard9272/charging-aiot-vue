import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: 'snapshot-center',
    redirect: '/snapshot-center/data-center',
    meta: { title: '鍗忚鏁版嵁瑙ｆ瀽', parentTitle: '鍗忚鏁版嵁瑙ｆ瀽' }
  },
  {
    path: 'snapshot-center/command-center',
    name: 'SnapshotCenter',
    component: () => import('@/features/snapshot-center/index.vue'),
    meta: { title: '瀹炴椂灞曠ず', parentTitle: '鍗忚鏁版嵁瑙ｆ瀽' }
  },
  {
    path: 'snapshot-center/data-center',
    name: 'SnapshotDataCenter',
    component: () => import('@/features/snapshot-center/DataCenter.vue'),
    meta: { title: '101-103 鏁版嵁灞曠ず', parentTitle: '鍗忚鏁版嵁瑙ｆ瀽' }
  },
  {
    path: 'snapshot-center/data-center/101',
    name: 'SnapshotProtocol101',
    component: () => import('@/features/snapshot-center/ProtocolDataPage.vue'),
    meta: { title: '101 鏁版嵁灞曠ず', parentTitle: '鍗忚鏁版嵁瑙ｆ瀽', protocol: 101 }
  },
  {
    path: 'snapshot-center/data-center/102',
    name: 'SnapshotProtocol102',
    component: () => import('@/features/snapshot-center/ProtocolDataPage.vue'),
    meta: { title: '102 鏁版嵁灞曠ず', parentTitle: '鍗忚鏁版嵁瑙ｆ瀽', protocol: 102 }
  },
  {
    path: 'snapshot-center/data-center/103',
    name: 'SnapshotProtocol103',
    component: () => import('@/features/snapshot-center/ProtocolDataPage.vue'),
    meta: { title: '103 鏁版嵁灞曠ず', parentTitle: '鍗忚鏁版嵁瑙ｆ瀽', protocol: 103 }
  }
]

export default routes

