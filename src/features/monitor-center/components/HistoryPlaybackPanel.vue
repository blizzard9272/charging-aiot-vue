<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getMonitorPlaybackList, type MonitorPlaybackItem } from '@/api/device'

interface FolderNode {
  id: string
  label: string
  path: string
  children: FolderNode[]
}

const QUERY_CHUNK = 500

const allPlaybackList = ref<MonitorPlaybackItem[]>([])
const coverMap = ref<Record<number, string>>({})
const loading = ref(false)
const selectedFolderPath = ref('')

const filterForm = reactive({
  videoName: '',
  recordTimeRange: [] as string[]
})

const pageState = reactive({
  currentPage: 1,
  pageSize: 20
})

const normalizeVideoPath = (item: MonitorPlaybackItem) => {
  const fromPath = String(item.videoPath || '').replace(/^\/+/, '')
  if (fromPath) return fromPath
  try {
    const parsed = new URL(item.videoUrl)
    const segments = parsed.pathname.split('/').filter(Boolean)
    if (!segments.length) return ''
    const videosIndex = segments.findIndex((s) => s.toLowerCase() === 'videos')
    if (videosIndex >= 0) return segments.slice(videosIndex + 1).join('/')
    return segments.join('/')
  } catch (_error) {
    return ''
  }
}

const parseDateTime = (value: string) => {
  const time = new Date(value.replace(/-/g, '/')).getTime()
  return Number.isNaN(time) ? 0 : time
}

const formatBytes = (value?: number) => {
  const size = Number(value || 0)
  if (!Number.isFinite(size) || size <= 0) return '--'
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
}

const folderTree = computed<FolderNode[]>(() => {
  const roots: FolderNode[] = []
  const rootMap = new Map<string, FolderNode>()

  const ensureNode = (parent: FolderNode | null, fullPath: string, label: string) => {
    if (!parent) {
      if (!rootMap.has(fullPath)) {
        const node: FolderNode = { id: fullPath, label, path: fullPath, children: [] }
        rootMap.set(fullPath, node)
        roots.push(node)
      }
      return rootMap.get(fullPath)!
    }

    const existing = parent.children.find((child) => child.path === fullPath)
    if (existing) return existing
    const node: FolderNode = { id: fullPath, label, path: fullPath, children: [] }
    parent.children.push(node)
    return node
  }

  allPlaybackList.value.forEach((item) => {
    const normalizedPath = normalizeVideoPath(item)
    if (!normalizedPath) return
    const segments = normalizedPath.split('/').filter(Boolean)
    if (segments.length <= 1) return

    const folders = segments.slice(0, -1)
    let currentPath = ''
    let parent: FolderNode | null = null

    folders.forEach((segment) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment
      parent = ensureNode(parent, currentPath, segment)
    })
  })

  const sortTree = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
    nodes.forEach((node) => sortTree(node.children))
  }

  sortTree(roots)
  return roots
})

const filteredPlaybackList = computed(() => {
  const keyword = filterForm.videoName.trim().toLowerCase()
  const hasRange = Array.isArray(filterForm.recordTimeRange) && filterForm.recordTimeRange.length === 2
  const start = hasRange ? parseDateTime(filterForm.recordTimeRange[0]) : 0
  const end = hasRange ? parseDateTime(filterForm.recordTimeRange[1]) : Number.MAX_SAFE_INTEGER
  const folder = selectedFolderPath.value.trim().replace(/^\/+/, '')

  return allPlaybackList.value.filter((item) => {
    const matchName = !keyword || item.name.toLowerCase().includes(keyword)
    const recordTime = parseDateTime(item.recordTime)
    const matchTime = !hasRange || (recordTime >= start && recordTime <= end)
    const path = normalizeVideoPath(item)
    const matchFolder = !folder || path.startsWith(`${folder}/`) || path === folder
    return matchName && matchTime && matchFolder
  })
})

const pagedPlaybackList = computed(() => {
  const start = (pageState.currentPage - 1) * pageState.pageSize
  return filteredPlaybackList.value.slice(start, start + pageState.pageSize)
})

