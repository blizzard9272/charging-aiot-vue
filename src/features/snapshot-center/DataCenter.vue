<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import { Connection, DataLine, PictureFilled, UserFilled } from '@element-plus/icons-vue'
import CanvasDetectionImage from '@/shared/components/CanvasDetectionImage.vue'
import {
  fetchUploadStreamOverview,
  fetchUploadStreamRecords,
  type UploadStreamOverviewVO,
  type LinkedStreamPacket,
  type StreamRecord101Details,
  type StreamRecord102Details,
  type StreamRecord103Details,
  type UploadStreamRecord
} from '@/api/uploadStream'

interface WsRecordLike {
  record_id?: unknown
  cam_id?: unknown
  camera_id?: unknown
  batch_id?: unknown
  protocol_id?: unknown
  track_id?: unknown
  timestamp?: unknown
  frame_seq?: unknown
  create_time?: unknown
  details?: unknown
}

const router = useRouter()

const MAX_CACHE_RECORDS = 300
const CAPTURE_PREVIEW_LIMIT = 8
const WS_OPEN_TIMEOUT = 7000
const RECONNECT_BASE_INTERVAL = 3000
const RECONNECT_MAX_INTERVAL = 30000
const RECONNECT_JITTER_MAX = 900

const loading = ref(false)
const wsUrl = ref((import.meta.env.VITE_STREAM_WS_URL as string) || 'ws://localhost:8080/ws/stream')
const isConnected = ref(false)
const reconnecting = ref(false)
const lastPushEventTime = ref<number | null>(null)
const lastPushReceivedTime = ref<number | null>(null)
const overview = ref<UploadStreamOverviewVO | null>(null)

const records = ref<UploadStreamRecord[]>([])
const capturePreviewRecords = ref<UploadStreamRecord[]>([])
const protocolTotals = ref<Record<number, number>>({ 101: 0, 102: 0, 103: 0 })
const snapshotRecordCount = ref(0)
const linkMode = ref<'strict' | 'loose'>('strict')
const protocolChartRef = ref<HTMLDivElement>()
const relationChartRef = ref<HTMLDivElement>()

let protocolChart: echarts.ECharts | null = null
let relationChart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null
let ws: WebSocket | null = null
let reconnectTimer: number | null = null
let manualClose = false
let reconnectAttempt = 0
let disconnectedNotified = false
let chartRenderQueued = false

const parseCreateTimeMs = (createTime: string) => {
  if (!createTime) return 0
  const ts = dayjs(createTime).valueOf()
  return Number.isFinite(ts) ? ts : 0
}

const recordSortTs = (record: UploadStreamRecord) => {
  const createTs = parseCreateTimeMs(record.create_time || '')
  return createTs > 0 ? createTs : record.timestamp
}

const cameraText = (record: UploadStreamRecord) => record.camera_id || `cam${record.cam_id || '-'}`
const formatTime = (timestamp: number, pattern = 'YYYY-MM-DD HH:mm:ss') => (timestamp ? dayjs(timestamp).format(pattern) : '--')
const visualTargetCount = (details: StreamRecord101Details) => {
  const targets = Array.isArray(details.targets) ? details.targets.filter(isVisualTarget) : []
  if (targets.length > 0) return targets.length
  const frameCount = Number(details.frame_target_count || 0)
  return Number.isFinite(frameCount) && frameCount > 0 ? frameCount : 0
}
const validVectorCount = (details: StreamRecord102Details) => {
  const payloadSize = Number(details.payload_size || 0)
  const hasVectorPreview = String(details.vector_base64_preview || '').trim() !== ''
  const hasVectorBody = String(details.vector_base64 || '').trim() !== ''
  const hasVector = payloadSize >= 2048 || hasVectorPreview || hasVectorBody
  if (!hasVector) return 0
  const targetCount = Number(details.target_count || 0)
  if (Number.isFinite(targetCount) && targetCount > 0) return targetCount
  return 1
}

const linkedPackets = computed<LinkedStreamPacket[]>(() => {
  const map = new Map<string, LinkedStreamPacket>()

  records.value.forEach((record) => {
    const key = buildStatsLinkKey(record)
    const packet = map.get(key) || {
      link_key: key,
      cam_id: record.cam_id,
      camera_id: record.camera_id || `cam${record.cam_id}`,
      timestamp: record.timestamp,
      create_time: record.create_time,
      protocol_101_record_ids: [],
      protocol_102_record_ids: [],
      protocol_103_record_ids: [],
      protocols: [],
      target_total: 0,
      vector_total: 0,
      image_total: 0
    }

    if (record.protocol_id === 101) {
      packet.protocol_101_record_ids.push(record.record_id)
      packet.target_total += visualTargetCount(record.details as StreamRecord101Details)
    }
    if (record.protocol_id === 102) {
      packet.protocol_102_record_ids.push(record.record_id)
      packet.vector_total += validVectorCount(record.details as StreamRecord102Details)
    }
    if (record.protocol_id === 103) {
      packet.protocol_103_record_ids.push(record.record_id)
      packet.image_total += 1
    }

    packet.protocols = []
    if (packet.protocol_101_record_ids.length) packet.protocols.push(101)
    if (packet.protocol_102_record_ids.length) packet.protocols.push(102)
    if (packet.protocol_103_record_ids.length) packet.protocols.push(103)
    if (record.create_time > packet.create_time) packet.create_time = record.create_time

    map.set(key, packet)
  })

  return [...map.values()].sort((a, b) => {
    const aTs = parseCreateTimeMs(a.create_time || '') || a.timestamp
    const bTs = parseCreateTimeMs(b.create_time || '') || b.timestamp
    return bTs - aTs || b.timestamp - a.timestamp || b.cam_id - a.cam_id
  })
})

