<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage, ElNotification } from 'element-plus'
import { RefreshRight, VideoCamera } from '@element-plus/icons-vue'
import { getStreamList, type AiotObject, type AiotStreamMessage } from '@/api/stream'

interface DetectionRow {
  cameraId: string
  objectCount: number
  trackIds: string
  timestamp: number
}

interface OverlayBox {
  left: number
  top: number
  width: number
  height: number
  trackId: string
  confidence?: number
}

interface LogEntry {
  id: number
  time: number
  msgType: number
  cameraId: string
  summary: string
}

const WS_URL = (import.meta.env.VITE_STREAM_WS_URL as string) || 'ws://172.18.7.124:8080/ws/stream'
const RECONNECT_INTERVAL = 5000
const MAX_LOG_COUNT = 200

const initLoading = ref(false)
const isConnected = ref(false)
const reconnecting = ref(false)
const detectionRows = ref<DetectionRow[]>([])
const currentBoxes = ref<OverlayBox[]>([])
const activeCameraId = ref('')
const logList = ref<LogEntry[]>([])
const videoStageRef = ref<HTMLDivElement>()
const logContainerRef = ref<HTMLDivElement>()

const overlaySize = reactive({
  width: 960,
  height: 540
})

const sourceFrame = reactive({
  width: 1920,
  height: 1080
})

const latestMessageMap = new Map<string, AiotStreamMessage>()
let ws: WebSocket | null = null
let reconnectTimer: number | null = null
let resizeObserver: ResizeObserver | null = null
let logId = 0
let manualClose = false

const totalObjectCount = computed(() =>
  detectionRows.value.reduce((sum, item) => sum + item.objectCount, 0)
)

const cameraCount = computed(() => detectionRows.value.length)
const currentTrackCount = computed(() => currentBoxes.value.length)

const connectionTagType = computed(() => {
  if (isConnected.value) return 'success'
  if (reconnecting.value) return 'warning'
  return 'info'
})

const connectionText = computed(() => {
  if (isConnected.value) return '实时连接中'
  if (reconnecting.value) return '连接断开，等待重连'
  return '未连接'
})

const isAiotMessage = (data: unknown): data is AiotStreamMessage => {
  if (!data || typeof data !== 'object') return false
  return 'msg_type' in data && 'camera_id' in data
}

const normalizeObjects = (objects: unknown): AiotObject[] => {
  if (!Array.isArray(objects)) return []
  return objects
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const raw = item as Record<string, unknown>
      const bbox = Array.isArray(raw.bbox) ? raw.bbox.map((n) => Number(n)) : []
      if (bbox.length !== 4 || bbox.some((n) => Number.isNaN(n))) return null
      return {
        obj_type: Number(raw.obj_type ?? 0),
        track_id: String(raw.track_id ?? ''),
        bbox,
        confidence: Number(raw.confidence ?? 0)
      } as AiotObject
    })
    .filter((item): item is AiotObject => item !== null)
}

const normalizeMessage = (payload: AiotStreamMessage): AiotStreamMessage => {
  const objects = normalizeObjects(payload.objects)
  return {
    ...payload,
    camera_id: String(payload.camera_id ?? '').trim() || 'unknown',
    msg_type: Number(payload.msg_type ?? -1),
    timestamp: Number(payload.timestamp ?? Date.now()),
    object_count: Number(payload.object_count ?? objects.length),
    objects,
    frame_width: Number(payload.frame_width ?? sourceFrame.width),
    frame_height: Number(payload.frame_height ?? sourceFrame.height)
  }
}

