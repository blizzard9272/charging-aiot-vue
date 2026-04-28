<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Expand, Fold, UserFilled, FullScreen } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { clearAuth, getAuthUser } from '@/utils/auth'
import { resolveTopNavByPath, topNavList } from '@/layout/navigation'

const props = defineProps<{
  isCollapse: boolean
}>()

const emit = defineEmits<{
  (event: 'toggle-collapse'): void
}>()

const route = useRoute()
const router = useRouter()
const username = computed(() => getAuthUser()?.username || '系统管理员')

const activeTopNav = ref('monitor')
const isFullscreen = ref(false)

watch(
  () => route.path,
  (path) => {
    activeTopNav.value = resolveTopNavByPath(path)
  },
  { immediate: true }
)

const handleTopNavChange = async (value: string) => {
  const target = topNavList.find((item) => item.key === value)
  if (!target) return
  if (route.path === target.defaultPath) return
  await router.push(target.defaultPath)
}

const handleTopMenuSelect = async (index: string) => {
  if (index.startsWith('/')) {
    if (route.path !== index) await router.push(index)
    return
  }
  await handleTopNavChange(index)
}

const handleTopTitleClick = async (key: string) => {
  await handleTopNavChange(key)
}

const handleLogout = async () => {
  try {
    await ElMessageBox.confirm('确认退出当前账号登录吗？', '退出登录', {
      confirmButtonText: '确认退出',
      cancelButtonText: '取消',
      type: 'warning'
    })

    clearAuth()
    ElMessage.success('已退出登录')
    router.replace('/login')
  } catch {
    // 用户取消退出
  }
}

const syncFullscreenState = () => {
  isFullscreen.value = Boolean(document.fullscreenElement)
}

const toggleFullscreen = async () => {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen()
  } else {
    await document.exitFullscreen()
  }
}

onMounted(() => {
  syncFullscreenState()
  document.addEventListener('fullscreenchange', syncFullscreenState)
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncFullscreenState)
})

const fullscreenTooltip = computed(() => isFullscreen.value ? '退出全屏' : '全屏显示')

const activeSubPath = computed(() => route.path)

const isTopActive = (key: string) => activeTopNav.value === key
</script>

<template>
  <div class="header-container">
    <div class="left-section">
      <el-icon class="toggle-icon" @click="emit('toggle-collapse')">
        <component :is="props.isCollapse ? Expand : Fold" />
      </el-icon>
      <el-menu
        :default-active="activeTopNav"
        mode="horizontal"
        :ellipsis="false"
        class="top-nav-menu"
        @select="handleTopMenuSelect"
      >
        <el-sub-menu
          v-for="item in topNavList"
          :key="item.key"
          :index="item.key"
          :class="{ 'top-submenu-active': isTopActive(item.key) }"
          @title-click="() => handleTopTitleClick(item.key)"
        >
          <template #title>{{ item.name }}</template>
          <el-menu-item
            v-for="child in item.children"
            :key="child.key"
            :index="child.path"
            :class="{ 'is-active-sub': activeSubPath === child.path }"
          >
            {{ child.name }}
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </div>

    <div class="right-section">
      <el-tooltip :content="fullscreenTooltip" placement="bottom">
        <el-icon class="refresh-icon" @click="toggleFullscreen"><FullScreen /></el-icon>
      </el-tooltip>
      <el-dropdown trigger="click">
        <span class="user-profile">
          <el-avatar :size="32" :icon="UserFilled" class="user-avatar" />
          <span class="user-name">{{ username }}</span>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item>个人中心</el-dropdown-item>
            <el-dropdown-item>系统设置</el-dropdown-item>
            <el-dropdown-item divided @click="handleLogout">退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<style scoped>
.header-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  padding: 0 20px;
  color: #303133;
  background: #fff;
}

.left-section {
  display: flex;
  align-items: center;
  min-width: 0;
}

.toggle-icon {
  font-size: 22px;
  cursor: pointer;
  margin-right: 20px;
  color: #606266;
  transition: color 0.3s;
}

.toggle-icon:hover {
  color: #409eff;
}

.top-nav-menu {
  margin-left: 16px;
  border-bottom: none;
  background: transparent;
  flex: 1;
  min-width: 0;
}

:deep(.top-nav-menu.el-menu--horizontal > .el-sub-menu .el-sub-menu__title) {
  height: 60px;
  line-height: 60px;
  color: #606266;
  border-bottom: 2px solid transparent;
  padding: 0 18px;
}

:deep(.top-nav-menu.el-menu--horizontal > .el-sub-menu .el-sub-menu__title:hover) {
  color: #409eff;
}

:deep(.top-nav-menu.el-menu--horizontal > .top-submenu-active .el-sub-menu__title) {
  color: #409eff;
  border-bottom-color: #409eff;
}

.right-section {
  display: flex;
  align-items: center;
}

.refresh-icon {
  font-size: 20px;
  cursor: pointer;
  margin-right: 20px;
  color: #606266;
}

.refresh-icon:hover {
  color: #409eff;
}

.user-profile {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 8px;
  transition: background-color 0.2s;
}

.user-profile:hover {
  background: rgba(64, 158, 255, 0.1);
}

.user-name {
  margin-left: 8px;
  font-size: 14px;
  color: #303133;
}

.user-avatar {
  background-color: #409eff;
}
</style>
