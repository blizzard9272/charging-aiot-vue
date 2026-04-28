<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import { Camera, Link, PictureFilled, UserFilled } from '@element-plus/icons-vue'
import CanvasDetectionImage from '@/shared/components/CanvasDetectionImage.vue'
import {
  fetchUploadStreamRecords,
  type StreamRecord101Details,
  type StreamRecord102Details,
  type StreamRecord103Details,
  type StreamTarget,
  type UploadStreamRecord
} from '@/api/uploadStream'

interface WsRecordLike {
  record_id?: unknown
  cam_id?: unknown
  protocol_id?: unknown
  timestamp?: unknown
  create_time?: unknown
  details?: unknown
}

interface WorkbenchLinkedPacket {
  linkKey: string
  camId: number
  timestamp: number
  records101: UploadStreamRecord[]
  records102: UploadStreamRecord[]
  records103: UploadStreamRecord[]
}

const loading = ref(false)
const wsUrl = ref((import.meta.env.VITE_STREAM_WS_URL as string) || 'ws://localhost:8080/ws/stream')
const wsTryUrl = ref('')
const isConnected = ref(false)
const reconnecting = ref(false)
const connectError = ref('')
const lastPushTime = ref<number | null>(null)
const snapshotRecordCount = ref(0)

const records = ref<UploadStreamRecord[]>([])
const imageDialogVisible = ref(false)
const currentPreviewImage = ref('')
const previewTargets = ref<StreamTarget[]>([])

const ratioChartRef = ref<HTMLDivElement>()

const MAX_CACHE_RECORDS = 5000
const SNAPSHOT_BATCH_SIZE = 200
const WS_OPEN_TIMEOUT = 7000
const RECONNECT_BASE_INTERVAL = 3000
const RECONNECT_MAX_INTERVAL = 30000
const RECONNECT_JITTER_MAX = 900

let ws: WebSocket | null = null
let reconnectTimer: number | null = null
let manualClose = false
let reconnectAttempt = 0

let ratioChart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const list101 = computed(() => records.value.filter((item) => item.protocol_id === 101).slice(0, 14))
const list102 = computed(() => records.value.filter((item) => item.protocol_id === 102).slice(0, 14))
const list103 = computed(() => records.value.filter((item) => item.protocol_id === 103).slice(0, 12))

const parseCreateTimeMs = (createTime: string) => {
  if (!createTime) return 0
  const ts = dayjs(createTime).valueOf()
  return Number.isFinite(ts) ? ts : 0
}

const recordSortTs = (record: UploadStreamRecord) => {
  const createTs = parseCreateTimeMs(record.create_time || '')
  return createTs > 0 ? createTs : record.timestamp
}

const linkedPackets = computed<WorkbenchLinkedPacket[]>(() => {
  const map = new Map<string, WorkbenchLinkedPacket>()

  records.value.forEach((record) => {
    const key = `${record.cam_id}_${record.timestamp}`
    const existing = map.get(key)
    if (!existing) {
      const created: WorkbenchLinkedPacket = {
        linkKey: key,
        camId: record.cam_id,
        timestamp: record.timestamp,
        records101: [],
        records102: [],
        records103: []
      }
      map.set(key, created)
    }

    const packet = map.get(key)
    if (!packet) return
    if (record.protocol_id === 101) packet.records101.push(record)
    if (record.protocol_id === 102) packet.records102.push(record)
    if (record.protocol_id === 103) packet.records103.push(record)
  })

  return [...map.values()].sort((a, b) => {
    const aTs = Math.max(...[...a.records101, ...a.records102, ...a.records103].map((row) => recordSortTs(row)), a.timestamp)
    const bTs = Math.max(...[...b.records101, ...b.records102, ...b.records103].map((row) => recordSortTs(row)), b.timestamp)
    return bTs - aTs || b.camId - a.camId
  })
})

const linkedPacketByKey = computed(() => {
  const map = new Map<string, WorkbenchLinkedPacket>()
  linkedPackets.value.forEach((packet) => {
    map.set(packet.linkKey, packet)
  })
  return map
})

const list103Linked = computed(() => {
  return list103.value.map((record) => {
    const key = `${record.cam_id}_${record.timestamp}`
    const packet = linkedPacketByKey.value.get(key) || null
    const targets = packet
      ? packet.records101.flatMap((row) => {
        const details = row.details as StreamRecord101Details
        return Array.isArray(details.targets) ? details.targets : []
      })
      : []

    return {
      record,
      packet,
      targets,
      hasDetected: targets.length > 0
    }
  })
})

const recognitionPacketsAll = computed(() => {
  return linkedPackets.value.filter((packet) => packet.records102.length > 0)
})

const statusTagType = computed(() => {
  if (isConnected.value) return 'success'
  if (reconnecting.value) return 'warning'
  return 'danger'
})

