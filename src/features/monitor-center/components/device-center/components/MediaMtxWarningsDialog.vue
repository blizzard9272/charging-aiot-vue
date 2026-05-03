<script setup lang="ts">
import { computed } from 'vue'
import type { MediaMtxWarningItem } from '@/api/device'

const props = withDefaults(defineProps<{
  visible: boolean
  warnings: MediaMtxWarningItem[]
  title?: string
}>(), {
  title: 'MediaMTX 同步警告'
})

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
}>()

const normalizedWarnings = computed(() => (Array.isArray(props.warnings) ? props.warnings : []))

const handleClose = () => {
  emit('update:visible', false)
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    width="760px"
    destroy-on-close
    @update:model-value="(val: boolean) => emit('update:visible', val)"
    @close="handleClose"
  >
    <div class="dialog-summary">
      共 {{ normalizedWarnings.length }} 条警告，表示数据库操作已完成，但 MediaMTX 配置同步或清理未完全成功。
    </div>

    <el-table :data="normalizedWarnings" border class="warning-table" empty-text="暂无警告">
      <el-table-column prop="pathName" label="路径名" min-width="160" show-overflow-tooltip />
      <el-table-column prop="code" label="状态码" width="100" align="center" />
      <el-table-column prop="message" label="警告信息" min-width="360" show-overflow-tooltip />
    </el-table>

    <template #footer>
      <el-button type="primary" @click="handleClose">知道了</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.dialog-summary {
  margin-bottom: 12px;
  color: #606266;
  line-height: 1.6;
}

.warning-table {
  width: 100%;
}
</style>