const formatTime = (time: number) => {
  const date = new Date(time)
  const datePart = `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
  const msPart = date.getMilliseconds().toString().padStart(3, '0')
  return `${datePart}.${msPart}`
}

const appendLog = (msg: AiotStreamMessage) => {
  const summary =
    msg.msg_type === 101
      ? `检测更新: ${msg.camera_id} 目标数 ${msg.object_count}`
      : `告警事件: 类型 ${msg.msg_type} 摄像头 ${msg.camera_id}`

  logList.value.push({
    id: ++logId,
    time: msg.timestamp,
    msgType: msg.msg_type,
    cameraId: msg.camera_id,
    summary
  })

  if (logList.value.length > MAX_LOG_COUNT) {
    logList.value = logList.value.slice(-MAX_LOG_COUNT)
  }

  nextTick(() => {
    if (logContainerRef.value) {
      logContainerRef.value.scrollTop = logContainerRef.value.scrollHeight
    }
  })
}

const updateDetectionRows = () => {
  const rows = Array.from(latestMessageMap.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((item) => ({
      cameraId: item.camera_id,
      objectCount: item.object_count,
      trackIds: item.objects.map((obj) => String(obj.track_id)).join(', ') || '-',
      timestamp: item.timestamp
    }))
  detectionRows.value = rows
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const mapObjectToOverlayBox = (obj: AiotObject): OverlayBox | null => {
  if (!Array.isArray(obj.bbox) || obj.bbox.length !== 4) return null

  let [x1, y1, x2, y2] = obj.bbox.map((item) => Number(item))
  if ([x1, y1, x2, y2].some((item) => Number.isNaN(item))) return null

  if (x2 < x1) [x1, x2] = [x2, x1]
  if (y2 < y1) [y1, y2] = [y2, y1]

  const isNormalized = x1 >= 0 && y1 >= 0 && x2 <= 1.2 && y2 <= 1.2

  if (isNormalized) {
    x1 *= overlaySize.width
    x2 *= overlaySize.width
    y1 *= overlaySize.height
    y2 *= overlaySize.height
  } else if (x2 > overlaySize.width || y2 > overlaySize.height) {
    const scaleX = overlaySize.width / Math.max(sourceFrame.width, 1)
    const scaleY = overlaySize.height / Math.max(sourceFrame.height, 1)
    x1 *= scaleX
    x2 *= scaleX
    y1 *= scaleY
    y2 *= scaleY
  }

  const left = clamp(x1, 0, overlaySize.width)
  const top = clamp(y1, 0, overlaySize.height)
  const right = clamp(x2, 0, overlaySize.width)
  const bottom = clamp(y2, 0, overlaySize.height)

  const width = Math.max(right - left, 2)
  const height = Math.max(bottom - top, 2)

  return {
    left,
    top,
    width,
    height,
    trackId: String(obj.track_id ?? '-'),
    confidence: obj.confidence
  }
}

const refreshOverlay = () => {
  const cameraId = activeCameraId.value || detectionRows.value[0]?.cameraId
  if (!cameraId) {
    currentBoxes.value = []
    return
  }

  const msg = latestMessageMap.get(cameraId)
  if (!msg) {
    currentBoxes.value = []
    return
  }

  activeCameraId.value = cameraId
  currentBoxes.value = msg.objects
    .map((obj) => mapObjectToOverlayBox(obj))
    .filter((item): item is OverlayBox => item !== null)
}

const setActiveCamera = (row: DetectionRow) => {
  activeCameraId.value = row.cameraId
  refreshOverlay()
}

const handleAlarm = (msg: AiotStreamMessage, silent = false) => {
  if (silent) return
  ElNotification({
    title: msg.msg_type === 103 ? '严重告警' : '告警通知',
    type: msg.msg_type === 103 ? 'error' : 'warning',
    duration: 4000,
    message: `${msg.camera_id} 触发告警，时间 ${formatTime(msg.timestamp)}`
  })
}

const handleMessage = (payload: unknown, silentAlarm = false) => {
  if (!isAiotMessage(payload)) return

  const msg = normalizeMessage(payload)
  sourceFrame.width = Number(msg.frame_width ?? sourceFrame.width) || sourceFrame.width
  sourceFrame.height = Number(msg.frame_height ?? sourceFrame.height) || sourceFrame.height

  if (msg.msg_type === 101) {
    latestMessageMap.set(msg.camera_id, msg)
    updateDetectionRows()
    if (!activeCameraId.value) {
      activeCameraId.value = msg.camera_id
    }
    if (activeCameraId.value === msg.camera_id) {
      refreshOverlay()
    }
  }

  if (msg.msg_type === 102 || msg.msg_type === 103) {
    handleAlarm(msg, silentAlarm)
  }

  appendLog(msg)
}

const clearReconnectTimer = () => {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

const scheduleReconnect = () => {
  if (manualClose || reconnectTimer !== null) return
  reconnecting.value = true
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    connectWebSocket()
  }, RECONNECT_INTERVAL)
}

const connectWebSocket = () => {
  if (ws && ws.readyState === WebSocket.OPEN) return

  try {
    ws = new WebSocket(WS_URL)
  } catch (error) {
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    isConnected.value = true
    reconnecting.value = false
    clearReconnectTimer()
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (Array.isArray(data)) {
        data.forEach((item) => handleMessage(item))
      } else {
        handleMessage(data)
      }
    } catch (error) {
      ElMessage.warning('收到无法解析的实时消息')
    }
  }

  ws.onerror = () => {
    isConnected.value = false
  }

  ws.onclose = () => {
    isConnected.value = false
    ws = null
    scheduleReconnect()
  }
}

const reconnectNow = () => {
  manualClose = false
  clearReconnectTimer()
  if (ws) {
    ws.close()
    ws = null
  }
  connectWebSocket()
}

const fetchHistory = async () => {
  initLoading.value = true
  try {
    const res = await getStreamList()
    const list = Array.isArray(res.data) ? res.data : []
    list.forEach((item: any) => handleMessage(item, true))
  } catch (error) {
    ElMessage.error('历史流数据加载失败')
  } finally {
    initLoading.value = false
  }
}

const syncOverlaySize = () => {
  if (!videoStageRef.value) return
  const rect = videoStageRef.value.getBoundingClientRect()
  overlaySize.width = Math.max(Math.floor(rect.width), 1)
  overlaySize.height = Math.max(Math.floor(rect.height), 1)
  refreshOverlay()
}

onMounted(async () => {
  syncOverlaySize()
  if (videoStageRef.value && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => syncOverlaySize())
    resizeObserver.observe(videoStageRef.value)
  }

  await fetchHistory()
  connectWebSocket()
})

onUnmounted(() => {
  manualClose = true
  clearReconnectTimer()
  if (ws) {
    ws.close()
    ws = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})
</script>

<template>
  <div class="aiot-realtime-page" v-loading="initLoading">
    <el-row :gutter="20" class="main-row">
      <el-col :xl="16" :lg="15" :md="24" :sm="24">
        <el-card class="video-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <div class="title-wrap">
                <span>实时视频窗口</span>
                <el-tag size="small" :type="connectionTagType">{{ connectionText }}</el-tag>
              </div>
              <el-button link type="primary" :icon="RefreshRight" @click="reconnectNow">立即重连</el-button>
            </div>
          </template>

          <div ref="videoStageRef" class="video-stage">
            <div class="video-placeholder">
              <el-icon class="video-icon"><VideoCamera /></el-icon>
              <p class="video-tip">模拟视频区域（检测框实时叠加）</p>
              <p class="video-camera">当前摄像头: {{ activeCameraId || '暂无' }}</p>
            </div>

            <div class="overlay-layer">
              <div
                v-for="(box, index) in currentBoxes"
                :key="`${box.trackId}-${index}`"
                class="bbox"
                :style="{
                  left: `${box.left}px`,
                  top: `${box.top}px`,
                  width: `${box.width}px`,
                  height: `${box.height}px`
                }"
              >
                <span class="bbox-label">ID: {{ box.trackId }}</span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xl="8" :lg="9" :md="24" :sm="24">
        <div class="right-panel">
          <el-card class="stats-card" shadow="hover">
            <template #header>
              <div class="card-header">
                <span>实时目标检测列表</span>
              </div>
            </template>

            <div class="metrics-grid">
              <div class="metric-item">
                <div class="metric-label">在线摄像头</div>
                <div class="metric-value">{{ cameraCount }}</div>
              </div>
              <div class="metric-item">
                <div class="metric-label">目标总数</div>
                <div class="metric-value">{{ totalObjectCount }}</div>
              </div>
              <div class="metric-item">
                <div class="metric-label">当前框数</div>
                <div class="metric-value">{{ currentTrackCount }}</div>
              </div>
            </div>

            <el-table
              :data="detectionRows"
              size="small"
              height="250"
              empty-text="等待实时检测数据..."
              @row-click="setActiveCamera"
            >
              <el-table-column prop="cameraId" label="camera_id" min-width="110" />
              <el-table-column prop="objectCount" label="object_count" width="110" />
              <el-table-column prop="trackIds" label="track_id 列表" min-width="180" show-overflow-tooltip />
            </el-table>
          </el-card>

          <el-card class="log-card" shadow="hover">
            <template #header>
              <div class="card-header">
                <span>实时结构化日志流</span>
                <el-tag size="small" type="info">{{ logList.length }} 条</el-tag>
              </div>
            </template>

            <div ref="logContainerRef" class="log-list">
              <div v-for="item in logList" :key="item.id" class="log-item">
                <div class="log-top">
                  <span class="log-time">{{ formatTime(item.time) }}</span>
                  <el-tag size="small" :type="item.msgType === 101 ? 'success' : item.msgType === 102 ? 'warning' : 'danger'">
                    {{ item.msgType }}
                  </el-tag>
                </div>
                <div class="log-summary">{{ item.summary }}</div>
                <div class="log-camera">camera_id: {{ item.cameraId }}</div>
              </div>
            </div>
          </el-card>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.aiot-realtime-page {
  height: 100%;
}

.main-row {
  height: 100%;
}

.video-card,
.stats-card,
.log-card {
  border: none;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.04);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #303133;
  font-weight: 600;
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.video-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  background:
    linear-gradient(145deg, rgba(2, 20, 44, 0.95) 0%, rgba(7, 45, 90, 0.9) 45%, rgba(16, 79, 130, 0.82) 100%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.03) 0, rgba(255, 255, 255, 0.03) 1px, transparent 1px, transparent 24px);
}

.video-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #cbd5e1;
  user-select: none;
}

.video-icon {
  font-size: 52px;
  margin-bottom: 12px;
  color: #e2e8f0;
}

.video-tip {
  margin: 0;
  font-size: 14px;
}

.video-camera {
  margin-top: 8px;
  font-size: 13px;
  color: #dbeafe;
}

.overlay-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.bbox {
  position: absolute;
  border: 2px solid #f56c6c;
  box-sizing: border-box;
  box-shadow: 0 0 0 1px rgba(245, 108, 108, 0.35) inset;
}

.bbox-label {
  position: absolute;
  top: -22px;
  left: -2px;
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  background: #f56c6c;
  color: #fff;
  border-radius: 4px 4px 0 0;
  font-size: 12px;
  line-height: 18px;
}

.right-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.stats-card {
  flex: 0 0 auto;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 12px;
}

.metric-item {
  padding: 10px;
  border-radius: 8px;
  background: #f5f7fa;
}

.metric-label {
  font-size: 12px;
  color: #909399;
}

.metric-value {
  font-size: 22px;
  margin-top: 4px;
  color: #303133;
  font-weight: 700;
}

.log-card {
  flex: 1;
  min-height: 280px;
}

.log-list {
  height: 330px;
  overflow-y: auto;
  padding-right: 6px;
}

.log-list::-webkit-scrollbar {
  width: 6px;
}

.log-list::-webkit-scrollbar-thumb {
  background: #dcdfe6;
  border-radius: 3px;
}

.log-item {
  border-radius: 8px;
  border: 1px solid #ebeef5;
  padding: 10px;
  margin-bottom: 10px;
  background: #fafafa;
}

.log-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.log-time {
  font-size: 12px;
  color: #909399;
}

.log-summary {
  margin-top: 8px;
  font-size: 14px;
  color: #303133;
}

.log-camera {
  margin-top: 6px;
  font-size: 12px;
  color: #606266;
}

@media (max-width: 1200px) {
  .metrics-grid {
    grid-template-columns: 1fr;
  }

  .log-list {
    height: 260px;
  }
}
</style>