const activeCameraList = computed(() => {
  return [...new Set(records.value.map((item) => cameraText(item)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
})

const overviewSummary = computed(() => overview.value?.summary || {
  total_records: 0,
  camera_count: 0,
  target_count: 0,
  vector_bytes: 0,
  image_success: 0,
  latest_event_time: 0,
  latest_received_time: ''
})

const stats = computed(() => {
  const targetCount = records.value
    .filter((item) => item.protocol_id === 101)
    .reduce((sum, item) => sum + visualTargetCount(item.details as StreamRecord101Details), 0)
  const vectorBytes = records.value
    .filter((item) => item.protocol_id === 102)
    .reduce((sum, item) => sum + Number((item.details as StreamRecord102Details).payload_size || 0), 0)
  const mediaReady = records.value
    .filter((item) => item.protocol_id === 103)
    .filter((item) => (item.details as StreamRecord103Details).image_fetch_status === 'success').length
  const fullLinked = linkedPackets.value.filter((item) => item.protocol_101_record_ids.length && item.protocol_102_record_ids.length && item.protocol_103_record_ids.length).length

  return {
    total: records.value.length,
    cameras: activeCameraList.value.length,
    linked: linkedPackets.value.length,
    fullLinked,
    targetCount,
    vectorBytes,
    imageSuccess: mediaReady
  }
})
const cached101Rows = computed(() => records.value.filter((item) => item.protocol_id === 101).length)
const total101Rows = computed(() => protocolTotals.value[101] || 0)
const uncached101Rows = computed(() => Math.max(0, total101Rows.value - cached101Rows.value))
const cachePolicyText = computed(() => {
  return `首页摘要由后端直接聚合，页面启动时仅缓存最近 ${MAX_CACHE_RECORDS} 条记录，之后用 WebSocket 增量合并；101 卡片展示的是目标明细行数，不是关键帧数。`
})
const keyframePolicyText = computed(() => {
  if (linkMode.value === 'loose') {
    return '当前使用宽松口径：按 camera_id + timestamp 关联，合并更积极，但可能把同毫秒不同帧视为同一关键帧。'
  }
  return '当前使用严格口径：优先按 camera_id + timestamp + frame_seq 去重；当缺失序号时回退为 camera_id + timestamp。'
})
const fullLinkedPolicyText = computed(() => {
  return '完整关联表示同一关键帧下同时出现 101 检测、102 向量和 103 媒体三类记录，用于判断整条识别链路是否闭环。'
})
const channelStatusText = computed(() => {
  if (isConnected.value) return 'WebSocket 正在接收增量消息，首页数据会持续滚动更新。'
  if (reconnecting.value) return 'WebSocket 正在自动重连，期间页面仍保留已缓存数据。'
  return 'WebSocket 当前离线，页面仅展示缓存结果，新的推送暂时不会实时刷新。'
})
const pushTimeText = computed(() => {
  return '最近推送时间取平台接收并写入前端缓存的最新时刻；下方补充的是设备侧最近事件发生时间。'
})

const latestRecords = computed(() => records.value.slice(0, 16))
const recentPackets = computed(() => linkedPackets.value.slice(0, 12))
const previewDialogVisible = ref(false)
const previewMediaUrl = ref('')
const previewMediaType = ref<'image' | 'video'>('image')

const isVisualTarget = (target: { x1: number; y1: number; x2: number; y2: number }) => {
  return !(target.x1 === 0 && target.y1 === 0 && target.x2 === 0 && target.y2 === 0)
}

const dedupeVisualTargets = (targets: StreamRecord101Details['targets']) => {
  const result: StreamRecord101Details['targets'] = []
  const seen = new Set<string>()
  targets.forEach((target) => {
    if (!isVisualTarget(target)) return
    const key = `${target.type ?? -1}-${target.x1}-${target.y1}-${target.x2}-${target.y2}`
    if (seen.has(key)) return
    seen.add(key)
    result.push(target)
  })
  return result
}

const parseTrackId = (value: unknown) => {
  const num = Number(value)
  return Number.isFinite(num) ? Math.trunc(num) : 0
}

const getRecordFaceId = (record: UploadStreamRecord) => {
  const details = record.details as StreamRecord103Details & { tid?: unknown; track_id?: unknown; face_id?: unknown }
  const fromDetails = parseTrackId(details.face_id ?? details.tid ?? details.track_id)
  if (fromDetails > 0) return fromDetails
  const rowLike = record as UploadStreamRecord & { track_id?: unknown; face_id?: unknown }
  const fromRecord = parseTrackId(rowLike.face_id ?? rowLike.track_id)
  if (fromRecord > 0) return fromRecord
  const normalized = (record.normalized_json || {}) as Record<string, unknown>
  return parseTrackId(normalized.face_id ?? normalized.track_id)
}

const getFrameSeq = (record: UploadStreamRecord) => {
  const seq = Number((record as UploadStreamRecord & { frame_seq?: unknown }).frame_seq)
  return Number.isFinite(seq) ? seq : null
}

const buildStrictFrameLinkKey = (record: UploadStreamRecord) => {
  const camera = record.camera_id || `cam${record.cam_id}`
  const seq = getFrameSeq(record)
  if (seq !== null) return `${camera}_${record.timestamp}_${seq}`
  return `${camera}_${record.timestamp}`
}

const buildStatsLinkKey = (record: UploadStreamRecord) => {
  if (linkMode.value === 'loose') {
    const camera = record.camera_id || `cam${record.cam_id}`
    return `${camera}_${record.timestamp}`
  }
  return buildStrictFrameLinkKey(record)
}

const openPreviewDialog = (mediaUrl: string, mediaType: 'image' | 'video') => {
  previewMediaUrl.value = mediaUrl
  previewMediaType.value = mediaType
  previewDialogVisible.value = true
}

const targetsByLinkKey = computed(() => {
  const map = new Map<string, StreamRecord101Details['targets']>()
  records.value
    .filter((item) => item.protocol_id === 101)
    .forEach((item) => {
      const key = buildStrictFrameLinkKey(item)
      const targets = (item.details as StreamRecord101Details).targets || []
      const current = map.get(key) || []
      map.set(key, dedupeVisualTargets([...current, ...targets]))
    })
  return map
})

const targetsByTimestampKey = computed(() => {
  const map = new Map<string, StreamRecord101Details['targets']>()
  records.value
    .filter((item) => item.protocol_id === 101)
    .forEach((item) => {
      const tsKey = `${cameraText(item)}_${item.timestamp}`
      const targets = (item.details as StreamRecord101Details).targets || []
      const current = map.get(tsKey) || []
      map.set(tsKey, dedupeVisualTargets([...current, ...targets]))
    })
  return map
})

const latestCaptureEntries = computed(() => {
  return capturePreviewRecords.value
    .map((item) => {
      const linkKey = buildStrictFrameLinkKey(item)
      const tsKey = `${cameraText(item)}_${item.timestamp}`
      const allTargets = dedupeVisualTargets([
        ...(targetsByLinkKey.value.get(linkKey) || []),
        ...(targetsByTimestampKey.value.get(tsKey) || [])
      ])
      const faceId = getRecordFaceId(item)
      const matchedTargets = faceId > 0 ? allTargets.filter((target) => Number(target.face_id ?? target.tid) === faceId) : []
      return {
        record: item,
        targets: matchedTargets.length ? matchedTargets : allTargets
      }
    })
})

const protocolCards = computed(() => [
  {
    protocol: 101,
    title: '目标检测',
    total: protocolTotals.value[101] || 0,
    desc: `坐标明细 ${protocolTotals.value[101] || 0}，总目标 ${overviewSummary.value.target_count}`,
    icon: UserFilled,
    color: '#37b26c',
    path: '/snapshot-center/data-center/101',
    explain: '101 展示人脸或目标检测坐标明细，适合检查检测数量、目标框位置以及帧级去重后的规模。'
  },
  {
    protocol: 102,
    title: '特征向量',
    total: protocolTotals.value[102] || 0,
    desc: `总向量 ${(overviewSummary.value.vector_bytes / 1024).toFixed(1)} KB`,
    icon: DataLine,
    color: '#e8a219',
    path: '/snapshot-center/data-center/102',
    explain: '102 展示特征向量接收结果，重点看向量体量、识别状态和与 101、103 的联动情况。'
  },
  {
    protocol: 103,
    title: '媒体抓拍',
    total: protocolTotals.value[103] || 0,
    desc: `成功落媒体 ${overviewSummary.value.image_success}`,
    icon: PictureFilled,
    color: '#2f75ff',
    path: '/snapshot-center/data-center/103',
    explain: '103 展示图片或视频抓拍结果，适合核对媒体是否完整接收、可播放，以及与关键帧的关联。'
  }
])

const packetProtocolText = (packet: LinkedStreamPacket) => {
  const parts: string[] = []
  if (packet.protocol_101_record_ids.length) parts.push('101')
  if (packet.protocol_102_record_ids.length) parts.push('102')
  if (packet.protocol_103_record_ids.length) parts.push('103')
  return parts.join(' / ') || '--'
}

const recordSummary = (record: UploadStreamRecord) => {
  if (record.protocol_id === 101) {
    const detail = record.details as StreamRecord101Details
    const target = detail.targets?.[0]
    return target
      ? `人脸 ${target.face_id ?? target.tid}，坐标 (${target.x1}, ${target.y1}) - (${target.x2}, ${target.y2})`
      : `人脸数量 ${detail.count}`
  }
  if (record.protocol_id === 102) {
    const detail = record.details as StreamRecord102Details
    return `face_id ${detail.face_id || record.face_id || record.track_id || '--'}，${detail.status || 'received'}`
  }
  const detail = record.details as StreamRecord103Details
  const mediaText = detail.media_kind === 'video' ? '视频' : '图片'
  if (String(detail.image_fetch_status || '').trim() === 'incomplete') {
    const totalPackets = Number(detail.total_packets || 0)
    const receivedPackets = Number(detail.received_packets || 0)
    const missingPackets = Math.max(0, totalPackets - receivedPackets)
    return `incomplete，${mediaText} 不完整，不可预览${missingPackets > 0 ? `，缺 ${missingPackets} 片` : ''}`
  }
  return `face_id ${detail.face_id || record.face_id || record.track_id || '--'}，${detail.image_fetch_status || 'pending'}，${mediaText}`
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

const normalizeRecord = (source: WsRecordLike): UploadStreamRecord | null => {
  const protocolId = toInt(source.protocol_id)
  if (![101, 102, 103].includes(protocolId)) return null

  const timestamp = toInt(source.timestamp)
  if (timestamp <= 0) return null

  const recordId = toInt(source.record_id, timestamp)
  const camId = toInt(source.cam_id)
  const cameraId = String(source.camera_id || `cam${camId}`)
  const batchId = toInt(source.batch_id)
  const detailsRaw = source.details && typeof source.details === 'object' ? (source.details as Record<string, unknown>) : {}

  if (protocolId === 101) {
    const targets = Array.isArray(detailsRaw.targets)
      ? detailsRaw.targets.map((item) => {
          const row = (item || {}) as Record<string, unknown>
          return {
            type: toInt(row.type),
            tid: toInt(row.tid),
            face_id: toInt(row.face_id, toInt(row.tid)),
            x1: toInt(row.x1),
            y1: toInt(row.y1),
            x2: toInt(row.x2),
            y2: toInt(row.y2),
            object_index: toInt(row.object_index)
          }
        })
      : []

    return {
      record_id: recordId,
      cam_id: camId,
      camera_id: cameraId,
      protocol_id: 101,
      timestamp,
      frame_seq: toInt(source.frame_seq, toInt(detailsRaw.frame_seq, toInt(detailsRaw.frame_index))),
      batch_id: batchId,
      source_file_name: '',
      source_file_size: 0,
      create_time: String(source.create_time || ''),
      face_id: toInt((source as WsRecordLike & { face_id?: unknown }).face_id, toInt((source as WsRecordLike & { track_id?: unknown }).track_id)),
      details: {
        count: Number(detailsRaw.count ?? targets.length),
        frame_face_count: toInt(detailsRaw.frame_face_count, Number(detailsRaw.count ?? targets.length)),
        frame_width: toInt(detailsRaw.frame_width),
        frame_height: toInt(detailsRaw.frame_height),
        targets,
        payload_hex_rebuilt: String(detailsRaw.payload_hex_rebuilt || ''),
        frame_target_count: Number(detailsRaw.frame_target_count || targets.length)
      }
    }
  }

  if (protocolId === 102) {
    return {
      record_id: recordId,
      cam_id: camId,
      camera_id: cameraId,
      protocol_id: 102,
      timestamp,
      frame_seq: toInt(source.frame_seq, toInt(detailsRaw.frame_seq, toInt(detailsRaw.frame_index))),
      batch_id: batchId,
      source_file_name: '',
      source_file_size: 0,
      create_time: String(source.create_time || ''),
      face_id: toInt((source as WsRecordLike & { face_id?: unknown }).face_id, toInt((source as WsRecordLike & { track_id?: unknown }).track_id)),
      details: {
        payload_size: toInt(detailsRaw.payload_size),
        face_id: toInt(detailsRaw.face_id, toInt((source as WsRecordLike & { face_id?: unknown }).face_id, toInt((source as WsRecordLike & { track_id?: unknown }).track_id))),
        vector_base64_preview: String(detailsRaw.vector_base64_preview || ''),
        vector_hex_preview: String(detailsRaw.vector_hex_preview || ''),
        vector_payload_hex_preview: String(detailsRaw.vector_payload_hex_preview || ''),
        vector_base64: String(detailsRaw.vector_base64 || ''),
        embedding_dim: toInt(detailsRaw.embedding_dim),
        embedding_file_path: String(detailsRaw.embedding_file_path || ''),
        embedding_preview: String(detailsRaw.embedding_preview || ''),
        status: String(detailsRaw.status || '')
      }
    }
  }

  return {
    record_id: recordId,
    cam_id: camId,
    camera_id: cameraId,
    protocol_id: 103,
    timestamp,
    frame_seq: toInt(source.frame_seq, toInt(detailsRaw.frame_seq, toInt(detailsRaw.frame_index))),
    batch_id: batchId,
    source_file_name: '',
    source_file_size: 0,
    create_time: String(source.create_time || ''),
    face_id: toInt((source as WsRecordLike & { face_id?: unknown }).face_id, toInt((source as WsRecordLike & { track_id?: unknown }).track_id)),
      details: {
        payload_size: toInt(detailsRaw.payload_size),
        tid: toInt(detailsRaw.tid, toInt(detailsRaw.track_id, toInt((source as WsRecordLike & { track_id?: unknown }).track_id))),
        face_id: toInt(detailsRaw.face_id, toInt(detailsRaw.tid, toInt(detailsRaw.track_id, toInt((source as WsRecordLike & { track_id?: unknown }).track_id)))),
        image_hex_preview: String(detailsRaw.image_hex_preview || ''),
        base64_image: String(detailsRaw.base64_image || ''),
        image_data_url: ensureDataUrl(String(detailsRaw.image_data_url || detailsRaw.base64_image || '')),
        image_fetch_status: String(detailsRaw.image_fetch_status || ''),
        local_image_path: String(detailsRaw.local_image_path || ''),
        media_kind: String(detailsRaw.media_kind || 'image'),
        media_url: String(detailsRaw.media_url || ''),
        payload_type: toInt(detailsRaw.payload_type),
        media_type: toInt(detailsRaw.media_type, toInt(detailsRaw.payload_type)),
        start_timestamp: toInt(detailsRaw.start_timestamp),
        end_timestamp: toInt(detailsRaw.end_timestamp),
        total_packets: toInt(detailsRaw.total_packets),
        packet_index: toInt(detailsRaw.packet_index),
        received_packets: toInt(detailsRaw.received_packets),
        media_total_size: toInt(detailsRaw.media_total_size),
        chunk_length: toInt(detailsRaw.chunk_length),
        received_media_size: toInt(detailsRaw.received_media_size, toInt(detailsRaw.payload_size)),
        is_complete_media: Boolean(detailsRaw.is_complete_media),
        source_file_name: String(detailsRaw.source_file_name || ''),
        person_count: toInt(detailsRaw.person_count),
        animal_count: toInt(detailsRaw.animal_count),
        car_count: toInt(detailsRaw.car_count)
    }
  }
}

const extractRecordsFromPayload = (payload: unknown): UploadStreamRecord[] => {
  if (Array.isArray(payload)) {
    return payload.map((item) => normalizeRecord(item as WsRecordLike)).filter((item): item is UploadStreamRecord => item !== null)
  }

  if (!payload || typeof payload !== 'object') return []

  const wrapper = payload as Record<string, unknown>
  if (Array.isArray(wrapper.records)) {
    return wrapper.records.map((item) => normalizeRecord(item as WsRecordLike)).filter((item): item is UploadStreamRecord => item !== null)
  }

  if (wrapper.data) return extractRecordsFromPayload(wrapper.data)
  const normalized = normalizeRecord(wrapper as WsRecordLike)
  return normalized ? [normalized] : []
}

const appendRecords = (incoming: UploadStreamRecord[]) => {
  if (!incoming.length) return

  const existingKeys = new Set(records.value.map((item) => `${item.protocol_id}-${item.record_id}`))
  const merged = [...incoming, ...records.value]
  const dedupMap = new Map<string, UploadStreamRecord>()
  const addedCounts = { 101: 0, 102: 0, 103: 0 }

  merged.forEach((item) => {
    const key = `${item.protocol_id}-${item.record_id}`
    if (!dedupMap.has(key)) {
      dedupMap.set(key, item)
      if (incoming.includes(item) && !existingKeys.has(key)) {
        addedCounts[item.protocol_id as 101 | 102 | 103] += 1
      }
    }
  })

  records.value = [...dedupMap.values()]
    .sort((a, b) => recordSortTs(b) - recordSortTs(a) || b.timestamp - a.timestamp)
    .slice(0, MAX_CACHE_RECORDS)

  const previewIncoming = incoming.filter((item) => {
    if (item.protocol_id !== 103) return false
    const details = item.details as StreamRecord103Details
    return String(details.image_data_url || '').trim() !== '' || String(details.media_url || '').trim() !== ''
  })
  if (previewIncoming.length > 0) {
    capturePreviewRecords.value = [...previewIncoming, ...capturePreviewRecords.value]
      .sort((a, b) => recordSortTs(b) - recordSortTs(a) || b.timestamp - a.timestamp)
      .filter((item, index, list) => list.findIndex((candidate) => candidate.record_id === item.record_id) === index)
      .slice(0, CAPTURE_PREVIEW_LIMIT)
  }

  protocolTotals.value = {
    101: (protocolTotals.value[101] || 0) + addedCounts[101],
    102: (protocolTotals.value[102] || 0) + addedCounts[102],
    103: (protocolTotals.value[103] || 0) + addedCounts[103]
  }
}

const isReplayPacket = (payload: unknown) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const wrapper = payload as Record<string, unknown>
  return Array.isArray(wrapper.records)
}

const buildWsCandidates = (inputUrl: string) => {
  const fallbackLocal = ['ws://127.0.0.1:8080/ws/stream', 'ws://localhost:8080/ws/stream']
  const candidates: string[] = []
  const addUnique = (url: string) => {
    if (url && !candidates.includes(url)) candidates.push(url)
  }

  const trimmed = inputUrl.trim()
  addUnique(trimmed)

  try {
    const parsed = new URL(trimmed)
    if (typeof window !== 'undefined' && window.location.hostname) {
      addUnique(`${parsed.protocol}//${window.location.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname || '/ws/stream'}`)
    }
    if (parsed.hostname === 'localhost') addUnique(trimmed.replace('localhost', '127.0.0.1'))
    if (parsed.hostname === '127.0.0.1') addUnique(trimmed.replace('127.0.0.1', 'localhost'))
  } catch (_error) {
    // noop
  }

  fallbackLocal.forEach(addUnique)
  return candidates
}

const clearReconnectTimer = () => {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
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

const calcReconnectDelay = () => {
  const exp = Math.min(RECONNECT_MAX_INTERVAL, Math.round(RECONNECT_BASE_INTERVAL * Math.pow(1.6, Math.max(0, reconnectAttempt - 1))))
  return Math.min(RECONNECT_MAX_INTERVAL, exp + Math.floor(Math.random() * RECONNECT_JITTER_MAX))
}

const notifyDisconnected = () => {
  if (disconnectedNotified) return
  disconnectedNotified = true
  ElMessage.warning('WebSocket 未连接，系统正在自动重连')
}

const scheduleReconnect = () => {
  if (manualClose || reconnectTimer !== null) return
  reconnecting.value = true
  reconnectAttempt += 1
  notifyDisconnected()
  const delay = calcReconnectDelay()
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    connectWs()
  }, delay)
}

const connectByCandidates = (candidates: string[], index = 0) => {
  if (index >= candidates.length) {
    isConnected.value = false
    reconnecting.value = false
    notifyDisconnected()
    return
  }

  const target = candidates[index]

  let socket: WebSocket
  try {
    socket = new WebSocket(target)
  } catch (_error) {
    connectByCandidates(candidates, index + 1)
    return
  }

  let opened = false
  const openTimeout = window.setTimeout(() => {
    if (!opened) socket.close()
  }, WS_OPEN_TIMEOUT)

  socket.onopen = () => {
    opened = true
    window.clearTimeout(openTimeout)
    ws = socket
    wsUrl.value = target
    isConnected.value = true
    reconnecting.value = false
    reconnectAttempt = 0
    disconnectedNotified = false
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
        const newestEventTs = incoming.reduce((maxTs, record) => {
          return Math.max(maxTs, Number(record.timestamp || 0))
        }, 0)
        if (newestEventTs > 0) {
          lastPushEventTime.value = Math.max(lastPushEventTime.value || 0, newestEventTs)
        }
        lastPushReceivedTime.value = Date.now()
      }
    } catch (_error) {
      ElMessage.warning('收到无法解析的实时消息')
    }
  }

  socket.onerror = () => {
    isConnected.value = false
  }

  socket.onclose = () => {
    window.clearTimeout(openTimeout)
    if (!opened) {
      connectByCandidates(candidates, index + 1)
      return
    }

    isConnected.value = false
    ws = null
    if (!manualClose) scheduleReconnect()
  }
}

