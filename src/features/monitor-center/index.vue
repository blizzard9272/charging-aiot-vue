<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import WorkbenchPanel from './components/WorkbenchPanel.vue'
import HistoryPlaybackPanel from './components/HistoryPlaybackPanel.vue'
import DeviceCenterView from '@/features/monitor-center/components/device-center/index.vue'
import GroupManagementPanel from './components/GroupManagementPanel.vue'

type SectionName = 'workbench' | 'group-management' | 'device-center' | 'video-list'

const route = useRoute()

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

const breadcrumbText = computed(() => {
  const parent = String(route.meta.parentTitle || '鐩戞帶涓績')
  const title = String(route.meta.title || '')
  const leaf = title.includes('-') ? title.split('-').at(-1) : title

  return `${parent} / ${leaf || '缁煎悎鐪嬫澘'}`
})
</script>

<template>
  <div class="monitor-center-page">
    <el-card shadow="never" class="title-card">
      <div class="title-row">
        <span class="breadcrumb-label">{{ breadcrumbText }}</span>
      </div>
    </el-card>

    <div class="section-content">
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

.title-row {
  display: flex;
  align-items: center;
  min-height: 44px;
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

