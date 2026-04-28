<script setup lang="ts">
import { Monitor, Edit, Delete, View } from '@element-plus/icons-vue'
import type { CameraDeviceVO } from '@/shared/types/monitor-center'

defineProps<{
  data: CameraDeviceVO[]
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'play', row: CameraDeviceVO): void
  (e: 'view-config', row: CameraDeviceVO): void
  (e: 'edit', row: CameraDeviceVO): void
  (e: 'delete', row: CameraDeviceVO): void
}>()

const protocolTypeLabelMap: Record<number, string> = {
  1: 'RTSP',
  2: 'GB28181',
  3: 'ONVIF'
}

const getProtocolTypeLabel = (protocolType: number) => {
  return protocolTypeLabelMap[protocolType] || `未知协议(${protocolType})`
}
</script>

<template>
  <el-table :data="data" v-loading="loading" border stripe style="width: 100%">
    <el-table-column prop="deviceName" label="设备名称" min-width="150" show-overflow-tooltip />

    <el-table-column label="品牌 / 型号" min-width="240">
      <template #default="{ row }">
        <div class="brand-model-cell">
          <div class="brand-line">品牌：{{ row.brand || '--' }}</div>
          <div class="model-line">型号：{{ row.model || '--' }}</div>
        </div>
      </template>
    </el-table-column>

    <el-table-column prop="groupName" label="分组" min-width="120" show-overflow-tooltip>
      <template #default="{ row }">
        {{ row.groupName || '--' }}
      </template>
    </el-table-column>

    <el-table-column label="设备IP / 端口" min-width="170" show-overflow-tooltip>
      <template #default="{ row }">
        {{ row.ipAddress || '--' }}<span v-if="row.port">:{{ row.port }}</span>
      </template>
    </el-table-column>

    <el-table-column label="协议类型" width="120" align="center">
      <template #default="{ row }">
        <el-tag effect="plain">{{ getProtocolTypeLabel(row.protocolType) }}</el-tag>
      </template>
    </el-table-column>

    <el-table-column label="在线状态" width="100" align="center">
      <template #default="{ row }">
        <el-tag :type="row.onlineStatus === 1 ? 'success' : 'info'">
          {{ row.onlineStatus === 1 ? '在线' : '离线' }}
        </el-tag>
      </template>
    </el-table-column>

    <el-table-column prop="location" label="安装位置" min-width="180" show-overflow-tooltip />

    <el-table-column label="操作" width="200" fixed="right">
      <template #default="{ row }">
        <div class="action-grid">
          <el-tooltip
            :content="row.onlineStatus === 1 ? '监控预览' : '设备离线，暂不可监控'"
            placement="top"
          >
            <el-button
              type="primary"
              link
              :icon="Monitor"
              :disabled="row.onlineStatus !== 1"
              @click="emit('play', row)"
            >
              监控
            </el-button>
          </el-tooltip>
          <el-button type="primary" link :icon="View" @click="emit('view-config', row)">流配置</el-button>
          <el-button type="primary" link :icon="Edit" @click="emit('edit', row)">编辑</el-button>
          <el-button type="danger" link :icon="Delete" @click="emit('delete', row)">删除</el-button>
        </div>
      </template>
    </el-table-column>
  </el-table>
</template>

<style scoped>
.brand-model-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  line-height: 1.45;
}

.brand-line,
.model-line {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  row-gap: 4px;
  column-gap: 10px;
}

.action-grid :deep(.el-button) {
  margin-left: 0;
  justify-content: flex-start;
}

:deep(.el-table .cell) {
  line-height: 1.55;
}

:deep(.el-table__row > td) {
  padding-top: 12px;
  padding-bottom: 12px;
}
</style>