const connectWs = () => {
  clearReconnectTimer()
  closeWs()
  manualClose = false
  reconnecting.value = true
  connectByCandidates(buildWsCandidates(wsUrl.value))
}

const loadCapturePreviews = async () => {
  const res = await fetchUploadStreamRecords({
    protocol: 103,
    limit: CAPTURE_PREVIEW_LIMIT,
    offset: 0,
    include_payload: 1
  })

  const batch = Array.isArray(res?.data?.records) ? res.data.records : []
  capturePreviewRecords.value = batch
    .filter((item) => {
      if (item.protocol_id !== 103) return false
      const details = item.details as StreamRecord103Details
      return String(details.image_data_url || '').trim() !== '' || String(details.media_url || '').trim() !== ''
    })
    .sort((a, b) => recordSortTs(b) - recordSortTs(a) || b.timestamp - a.timestamp)
    .slice(0, CAPTURE_PREVIEW_LIMIT)
}

const loadOverview = async () => {
  const res = await fetchUploadStreamOverview()
  overview.value = res?.data || null
  if (res?.data?.protocol_totals) {
    protocolTotals.value = res.data.protocol_totals
  }
  const latestEventTs = Number(res?.data?.summary?.latest_event_time || 0)
  if (latestEventTs > 0) {
    lastPushEventTime.value = latestEventTs
  }
  const latestReceivedRaw = String(res?.data?.summary?.latest_received_time || '')
  const latestReceivedTs = parseCreateTimeMs(latestReceivedRaw)
  if (latestReceivedTs > 0) {
    lastPushReceivedTime.value = latestReceivedTs
  }
}