const statusText = computed(() => {
  if (isConnected.value) return 'WebSocket 宸茶繛鎺?'
  if (reconnecting.value) return '杩炴帴鏂紑锛岄噸杩炰腑'
  return '鏈繛鎺?'
})

const stats = computed(() => {
  const camSet = new Set<number>()
  let currentTotalPeople = 0
  let todayCaptureCount = 0
  let todayRecognizedCount = 0
  let protocol101Count = 0
  let protocol102Count = 0
  let protocol103Count = 0

  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const dayStartTs = dayStart.getTime()

  records.value.forEach((item) => {
    camSet.add(item.cam_id)
    const createdAtTs = parseCreateTimeMs(item.create_time || '')
    const statTs = createdAtTs > 0 ? createdAtTs : item.timestamp

    if (item.protocol_id === 101) {
      protocol101Count++
    }

    if (item.protocol_id === 102) {
      protocol102Count++
    }

    if (item.protocol_id === 103) {
      protocol103Count++
    }

    if (statTs >= dayStartTs && item.protocol_id === 103) {
      todayCaptureCount++
    }

    if (statTs >= dayStartTs && item.protocol_id === 102) {
      todayRecognizedCount++
    }
  })

  currentTotalPeople = protocol101Count

  return {
    onlineDeviceCount: camSet.size,
    currentTotalPeople,
    todayCaptureCount,
    todayRecognizedCount,
    protocol101Count,
    protocol102Count,
    protocol103Count,
    totalRecords: records.value.length,
    linkedEventCount: linkedPackets.value.length,
    fullLinkedCount: linkedPackets.value.filter((packet) => {
      return packet.records101.length > 0 && packet.records102.length > 0 && packet.records103.length > 0
    }).length
  }
})

const protocolProgressItems = computed(() => {
  const total = stats.value.protocol101Count + stats.value.protocol102Count + stats.value.protocol103Count
  const safePct = (count: number) => {
    if (total <= 0) return 0
    return Number(((count / total) * 100).toFixed(1))
  }

  return [
    {
      label: '101 妫€娴?',
      count: stats.value.protocol101Count,
      percent: safePct(stats.value.protocol101Count),
      color: '#5ad8a6'
    },
    {
      label: '102 鍚戦噺',
      count: stats.value.protocol102Count,
      percent: safePct(stats.value.protocol102Count),
      color: '#f6bd16'
    },
    {
      label: '103 鎶撴媿',
      count: stats.value.protocol103Count,
      percent: safePct(stats.value.protocol103Count),
      color: '#5b8ff9'
    }
  ]
})

const formatTime = (timestamp: number, pattern = 'YYYY-MM-DD HH:mm:ss') => {
  if (!timestamp) return '--'
  return dayjs(timestamp).format(pattern)
}

const toInt = (value: unknown, fallback = 0) => {
  const num = Number(value)
  return Number.isFinite(num) ? Math.trunc(num) : fallback
}

const ensureDataUrl = (raw: string) => {
  const text = raw.trim()
  if (!text) return ''
  if (text.startsWith('data:image')) return text
  return `data:image/jpeg;base64,${text}`
}

const normalizeTargets = (source: unknown): StreamTarget[] => {
  if (!Array.isArray(source)) return []

  return source
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>

      return {
        type: toInt(row.type),
        tid: toInt(row.tid),
        x1: toInt(row.x1),
        y1: toInt(row.y1),
        x2: toInt(row.x2),
        y2: toInt(row.y2)
      }
    })
    .filter((item): item is StreamTarget => item !== null)
}

const normalizeRecord = (source: WsRecordLike): UploadStreamRecord | null => {
  const protocolId = toInt(source.protocol_id)
  if (![101, 102, 103].includes(protocolId)) return null

  const timestamp = toInt(source.timestamp)
  if (timestamp <= 0) return null

  const recordId = toInt(source.record_id, timestamp)
  const camId = toInt(source.cam_id)
  const detailsRaw = source.details && typeof source.details === 'object'
    ? (source.details as Record<string, unknown>)
    : {}

  if (protocolId === 101) {
    const targets = normalizeTargets(detailsRaw.targets)
    return {
      record_id: recordId,
      cam_id: camId,
      protocol_id: 101,
      timestamp,
      source_file_name: '',
      source_file_size: 0,
      create_time: String(source.create_time || ''),
      details: {
        count: Number(detailsRaw.count ?? targets.length),
        targets,
        payload_hex_rebuilt: String(detailsRaw.payload_hex_rebuilt || '')
      }
    }
  }

  if (protocolId === 102) {
    return {
      record_id: recordId,
      cam_id: camId,
      protocol_id: 102,
      timestamp,
      source_file_name: '',
      source_file_size: 0,
      create_time: String(source.create_time || ''),
      details: {
        payload_size: toInt(detailsRaw.payload_size),
        vector_base64_preview: String(detailsRaw.vector_base64_preview || ''),
        vector_hex_preview: String(detailsRaw.vector_hex_preview || ''),
        vector_payload_hex_preview: String(detailsRaw.vector_payload_hex_preview || ''),
        vector_base64: String(detailsRaw.vector_base64 || '')
      }
    }
  }

  const imageDataUrl = ensureDataUrl(String(detailsRaw.image_data_url || detailsRaw.base64_image || ''))
  return {
    record_id: recordId,
    cam_id: camId,
    protocol_id: 103,
    timestamp,
    source_file_name: '',
    source_file_size: 0,
    create_time: String(source.create_time || ''),
    details: {
      payload_size: toInt(detailsRaw.payload_size),
      image_hex_preview: String(detailsRaw.image_hex_preview || ''),
      base64_image: String(detailsRaw.base64_image || ''),
      image_data_url: imageDataUrl
    }
  }
}

