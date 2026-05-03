<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { getMediaMtxHealth, syncCameraConfig } from '@/api/device'
import type { MediaMtxHealthResult, SyncCameraConfigResult } from '@/api/device'
import WorkbenchPanel from './components/WorkbenchPanel.vue'
import HistoryPlaybackPanel from './components/HistoryPlaybackPanel.vue'
import DeviceCenterView from '@/features/monitor-center/components/device-center/index.vue'
import GroupManagementPanel from './components/GroupManagementPanel.vue'
import SyncCameraConfigResultDialog from './components/SyncCameraConfigResultDialog.vue'

type SectionName = 'workbench' | 'group-management' | 'device-center' | 'video-list'

const SYNC_STATUS_BASE_TEXT = '\u6b63\u5728\u4ece\u6570\u636e\u5e93\u540c\u6b65 MediaMTX \u914d\u7f6e\uff0c\u8bf7\u7a0d\u5019\u518d\u9884\u89c8\u89c6\u9891\u6216\u68c0\u67e5\u5f55\u5236\u8bbe\u7f6e\u3002'
const SYNC_BUTTON_TEXT = '\u624b\u52a8\u56de\u704c'
const SYNC_ALERT_TITLE = 'MediaMTX \u540c\u6b65\u4e2d'
const SYNC_LOADING_TEXT = 'MediaMTX \u6b63\u5728\u4ece\u6570\u636e\u5e93\u540c\u6b65\u914d\u7f6e...'
const SYNC_RESULT_TITLE = '\u624b\u52a8\u56de\u704c\u7ed3\u679c'
const MANUAL_SYNC_FAILED_TEXT = '\u624b\u52a8\u56de\u704c\u5931\u8d25'
const DEFAULT_PARENT_TITLE = '\u76d1\u63a7\u4e2d\u5fc3'
const DEFAULT_LEAF_TITLE = '\u7efc\u5408\u770b\u677f'

const route = useRoute()
const mediaMtxHealth = ref<MediaMtxHealthResult | null>(null)
const syncLoading = ref(false)
const syncResultDialogVisible = ref(false)
const syncResult = ref<SyncCameraConfigResult | null>(null)
let healthTimer: number | null = null

const sectionComponentMap: Record<SectionName, any> = {
  workbench: WorkbenchPanel,
  'group-management': GroupManagementPanel,
  'device-center': DeviceCenterView,
  'video-list': HistoryPlaybackPanel
}

const getSectionByPath = (path: string): SectionName => {
  if (path.includes('/monitor-center/group-management')) return 'group-management'
  if (path.includes('/monitor-center/device-center')) return 'device-center'
  if (path.includes('/monitor-center/video-list')) return 'video-list'
  return 'workbench'
}

const activeSection = computed<SectionName>(() => getSectionByPath(route.path))
const currentSectionComponent = computed(() => sectionComponentMap[activeSection.value])

const isMediaMtxSyncing = computed(() => {
  const health = mediaMtxHealth.value
  if (!health) return false

  const nowTs = Number(health.nowTs || 0)
  const lastAttemptTs = Number(health.lastAttemptTs || 0)
  const lastSuccessTs = Number(health.lastSuccessTs || 0)
  const intervalSeconds = Math.max(Number(health.intervalSeconds || 0), 30)

  if (lastSuccessTs > 0) return false
  if (lastAttemptTs <= 0) return true

  return nowTs > 0 && nowTs - lastAttemptTs <= intervalSeconds * 2
})

const syncStatusText = computed(() => {
  const health = mediaMtxHealth.value
  if (!health) {
    return SYNC_STATUS_BASE_TEXT
  }

  if (health.lastAttemptAt) {
    return `${SYNC_STATUS_BASE_TEXT}\u4e0a\u6b21\u540c\u6b65\u5c1d\u8bd5\u65f6\u95f4\uff1a${health.lastAttemptAt}\u3002`
  }

  return SYNC_STATUS_BASE_TEXT
})