const loadSnapshotOnce = async () => {
  loading.value = true
  try {
    await loadOverview()
    const res = await fetchUploadStreamRecords({ limit: MAX_CACHE_RECORDS, offset: 0, include_payload: 0 })
    const batch = Array.isArray(res?.data?.records) ? res.data.records : []
    records.value = batch
      .sort((a, b) => recordSortTs(b) - recordSortTs(a) || b.timestamp - a.timestamp)
      .slice(0, MAX_CACHE_RECORDS)
    snapshotRecordCount.value = records.value.length

    if (records.value.length > 0) {
      const latestEventTs = records.value.reduce((maxTs, row) => Math.max(maxTs, Number(row.timestamp || 0)), 0)
      if (latestEventTs > 0) lastPushEventTime.value = Math.max(lastPushEventTime.value || 0, latestEventTs)
      const latestReceivedTs = parseCreateTimeMs(records.value[0].create_time || '')
      if (latestReceivedTs > 0) {
        lastPushReceivedTime.value = Math.max(lastPushReceivedTime.value || 0, latestReceivedTs)
      }
    }

    await loadCapturePreviews()
  } catch (_error) {
    ElMessage.error('数据展示中心初始化加载失败')
  } finally {
    loading.value = false
  }
}

const queueRenderCharts = () => {
  if (chartRenderQueued) return
  chartRenderQueued = true
  window.requestAnimationFrame(async () => {
    chartRenderQueued = false
    await renderCharts()
  })
}

