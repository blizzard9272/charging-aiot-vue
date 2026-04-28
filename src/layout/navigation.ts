export interface SecondaryNavItem {
  key: string
  path: string
  name: string
}

export interface TopNavItem {
  key: string
  name: string
  defaultPath: string
  children: SecondaryNavItem[]
}

export const topNavList: TopNavItem[] = [
  {
    key: 'monitor',
    name: '监控中心',
    defaultPath: '/monitor-center/workbench',
    children: [
      { key: 'monitor-workbench', path: '/monitor-center/workbench', name: '综合看板' },
      { key: 'monitor-group', path: '/monitor-center/group-management', name: '分组管理' },
      { key: 'monitor-device', path: '/monitor-center/device-center', name: '设备管理' },
      { key: 'monitor-video', path: '/monitor-center/video-list', name: '视频列表' }
    ]
  },
  {
    key: 'snapshot',
    name: '协议数据解析',
    defaultPath: '/snapshot-center/data-center',
    children: [
      { key: 'snapshot-data', path: '/snapshot-center/data-center', name: '数据展示中心' },
      { key: 'snapshot-101', path: '/snapshot-center/data-center/101', name: '101 数据展示' },
      { key: 'snapshot-102', path: '/snapshot-center/data-center/102', name: '102 数据展示' },
      { key: 'snapshot-103', path: '/snapshot-center/data-center/103', name: '103 数据展示' }
    ]
  },
  {
    key: 'info',
    name: '信息管理',
    defaultPath: '/info-management/personnel',
    children: [
      { key: 'info-personnel', path: '/info-management/personnel', name: '人员管理' },
      { key: 'info-storage', path: '/info-management/storage', name: '存储管理' }
    ]
  }
]

export const resolveTopNavByPath = (path: string) => {
  if (path.startsWith('/snapshot-center')) return 'snapshot'
  if (path.startsWith('/info-management') || path.startsWith('/personnel')) return 'info'
  return 'monitor'
}