const extractRecordsFromPayload = (payload: unknown): UploadStreamRecord[] => {
  if (Array.isArray(payload)) {
    return payload
      .map((item) => normalizeRecord(item as WsRecordLike))
      .filter((item): item is UploadStreamRecord => item !== null)
  }

  if (!payload || typeof payload !== 'object') return []

  const wrapper = payload as Record<string, unknown>
  if (Array.isArray(wrapper.records)) {
    return wrapper.records
      .map((item) => normalizeRecord(item as WsRecordLike))
      .filter((item): item is UploadStreamRecord => item !== null)
  }

  if (wrapper.data) {
    return extractRecordsFromPayload(wrapper.data)
  }

  const normalized = normalizeRecord(wrapper as WsRecordLike)
  return normalized ? [normalized] : []
}

const isReplayPacket = (payload: unknown) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const wrapper = payload as Record<string, unknown>
  return Array.isArray(wrapper.records)
}

const appendRecords = (incoming: UploadStreamRecord[]) => {
  if (!incoming.length) return

  const merged = [...incoming, ...records.value]
  const dedupMap = new Map<string, UploadStreamRecord>()

  merged.forEach((item) => {
    const key = `${item.record_id}-${item.protocol_id}`
    if (!dedupMap.has(key)) {
      dedupMap.set(key, item)
    }
  })

  records.value = [...dedupMap.values()]
    .sort((a, b) => recordSortTs(b) - recordSortTs(a) || b.timestamp - a.timestamp)
    .slice(0, MAX_CACHE_RECORDS)
}

const loadSnapshotOnce = async () => {
  loading.value = true
  try {
    const merged: UploadStreamRecord[] = []
    let offset = 0
    let total = 0

    while (offset < MAX_CACHE_RECORDS) {
      const res = await fetchUploadStreamRecords({
        limit: SNAPSHOT_BATCH_SIZE,
        offset,
        include_payload: 1
      })

      total = Number(res?.data?.total || total || 0)
      const batch = Array.isArray(res?.data?.records) ? res.data.records : []
      if (batch.length === 0) break

      merged.push(...batch)

      if ((total > 0 && merged.length >= total) || batch.length < SNAPSHOT_BATCH_SIZE) {
        break
      }

      offset += batch.length
    }

    records.value = merged
      .sort((a, b) => recordSortTs(b) - recordSortTs(a) || b.timestamp - a.timestamp)
      .slice(0, MAX_CACHE_RECORDS)
    snapshotRecordCount.value = records.value.length
  } catch (_err) {
    snapshotRecordCount.value = records.value.length
    ElMessage.error('鍒濆鍖栨暟鎹姞杞藉け璐ワ紝璇锋鏌ユ帴鍙?')
  } finally {
    loading.value = false
  }
}