const loadPlaybackList = async () => {
  loading.value = true
  try {
    const merged: MonitorPlaybackItem[] = []
    let page = 1
    let queryTotal = 0

    while (page <= 200) {
      const res = await getMonitorPlaybackList({ page, pageSize: QUERY_CHUNK })
      queryTotal = Number(res.data.total || queryTotal || 0)
      const batch = Array.isArray(res.data.records) ? res.data.records : []
      if (!batch.length) break
      merged.push(...batch)
      if ((queryTotal > 0 && merged.length >= queryTotal) || batch.length < QUERY_CHUNK) break
      page += 1
    }

    allPlaybackList.value = merged
  } catch (_error) {
    ElMessage.error('视频列表加载失败')
    allPlaybackList.value = []
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  pageState.currentPage = 1
}

const handleReset = () => {
  filterForm.videoName = ''
  filterForm.recordTimeRange = []
  selectedFolderPath.value = ''
  pageState.currentPage = 1
}

const handleRefresh = () => {
  pageState.currentPage = 1
  loadPlaybackList()
}

const handleFolderSelect = (node: FolderNode) => {
  selectedFolderPath.value = node?.path || ''
  pageState.currentPage = 1
}

const handleCurrentChange = (page: number) => {
  pageState.currentPage = page
}

const handleSizeChange = (size: number) => {
  pageState.pageSize = size
  pageState.currentPage = 1
}

const dialogVisible = ref(false)
const currentVideo = ref<MonitorPlaybackItem | null>(null)
const videoRef = ref<HTMLVideoElement>()
const dialogWidth = ref('960px')
const videoMeta = reactive({
  width: 1920,
  height: 1080
})

const videoRatio = computed(() => {
  const width = Math.max(videoMeta.width, 1)
  const height = Math.max(videoMeta.height, 1)
  return `${width} / ${height}`
})

const recalcDialogSize = () => {
  const maxWidth = window.innerWidth * 0.9
  const maxHeight = window.innerHeight * 0.78
  const ratio = Math.max(videoMeta.width, 1) / Math.max(videoMeta.height, 1)
  let finalWidth = maxWidth
  let finalHeight = finalWidth / ratio

  if (finalHeight > maxHeight) {
    finalHeight = maxHeight
    finalWidth = finalHeight * ratio
  }

  dialogWidth.value = `${Math.floor(finalWidth)}px`
}

const extractFirstFrame = (url: string) => {
  return new Promise<string>((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'

    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error('capture timeout'))
    }, 10000)

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      video.pause()
      video.removeAttribute('src')
      video.load()
    }

    const capture = () => {
      try {
        const width = video.videoWidth || 640
        const height = video.videoHeight || 360
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          cleanup()
          reject(new Error('canvas context unavailable'))
          return
        }
        ctx.drawImage(video, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        cleanup()
        resolve(dataUrl)
      } catch (error) {
        cleanup()
        reject(error)
      }
    }

    video.addEventListener('loadeddata', () => {
      const seekTime = Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(1, video.duration / 2)
        : 0.1
      video.currentTime = seekTime
    })

    video.addEventListener('seeked', capture)
    video.addEventListener('error', () => {
      cleanup()
      reject(new Error('video load error'))
    })

    video.src = url
  })
}

const buildCovers = async (items: MonitorPlaybackItem[]) => {
  for (const item of items) {
    if (coverMap.value[item.id]) continue
    try {
      const frame = await extractFirstFrame(item.videoUrl)
      coverMap.value[item.id] = frame
    } catch (_error) {
      // keep placeholder when frame capture fails
    }
  }
}

const openPlayback = (item: MonitorPlaybackItem) => {
  videoMeta.width = 1920
  videoMeta.height = 1080
  recalcDialogSize()
  currentVideo.value = item
  dialogVisible.value = true
}

const handleVideoLoadedMetadata = () => {
  if (!videoRef.value) return
  videoMeta.width = videoRef.value.videoWidth || 1920
  videoMeta.height = videoRef.value.videoHeight || 1080
  recalcDialogSize()
}

const handleResize = () => {
  if (!dialogVisible.value) return
  recalcDialogSize()
}

const handleDialogClosed = () => {
  if (!videoRef.value) return
  videoRef.value.pause()
  videoRef.value.currentTime = 0
}