const renderCharts = async () => {
  await nextTick()

  if (protocolChartRef.value) {
    protocolChart = protocolChart || echarts.init(protocolChartRef.value)
    const protocolData = protocolCards.value.map((item) => ({ name: `${item.protocol} ${item.title}`, value: item.total }))
    protocolChart.setOption({
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, textStyle: { color: '#6f83a5' } },
      series: [
        {
          type: 'pie',
          radius: ['44%', '70%'],
          center: ['50%', '48%'],
          roseType: 'radius',
          data: protocolData,
          label: {
            color: '#526784',
            formatter: '{b}\n{c} 条'
          },
          color: ['#37b26c', '#e8a219', '#2f75ff']
        }
      ]
    })
  }

  if (relationChartRef.value) {
    relationChart = relationChart || echarts.init(relationChartRef.value)
    relationChart.setOption({
      grid: { left: 54, right: 20, top: 22, bottom: 34 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'category',
        data: ['101记录', '102记录', '103记录', '关键帧', '完整关联'],
        axisLine: { lineStyle: { color: '#8ba6d6' } },
        axisLabel: { color: '#516b93' }
      },
      yAxis: {
        type: 'value',
        name: '数量',
        nameTextStyle: { color: '#6f83a5' },
        splitLine: { lineStyle: { color: 'rgba(139,166,214,.18)' } },
        axisLabel: { color: '#6f83a5' }
      },
      series: [
        {
          type: 'bar',
          barWidth: 36,
          data: [
            protocolTotals.value[101] || 0,
            protocolTotals.value[102] || 0,
            protocolTotals.value[103] || 0,
            stats.value.linked,
            stats.value.fullLinked
          ],
          itemStyle: {
            color: (params: { dataIndex: number }) => ['#37b26c', '#e8a219', '#2f75ff', '#8b5cf6', '#1f9d7a'][params.dataIndex] || '#5b8ff9',
            borderRadius: [10, 10, 0, 0]
          },
          label: {
            show: true,
            position: 'top',
            color: '#425b84'
          }
        }
      ]
    })
  }
}