const clearReconnectTimer = () => {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

const calcReconnectDelay = () => {
  const exp = Math.min(
    RECONNECT_MAX_INTERVAL,
    Math.round(RECONNECT_BASE_INTERVAL * Math.pow(1.6, Math.max(0, reconnectAttempt - 1)))
  )
  const jitter = Math.floor(Math.random() * RECONNECT_JITTER_MAX)
  return Math.min(RECONNECT_MAX_INTERVAL, exp + jitter)
}

const buildWsCandidates = (inputUrl: string) => {
  const fallbackLocal = [
    'ws://127.0.0.1:8080/ws/stream',
    'ws://localhost:8080/ws/stream'
  ]

  const candidates: string[] = []
  const addUnique = (url: string) => {
    if (!url) return
    if (!candidates.includes(url)) {
      candidates.push(url)
    }
  }

  const trimmed = inputUrl.trim()
  addUnique(trimmed)

  try {
    const parsed = new URL(trimmed)

    if (typeof window !== 'undefined' && window.location.hostname) {
      const host = window.location.hostname
      const alt = `${parsed.protocol}//${host}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname || '/ws/stream'}`
      addUnique(alt)
    }

    if (parsed.hostname === 'localhost') {
      addUnique(trimmed.replace('localhost', '127.0.0.1'))
    } else if (parsed.hostname === '127.0.0.1') {
      addUnique(trimmed.replace('127.0.0.1', 'localhost'))
    }
  } catch (_err) {
    // Keep original text only, fallback list will still be appended below.
  }

  fallbackLocal.forEach(addUnique)
  return candidates
}

const connectByCandidates = (candidates: string[], index = 0) => {
  if (index >= candidates.length) {
    isConnected.value = false
    connectError.value = 'WebSocket 杩炴帴澶辫触锛氳鍏堝惎鍔?ws bridge锛坣pm --prefix ./charging-aiot-vue run ws:stream锛?'
    scheduleReconnect()
    return
  }

  const target = candidates[index]
  wsTryUrl.value = target

  let socket: WebSocket
  try {
    socket = new WebSocket(target)
  } catch (_err) {
    connectByCandidates(candidates, index + 1)
    return
  }

  let opened = false
  const openTimeout = window.setTimeout(() => {
    if (!opened) {
      try {
        socket.close()
      } catch (_err) {
        // ignore close error
      }
    }
  }, WS_OPEN_TIMEOUT)

  socket.onopen = () => {
    opened = true
    window.clearTimeout(openTimeout)

    ws = socket
    wsUrl.value = target
    isConnected.value = true
    reconnecting.value = false
    reconnectAttempt = 0
    connectError.value = ''
    wsTryUrl.value = ''
  }

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data)
      if (payload && typeof payload === 'object' && (payload as Record<string, unknown>).type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }))
        return
      }

      if (isReplayPacket(payload) && snapshotRecordCount.value === 0) {
        return
      }

      const incoming = extractRecordsFromPayload(payload)
      if (incoming.length > 0) {
        appendRecords(incoming)
        lastPushTime.value = Date.now()
      }
    } catch (_err) {
      ElMessage.warning('鏀跺埌鏃犳硶瑙ｆ瀽鐨勬帹閫佹秷鎭?')
    }
  }

  socket.onerror = () => {
    isConnected.value = false
    if (opened) {
      connectError.value = `杩炴帴寮傚父锛?{target}`
    }
  }

  socket.onclose = () => {
    window.clearTimeout(openTimeout)

    if (!opened) {
      connectByCandidates(candidates, index + 1)
      return
    }

    isConnected.value = false
    ws = null
    if (!manualClose) {
      scheduleReconnect()
    }
  }
}

const scheduleReconnect = () => {
  if (manualClose || reconnectTimer !== null) return
  reconnecting.value = true
  reconnectAttempt += 1
  const delay = calcReconnectDelay()
  connectError.value = `杩炴帴涓柇锛?{Math.ceil(delay / 1000)}s 鍚庨噸璇曪紙绗?${reconnectAttempt} 娆★級`
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    connectWs()
  }, delay)
}

const closeWs = () => {
  if (!ws) return
  ws.onopen = null
  ws.onmessage = null
  ws.onclose = null
  ws.onerror = null
  ws.close()
  ws = null
}

const connectWs = () => {
  clearReconnectTimer()
  closeWs()

  manualClose = false
  connectError.value = ''
  reconnecting.value = true

  const candidates = buildWsCandidates(wsUrl.value)
  connectByCandidates(candidates)
}

const reconnectNow = () => {
  manualClose = false
  reconnectAttempt = 0
  connectWs()
}

const disconnectNow = () => {
  manualClose = true
  reconnecting.value = false
  reconnectAttempt = 0
  clearReconnectTimer()
  closeWs()
  isConnected.value = false
}

const openImageDialog = (url: string, targets: StreamTarget[] = []) => {
  if (!url) return
  currentPreviewImage.value = url
  previewTargets.value = targets
  imageDialogVisible.value = true
}

const linkedTargetCount = (packet: WorkbenchLinkedPacket | null) => {
  if (!packet) return 0
  return packet.records101.reduce((sum, record) => {
    const details = record.details as StreamRecord101Details
    return sum + Number(details.count || 0)
  }, 0)
}

const linkedVectorPayload = (packet: WorkbenchLinkedPacket | null) => {
  if (!packet) return 0
  return packet.records102.reduce((sum, record) => {
    const details = record.details as StreamRecord102Details
    return sum + Number(details.payload_size || 0)
  }, 0)
}

const recognitionFirstVectorHex = (packet: WorkbenchLinkedPacket | null) => {
  if (!packet || packet.records102.length <= 0) return '--'
  const details = packet.records102[0].details as StreamRecord102Details
  return details.vector_hex_preview || details.vector_payload_hex_preview || '--'
}

const recognitionPackets = computed(() => {
  return recognitionPacketsAll.value.slice(0, 14)
})

