<script setup lang="ts">
import { computed } from 'vue'
import type { SyncCameraConfigResult } from '@/api/device'

const props = defineProps<{
  visible: boolean
  result: SyncCameraConfigResult | null
  title?: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
}>()

const summary = computed<SyncCameraConfigResult>(() => {
  return props.result || {
    total: 0,
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    failedItems: [],
    skippedItems: []
  }
})

const hasFailedItems = computed(() => summary.value.failedItems.length > 0)
const hasSkippedItems = computed(() => summary.value.skippedItems.length > 0)

const handleClose = () => {
  emit('update:visible', false)
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="title || '配置同步结果'"
    width="900px"
    destroy-on-close
    @update:model-value="(val: boolean) => emit('update:visible', val)"
    @close="handleClose"
  >
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">总条数</div>
        <div class="summary-value">{{ summary.total }}</div>
      </div>
      <div class="summary-card ok">
        <div class="summary-label">成功</div>
        <div class="summary-value">{{ summary.successCount }}</div>
      </div>
      <div class="summary-card warn">
        <div class="summary-label">跳过</div>
        <div class="summary-value">{{ summary.skippedCount }}</div>
      </div>
      <div class="summary-card err">
        <div class="summary-label">失败</div>
        <div class="summary-value">{{ summary.failedCount }}</div>
      </div>
    </div>

    <div v-if="hasFailedItems" class="section-block">
      <div class="section-title">失败明细</div>
      <el-table :data="summary.failedItems" border empty-text="暂无失败记录">
        <el-table-column prop="pathId" label="路径ID" width="100" align="center" />
        <el-table-column prop="deviceId" label="设备ID" width="100" align="center" />
        <el-table-column prop="pathName" label="路径名" min-width="160" show-overflow-tooltip />
        <el-table-column prop="code" label="状态码" width="100" align="center" />
        <el-table-column label="错误信息" min-width="320" show-overflow-tooltip>
          <template #default="{ row }">
            {{ typeof row.error === 'string' ? row.error : JSON.stringify(row.error) }}
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div v-if="hasSkippedItems" class="section-block">
      <div class="section-title">跳过明细</div>
      <el-table :data="summary.skippedItems" border empty-text="暂无跳过记录">
        <el-table-column prop="pathId" label="路径ID" width="100" align="center" />
        <el-table-column prop="deviceId" label="设备ID" width="100" align="center" />
        <el-table-column prop="pathName" label="路径名" min-width="180" show-overflow-tooltip />
        <el-table-column prop="reason" label="跳过原因" min-width="280" show-overflow-tooltip />
      </el-table>
    </div>

    <template #footer>
      <el-button type="primary" @click="handleClose">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.summary-card {
  padding: 14px 16px;
  border: 1px solid #e5eaf3;
  border-radius: 10px;
  background: #f8fbff;
}

.summary-card.ok {
  background: #f0fdf4;
}

.summary-card.warn {
  background: #fffbeb;
}

.summary-card.err {
  background: #fff1f2;
}

.summary-label {
  color: #6b7280;
  font-size: 12px;
}

.summary-value {
  margin-top: 6px;
  color: #111827;
  font-size: 24px;
  font-weight: 700;
}

.section-block + .section-block {
  margin-top: 18px;
}

.section-title {
  margin-bottom: 10px;
  color: #374151;
  font-size: 14px;
  font-weight: 700;
}
</style>
