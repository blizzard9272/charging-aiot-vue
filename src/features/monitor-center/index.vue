<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { getMediaMtxHealth, syncCameraConfig } from '@/api/device'
import type { MediaMtxHealthResult } from '@/api/device'
import WorkbenchPanel from './components/WorkbenchPanel.vue'
import HistoryPlaybackPanel from './components/HistoryPlaybackPanel.vue'
import DeviceCenterView from '@/features/monitor-center/components/device-center/index.vue'
import GroupManagementPanel from './components/GroupManagementPanel.vue'

type SectionName = 'workbench' | 'group-management' | 'device-center' | 'video-list'

const route = useRoute()
const mediaMtxHealth = ref<MediaMtxHealthResult | null>(null)
const syncLoading = ref(false)
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
    return 'MediaMTX is syncing config from the database. Please wait before previewing streams or checking recording settings.'
  }

  if (health.lastAttemptAt) {
    return `MediaMTX is syncing config from the database. Last sync attempt: ${health.lastAttemptAt}. Please wait before previewing streams or checking recording settings.`
  }

  return 'MediaMTX is syncing config from the database. Please wait before previewing streams or checking recording settings.'
})

const breadcrumbText = computed(() => {
  const parent = String(route.meta.parentTitle || 'Monitor Center')
  const title = String(route.meta.title || '')
  const leaf = title.includes('-') ? title.split('-').at(-1) : title

  return `${parent} / ${leaf || 'Workbench'}`
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
    const result = res.data

    if (result && result.failedCount > 0) {
      ElMessage.warning(`回灌完成，但有 ${result.failedCount} 条失败，${result.skippedCount} 条跳过`)
      console.warn('[MonitorCenter] syncCameraConfig failedItems', result.failedItems)
      console.warn('[MonitorCenter] syncCameraConfig skippedItems', result.skippedItems)
    } else {
      ElMessage.success(`回灌完成：成功 ${result?.successCount ?? 0} 条，跳过 ${result?.skippedCount ?? 0} 条`)
    }

    await fetchMediaMtxHealth()
    window.dispatchEvent(new CustomEvent('monitor-center-sync-finished'))
  } catch (error: any) {
    ElMessage.error(error?.message || '手动回灌失败')
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
          手动回灌
        </el-button>
      </div>
    </el-card>

    <el-alert
      v-if="isMediaMtxSyncing"
      class="sync-alert"
      title="MediaMTX Sync In Progress"
      type="warning"
      :closable="false"
      show-icon
      :description="syncStatusText"
    />

    <div
      class="section-content"
      v-loading="isMediaMtxSyncing"
      element-loading-text="MediaMTX is syncing config from the database..."
      element-loading-background="rgba(255, 255, 255, 0.72)"
    >
      <component :is="currentSectionComponent" />
    </div>
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