const recognitionStats = computed(() => {
  let linkedCaptureCount = 0
  let linkedTargetTotal = 0
  let linkedVectorBytes = 0

  linkedPackets.value.forEach((packet) => {
    if (packet.records102.length <= 0) return

    if (packet.records103.length > 0) {
      linkedCaptureCount += 1
    }

    linkedTargetTotal += linkedTargetCount(packet)
    linkedVectorBytes += linkedVectorPayload(packet)
  })

  return {
    totalRecognizedEvents: recognitionPacketsAll.value.length,
    linkedCaptureCount,
    linkedTargetTotal,
    linkedVectorBytes
  }
})

const buildRatioData = () => {
  const result = [
    { name: '101 妫€娴?', value: 0 },
    { name: '102 鍚戦噺', value: 0 },
    { name: '103 鍥剧墖', value: 0 }
  ]

  records.value.forEach((item) => {
    if (item.protocol_id === 101) result[0].value += 1
    if (item.protocol_id === 102) result[1].value += 1
    if (item.protocol_id === 103) result[2].value += 1
  })

  return result
}

const ensureCharts = () => {
  if (ratioChartRef.value && !ratioChart) {
    ratioChart = echarts.init(ratioChartRef.value)
  }
}

const renderCharts = () => {
  ensureCharts()

  ratioChart?.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(8, 27, 56, 0.92)',
      borderColor: 'rgba(103, 142, 201, 0.45)',
      borderWidth: 1,
      textStyle: { color: '#dce9ff' },
      extraCssText: 'box-shadow:none;'
    },
    legend: {
      orient: 'horizontal',
      left: 'center',
      bottom: 4,
      itemWidth: 12,
      itemGap: 18,
      textStyle: { color: '#d6e3ff' }
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '64%'],
        center: ['50%', '44%'],
        data: buildRatioData(),
        label: {
          color: '#d6e3ff',
          formatter: '{d}%'
        },
        itemStyle: {
          borderColor: '#0d2247',
          borderWidth: 2
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 0,
            shadowColor: 'transparent'
          }
        }
      }
    ]
  })
}

const resizeCharts = () => {
  ratioChart?.resize()
}

watch(records, async () => {
  await nextTick()
  renderCharts()
})

watch(imageDialogVisible, (visible) => {
  if (!visible) {
    previewTargets.value = []
    currentPreviewImage.value = ''
  }
})

onMounted(async () => {
  await loadSnapshotOnce()
  await nextTick()
  renderCharts()
  connectWs()

  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => {
      resizeCharts()
    })

    if (ratioChartRef.value) resizeObserver.observe(ratioChartRef.value)
  }

  window.addEventListener('resize', resizeCharts)
})

onUnmounted(() => {
  manualClose = true
  clearReconnectTimer()
  closeWs()
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', resizeCharts)
  ratioChart?.dispose()
  ratioChart = null
})
</script>