watch(
  () => [
    records.value.length,
    protocolTotals.value[101] || 0,
    protocolTotals.value[102] || 0,
    protocolTotals.value[103] || 0,
    stats.value.linked,
    stats.value.fullLinked
  ],
  () => {
    queueRenderCharts()
  }
)

onMounted(async () => {
  await loadSnapshotOnce()
  queueRenderCharts()
  connectWs()

  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => {
      protocolChart?.resize()
      relationChart?.resize()
    })
    if (protocolChartRef.value) resizeObserver.observe(protocolChartRef.value)
    if (relationChartRef.value) resizeObserver.observe(relationChartRef.value)
  }
})

onUnmounted(() => {
  manualClose = true
  clearReconnectTimer()
  closeWs()
  resizeObserver?.disconnect()
  protocolChart?.dispose()
  relationChart?.dispose()
})
</script>

<template>
  <div class="data-center-page" v-loading="loading">
    <section class="hero">
      <div class="hero-copy">
        <p class="hero-eyebrow">Protocol Data Hub</p>
        <h2>101-103 数据展示中心</h2>
        <span>统一展示三类协议数据的实时接收、解析结果、关联关系和增量变化</span>
      </div>
      <div class="hero-kpis">
        <div class="hero-kpi explain-card">
          <div style="margin-bottom: 10px;">实时通道状态</div>
          <strong>{{ isConnected ? '在线' : reconnecting ? '重连中' : '离线' }}</strong>
          <div class="explain-hover-panel">
            <div class="hover-title">实时通道状态</div>
            <div class="hover-text">{{ channelStatusText }}</div>
          </div>
        </div>
        <div class="hero-kpi explain-card">
          <span>最后推送时间</span><strong>{{ lastPushReceivedTime ? formatTime(lastPushReceivedTime, 'YYYY-MM-DD HH:mm:ss') : '--' }}</strong>
          <small>最近事件发生时间 {{ lastPushEventTime ? formatTime(lastPushEventTime, 'YYYY-MM-DD HH:mm:ss') : '--' }}</small>
          <div class="explain-hover-panel">
            <div class="hover-title">推送时间说明</div>
            <div class="hover-text">{{ pushTimeText }}</div>
          </div>
        </div>
      </div>
    </section>

    <div class="overview-grid">
      <div class="overview-card explain-card">
        <strong>{{ stats.total }}</strong>
        <span>当前缓存记录</span>
        <div class="explain-hover-panel">
          <div class="hover-title">缓存策略说明</div>
          <div class="hover-text">{{ cachePolicyText }}</div>
          <div class="hover-text">当前 101 库内目标明细 {{ total101Rows }} 条，前端缓存 101 明细 {{ cached101Rows }} 条，差值 {{ uncached101Rows }} 条不会参与首页缓存目标和 103 媒体关联统计。</div>
        </div>
      </div>
      <div class="overview-card active-camera-card">
        <strong>{{ stats.cameras }}</strong>
        <span>活跃摄像头</span>
        <div class="camera-hover-panel">
          <div class="hover-title">活跃摄像头列表</div>
          <div v-if="activeCameraList.length" class="camera-chip-list">
            <span v-for="camera in activeCameraList" :key="camera">{{ camera }}</span>
          </div>
          <div v-else class="camera-empty">暂无摄像头数据</div>
        </div>
      </div>
      <div class="overview-card explain-card">
        <strong>{{ stats.linked }}</strong>
        <span>关键帧数量</span>
        <div class="link-mode-switch">
          <el-radio-group v-model="linkMode" size="small">
            <el-radio-button label="strict">严格口径</el-radio-button>
            <el-radio-button label="loose">宽松口径</el-radio-button>
          </el-radio-group>
        </div>
        <div class="explain-hover-panel">
          <div class="hover-title">关键帧统计口径</div>
          <div class="hover-text">{{ keyframePolicyText }}</div>
        </div>
      </div>
      <div class="overview-card explain-card">
        <strong>{{ stats.fullLinked }}</strong>
        <span>101/102/103 完整关联</span>
        <div class="explain-hover-panel">
          <div class="hover-title">完整关联说明</div>
          <div class="hover-text">{{ fullLinkedPolicyText }}</div>
        </div>
      </div>
    </div>

    <div class="protocol-grid">
      <div
        v-for="item in protocolCards"
        :key="item.protocol"
        class="protocol-card explain-card"
        :style="{ '--card-color': item.color }"
        @click="router.push(item.path)"
      >
        <el-icon><component :is="item.icon" /></el-icon>
        <div class="protocol-card-content">
          <p>{{ item.protocol }} {{ item.title }}</p>
          <strong>{{ item.total }}</strong>
          <span>{{ item.desc }}</span>
        </div>
        <div class="explain-hover-panel">
          <div class="hover-title">{{ item.protocol }} {{ item.title }}</div>
          <div class="hover-text">{{ item.explain }}</div>
        </div>
      </div>
    </div>

    <el-row :gutter="18" class="chart-row">
      <el-col :xl="8" :lg="9" :md="24">
        <el-card shadow="never" class="panel-card">
          <template #header>
            <div class="panel-header-copy">
              <span>协议占比</span>
              <small>查看 101 / 102 / 103 当前累计分布</small>
            </div>
          </template>
          <div ref="protocolChartRef" class="chart"></div>
        </el-card>
      </el-col>
      <el-col :xl="16" :lg="15" :md="24">
        <el-card shadow="never" class="panel-card">
          <template #header>
            <div class="panel-header-copy">
              <span>101-103 关联概览</span>
              <small>对比协议记录量、关键帧量和完整关联量</small>
            </div>
          </template>
          <div ref="relationChartRef" class="chart"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="18">
      <el-col :xl="14" :lg="14" :md="24">
        <el-card shadow="never" class="panel-card">
          <template #header>实时接收数据</template>
          <div class="live-list">
            <div v-for="record in latestRecords" :key="`${record.protocol_id}-${record.record_id}`" class="live-item">
              <el-tag :type="record.protocol_id === 101 ? 'success' : record.protocol_id === 102 ? 'warning' : 'primary'">
                {{ record.protocol_id }}
              </el-tag>
              <div>
                <strong>{{ cameraText(record) }} · {{ formatTime(record.timestamp, 'YYYY-MM-DD HH:mm:ss') }}</strong>
                <span>{{ recordSummary(record) }}</span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xl="10" :lg="10" :md="24">
        <el-card shadow="never" class="panel-card">
          <template #header>
            <span><el-icon><Connection /></el-icon> 关键帧队列</span>
          </template>
          <el-table :data="recentPackets" height="438" size="small">
            <el-table-column label="摄像头" width="110">
              <template #default="{ row }">{{ row.camera_id || `cam${row.cam_id}` }}</template>
            </el-table-column>
            <el-table-column label="协议" width="120">
              <template #default="{ row }">{{ packetProtocolText(row) }}</template>
            </el-table-column>
            <el-table-column label="目标/向量/媒体" width="150">
              <template #default="{ row }">{{ row.target_total }} / {{ row.vector_total }} / {{ row.image_total }}</template>
            </el-table-column>
            <el-table-column label="时间">
              <template #default="{ row }">{{ formatTime(row.timestamp, 'YYYY-MM-DD HH:mm:ss') }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="panel-card capture-panel">
      <template #header>103 媒体抓拍（图片按帧序号优先关联 101 坐标）</template>
      <div v-if="latestCaptureEntries.length" class="capture-grid">
        <div v-for="entry in latestCaptureEntries" :key="entry.record.record_id" class="capture-card">
          <CanvasDetectionImage
            v-if="(entry.record.details as StreamRecord103Details).media_kind !== 'video'"
            :image-url="(entry.record.details as StreamRecord103Details).image_data_url"
            :targets="[]"
            :height="220"
            @click="openPreviewDialog((entry.record.details as StreamRecord103Details).image_data_url, 'image')"
          />
          <div v-else class="capture-video-wrap">
            <video
              class="capture-video"
              :src="(entry.record.details as StreamRecord103Details).media_url"
              controls
              preload="metadata"
              @click="openPreviewDialog((entry.record.details as StreamRecord103Details).media_url || '', 'video')"
            />
          </div>
          <div class="capture-meta">
            <div>{{ cameraText(entry.record) }} · {{ formatTime(entry.record.timestamp, 'YYYY-MM-DD HH:mm:ss') }}</div>
            <div>媒体类型：{{ (entry.record.details as StreamRecord103Details).media_kind === 'video' ? '视频' : '图片' }}</div>
            <div v-if="(entry.record.details as StreamRecord103Details).media_kind === 'video'">
              时间段：{{ formatTime((entry.record.details as StreamRecord103Details).start_timestamp || entry.record.timestamp) }} ~ {{ formatTime((entry.record.details as StreamRecord103Details).end_timestamp || entry.record.timestamp) }}
            </div>
            <div v-else>框数量：{{ entry.targets.length }}</div>
          </div>
        </div>
      </div>
      <div v-else class="empty-capture">暂无 103 媒体数据</div>
    </el-card>

    <el-dialog
      v-model="previewDialogVisible"
      width="78vw"
      align-center
      destroy-on-close
      title="103 媒体预览"
    >
      <CanvasDetectionImage
        v-if="previewMediaType === 'image'"
        :image-url="previewMediaUrl"
        :targets="[]"
        :height="560"
      />
      <video v-else class="preview-video" :src="previewMediaUrl" controls style="width:100%;max-height:70vh;background:#000" />
    </el-dialog>
  </div>