onMounted(() => {
  loadPlaybackList()
  recalcDialogSize()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

watch(
  () => pagedPlaybackList.value,
  (list) => {
    if (!list.length) return
    buildCovers(list)
  },
  { immediate: true }
)
</script>

<template>
  <div class="history-playback-panel">
    <el-card shadow="hover" class="hover-card filter-card">
      <el-form :inline="true" :model="filterForm">
        <el-form-item label="视频名称">
          <el-input
            v-model="filterForm.videoName"
            placeholder="请输入视频名称"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="录制时间">
          <el-date-picker
            v-model="filterForm.recordTimeRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            value-format="YYYY-MM-DD HH:mm:ss"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
          <el-button @click="handleRefresh">刷新列表</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-row v-loading="loading" :gutter="16" class="playback-main">
      <el-col :xs="24" :sm="24" :md="8" :lg="6">
        <el-card shadow="hover" class="hover-card folder-card">
          <template #header>
            <div class="folder-header">
              <span>目录分级</span>
              <el-button link type="primary" @click="selectedFolderPath = ''">全部</el-button>
            </div>
          </template>
          <el-tree
            :data="folderTree"
            node-key="id"
            :props="{ label: 'label', children: 'children' }"
            :highlight-current="true"
            :expand-on-click-node="false"
            default-expand-all
            @node-click="handleFolderSelect"
          />
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="24" :md="16" :lg="18">
        <el-row :gutter="16">
          <el-col
            v-for="item in pagedPlaybackList"
            :key="item.id"
            :xs="24"
            :sm="12"
            :md="12"
            :lg="8"
          >
            <el-card shadow="hover" class="hover-card playback-card" @click="openPlayback(item)">
              <div class="cover-box">
                <img v-if="coverMap[item.id]" class="cover-image" :src="coverMap[item.id]" :alt="item.name" />
                <span v-else>{{ item.coverText }}</span>
              </div>
              <div class="playback-title">{{ item.name }}</div>
              <div class="playback-time">录制时间：{{ item.recordTime }}</div>
              <div class="playback-path">目录：/{{ normalizeVideoPath(item) }}</div>
              <div class="playback-size">大小：{{ formatBytes(item.fileSize) }}</div>
            </el-card>
          </el-col>

          <el-col v-if="pagedPlaybackList.length === 0" :span="24">
            <el-empty description="暂无匹配的视频记录" />
          </el-col>
        </el-row>
      </el-col>
    </el-row>

    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="pageState.currentPage"
        v-model:page-size="pageState.pageSize"
        :page-sizes="[20, 50, 100]"
        background
        layout="total, sizes, prev, pager, next, jumper"
        :total="filteredPlaybackList.length"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>

    <el-dialog
      v-model="dialogVisible"
      class="playback-dialog"
      :width="dialogWidth"
      align-center
      :title="currentVideo?.name || '视频回放'"
      @closed="handleDialogClosed"
    >
      <div class="video-dialog-content" :style="{ aspectRatio: videoRatio }">
        <video
          v-if="currentVideo"
          ref="videoRef"
          class="video-player"
          :src="currentVideo.videoUrl"
          controls
          preload="metadata"
          @loadedmetadata="handleVideoLoadedMetadata"
        />
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.history-playback-panel {
  background-color: #f0f2f5;
}

.hover-card {
  border: none;
  margin-bottom: 16px;
  cursor: pointer;
  transition: box-shadow 0.2s ease;
}

.filter-card {
  cursor: default;
}

.playback-main {
  margin-bottom: 10px;
}

.folder-card {
  min-height: 560px;
}

.folder-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cover-box {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f5f7fa;
  font-weight: 600;
  background: linear-gradient(145deg, #1f4d75, #409eff);
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
  display: block;
}

.playback-title {
  margin-top: 12px;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.playback-time {
  margin-top: 8px;
  font-size: 13px;
  color: #606266;
}

.playback-path,
.playback-size {
  margin-top: 6px;
  font-size: 12px;
  color: #7a8597;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.video-dialog-content {
  border-radius: 8px;
  overflow: hidden;
  background: transparent;
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
}

.video-player {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  background: transparent;
}

:deep(.playback-dialog .el-dialog__body) {
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