<template>
  <div class="command-center-page" v-loading="loading">
    <el-card class="connection-card" shadow="hover">
      <div class="connection-main">
        <div class="left-wrap">
          <div class="connection-title">实时展示（WebSocket 实时推送）</div>
          <div class="sub-text">
            最后推送：{{ lastPushTime ? formatTime(lastPushTime) : '--' }}
            <span v-if="wsTryUrl"> | 尝试连接：{{ wsTryUrl }}</span>
            <span v-if="connectError" class="error-text"> | {{ connectError }}</span>
          </div>
        </div>

        <div class="right-wrap">
          <el-input v-model="wsUrl" class="ws-input" placeholder="ws://localhost:8080/ws/stream" />
          <el-tag :type="statusTagType">{{ statusText }}</el-tag>
          <el-button type="primary" @click="reconnectNow">连接</el-button>
          <el-button @click="disconnectNow">断开</el-button>
          <!-- <el-button type="success" @click="loadSnapshotOnce">刷新快照</el-button> -->
        </div>
      </div>
    </el-card>

    <el-row :gutter="14" class="summary-row">
      <el-col :xs="24" :sm="12" :md="12" :lg="4">
        <div class="summary-box summary-a">
          <div class="summary-icon"><el-icon><Camera /></el-icon></div>
          <div>
            <div class="summary-title">活跃设备数</div>
            <div class="summary-value">{{ stats.onlineDeviceCount }}</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="4">
        <div class="summary-box summary-b">
          <div class="summary-icon"><el-icon><UserFilled /></el-icon></div>
          <div>
            <div class="summary-title">当前目标总数</div>
            <div class="summary-value">{{ stats.currentTotalPeople }}</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="4">
        <div class="summary-box summary-c">
          <div class="summary-icon"><el-icon><PictureFilled /></el-icon></div>
          <div>
            <div class="summary-title">今日抓拍 (103)</div>
            <div class="summary-value">{{ stats.todayCaptureCount }}</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="4">
        <div class="summary-box summary-d">
          <div class="summary-icon"><el-icon><Link /></el-icon></div>
          <div>
            <div class="summary-title">今日识别 (102)</div>
            <div class="summary-value">{{ stats.todayRecognizedCount }}</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="4">
        <div class="summary-box summary-e">
          <div class="summary-icon"><el-icon><Link /></el-icon></div>
          <div>
            <div class="summary-title">总记录数</div>
            <div class="summary-value">{{ stats.totalRecords }}</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="12" :lg="4">
        <div class="summary-box summary-f">
          <div class="summary-icon"><el-icon><Link /></el-icon></div>
          <div>
            <div class="summary-title">完整关联事件</div>
            <div class="summary-value">{{ stats.fullLinkedCount }}</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <div class="summary-progress-card">
      <div class="panel-title">三协议总体数量进度</div>
      <div class="progress-list">
        <div v-for="item in protocolProgressItems" :key="item.label" class="progress-item">
          <div class="progress-label">
            <span>{{ item.label }}</span>
            <span>{{ item.count }}（{{ item.percent }}%）</span>
          </div>
          <el-progress :percentage="item.percent" :stroke-width="10" :color="item.color" :show-text="false" />
        </div>
      </div>
    </div>

    <el-row :gutter="14" class="chart-row">
      <el-col :xs="24" :sm="24" :md="24" :lg="14">
        <div class="chart-card recognition-card">
          <div class="panel-title">识别关联看板（102）</div>
          <div class="recognition-metrics">
            <div class="recognition-metric">
              <div class="metric-label">识别事件</div>
              <div class="metric-value">{{ recognitionStats.totalRecognizedEvents }}</div>
            </div>
            <div class="recognition-metric">
              <div class="metric-label">关联抓拍</div>
              <div class="metric-value">{{ recognitionStats.linkedCaptureCount }}</div>
            </div>
            <div class="recognition-metric">
              <div class="metric-label">关联目标</div>
              <div class="metric-value">{{ recognitionStats.linkedTargetTotal }}</div>
            </div>
            <div class="recognition-metric">
              <div class="metric-label">向量总字节</div>
              <div class="metric-value">{{ recognitionStats.linkedVectorBytes }}</div>
            </div>
          </div>

          <el-scrollbar class="recognition-scroll">
            <div v-if="recognitionPackets.length > 0" class="recognition-list">
              <div v-for="packet in recognitionPackets" :key="packet.linkKey" class="recognition-item">
                <div class="recognition-head">
                  <span>{{ formatTime(packet.timestamp, 'HH:mm:ss') }} | cam {{ packet.camId }}</span>
                  <span>102: {{ packet.records102.length }}，103: {{ packet.records103.length }}</span>
                </div>
                <div class="recognition-line">关联101目标：{{ linkedTargetCount(packet) }}</div>
                <div class="recognition-line">向量字节：{{ linkedVectorPayload(packet) }}</div>
                <div class="recognition-line">hex_preview：{{ recognitionFirstVectorHex(packet) }}</div>
              </div>
            </div>
            <div v-else class="empty-text">暂无识别关联数据</div>
          </el-scrollbar>
        </div>
      </el-col>
      <el-col :xs="24" :sm="24" :md="24" :lg="10">
        <div class="chart-card ratio-card">
          <div class="panel-title">协议占比</div>
          <div ref="ratioChartRef" class="chart-box ratio-box" />
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="14" class="content-row">
      <el-col :xs="24" :sm="24" :md="12" :lg="12">
        <div class="panel-card">
          <div class="panel-title">101 目标检测解析</div>
          <el-scrollbar class="scroll-area">
            <div v-if="list101.length > 0" class="feed-list">
              <div v-for="item in list101" :key="item.record_id" class="feed-item">
                <div>
                  [{{ formatTime(item.timestamp, 'HH:mm:ss') }}] 摄像头 {{ item.cam_id }} 检测到
                  <span class="highlight">{{ (item.details as StreamRecord101Details).count }}</span> 涓洰鏍?
                </div>
                <div class="binary-line">
                  payload(hex): {{ (item.details as StreamRecord101Details).payload_hex_rebuilt || '--' }}
                </div>
              </div>
            </div>
            <div v-else class="empty-text">暂无 101 推送数据</div>
          </el-scrollbar>
        </div>
      </el-col>

      <el-col :xs="24" :sm="24" :md="12" :lg="12">
        <div class="panel-card">
          <div class="panel-title">102 向量解析</div>
          <el-scrollbar class="scroll-area">
            <el-timeline v-if="list102.length > 0">
              <el-timeline-item
                v-for="item in list102"
                :key="item.record_id"
                :timestamp="formatTime(item.timestamp, 'HH:mm:ss')"
                placement="top"
              >
                <div class="timeline-record">
                  <div class="timeline-line">cam_id：{{ item.cam_id }}</div>
                  <div class="timeline-line">payload_size：{{ (item.details as StreamRecord102Details).payload_size }}</div>
                  <div class="timeline-line">hex_preview：{{ (item.details as StreamRecord102Details).vector_hex_preview || '--' }}</div>
                </div>
              </el-timeline-item>
            </el-timeline>
            <div v-else class="empty-text">暂无 102 推送数据</div>
          </el-scrollbar>
        </div>
      </el-col>
    </el-row>

    <div class="panel-card panel-bottom">
      <div class="panel-title">103 图片抓拍</div>
      <el-row v-if="list103Linked.length > 0" :gutter="18" class="capture-row">
        <el-col
          v-for="entry in list103Linked"
          :key="entry.record.record_id"
          :xs="24"
          :sm="12"
          :md="12"
          :lg="12"
          class="capture-col"
        >
          <div class="capture-card" :class="{ 'capture-detected': entry.hasDetected }">
            <CanvasDetectionImage
              class="capture-image"
              :image-url="(entry.record.details as StreamRecord103Details).image_data_url"
              :targets="entry.targets"
              :height="260"
              @click="openImageDialog((entry.record.details as StreamRecord103Details).image_data_url, entry.targets)"
            />
            <div class="capture-meta">
              <div>cam_id：{{ entry.record.cam_id }}</div>
              <div>size：{{ (entry.record.details as StreamRecord103Details).payload_size }}</div>
              <div>{{ formatTime(entry.record.timestamp) }}</div>
              <div class="capture-link">关联 101：{{ entry.packet?.records101.length || 0 }} 条，102：{{ entry.packet?.records102.length || 0 }} 条</div>
              <div class="capture-link">识别框数量：{{ entry.targets.length }}</div>
              <div class="capture-link">关联目标：{{ linkedTargetCount(entry.packet) }}，向量字节：{{ linkedVectorPayload(entry.packet) }}</div>
            </div>
          </div>
        </el-col>
      </el-row>
      <div v-else class="empty-text">暂无 103 推送数据</div>
    </div>

    <el-dialog
      v-model="imageDialogVisible"
      width="75vw"
      align-center
      destroy-on-close
      title="抓拍图片预览"
    >
      <div class="preview-dialog-content">
        <CanvasDetectionImage
          class="preview-image"
          :image-url="currentPreviewImage"
          :targets="previewTargets"
          :height="560"
        />
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.command-center-page {
  min-height: 100%;
  padding: 2px;
  background: radial-gradient(circle at 10% 6%, rgba(61, 102, 179, 0.28), transparent 34%),
    radial-gradient(circle at 84% 2%, rgba(24, 145, 127, 0.2), transparent 26%),
    linear-gradient(180deg, #0b1d3d 0%, #08162f 100%);
  color: #d4e3ff;
}

.connection-card {
  margin-bottom: 14px;
  border: none;
  background: linear-gradient(120deg, rgba(15, 42, 86, 0.94), rgba(8, 29, 61, 0.9));
  box-shadow: inset 0 0 0 1px rgba(116, 149, 201, 0.24);
}

.connection-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.left-wrap {
  min-width: 220px;
}

.connection-title {
  font-size: 17px;
  font-weight: 700;
  color: #edf3ff;
}

.sub-text {
  margin-top: 6px;
  font-size: 12px;
  color: #9eb3d8;
}

.error-text {
  color: #fda4af;
}

.right-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.ws-input {
  width: 280px;
}

.summary-row {
  margin-bottom: 14px;
}

.summary-box {
  border-radius: 12px;
  min-height: 96px;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: inset 0 0 0 1px rgba(122, 158, 218, 0.2);
}

.summary-a {
  background: linear-gradient(130deg, rgba(24, 89, 168, 0.48), rgba(16, 58, 112, 0.18));
}

.summary-b {
  background: linear-gradient(130deg, rgba(22, 142, 126, 0.5), rgba(14, 80, 70, 0.16));
}

.summary-c {
  background: linear-gradient(130deg, rgba(191, 135, 47, 0.5), rgba(99, 71, 25, 0.16));
}

.summary-d {
  background: linear-gradient(130deg, rgba(138, 92, 201, 0.5), rgba(76, 53, 112, 0.16));
}

.summary-e {
  background: linear-gradient(130deg, rgba(53, 119, 196, 0.52), rgba(27, 64, 110, 0.16));
}

.summary-f {
  background: linear-gradient(130deg, rgba(82, 170, 120, 0.5), rgba(40, 88, 62, 0.16));
}

.summary-icon {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font-size: 24px;
  color: #ecf2ff;
  background: rgba(255, 255, 255, 0.1);
}

.summary-title {
  font-size: 12px;
  color: #b8c9e8;
}

.summary-value {
  margin-top: 6px;
  font-size: 28px;
  line-height: 1;
  font-weight: 700;
  color: #ecf2ff;
}

.summary-progress-card {
  margin-bottom: 14px;
  border-radius: 12px;
  padding: 12px;
  background: linear-gradient(155deg, rgba(17, 43, 87, 0.94), rgba(9, 27, 56, 0.9));
  box-shadow: inset 0 0 0 1px rgba(109, 146, 207, 0.22);
}

.progress-list {
  display: grid;
  gap: 10px;
}

.progress-item {
  border-radius: 8px;
  padding: 8px 10px;
  background: rgba(8, 28, 58, 0.64);
  border: 1px solid rgba(116, 149, 208, 0.2);
}

.progress-label {
  margin-bottom: 6px;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #c7d6f5;
}

.chart-row,
.content-row {
  margin-bottom: 14px;
}

.chart-card,
.panel-card {
  border-radius: 12px;
  padding: 12px;
  background: linear-gradient(155deg, rgba(17, 43, 87, 0.94), rgba(9, 27, 56, 0.9));
  box-shadow: inset 0 0 0 1px rgba(109, 146, 207, 0.22);
}

.panel-bottom {
  margin-bottom: 8px;
}

.panel-title {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #edf3ff;
}

.chart-box {
  width: 100%;
  height: 280px;
}

.ratio-card {
  min-height: 304px;
}

.ratio-box {
  height: 332px;
}

.recognition-card {
  min-height: 360px;
}

.recognition-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}

