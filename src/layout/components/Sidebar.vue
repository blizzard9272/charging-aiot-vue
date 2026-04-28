<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  CollectionTag,
  DataLine,
  FolderOpened,
  Odometer,
  Platform,
  User,
  VideoCamera
} from '@element-plus/icons-vue'
import { resolveTopNavByPath, topNavList } from '@/layout/navigation'

const props = defineProps<{
  isCollapse: boolean
}>()

interface MenuItem {
  key: string
  path: string
  name: string
  icon?: Component
}

const iconByKey: Record<string, Component> = {
  'monitor-workbench': Platform,
  'monitor-group': CollectionTag,
  'monitor-device': Odometer,
  'monitor-video': VideoCamera,
  'snapshot-data': DataLine,
  'snapshot-101': DataLine,
  'snapshot-102': DataLine,
  'snapshot-103': DataLine,
  'info-personnel': User,
  'info-storage': FolderOpened
}

const route = useRoute()
const router = useRouter()
const activeMenu = ref(route.path)
const activeTopNav = computed(() => resolveTopNavByPath(route.path))

const menuList = computed<MenuItem[]>(() => {
  const group = topNavList.find((item) => item.key === activeTopNav.value)
  if (!group) return []
  return group.children.map((child) => ({
    key: child.key,
    path: child.path,
    name: child.name,
    icon: iconByKey[child.key]
  }))
})

watch(
  () => route.path,
  (path) => {
    activeMenu.value = path
  },
  { immediate: true }
)

const navigateTo = async (path: string) => {
  if (!path.startsWith('/')) return
  if (path === route.path) return
  await router.push(path)
}
</script>

<template>
  <el-menu
    :default-active="activeMenu"
    :collapse="props.isCollapse"
    class="sidebar-menu"
    background-color="transparent"
    text-color="#b9cbec"
    active-text-color="#409eff"
  >
    <template v-for="item in menuList" :key="item.key">
      <el-menu-item :index="item.path" @click="navigateTo(item.path)">
        <template #title>
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.name }}</span>
        </template>
      </el-menu-item>
    </template>
  </el-menu>
</template>

<style scoped>
.sidebar-menu {
  flex: 1;
  border-right: none;
  overflow-y: auto;
  background: transparent;
}

.sidebar-menu::-webkit-scrollbar {
  display: none;
}

.sidebar-menu:not(.el-menu--collapse) {
  width: 250px;
}

:deep(.el-menu) {
  background: transparent;
}

:deep(.el-sub-menu__title),
:deep(.el-menu-item) {
  color: #b9cbec !important;
}

:deep(.el-sub-menu__title:hover),
:deep(.el-menu-item:hover) {
  background: rgba(123, 163, 226, 0.14) !important;
  color: #e6efff !important;
}

:deep(.el-menu-item.is-active) {
  background: linear-gradient(90deg, rgba(79, 142, 232, 0.28), rgba(34, 104, 196, 0.08)) !important;
  color: #eaf2ff !important;
  box-shadow: inset 2px 0 0 #5b8ff9;
}

:deep(.el-sub-menu__title i),
:deep(.el-menu-item i) {
  color: #95b0df;
}
</style>