const breadcrumbText = computed(() => {
  const parent = String(route.meta.parentTitle || DEFAULT_PARENT_TITLE)
  const title = String(route.meta.title || '')
  const leaf = title.includes('-') ? title.split('-').at(-1) : title

  return `${parent} / ${leaf || DEFAULT_LEAF_TITLE}`
})

const fetchMediaMtxHealth = async () => {
  try {
    const res = await getMediaMtxHealth()
    mediaMtxHealth.value = res.data || null
  } catch (_error) {
    mediaMtxHealth.value = null
  }
}

const handleManualSync = async () => {
  if (syncLoading.value) return

  syncLoading.value = true
  try {
    const res = await syncCameraConfig()
    const result = res.data || null

    syncResult.value = result
    syncResultDialogVisible.value = true

    if (result && result.failedCount > 0) {
      ElMessage.warning(`\u56de\u704c\u5b8c\u6210\uff0c\u4f46\u6709 ${result.failedCount} \u6761\u5931\u8d25\uff0c${result.skippedCount} \u6761\u8df3\u8fc7`)
    } else {
      ElMessage.success(`\u56de\u704c\u5b8c\u6210\uff1a\u6210\u529f ${result?.successCount ?? 0} \u6761\uff0c\u8df3\u8fc7 ${result?.skippedCount ?? 0} \u6761`)
    }

    await fetchMediaMtxHealth()
    window.dispatchEvent(new CustomEvent('monitor-center-sync-finished'))
  } catch (error: any) {
    ElMessage.error(error?.message || MANUAL_SYNC_FAILED_TEXT)
  } finally {
    syncLoading.value = false
  }
}

onMounted(async () => {
  await fetchMediaMtxHealth()
  healthTimer = window.setInterval(() => {
    fetchMediaMtxHealth()
  }, 3000)
})

onUnmounted(() => {
  if (healthTimer !== null) {
    window.clearInterval(healthTimer)
    healthTimer = null
  }
})
</script>

<template>
  <div class="monitor-center-page">
    <el-card shadow="never" class="title-card">
      <div class="title-row">
        <span class="breadcrumb-label">{{ breadcrumbText }}</span>
        <el-button
          v-if="activeSection === 'workbench'"
          class="title-sync-btn"
          type="primary"
          :icon="Refresh"
          :loading="syncLoading"
          @click="handleManualSync"
        >
          {{ SYNC_BUTTON_TEXT }}
        </el-button>
      </div>
    </el-card>

    <el-alert
      v-if="isMediaMtxSyncing"
      class="sync-alert"
      :title="SYNC_ALERT_TITLE"
      type="warning"
      :closable="false"
      show-icon
      :description="syncStatusText"
    />

    <div
      class="section-content"
      v-loading="isMediaMtxSyncing"
      :element-loading-text="SYNC_LOADING_TEXT"
      element-loading-background="rgba(255, 255, 255, 0.72)"
    >
      <component :is="currentSectionComponent" />
    </div>

    <SyncCameraConfigResultDialog
      v-model:visible="syncResultDialogVisible"
      :result="syncResult"
      :title="SYNC_RESULT_TITLE"
    />
  </div>
</template>

<style scoped>
.monitor-center-page {
  min-height: 100%;
  background-color: #f0f2f5;
}

.title-card {
  border: none;
  margin-bottom: 10px;
}

.sync-alert {
  margin-bottom: 10px;
}

.title-row {
  display: flex;
  align-items: center;
  min-height: 44px;
}

.title-sync-btn {
  margin-left: auto;
}

.breadcrumb-label {
  color: #a4a8b2;
  font-size: 26px;
  font-weight: 500;
  letter-spacing: 0.5px;
}

:deep(.title-card .el-card__body) {
  padding-top: 10px;
  padding-bottom: 10px;
}

.section-content {
  min-height: 0;
}
</style>