.recognition-metric {
  border-radius: 8px;
  padding: 8px;
  background: rgba(8, 28, 58, 0.62);
  border: 1px solid rgba(116, 149, 208, 0.2);
}

.metric-label {
  font-size: 12px;
  color: #a9c0ea;
}

.metric-value {
  margin-top: 4px;
  font-size: 18px;
  font-weight: 700;
  color: #eff4ff;
}

.recognition-scroll {
  height: 245px;
}

.recognition-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recognition-item {
  border-radius: 8px;
  padding: 10px;
  background: rgba(10, 29, 58, 0.72);
  border: 1px solid rgba(112, 145, 202, 0.24);
  font-size: 12px;
  color: #d4e3ff;
}

.recognition-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
  color: #e6efff;
}

.recognition-line {
  color: #9db6e5;
  word-break: break-all;
}

.scroll-area {
  height: 300px;
}

.feed-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.feed-item {
  border-radius: 8px;
  padding: 10px;
  background: rgba(10, 29, 58, 0.72);
  border: 1px solid rgba(112, 145, 202, 0.24);
  font-size: 12px;
  color: #d4e3ff;
}

.highlight {
  color: #fda4af;
  font-weight: 700;
}

.binary-line {
  margin-top: 6px;
  color: #9db6e5;
  font-family: Consolas, 'Courier New', monospace;
  word-break: break-all;
}

