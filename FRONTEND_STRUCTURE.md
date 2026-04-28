# 前端结构说明

## 目标

这次重构的核心目标是把前端代码从“页面堆在 `views` 里”的状态，整理成“按业务模块分层”的状态。

当前前端主要分成三类业务模块：

1. 监控中心
2. 协议数据
3. 信息管理

同时把可复用的组件、公共类型和接口封装收口到独立目录，避免页面之间互相穿透引用。

## 目录总览

```text
src/
├── api/
│   ├── common.ts
│   ├── auth.ts
│   ├── device.ts
│   ├── personnel.ts
│   ├── snapshot.ts
│   ├── storageSettings.ts
│   ├── stream.ts
│   └── uploadStream.ts
├── features/
│   ├── information-management/
│   │   ├── index.vue
│   │   └── StorageManagement.vue
│   ├── monitor-center/
│   │   ├── index.vue
│   │   ├── mock.ts
│   │   └── components/
│   │       ├── GroupManagementPanel.vue
│   │       ├── HistoryPlaybackPanel.vue
│   │       ├── WorkbenchPanel.vue
│   │       └── device-center/
│   │           ├── create.vue
│   │           ├── index.vue
│   │           └── components/
│   │               ├── DeviceEditDialog.vue
│   │               ├── DeviceFilter.vue
│   │               └── DeviceTable.vue
│   └── snapshot-center/
│       ├── DataCenter.vue
│       ├── index.vue
│       ├── mock.ts
│       └── ProtocolDataPage.vue
├── layout/
├── router/
│   ├── index.ts
│   └── modules/
│       ├── deviceCenter.ts
│       ├── informationManagement.ts
│       ├── monitorCenter.ts
│       ├── snapshotCenter.ts
│       ├── test.ts
│       └── workbench.ts
├── shared/
│   ├── components/
│   │   ├── CanvasDetectionImage.vue
│   │   └── WebRTCPlayer.vue
│   └── types/
│       ├── monitor-center.ts
│       └── snapshot-center.ts
├── store/
├── utils/
├── views/
│   ├── Home.vue
│   ├── Login/
│   │   └── index.vue
│   ├── AiotRealtime/
│   │   └── index.vue
│   └── Test/
│       └── test.vue
├── App.vue
├── main.ts
└── style.css
```

## 各目录职责

### `src/api`

前端对后端 PHP 接口的统一封装层。

这里的文件只负责：

1. 定义请求参数类型
2. 定义响应类型
3. 拼接后端接口路径
4. 通过 `utils/request.ts` 发起请求

其中：

1. `common.ts`：公共响应壳，包含 `ApiResponse` 和 `PageResult`
2. `device.ts`：监控中心相关接口
3. `snapshot.ts`：协议数据查询接口
4. `personnel.ts`：人员管理接口
5. `storageSettings.ts`：存储策略接口
6. `stream.ts`：AIOT 实时流数据接口
7. `uploadStream.ts`：三协议数据流接口

### `src/features/monitor-center`

监控中心业务模块。

这里是监控中心的页面壳、子功能面板和设备管理子模块。

职责拆分如下：

1. `index.vue`：监控中心总入口，根据当前路由展示不同子面板
2. `components/WorkbenchPanel.vue`：综合看板
3. `components/GroupManagementPanel.vue`：分组管理
4. `components/HistoryPlaybackPanel.vue`：视频回放列表
5. `components/device-center/index.vue`：设备列表页
6. `components/device-center/create.vue`：新增设备页
7. `components/device-center/components/*`：设备模块内部拆分组件
8. `mock.ts`：监控中心相关模拟数据

### `src/features/snapshot-center`

协议数据业务模块。

这里集中管理 101 / 102 / 103 协议数据的展示、筛选、统计和帧详情。

职责拆分如下：

1. `index.vue`：协议数据中心入口
2. `DataCenter.vue`：协议数据总览页
3. `ProtocolDataPage.vue`：单协议数据页
4. `mock.ts`：协议数据模拟内容

### `src/features/information-management`

信息管理业务模块。

这里包含人员管理和存储管理两个子页面。

职责拆分如下：

1. `index.vue`：人员管理
2. `StorageManagement.vue`：存储配置管理

### `src/shared`

跨模块复用区。

这里放的是多个业务模块都会依赖的公共内容，避免业务目录之间互相引用。

1. `shared/components/CanvasDetectionImage.vue`：图片检测框绘制组件
2. `shared/components/WebRTCPlayer.vue`：WebRTC 播放组件
3. `shared/types/monitor-center.ts`：监控中心公共类型
4. `shared/types/snapshot-center.ts`：协议数据公共类型

### `src/router`

路由层只负责页面入口的组织，不承载业务实现。

当前采用 `router/modules/*` 按模块拆分路由配置：

1. `monitorCenter.ts`
2. `snapshotCenter.ts`
3. `informationManagement.ts`
4. `deviceCenter.ts`
5. `workbench.ts`
6. `test.ts`

### `src/views`

这里保留的是登录页、首页、AIOT 实时页和测试页等非主业务模块页面。

当前不再把监控中心、协议数据、信息管理这些业务页面继续放在这里。

### `src/layout`

全局布局层。

负责侧边栏、顶部栏、整体容器和路由内容展示。

### `src/store`、`src/utils`

1. `store`：全局状态管理
2. `utils`：请求封装、认证工具等通用工具

## 设计原则

1. 页面只依赖自己的 feature 目录和 `api` 层，不直接跨目录引用别的页面实现。
2. 可复用 UI 组件统一放到 `shared/components`。
3. 通用 TypeScript 类型统一放到 `shared/types` 或 `api/common.ts`。
4. 路由只引用 feature 页面，不直接引用零散的业务内部实现。
5. 目录命名尽量统一使用小写加连字符，减少大小写混用和历史拼写错误。

## 当前状态

这次重构已完成以下内容：

1. 监控中心、协议数据、信息管理全部迁到 `src/features/`
2. 原来分散在 `src/components` 和 `views` 内的共享部分已收口到 `src/shared/`
3. `api` 层的公共响应类型已抽到 `src/api/common.ts`
4. 路由模块 `infomation.ts` 已更正为 `informationManagement.ts`

## 验证结果

1. `npx vue-tsc -b` 已通过
2. `npm run build` 在当前 Windows 环境下仍会遇到 Vite/rolldown 的 `spawn EPERM`，这属于构建工具层问题，不是本次目录重构引入的类型错误