</template>

<style scoped>
.data-center-page {
  min-height: 100%;
  padding: 18px;
  background:
    radial-gradient(circle at 8% 6%, rgba(76, 125, 220, 0.1), transparent 38%),
    linear-gradient(180deg, #eef3fb 0%, #f5f8fd 100%);
}

.hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  padding: 26px;
  border-radius: 20px;
  color: #eaf2ff;
  background:
    radial-gradient(circle at 85% 15%, rgba(71, 132, 255, 0.4), transparent 30%),
    linear-gradient(130deg, #10264f, #08172f);
  box-shadow: 0 18px 40px rgba(13, 31, 66, 0.2);
}

.hero-copy {
  max-width: 760px;
}

.hero-eyebrow {
  margin: 0;
  color: #8fb8ff;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero h2 {
  margin: 8px 0 10px;
  font-size: 30px;
  letter-spacing: 0.03em;
  color:#caecff;
}

.hero-copy span {
  color: #b9cbec;
}

.hero-kpis {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  min-width: 320px;
  overflow: visible;
}

.hero-kpi {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  padding: 14px 16px;
  border: 1px solid rgba(143, 184, 255, 0.22);
  border-radius: 12px;
  background: rgba(16, 34, 67, 0.55);
  text-align: center;
  overflow: visible;
}

.hero-kpi strong {
  display: block;
  font-size: 22px;
}

.hero-kpi span {
  color: #a8c2e8;
}

.hero-kpi small {
  display: block;
  margin-top: 4px;
  color: #9bb7e1;
  font-size: 12px;
}

.overview-grid,
.protocol-grid {
  position: relative;
  display: grid;
  gap: 16px;
  margin-top: 16px;
  overflow: visible;
}

.overview-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.protocol-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: 16px;
}