.timeline-record {
  font-size: 12px;
  color: #c6d7f8;
}

.timeline-line {
  margin-bottom: 4px;
  word-break: break-all;
}

.capture-card {
  border-radius: 8px;
  overflow: hidden;
  background: rgba(8, 28, 58, 0.72);
  box-shadow: inset 0 0 0 1px rgba(116, 149, 208, 0.25);
}

.capture-row {
  margin-top: 4px;
}

.capture-col {
  margin-bottom: 14px;
}

.capture-card.capture-detected {
  background: linear-gradient(160deg, rgba(8, 24, 48, 0.95), rgba(8, 28, 58, 0.86));
  box-shadow: inset 0 0 0 2px rgba(43, 211, 255, 0.38), 0 10px 20px rgba(2, 10, 24, 0.35);
}

.capture-image {
  width: 100%;
  height: 260px;
}

.capture-meta {
  padding: 8px;
  font-size: 12px;
  color: #c7d6f5;
  line-height: 1.45;
}

.capture-link {
  margin-top: 4px;
  color: #9db6e5;
}

.image-fallback,
.empty-text {
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8aa4d4;
}

.preview-dialog-content {
  display: flex;
  justify-content: center;
}

.preview-image {
  max-width: 100%;
  max-height: 70vh;
}

:deep(.el-button--default) {
  background: rgba(10, 30, 61, 0.78);
  color: #dce9ff;
  border-color: rgba(104, 143, 202, 0.35);
}

:deep(.el-button--success) {
  border-color: #2d9b78;
  background-color: #2d9b78;
}

:deep(.el-input__wrapper) {
  background: rgba(8, 27, 56, 0.84);
  box-shadow: 0 0 0 1px rgba(103, 142, 201, 0.35) inset;
}

:deep(.el-input__inner) {
  color: #e2edff;
}

:deep(.el-timeline-item__timestamp) {
  color: #9db6e5;
}

:deep(.el-timeline-item__node) {
  background-color: #4f8ee8;
}

@media (max-width: 992px) {
  .connection-main {
    flex-direction: column;
    align-items: flex-start;
  }

  .right-wrap {
    justify-content: flex-start;
  }

  .ws-input {
    width: 100%;
  }

  .summary-value {
    font-size: 24px;
  }

  .chart-box {
    height: 250px;
  }

  .recognition-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>