.overview-card,
.protocol-card {
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(24, 42, 78, 0.08);
}

.overview-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 150px;
  padding: 18px;
  text-align: center;
  border: 1px solid rgba(12, 37, 78, 0.05);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.overview-card:hover,
.hero-kpi:hover,
.protocol-card:hover {
  z-index: 30;
  transform: translateY(-4px);
  box-shadow: 0 18px 36px rgba(24, 42, 78, 0.14);
}

.overview-card strong {
  display: block;
  color: #1f2f4d;
  font-size: 28px;
}

.overview-card span,
.protocol-card span {
  color: #7a8aa0;
}

.link-mode-switch {
  margin-top: 10px;
  display: flex;
  justify-content: center;
}

.active-camera-card {
  overflow: visible;
}

.explain-card {
  overflow: visible;
}

.explain-hover-panel {
  position: absolute;
  left: 16px;
  right: 16px;
  top: calc(100% - 4px);
  z-index: 11;
  padding: 14px;
  border: 1px solid rgba(47, 117, 255, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 36px rgba(24, 42, 78, 0.18);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-6px);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.explain-hover-panel::before {
  content: '';
  position: absolute;
  top: -7px;
  left: 50%;
  width: 12px;
  height: 12px;
  background: rgba(255, 255, 255, 0.98);
  border-top: 1px solid rgba(47, 117, 255, 0.14);
  border-left: 1px solid rgba(47, 117, 255, 0.14);
  transform: translateX(-50%) rotate(45deg);
}

.explain-card:hover .explain-hover-panel {
  transition-delay: 0.12s;
  opacity: 1;
  pointer-events: auto;
  transform: translateY(8px);
}

.camera-hover-panel {
  position: absolute;
  left: 16px;
  right: 16px;
  top: calc(100% - 4px);
  z-index: 12;
  padding: 14px;
  border: 1px solid rgba(47, 117, 255, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 36px rgba(24, 42, 78, 0.18);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-6px);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.camera-hover-panel::before {
  content: '';
  position: absolute;
  top: -7px;
  left: 50%;
  width: 12px;
  height: 12px;
  background: rgba(255, 255, 255, 0.98);
  border-top: 1px solid rgba(47, 117, 255, 0.14);
  border-left: 1px solid rgba(47, 117, 255, 0.14);
  transform: translateX(-50%) rotate(45deg);
}

.active-camera-card:hover .camera-hover-panel {
  transition-delay: 0.12s;
  opacity: 1;
  pointer-events: auto;
  transform: translateY(8px);
}

.hover-title {
  margin-bottom: 10px;
  color: #1f2f4d;
  font-weight: 700;
}

.hover-text {
  color: #587093;
  line-height: 1.45;
}

.hover-text + .hover-text {
  margin-top: 8px;
}

.camera-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.camera-chip-list span {
  padding: 5px 10px;
  border-radius: 999px;
  color: #245ea8;
  background: #edf5ff;
}

.camera-empty {
  color: #8ea2c4;
}

.protocol-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  justify-content: center;
  padding: 20px;
  cursor: pointer;
  border: 1px solid rgba(12, 37, 78, 0.05);
  text-align: center;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.protocol-card-content {
  display: grid;
  gap: 4px;
  justify-items: center;
}

.protocol-card .el-icon {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  color: #fff;
  background: var(--card-color);
}

.protocol-card p {
  margin: 0;
  color: #566a89;
}

.protocol-card strong {
  display: block;
  margin: 3px 0;
  color: #1f2f4d;
  font-size: 26px;
}

.chart-row {
  margin-bottom: 16px;
}

.panel-card {
  border: none;
  border-radius: 16px;
  box-shadow: 0 12px 32px rgba(24, 42, 78, 0.08);
}

.panel-header-copy {
  display: grid;
  gap: 4px;
}

.panel-header-copy span {
  color: #27405f;
  font-weight: 700;
}

.panel-header-copy small {
  color: #7b8fad;
  font-size: 12px;
  line-height: 1.4;
}

.chart {
  height: 320px;
}

.live-list {
  display: grid;
  gap: 10px;
  max-height: 438px;
  overflow: auto;
}

.live-item {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid #edf1f7;
  border-radius: 12px;
  background: #fbfdff;
}

.live-item strong,
.live-item span {
  display: block;
}

.live-item strong {
  color: #22324f;
}

.live-item span {
  margin-top: 4px;
  color: #6f83a5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.capture-panel {
  margin-top: 16px;
}

.capture-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.capture-card {
  border: 1px solid #edf1f7;
  border-radius: 12px;
  background: #fbfdff;
  overflow: hidden;
}

.capture-video-wrap {
  height: 220px;
  background: #08172f;
}

.capture-video {
  width: 100%;
  height: 220px;
  object-fit: contain;
  background: #08172f;
}

.capture-meta {
  padding: 10px 12px;
  color: #5f7395;
  font-size: 12px;
  line-height: 1.7;
}

.empty-capture {
  color: #8ea2c4;
  padding: 8px 2px;
}

.preview-video {
  width: 100%;
  max-height: 70vh;
  background: #000;
}

@media (max-width: 1200px) {
  .overview-grid,
  .protocol-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .hero-kpis {
    min-width: 0;
    width: 100%;
  }

  .capture-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .overview-grid,
  .protocol-grid {
    grid-template-columns: 1fr;
  }

  .hero h2 {
    font-size: 24px;
  }

  .capture-grid {
    grid-template-columns: 1fr;
  }
}
</style>

