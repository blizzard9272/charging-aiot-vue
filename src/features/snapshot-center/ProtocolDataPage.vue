<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import * as echarts from 'echarts'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Camera, Histogram, PictureFilled, UserFilled, View, WarningFilled } from '@element-plus/icons-vue'
import CanvasDetectionImage from '@/shared/components/CanvasDetectionImage.vue'
import {
  fetchProtocolFrame,
  fetchUploadStreamCameraOptions,
  fetchUploadStreamRecords,
  deleteProtocolMedia,
  type CameraOptionVO,
  type StreamRecord101Details,
  type StreamRecord102Details,
  type StreamRecord103Details,
  type UploadStreamRecord
} from '@/api/uploadStream'

type ProtocolId = 101 | 102 | 103

const route = useRoute()
const protocol = computed(() => Number(route.meta.protocol || route.params.protocol || 101) as ProtocolId)

const loading = ref(false)
const records = ref<UploadStreamRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const cameraId = ref('')
const cameraOptions = ref<CameraOptionVO[]>([])
const eventTimeRange = ref<[string, string] | []>([])
const qualityFilter = ref<'all' | 'error' | 'missing' | 'normal'>('all')

const aggregateLoading = ref(false)
const aggregateRecords = ref<UploadStreamRecord[]>([])
const aggregateTotal = ref(0)

const imageTargetsMap = ref<Map<string, StreamRecord101Details['targets']>>(new Map())
const imageTargetsByTimestampMap = ref<Map<string, StreamRecord101Details['targets']>>(new Map())
const previewDialogVisible = ref(false)
const previewImageUrl = ref('')
const previewMediaType = ref<'image' | 'video'>('image')

const trendChartRef = ref<HTMLDivElement>()
const categoryChartRef = ref<HTMLDivElement>()
const cameraChartRef = ref<HTMLDivElement>()
const eventGranularity = ref<'year' | 'quarter' | 'month' | 'week' | 'day' | 'hourly'>('day')
const receiveGranularity = ref<'year' | 'quarter' | 'month' | 'week' | 'day' | 'hourly'>('day')
const eventHourlyDate = ref('')
const receiveHourlyDate = ref('')
let trendChart: echarts.ECharts | null = null
let categoryChart: echarts.ECharts | null = null
let cameraChart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const frameDialogVisible = ref(false)
const frameDialogLoading = ref(false)
const frameDialogTitle = ref('协议帧详情')
const frameHex = ref('')
const frameDialogWidth = computed(() => '58vw')

type QualityState = 'normal' | 'error' | 'missing' | 'error_missing'

interface QualitySummary {
  stateMap: Map<string, QualityState>
  errorCount: number
  missingCount: number
  missingFrames: number
}

const isVisualTarget = (target: { x1: number; y1: number; x2: number; y2: number }) => {
  return !(target.x1 === 0 && target.y1 === 0 && target.x2 === 0 && target.y2 === 0)
}

const dedupeVisualTargets = (targets: StreamRecord101Details['targets']) => {
  const result: StreamRecord101Details['targets'] = []
  const seen = new Set<string>()
  targets.forEach((target) => {
    if (!isVisualTarget(target)) return
    // 同一时间戳可能出现重复上报，按目标几何位置去重，避免人数被累加。
    const key = `${target.type ?? -1}-${target.x1}-${target.y1}-${target.x2}-${target.y2}`
    if (seen.has(key)) return
    seen.add(key)
    result.push(target)
  })
  return result
}

const openPreviewDialog = (imageUrl: string) => {
  previewImageUrl.value = imageUrl
  previewMediaType.value = 'image'
  previewDialogVisible.value = true
}

const openVideoPreviewDialog = (videoUrl: string) => {
  previewImageUrl.value = videoUrl
  previewMediaType.value = 'video'
  previewDialogVisible.value = true
}

const protocolInfo = computed(() => {
  if (protocol.value === 101) {
    return {
      title: '101 人脸坐标数据',
      desc: '按人脸编号、分辨率、坐标、置信度和原始协议帧追踪检测结果',
      color: '#37b26c',
      icon: UserFilled
    }
  }
  if (protocol.value === 102) {
    return {
      title: '102 特征向量数据',
      desc: '聚合人脸编号、向量维度、识别状态、特征文件与协议帧信息',
      color: '#e8a219',
      icon: Histogram
    }
  }
  return {
    title: '103 媒体抓拍数据',
    desc: '展示图片和视频抓拍结果，并显示媒体类型、关联人脸编号、分包与落盘状态',
    color: '#2f75ff',
    icon: PictureFilled
  }
})

const cameraText = (record: UploadStreamRecord) => record.camera_id || `cam${record.cam_id || '-'}`
const formatTime = (timestamp: number) => (timestamp ? dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss') : '--')
const parseCreateTimeMs = (createTime: string) => {
  if (!createTime) return 0
  const ts = dayjs(createTime).valueOf()
  return Number.isFinite(ts) ? ts : 0
}
const recordSortTs = (record: UploadStreamRecord) => {
  const createTs = parseCreateTimeMs(record.create_time || '')
  return createTs > 0 ? createTs : record.timestamp
}
const formatCreateTime = (createTime: string) => {
  const ts = parseCreateTimeMs(createTime)
  return ts > 0 ? dayjs(ts).format('YYYY-MM-DD HH:mm:ss') : '--'
}

const formatBytes = (value: number) => {
  if (!value) return '0 B'
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}

const row101ResolutionText = (row: UploadStreamRecord) => {
  const details = row.details as StreamRecord101Details
  const width = Number(details.frame_width || 0)
  const height = Number(details.frame_height || 0)
  if (width > 0 && height > 0) return `${width} × ${height}`
  return '未上报'
}

const objTypeText = (objType?: number) => {
  if (objType === 0) return '人'
  if (objType === 1) return '动物'
  if (objType === 2) return '车'
  return '--'
}

const framePreviewText = (row: UploadStreamRecord) => {
  const fromRow = String(row.raw_protocol_hex_preview || '').trim()
  if (fromRow) return fromRow

  if (row.protocol_id === 101) {
    const details = row.details as StreamRecord101Details
    return String(details.payload_hex_rebuilt || '').trim() || '--'
  }

  if (row.protocol_id === 102) {
    const details = row.details as StreamRecord102Details
    return String(details.vector_payload_hex_preview || details.vector_hex_preview || '').trim() || '--'
  }

  const details = row.details as StreamRecord103Details
  return String(details.image_hex_preview || '').trim() || '--'
}

const rowKey = (row: UploadStreamRecord) => `${row.protocol_id}-${row.record_id}`

const parseRowSequence = (row: UploadStreamRecord) => {
  const normalized = (row.normalized_json || {}) as Record<string, unknown>
  const seqRaw = normalized.frame_seq ?? normalized.frame_index ?? row.frame_seq
  const seq = Number(seqRaw)
  return Number.isFinite(seq) ? seq : null
}

const buildFrameLinkKey = (row: UploadStreamRecord) => {
  const seq = parseRowSequence(row)
  if (seq !== null) return `${cameraText(row)}_${row.timestamp}_${seq}`
  return `${cameraText(row)}_${row.timestamp}`
}

const parseTrackId = (value: unknown) => {
  const num = Number(value)
  return Number.isFinite(num) ? Math.trunc(num) : 0
}

const rowFaceId = (row: UploadStreamRecord) => {
  const details = row.details as StreamRecord103Details & { tid?: unknown; track_id?: unknown; face_id?: unknown }
  const fromDetails = parseTrackId(details.face_id ?? details.tid ?? details.track_id)
  if (fromDetails > 0) return fromDetails
  const rowLike = row as UploadStreamRecord & { track_id?: unknown; face_id?: unknown }
  const fromRecord = parseTrackId(rowLike.face_id ?? rowLike.track_id)
  if (fromRecord > 0) return fromRecord
  const normalized = (row.normalized_json || {}) as Record<string, unknown>
  return parseTrackId(normalized.face_id ?? normalized.track_id)
}

const row103MissingPackets = (row: UploadStreamRecord) => {
  const details = row.details as StreamRecord103Details
  const total = Number(details.total_packets || 0)
  const received = Number(details.received_packets || 0)
  return Math.max(0, total - received)
}

const row103MissingBytes = (row: UploadStreamRecord) => {
  const details = row.details as StreamRecord103Details
  const total = Number(details.media_total_size || 0)
  const received = Number(details.received_media_size || details.payload_size || 0)
  return Math.max(0, total - received)
}

const row103StatusText = (row: UploadStreamRecord) => {
  const details = row.details as StreamRecord103Details
  const raw = String(details.image_fetch_status || '').trim()
  if (raw === 'success') return '完整'
  if (raw === 'incomplete') {
    const missingPackets = row103MissingPackets(row)
    const missingBytes = row103MissingBytes(row)
    return `不完整${missingPackets > 0 ? `，缺 ${missingPackets} 片` : ''}${missingBytes > 0 ? `，缺 ${formatBytes(missingBytes)}` : ''}`
  }
  if (raw === 'binary_only') return '仅二进制'
  return raw || '--'
}

const row103StatusTagType = (row: UploadStreamRecord) => {
  const status = String((row.details as StreamRecord103Details).image_fetch_status || '').trim()
  if (status === 'success') return 'success'
  if (status === 'incomplete') return 'danger'
  return 'warning'
}

const rowHasError = (row: UploadStreamRecord) => {
  const detail103 = row.details as StreamRecord103Details
  const fetchFailed = row.protocol_id === 103 && String(detail103.image_fetch_status || '').trim() !== 'success'
  const hasErrorMessage = String(row.error_message || detail103.error_message || '').trim() !== ''
  return fetchFailed || hasErrorMessage
}

const buildQualitySummary = (rows: UploadStreamRecord[]): QualitySummary => {
  const errorKeys = new Set<string>()
  const missingKeys = new Set<string>()
  let missingFrames = 0

  rows.forEach((row) => {
    if (rowHasError(row)) {
      errorKeys.add(rowKey(row))
    }
  })

  const grouped = new Map<string, Array<{ row: UploadStreamRecord; seq: number | null }>>()
  rows.forEach((row) => {
    const groupKey = `${row.protocol_id}::${cameraText(row)}::${row.batch_id || 0}`
    const arr = grouped.get(groupKey) || []
    arr.push({ row, seq: parseRowSequence(row) })
    grouped.set(groupKey, arr)
  })

  grouped.forEach((arr) => {
    const frameMap = new Map<string, { seq: number; timestamp: number; rows: UploadStreamRecord[] }>()
    arr.forEach(({ row, seq }) => {
      if (seq === null) return
      const key = `${seq}-${row.timestamp}`
      const frame = frameMap.get(key)
      if (frame) {
        frame.rows.push(row)
      } else {
        frameMap.set(key, { seq, timestamp: row.timestamp, rows: [row] })
      }
    })

    const frames = [...frameMap.values()].sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp
      return a.seq - b.seq
    })

    let prevSeq: number | null = null
    let prevTimestamp: number | null = null
    frames.forEach((frame) => {
      const seq = frame.seq
      if (prevSeq !== null) {
        if (seq > prevSeq + 1) {
          missingFrames += seq - prevSeq - 1
          frame.rows.forEach((r) => missingKeys.add(rowKey(r)))
        } else if (seq < prevSeq || (seq === prevSeq && prevTimestamp !== null && frame.timestamp !== prevTimestamp)) {
          frame.rows.forEach((r) => errorKeys.add(rowKey(r)))
        }
      }
      prevSeq = seq
      prevTimestamp = frame.timestamp
    })
  })

  const stateMap = new Map<string, QualityState>()
  rows.forEach((row) => {
    const key = rowKey(row)
    const hasError = errorKeys.has(key)
    const hasMissing = missingKeys.has(key)
    if (hasError && hasMissing) stateMap.set(key, 'error_missing')
    else if (hasError) stateMap.set(key, 'error')
    else if (hasMissing) stateMap.set(key, 'missing')
    else stateMap.set(key, 'normal')
  })

  return {
    stateMap,
    errorCount: errorKeys.size,
    missingCount: missingKeys.size,
    missingFrames
  }
}

const aggregateQuality = computed(() => buildQualitySummary(aggregateRecords.value))
const tableQuality = computed(() => buildQualitySummary(records.value))

const qualityLabel = (state: QualityState) => {
  if (state === 'error_missing') return '出错+缺失'
  if (state === 'error') return '出错'
  if (state === 'missing') return '缺失'
  return '正常'
}

const qualityTagType = (state: QualityState) => {
  if (state === 'error_missing' || state === 'error') return 'danger'
  if (state === 'missing') return 'warning'
  return 'success'
}

const normalizeQualityState = (value: unknown): QualityState | null => {
  if (value === 'normal' || value === 'error' || value === 'missing' || value === 'error_missing') {
    return value
  }
  return null
}

const filteredRecords = computed(() => {
  return records.value
})

const mergedRecordIds = (row: UploadStreamRecord) => {
  const normalized = (row.normalized_json || {}) as Record<string, unknown>
  const ids = normalized.merged_record_ids
  return Array.isArray(ids) ? ids.map((item) => Number(item)).filter((item) => Number.isFinite(item)) : [row.record_id]
}

const mergedQualityState = (row: UploadStreamRecord): QualityState => {
  const directState = normalizeQualityState(row.quality_status)
  if (directState) return directState

  const rowStateById = new Map<number, QualityState>()
  records.value.forEach((item) => {
    const state = normalizeQualityState(item.quality_status)
    if (state) rowStateById.set(item.record_id, state)
  })

  const ids = mergedRecordIds(row)
  let hasError = false
  let hasMissing = false
  ids.forEach((id) => {
    const state = rowStateById.get(id) || tableQuality.value.stateMap.get(`${row.protocol_id}-${id}`) || 'normal'
    if (state === 'error' || state === 'error_missing') hasError = true
    if (state === 'missing' || state === 'error_missing') hasMissing = true
  })
  if (hasError && hasMissing) return 'error_missing'
  if (hasError) return 'error'
  if (hasMissing) return 'missing'
  return 'normal'
}

const rowDisplayId = (row: UploadStreamRecord) => {
  const ids = mergedRecordIds(row)
  if (ids.length <= 1) return String(row.record_id)
  const sorted = [...ids].sort((a, b) => a - b)
  return `${sorted[0]}(+${sorted.length - 1})`
}

const tableDisplayRecords = computed(() => {
  if (protocol.value !== 101) return filteredRecords.value
  const groupMap = new Map<string, UploadStreamRecord[]>()
  filteredRecords.value.forEach((row) => {
    const key = buildFrameLinkKey(row)
    const arr = groupMap.get(key) || []
    arr.push(row)
    groupMap.set(key, arr)
  })

  const mergedRows: UploadStreamRecord[] = []
  groupMap.forEach((rows) => {
    const sortedRows = [...rows].sort((a, b) => a.record_id - b.record_id)
    const first = sortedRows[0]
    const allTargets = dedupeVisualTargets(sortedRows.flatMap((row) => (row.details as StreamRecord101Details).targets || []))
    const details = first.details as StreamRecord101Details
    const mergedStates = sortedRows.map((row) => normalizeQualityState(row.quality_status)).filter((state): state is QualityState => state !== null)
    let mergedBackendState: QualityState | null = null
    if (mergedStates.includes('error_missing')) mergedBackendState = 'error_missing'
    else if (mergedStates.includes('error') && mergedStates.includes('missing')) mergedBackendState = 'error_missing'
    else if (mergedStates.includes('error')) mergedBackendState = 'error'
    else if (mergedStates.includes('missing')) mergedBackendState = 'missing'
    else if (mergedStates.includes('normal')) mergedBackendState = 'normal'

    const mergedRow: UploadStreamRecord = {
      ...first,
      quality_status: mergedBackendState || first.quality_status,
      details: {
        ...details,
        count: allTargets.length || Number(details.count || 0),
        target_count: allTargets.length || Number(details.target_count || details.frame_target_count || 0),
        frame_target_count: allTargets.length || Number(details.frame_target_count || details.count || 0),
        targets: allTargets
      },
      normalized_json: {
        ...(first.normalized_json || {}),
        merged_record_ids: sortedRows.map((row) => row.record_id)
      }
    }
    mergedRows.push(mergedRow)
  })

  return mergedRows.sort((a, b) => recordSortTs(b) - recordSortTs(a) || b.timestamp - a.timestamp || b.record_id - a.record_id)
})

const tableRowClassName = ({ row }: { row: UploadStreamRecord }) => {
  const state = mergedQualityState(row)
  if (state === 'error_missing') return 'row-error-missing'
  if (state === 'error') return 'row-error'
  if (state === 'missing') return 'row-missing'
  return ''
}

const statCards = computed(() => {
  const all = aggregateRecords.value
  const cameraSet = new Set(all.map((item) => cameraText(item)))
  const batchSet = new Set(all.map((item) => item.batch_id).filter(Boolean))
  const latest = all[0]
  const earliest = all.length ? all[all.length - 1] : null
  const latestReceived = [...all]
    .map((item) => ({ item, receivedTs: parseCreateTimeMs(item.create_time || '') }))
    .filter((entry) => entry.receivedTs > 0)
    .sort((a, b) => b.receivedTs - a.receivedTs)[0] || null
  const activeDays = new Set(all.map((item) => dayjs(item.timestamp).format('YYYY-MM-DD')))
  const latestActiveDate = latest ? dayjs(latest.timestamp).format('YYYY-MM-DD') : '--'
  const avgPerBatch = batchSet.size > 0 ? Math.round(all.length / batchSet.size) : 0
  const avgPerCamera = cameraSet.size > 0 ? Math.round(all.length / cameraSet.size) : 0

  if (protocol.value === 101) {
    const targetTotal = all.reduce((sum, item) => sum + Number((item.details as StreamRecord101Details).count || 0), 0)
    const personTotal = all.filter((item) => Number((item.details as StreamRecord101Details).obj_type ?? (item.details as StreamRecord101Details).targets?.[0]?.type) === 0).length
    const trackSet = new Set(all.flatMap((item) => (item.details as StreamRecord101Details).targets.map((target) => target.tid)))
    return [
      { label: '目标明细行数', value: aggregateTotal.value, sub: `当前页 ${records.value.length}`, icon: Histogram, explain: '统计 101 表中的目标明细总行数，反映全量坐标记录规模；副标题展示当前分页加载到前端的数据量。' },
      { label: '关键帧数', value: new Set(all.map((item) => buildFrameLinkKey(item))).size, sub: '按 camera+timestamp+frame_seq 去重', icon: Camera, explain: '按摄像头、事件时间和帧序号合并去重后的关键帧数量，用来衡量真实帧级事件规模。' },
      { label: '批次数', value: batchSet.size, sub: `均值 ${avgPerBatch}/批`, icon: Camera, explain: '按 batch_id 统计的推送批次数，用来观察发送端批量聚合后的上传频率与规模。' },
      { label: '摄像头数', value: cameraSet.size, sub: `均值 ${avgPerCamera}/摄像头`, icon: Camera, explain: '当前统计范围内产生 101 数据的摄像头数量，副标题给出每个摄像头平均贡献的记录数。' },
      { label: '活跃天数', value: activeDays.size, sub: `最近活跃日 ${latestActiveDate}`, icon: Histogram, explain: '按事件时间去重后的活跃日期数，适合观察该协议在更长时间范围内是否持续上报。' },
      { label: '目标数量', value: targetTotal, sub: `轨迹 ${trackSet.size}`, icon: UserFilled, explain: '各帧内目标数累计结果，副标题中的轨迹数用于表示关联的人脸或跟踪对象规模。' },
      { label: '人员记录', value: personTotal, sub: `非人 ${Math.max(0, aggregateTotal.value - personTotal)}`, icon: UserFilled, explain: '根据目标类型识别为“人”的记录数量，用于区分人像数据与其他类型目标。' },
      { label: '出错记录', value: aggregateQuality.value.errorCount, sub: '结构/序列异常', icon: WarningFilled, explain: '质检中判定为出错的记录数，通常表示帧结构异常、重复序号或媒体/字段异常。' },
      { label: '缺失记录', value: aggregateQuality.value.missingCount, sub: `推算缺失帧 ${aggregateQuality.value.missingFrames}`, icon: WarningFilled, explain: '依据同批次帧序号推断出的缺失关联记录数，副标题展示推算出的缺失帧数量。' },
      { label: '最近推送时间', value: latestReceived ? dayjs(latestReceived.receivedTs).format('YYYY-MM-DD HH:mm:ss') : '--', sub: latestReceived ? cameraText(latestReceived.item) : '--', icon: protocolInfo.value.icon, explain: '平台数据库最近写入该协议记录的时间，反映接收端最后一次真正收到并落库的时刻。' },
      { label: '最新事件时间', value: latest ? dayjs(latest.timestamp).format('YYYY-MM-DD HH:mm:ss') : '--', sub: latest ? cameraText(latest) : '--', icon: protocolInfo.value.icon, explain: '设备上报的最新事件时间，表示现场最新发生的协议事件，而不是平台接收时间。' },
      { label: '最早事件时间', value: earliest ? dayjs(earliest.timestamp).format('YYYY-MM-DD HH:mm:ss') : '--', sub: earliest ? cameraText(earliest) : '--', icon: protocolInfo.value.icon, explain: '当前统计区间内最早的一条事件时间，用来界定这批全量统计覆盖的起始范围。' }
    ]
  }

  if (protocol.value === 102) {
    const bytes = all.reduce((sum, item) => sum + Number((item.details as StreamRecord102Details).payload_size || 0), 0)
    const recognized = all.filter((item) => Boolean((item.details as StreamRecord102Details).person_name)).length
    return [
      { label: '总记录', value: aggregateTotal.value, sub: `当前页 ${records.value.length}`, icon: Histogram, explain: '统计 102 协议记录总数，反映特征向量上报总规模；副标题为当前列表页已加载的记录数。' },
      { label: '批次数', value: batchSet.size, sub: `均值 ${avgPerBatch}/批`, icon: Camera, explain: '按 batch_id 聚合后的批次总量，用于判断向量上传是否集中在少量大包还是分散小包。' },
      { label: '摄像头数', value: cameraSet.size, sub: `均值 ${avgPerCamera}/摄像头`, icon: Camera, explain: '在当前筛选范围内实际参与上传 102 数据的摄像头数量。' },
      { label: '活跃天数', value: activeDays.size, sub: `最近活跃日 ${latestActiveDate}`, icon: Histogram, explain: '按事件时间分布去重后的活跃日期数，可辅助判断向量数据是否连续稳定产出。' },
      { label: '向量大小', value: formatBytes(bytes), sub: '全量累计', icon: protocolInfo.value.icon, explain: '102 协议载荷大小累计值，代表特征向量数据在当前统计范围内占用的总字节量。' },
      { label: '人员命中', value: recognized, sub: `未命中 ${aggregateTotal.value - recognized}`, icon: UserFilled, explain: '已命中人员信息的向量记录数，通常可用于判断识别链路是否真正关联到了库中人员。' },
      { label: '出错记录', value: aggregateQuality.value.errorCount, sub: '结构/序列异常', icon: WarningFilled, explain: '质检中识别为结构、顺序或字段异常的 102 记录数量。' },
      { label: '缺失记录', value: aggregateQuality.value.missingCount, sub: `推算缺失帧 ${aggregateQuality.value.missingFrames}`, icon: WarningFilled, explain: '通过帧序列连续性推算出的缺失记录，用于判断发送端或接收链路是否有漏报。' },
      { label: '最近推送时间', value: latestReceived ? dayjs(latestReceived.receivedTs).format('YYYY-MM-DD HH:mm:ss') : '--', sub: latestReceived ? cameraText(latestReceived.item) : '--', icon: protocolInfo.value.icon, explain: '平台最近成功接收到一条 102 记录并落库的时间。' },
      { label: '最新事件时间', value: latest ? dayjs(latest.timestamp).format('YYYY-MM-DD HH:mm:ss') : '--', sub: latest ? cameraText(latest) : '--', icon: protocolInfo.value.icon, explain: '设备侧最近一次触发 102 协议事件的时间点。' },
      { label: '最早事件时间', value: earliest ? dayjs(earliest.timestamp).format('YYYY-MM-DD HH:mm:ss') : '--', sub: earliest ? cameraText(earliest) : '--', icon: protocolInfo.value.icon, explain: '当前全量统计中最早的一条 102 事件时间。' }
    ]
  }

  const imageBytes = all.reduce((sum, item) => sum + Number((item.details as StreamRecord103Details).payload_size || 0), 0)
  const success = all.filter((item) => (item.details as StreamRecord103Details).image_fetch_status === 'success').length
  const incomplete = all.filter((item) => (item.details as StreamRecord103Details).image_fetch_status === 'incomplete').length
  return [
    { label: '媒体记录数', value: aggregateTotal.value, sub: `当前页 ${records.value.length}`, icon: Histogram, explain: '103 协议媒体记录总数，表示图片或视频抓拍事件在当前统计范围内的规模。' },
    { label: '批次数', value: batchSet.size, sub: `均值 ${avgPerBatch}/批`, icon: Camera, explain: '按发送批次聚合后的媒体上传次数，用于观察抓拍文件在发送端的打包与推送节奏。' },
    { label: '摄像头数', value: cameraSet.size, sub: `均值 ${avgPerCamera}/摄像头`, icon: Camera, explain: '实际产生媒体抓拍数据的摄像头数量。' },
    { label: '活跃天数', value: activeDays.size, sub: `最近活跃日 ${latestActiveDate}`, icon: Histogram, explain: '媒体事件涉及的活跃日期数，用于判断抓拍数据的持续覆盖范围。' },
    { label: '媒体大小', value: formatBytes(imageBytes), sub: '全量累计', icon: protocolInfo.value.icon, explain: '当前统计范围内媒体载荷大小累计值，反映图片/视频传输的总体体量。' },
    { label: '媒体就绪', value: success, sub: `不完整 ${incomplete}，其他异常 ${Math.max(0, aggregateTotal.value - success - incomplete)}`, icon: PictureFilled, explain: '状态为 success 的媒体记录数量；副标题同时给出不完整媒体和其他异常媒体的数量。' },
    { label: '出错记录', value: aggregateQuality.value.errorCount, sub: '含媒体落盘/读取异常', icon: WarningFilled, explain: '媒体落盘、拼接、读取或结构解析异常的记录数。' },
    { label: '缺失记录', value: aggregateQuality.value.missingCount, sub: `推算缺失帧 ${aggregateQuality.value.missingFrames}`, icon: WarningFilled, explain: '通过帧序或分片关联推断出的缺失记录数，适合定位上传过程中的漏片或漏报。' },
    { label: '最近推送时间', value: latestReceived ? dayjs(latestReceived.receivedTs).format('YYYY-MM-DD HH:mm:ss') : '--', sub: latestReceived ? cameraText(latestReceived.item) : '--', icon: protocolInfo.value.icon, explain: '平台最近接收到并写入一条 103 记录的时间。' },
    { label: '最新事件时间', value: latest ? dayjs(latest.timestamp).format('YYYY-MM-DD HH:mm:ss') : '--', sub: latest ? cameraText(latest) : '--', icon: protocolInfo.value.icon, explain: '设备侧最近一次产生媒体抓拍事件的时间。' },
    { label: '最早事件时间', value: earliest ? dayjs(earliest.timestamp).format('YYYY-MM-DD HH:mm:ss') : '--', sub: earliest ? cameraText(earliest) : '--', icon: protocolInfo.value.icon, explain: '当前全量媒体统计中最早的一次事件时间。' }
  ]
})

const buildTimeBucket = (timestamp: number, granularity: 'year' | 'quarter' | 'month' | 'week' | 'day') => {
  const source = dayjs(timestamp)
  if (!source.isValid()) return null
  if (granularity === 'year') {
    return { sort: source.startOf('year').valueOf(), label: source.format('YYYY年') }
  }
  if (granularity === 'quarter') {
    const quarter = Math.floor(source.month() / 3) + 1
    const startMonth = (quarter - 1) * 3
    return { sort: source.month(startMonth).startOf('month').valueOf(), label: `${source.format('YYYY')} Q${quarter}` }
  }
  if (granularity === 'month') {
    return { sort: source.startOf('month').valueOf(), label: source.format('YYYY-MM') }
  }
  if (granularity === 'week') {
    const start = source.startOf('week')
    return { sort: start.valueOf(), label: `${start.format('YYYY-MM-DD')}周` }
  }
  return { sort: source.startOf('day').valueOf(), label: source.format('YYYY-MM-DD') }
}

const aggregateTimeline = (
  rows: UploadStreamRecord[],
  timestampGetter: (row: UploadStreamRecord) => number,
  granularity: 'year' | 'quarter' | 'month' | 'week' | 'day' | 'hourly',
  hourlyDate = ''
) => {
  if (granularity === 'hourly') {
    const timedRows = rows
      .map((item) => ({ item, ts: timestampGetter(item) }))
      .filter((entry) => Number.isFinite(entry.ts) && entry.ts > 0)
    if (!timedRows.length) return []

    const selectedBase = hourlyDate ? dayjs(hourlyDate) : dayjs(Math.max(...timedRows.map((entry) => entry.ts)))
    const dayStart = selectedBase.startOf('day')
    const dayEnd = dayStart.add(1, 'day')
    const bucketMap = new Map<string, { sort: number; label: string; value: number }>()

    for (let hour = 0; hour < 24; hour += 1) {
      const bucketStart = dayStart.add(hour, 'hour')
      const bucketEnd = bucketStart.add(1, 'hour')
      const label = `${bucketStart.format('HH:mm')}-${bucketEnd.format('HH:mm')}`
      bucketMap.set(label, {
        sort: bucketStart.valueOf(),
        label,
        value: 0
      })
    }

    timedRows.forEach(({ ts }) => {
      const point = dayjs(ts)
      if (point.valueOf() < dayStart.valueOf() || point.valueOf() >= dayEnd.valueOf()) return
      const bucketStart = dayStart.add(point.hour(), 'hour')
      const bucketEnd = bucketStart.add(1, 'hour')
      const label = `${bucketStart.format('HH:mm')}-${bucketEnd.format('HH:mm')}`
      const current = bucketMap.get(label)
      if (current) {
        current.value += 1
      }
    })

    return [...bucketMap.values()]
      .sort((a, b) => a.sort - b.sort)
      .map((item) => [item.label, item.value] as [string, number])
  }

  const map = new Map<string, { sort: number; label: string; value: number }>()
  rows.forEach((item) => {
    const ts = timestampGetter(item)
    if (!Number.isFinite(ts) || ts <= 0) return
    const bucket = buildTimeBucket(ts, granularity)
    if (!bucket) return
    const current = map.get(bucket.label)
    if (current) {
      current.value += 1
    } else {
      map.set(bucket.label, { ...bucket, value: 1 })
    }
  })
  return [...map.values()]
    .sort((a, b) => a.sort - b.sort)
    .map((item) => [item.label, item.value] as [string, number])
}

const eventTimelineData = computed(() => {
  return aggregateTimeline(
    aggregateRecords.value,
    (item) => Number(item.timestamp || 0),
    eventGranularity.value,
    eventHourlyDate.value
  )
})

const receiveTimelineData = computed(() => {
  return aggregateTimeline(
    aggregateRecords.value,
    (item) => parseCreateTimeMs(item.create_time || ''),
    receiveGranularity.value,
    receiveHourlyDate.value
  )
})

const latestEventTimelineDayText = computed(() => {
  const timestamps = aggregateRecords.value.map((item) => Number(item.timestamp || 0)).filter((item) => Number.isFinite(item) && item > 0)
  if (!timestamps.length) return '--'
  return dayjs(Math.max(...timestamps)).format('YYYY-MM-DD')
})

const latestReceiveTimelineDayText = computed(() => {
  const timestamps = aggregateRecords.value
    .map((item) => parseCreateTimeMs(item.create_time || ''))
    .filter((item) => Number.isFinite(item) && item > 0)
  if (!timestamps.length) return '--'
  return dayjs(Math.max(...timestamps)).format('YYYY-MM-DD')
})

const eventHourlyDateText = computed(() => eventHourlyDate.value || latestEventTimelineDayText.value)
const receiveHourlyDateText = computed(() => receiveHourlyDate.value || latestReceiveTimelineDayText.value)
const stackedTimelineCharts = computed(() => eventGranularity.value === 'hourly' || receiveGranularity.value === 'hourly')

const cameraDistributionData = computed(() => {
  const map = new Map<string, number>()
  aggregateRecords.value.forEach((item) => {
    const key = cameraText(item)
    map.set(key, (map.get(key) || 0) + 1)
  })
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12)
})

const row101VisualTargets = (row: UploadStreamRecord) => {
  const details = row.details as StreamRecord101Details
  const targets = Array.isArray(details.targets) ? details.targets.filter(isVisualTarget) : []
  return targets
}

const row101FrameTargetCount = (row: UploadStreamRecord) => {
  const details = row.details as StreamRecord101Details
  const count = Number(details.frame_target_count ?? details.target_count ?? details.count ?? 0)
  return Number.isFinite(count) && count > 0 ? count : row101TargetCount(row)
}

const row101ExpandRows = (row: UploadStreamRecord) => {
  return row101VisualTargets(row).map((target, index) => ({
    index: index + 1,
    faceId: target.face_id ?? target.tid ?? '--',
    objectType: objTypeText(target.type),
    coordinate: `(${target.x1}, ${target.y1}) - (${target.x2}, ${target.y2})`,
    confidence: target.conf ?? '--',
    boxSize: `${Math.max(0, Number(target.x2) - Number(target.x1))} × ${Math.max(0, Number(target.y2) - Number(target.y1))}`,
    anchor: `${target.x1}, ${target.y1}`
  }))
}

const row101TargetCount = (row: UploadStreamRecord) => {
  const visualCount = row101VisualTargets(row).length
  if (visualCount > 0) return visualCount
  const details = row.details as StreamRecord101Details
  const frameCount = Number(details.target_count ?? details.frame_target_count ?? 0)
  return Number.isFinite(frameCount) && frameCount > 0 ? frameCount : 0
}

const row102HasVector = (row: UploadStreamRecord) => {
  const details = row.details as StreamRecord102Details
  const payloadSize = Number(details.payload_size || 0)
  const base64Preview = String(details.vector_base64_preview || '').trim()
  const base64Body = String(details.vector_base64 || '').trim()
  return payloadSize >= 2048 || base64Preview !== '' || base64Body !== ''
}

const row102TargetCount = (row: UploadStreamRecord) => {
  if (!row102HasVector(row)) return 0
  const details = row.details as StreamRecord102Details
  const targetCount = Number(details.target_count || 0)
  if (Number.isFinite(targetCount) && targetCount > 0) return targetCount
  return 1
}

const rowFaceIdText = (row: UploadStreamRecord) => {
  const value = Number(row.face_id || row.track_id || 0)
  return Number.isFinite(value) && value > 0 ? String(value) : '--'
}

const rowFrameSeqText = (row: UploadStreamRecord) => {
  const seq = parseRowSequence(row)
  return seq === null ? '--' : String(seq)
}

const row102StatusText = (row: UploadStreamRecord) => {
  const details = row.details as StreamRecord102Details
  return String(details.status || details.information || '').trim() || '--'
}

const row103CanPreview = (row: UploadStreamRecord) => {
  const details = row.details as StreamRecord103Details
  if (String(details.image_fetch_status || '').trim() === 'deleted') return false
  if (String(details.local_image_path || '').trim() === '') return false
  return String(details.image_data_url || '').trim() !== '' || String(details.media_url || '').trim() !== ''
}

const row103DownloadUrl = (row: UploadStreamRecord) => {
  const details = row.details as StreamRecord103Details
  const mediaUrl = String(details.media_url || '').trim()
  if (!row103CanPreview(row) || mediaUrl === '') return ''
  return `${mediaUrl}${mediaUrl.includes('?') ? '&' : '?'}download=1`
}

const deleteMediaRow = async (row: UploadStreamRecord) => {
  await ElMessageBox.confirm(`确认删除记录 ${row.record_id} 对应的媒体文件吗？该操作会同步更新数据库中的媒体路径。`, '删除媒体', {
    type: 'warning',
    confirmButtonText: '确认删除',
    cancelButtonText: '取消'
  })
  await deleteProtocolMedia({ protocol: 103, record_id: row.record_id })
  ElMessage.success('媒体文件已删除')
  await resetAndReloadAll()
}

const renderCharts = async () => {
  await nextTick()
  if (trendChartRef.value) {
    trendChart = trendChart || echarts.init(trendChartRef.value)
    const eventRows = eventTimelineData.value.length ? eventTimelineData.value : [['暂无数据', 0] as [string, number]]
    const eventValues = eventRows.map(([, count]) => count)
    trendChart.setOption({
      grid: { left: 44, right: 20, top: 22, bottom: 42 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'category',
        data: eventRows.map(([date]) => date),
        axisLine: { lineStyle: { color: '#8ba6d6' } },
        axisLabel: { color: '#557099', interval: 0, rotate: eventRows.length > 10 ? 25 : 0 }
      },
      yAxis: {
        type: 'value',
        name: '记录数',
        nameTextStyle: { color: '#6f83a5' },
        splitLine: { lineStyle: { color: 'rgba(139,166,214,.18)' } },
        axisLabel: { color: '#6f83a5' }
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 34,
          data: eventValues,
          itemStyle: {
            borderRadius: [10, 10, 0, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: protocolInfo.value.color },
              { offset: 1, color: 'rgba(91, 143, 249, 0.18)' }
            ])
          }
        },
        {
          type: 'line',
          smooth: true,
          symbolSize: 8,
          data: eventValues,
          lineStyle: { width: 3, color: protocolInfo.value.color },
          itemStyle: { color: '#ffffff', borderColor: protocolInfo.value.color, borderWidth: 2 },
          z: 3
        }
      ]
    })
  }
  if (categoryChartRef.value) {
    categoryChart = categoryChart || echarts.init(categoryChartRef.value)
    const receiveRows = receiveTimelineData.value.length ? receiveTimelineData.value : [['暂无数据', 0] as [string, number]]
    const receiveValues = receiveRows.map(([, value]) => value)
    categoryChart.setOption({
      grid: { left: 44, right: 20, top: 22, bottom: 56 },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: receiveRows.map(([time]) => time),
        axisLine: { lineStyle: { color: '#8ba6d6' } },
        axisLabel: { color: '#557099', interval: 0, rotate: receiveRows.length > 10 ? 25 : 0 }
      },
      yAxis: {
        type: 'value',
        name: '接收量',
        nameTextStyle: { color: '#6f83a5' },
        splitLine: { lineStyle: { color: 'rgba(139,166,214,.18)' } },
        axisLabel: { color: '#6f83a5' }
      },
      series: [{
        type: 'line',
        smooth: false,
        step: 'middle',
        areaStyle: {
          color: 'rgba(91, 143, 249, 0.12)'
        },
        data: receiveValues,
        itemStyle: { color: protocolInfo.value.color },
        lineStyle: { width: 3 },
        label: { show: true, position: 'top', color: '#4c6488', formatter: '{c}' }
      }]
    })
  }
  if (cameraChartRef.value) {
    cameraChart = cameraChart || echarts.init(cameraChartRef.value)
    const cameraRows = cameraDistributionData.value.length ? cameraDistributionData.value : [{ name: '暂无数据', value: 0 }]
    cameraChart.setOption({
      grid: { left: 110, right: 32, top: 24, bottom: 24 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(139,166,214,.18)' } },
        axisLabel: { color: '#6f83a5' }
      },
      yAxis: {
        type: 'category',
        data: cameraRows.map((item) => item.name),
        axisLine: { lineStyle: { color: '#8ba6d6' } },
        axisLabel: { color: '#557099' }
      },
      series: [{
        type: 'bar',
        data: cameraRows.map((item) => item.value),
        itemStyle: {
          borderRadius: [0, 10, 10, 0],
          color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [
            { offset: 0, color: protocolInfo.value.color },
            { offset: 1, color: 'rgba(91, 143, 249, 0.18)' }
          ])
        },
        label: { show: true, position: 'right', color: '#4c6488' }
      }]
    })
  }
}

const loadAggregateData = async () => {
  aggregateLoading.value = true
  try {
    const merged: UploadStreamRecord[] = []
    let offset = 0
    let queryTotal = 0
    const chunk = protocol.value === 103 ? 200 : 500

    while (offset < 100000) {
      const res = await fetchUploadStreamRecords({
        protocol: protocol.value,
        limit: chunk,
        offset,
        include_payload: 0
      })
      queryTotal = Number(res.data.total || queryTotal || 0)
      const batch = Array.isArray(res.data.records) ? res.data.records : []
      if (!batch.length) break
      merged.push(...batch)
      if ((queryTotal > 0 && merged.length >= queryTotal) || batch.length < chunk) break
      offset += batch.length
    }

    aggregateTotal.value = queryTotal
    aggregateRecords.value = merged
  } catch (_error) {
    ElMessage.error('全量统计加载失败')
  } finally {
    aggregateLoading.value = false
  }
}

const loadTargetsForCurrent103Rows = async () => {
  imageTargetsMap.value = new Map()
  imageTargetsByTimestampMap.value = new Map()
  if (protocol.value !== 103 || records.value.length === 0) return

  const timestamps = [...new Set(records.value.map((item) => item.timestamp))]
  if (!timestamps.length) return

  try {
    const merged101: UploadStreamRecord[] = []
    let offset = 0
    let queryTotal = 0
    const chunk = 500
    const timestampParam = timestamps.join(',')

    while (offset < 5000) {
      const res = await fetchUploadStreamRecords({
        protocol: 101,
        limit: chunk,
        offset,
        camera_id: cameraId.value.trim() || undefined,
        timestamps: timestampParam,
        include_payload: 0
      })
      queryTotal = Number(res.data.total || queryTotal || 0)
      const batch = Array.isArray(res.data.records) ? res.data.records : []
      if (!batch.length) break
      merged101.push(...batch)
      if ((queryTotal > 0 && merged101.length >= queryTotal) || batch.length < chunk) break
      offset += batch.length
    }

    const map = new Map<string, StreamRecord101Details['targets']>()
    const tsMap = new Map<string, StreamRecord101Details['targets']>()
    merged101.forEach((item) => {
      const key = buildFrameLinkKey(item)
      const tsKey = `${cameraText(item)}_${item.timestamp}`
      const current = map.get(key) || []
      const currentTs = tsMap.get(tsKey) || []
      const targets = ((item.details as StreamRecord101Details).targets || []).filter(isVisualTarget)
      map.set(key, dedupeVisualTargets([...current, ...targets]))
      tsMap.set(tsKey, dedupeVisualTargets([...currentTs, ...targets]))
    })
    imageTargetsMap.value = map
    imageTargetsByTimestampMap.value = tsMap
  } catch (_error) {
    ElMessage.warning('103 关联 101 坐标加载失败')
  }
}

const loadTableData = async () => {
  loading.value = true
  try {
    const startEventTime = eventTimeRange.value.length === 2 ? Number(eventTimeRange.value[0]) : undefined
    const endEventTime = eventTimeRange.value.length === 2 ? Number(eventTimeRange.value[1]) : undefined
    const res = await fetchUploadStreamRecords({
      protocol: protocol.value,
      limit: pageSize.value,
      offset: (page.value - 1) * pageSize.value,
      camera_id: cameraId.value.trim() || undefined,
      start_event_time: startEventTime,
      end_event_time: endEventTime,
      include_payload: protocol.value === 103 ? 1 : 0,
      quality_status: qualityFilter.value
    })
    records.value = Array.isArray(res.data.records) ? res.data.records : []
    total.value = Number(res.data.total || 0)
    if (protocol.value === 103) {
      await loadTargetsForCurrent103Rows()
    } else {
      imageTargetsMap.value = new Map()
      imageTargetsByTimestampMap.value = new Map()
    }
  } catch (_error) {
    ElMessage.error('协议数据加载失败')
  } finally {
    loading.value = false
  }
}

const loadFrameDetail = async (row: UploadStreamRecord) => {
  frameDialogVisible.value = true
  frameDialogLoading.value = true
  frameDialogTitle.value = `协议 ${row.protocol_id} · 记录 ${row.record_id}`
  frameHex.value = ''
  try {
    const res = await fetchProtocolFrame({ protocol: row.protocol_id, record_id: row.record_id })
    frameHex.value = res.data.raw_protocol_hex || ''
  } catch (_error) {
    ElMessage.error('协议帧详情加载失败')
    frameDialogVisible.value = false
  } finally {
    frameDialogLoading.value = false
  }
}

const resetAndReloadAll = async () => {
  page.value = 1
  await Promise.all([loadAggregateData(), loadTableData()])
  await renderCharts()
}

const resetAndReloadTable = async () => {
  page.value = 1
  await loadTableData()
}

const loadCameraOptions = async () => {
  try {
    const res = await fetchUploadStreamCameraOptions({ protocol: protocol.value })
    cameraOptions.value = Array.isArray(res.data.records) ? res.data.records : []
    if (cameraId.value && !cameraOptions.value.some((item) => item.value === cameraId.value)) {
      cameraId.value = ''
    }
  } catch (_error) {
    ElMessage.warning('摄像头列表加载失败')
  }
}

watch(protocol, async () => {
  await loadCameraOptions()
  await resetAndReloadAll()
})

watch([page, pageSize], async () => {
  await loadTableData()
})

watch(aggregateRecords, async () => {
  if (!eventHourlyDate.value && latestEventTimelineDayText.value !== '--') {
    eventHourlyDate.value = latestEventTimelineDayText.value
  }
  if (!receiveHourlyDate.value && latestReceiveTimelineDayText.value !== '--') {
    receiveHourlyDate.value = latestReceiveTimelineDayText.value
  }
  await renderCharts()
}, { deep: true })

watch([eventGranularity, receiveGranularity, eventHourlyDate, receiveHourlyDate], async () => {
  await renderCharts()
})

onMounted(async () => {
  await loadCameraOptions()
  await resetAndReloadAll()
  eventHourlyDate.value = latestEventTimelineDayText.value !== '--' ? latestEventTimelineDayText.value : ''
  receiveHourlyDate.value = latestReceiveTimelineDayText.value !== '--' ? latestReceiveTimelineDayText.value : ''
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => {
      trendChart?.resize()
      categoryChart?.resize()
      cameraChart?.resize()
    })
    if (trendChartRef.value) resizeObserver.observe(trendChartRef.value)
    if (categoryChartRef.value) resizeObserver.observe(categoryChartRef.value)
    if (cameraChartRef.value) resizeObserver.observe(cameraChartRef.value)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  trendChart?.dispose()
  categoryChart?.dispose()
  cameraChart?.dispose()
})
</script>

<template>
  <div class="protocol-page" v-loading="loading || aggregateLoading">
    <section class="hero-card" :style="{ '--accent': protocolInfo.color }">
      <div>
        <p class="eyebrow">Protocol {{ protocol }}</p>
        <h2>{{ protocolInfo.title }}</h2>
        <p>{{ protocolInfo.desc }}</p>
      </div>
      <el-button type="primary" @click="resetAndReloadAll">刷新数据</el-button>
    </section>

    <div class="stat-grid">
      <div v-for="card in statCards" :key="card.label" class="stat-card explain-card">
        <el-icon><component :is="card.icon" /></el-icon>
        <div class="stat-card-content">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <small>{{ card.sub }}</small>
        </div>
        <div class="hover-panel">
          <div class="hover-title">{{ card.label }}</div>
          <div class="hover-text">{{ card.explain }}</div>
        </div>
      </div>
    </div>

    <el-row :gutter="18" class="chart-row" :class="{ 'chart-row-stacked': stackedTimelineCharts }">
      <el-col :xl="stackedTimelineCharts ? 24 : 16" :lg="stackedTimelineCharts ? 24 : 15" :md="24">
        <el-card shadow="never" class="panel-card">
          <template #header>
            <div class="chart-header">
              <div class="chart-header-copy">
                <span>按事件时间统计</span>
                <small>{{ eventGranularity === 'hourly' ? `展示 ${eventHourlyDateText} 当天每小时事件流量` : '按设备事件发生时间聚合记录量' }}</small>
              </div>
              <el-radio-group v-model="eventGranularity" size="small">
                <el-radio-button label="year">年</el-radio-button>
                <el-radio-button label="quarter">季</el-radio-button>
                <el-radio-button label="month">月</el-radio-button>
                <el-radio-button label="week">周</el-radio-button>
                <el-radio-button label="day">日</el-radio-button>
                <el-radio-button label="hourly">时刻</el-radio-button>
              </el-radio-group>
              <el-date-picker
                v-if="eventGranularity === 'hourly'"
                v-model="eventHourlyDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="选择日期"
                size="small"
                style="width: 150px"
              />
            </div>
          </template>
          <div ref="trendChartRef" class="chart"></div>
        </el-card>
      </el-col>
      <el-col :xl="stackedTimelineCharts ? 24 : 8" :lg="stackedTimelineCharts ? 24 : 9" :md="24">
        <el-card shadow="never" class="panel-card">
          <template #header>
            <div class="chart-header">
              <div class="chart-header-copy">
                <span>按接收时间统计</span>
                <small>{{ receiveGranularity === 'hourly' ? `展示 ${receiveHourlyDateText} 当天每小时接收流量` : '按平台写库时间观察接收节奏' }}</small>
              </div>
              <el-radio-group v-model="receiveGranularity" size="small">
                <el-radio-button label="year">年</el-radio-button>
                <el-radio-button label="quarter">季</el-radio-button>
                <el-radio-button label="month">月</el-radio-button>
                <el-radio-button label="week">周</el-radio-button>
                <el-radio-button label="day">日</el-radio-button>
                <el-radio-button label="hourly">时刻</el-radio-button>
              </el-radio-group>
              <el-date-picker
                v-if="receiveGranularity === 'hourly'"
                v-model="receiveHourlyDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="选择日期"
                size="small"
                style="width: 150px"
              />
            </div>
          </template>
          <div ref="categoryChartRef" class="chart"></div>
        </el-card>
      </el-col>
    </el-row>
    <el-card shadow="never" class="panel-card camera-chart-card">
      <template #header>
        <div class="chart-header-copy">
          <span>按摄像头归类统计（全量）</span>
          <small>展示记录量最高的前 12 个摄像头</small>
        </div>
      </template>
      <div ref="cameraChartRef" class="camera-chart"></div>
    </el-card>

    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="table-header">
          <span>数据明细</span>
          <div class="filters">
            <el-select
              v-model="cameraId"
              placeholder="选择摄像头"
              clearable
              filterable
              style="width: 220px"
              @change="resetAndReloadTable"
            >
              <el-option label="全部摄像头" value="" />
              <el-option
                v-for="item in cameraOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
            <el-date-picker
              v-model="eventTimeRange"
              type="datetimerange"
              value-format="x"
              start-placeholder="开始事件时间"
              end-placeholder="结束事件时间"
              style="width: 360px"
              @change="resetAndReloadTable"
            />
            <el-select v-model="qualityFilter" style="width: 170px" @change="resetAndReloadTable">
              <el-option label="全部质检状态" value="all" />
              <el-option label="仅出错" value="error" />
              <el-option label="仅缺失" value="missing" />
              <el-option label="仅正常" value="normal" />
            </el-select>
            <span class="filter-tip">质检筛选已升级为后端全量筛选</span>
            <el-button type="primary" @click="resetAndReloadTable">查询</el-button>
          </div>
        </div>
        <div class="time-tip">
          `事件时间（设备）` 表示协议帧中的设备上报时间；`接收时间（平台）` 表示该条记录写入平台数据库的时间。
        </div>
      </template>

      <el-table :data="tableDisplayRecords" :max-height="520" stripe :row-class-name="tableRowClassName">
        <el-table-column v-if="protocol === 101" type="expand" width="56">
          <template #default="{ row }">
            <div class="expand-panel">
              <div class="expand-head">
                <div class="expand-title">目标明细</div>
                <div class="expand-subtitle">同一关键帧下的每个目标拆开展示，避免主表单行过高</div>
              </div>
              <el-table :data="row101ExpandRows(row)" size="small" class="nested-table" stripe>
                <el-table-column prop="index" label="#" width="56" />
                <el-table-column label="人脸编号" width="170">
                  <template #default="{ row: subRow }">
                    <span class="detail-chip">{{ subRow.faceId }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="目标类型" width="110">
                  <template #default="{ row: subRow }">
                    <span class="detail-chip ghost-chip">{{ subRow.objectType }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="coordinate" label="坐标" width="180" show-overflow-tooltip />
                <el-table-column prop="boxSize" label="框大小" width="120" />
                <el-table-column prop="anchor" label="左上角" width="110" />
                <el-table-column prop="confidence" label="置信度" width="120" />
              </el-table>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="ID" width="110">
          <template #default="{ row }">{{ rowDisplayId(row) }}</template>
        </el-table-column>
        <el-table-column label="摄像头" width="120">
          <template #default="{ row }">{{ cameraText(row) }}</template>
        </el-table-column>
        <el-table-column prop="batch_id" label="批次" width="90" />
        <el-table-column label="事件时间（设备）" width="180">
          <template #default="{ row }">{{ formatTime(row.timestamp) }}</template>
        </el-table-column>
        <el-table-column label="接收时间（平台）" width="180">
          <template #default="{ row }">{{ formatCreateTime(row.create_time) }}</template>
        </el-table-column>
        <el-table-column label="帧序号" width="90">
          <template #default="{ row }">{{ rowFrameSeqText(row) }}</template>
        </el-table-column>
        <el-table-column label="质检状态" width="120">
          <template #default="{ row }">
            <el-tag :type="qualityTagType(mergedQualityState(row))">
              {{ qualityLabel(mergedQualityState(row)) }}
            </el-tag>
          </template>
        </el-table-column>

        <template v-if="protocol === 101">
          <el-table-column label="帧内目标数" width="100">
            <template #default="{ row }">{{ row101FrameTargetCount(row) }}</template>
          </el-table-column>
          <el-table-column label="当前明细数" width="100">
            <template #default="{ row }">{{ row101TargetCount(row) }}</template>
          </el-table-column>
          <el-table-column label="目标类型" width="100">
            <template #default="{ row }">{{ objTypeText(row101VisualTargets(row)[0]?.type ?? (row.details as StreamRecord101Details).obj_type) }}</template>
          </el-table-column>
          <!-- <el-table-column label="人脸编号" width="220" show-overflow-tooltip>
            <template #default="{ row }">{{ row101TrackSummaryText(row) }}</template>
          </el-table-column> -->
          <el-table-column label="分辨率" width="150">
            <template #default="{ row }">{{ row101ResolutionText(row) }}</template>
          </el-table-column>
          <!-- <el-table-column label="坐标明细" min-width="220">
            <template #default="{ row }">
              <span class="expand-tip">{{ row101VisualTargets(row).length ? `展开查看 ${row101VisualTargets(row).length} 个目标坐标` : '--' }}</span>
            </template>
          </el-table-column> -->
        </template>

        <template v-else-if="protocol === 102">
          <el-table-column label="向量个数" width="100">
            <template #default="{ row }">{{ row102TargetCount(row) }}</template>
          </el-table-column>
          <el-table-column label="目标类型" width="100">
            <template #default="{ row }">{{ objTypeText((row.details as StreamRecord102Details).obj_type) }}</template>
          </el-table-column>
          <el-table-column label="人脸编号" width="110">
            <template #default="{ row }">{{ rowFaceIdText(row) }}</template>
          </el-table-column>
          <el-table-column label="向量维度" width="110">
            <template #default="{ row }">{{ (row.details as StreamRecord102Details).embedding_dim || '--' }}</template>
          </el-table-column>
          <el-table-column label="载荷大小" width="120">
            <template #default="{ row }">{{ formatBytes((row.details as StreamRecord102Details).payload_size) }}</template>
          </el-table-column>
          <el-table-column label="入库状态" width="120">
            <template #default="{ row }">{{ row102StatusText(row) }}</template>
          </el-table-column>
          <el-table-column label="特征文件" show-overflow-tooltip>
            <template #default="{ row }">{{ (row.details as StreamRecord102Details).embedding_file_path || '--' }}</template>
          </el-table-column>
        </template>

        <template v-else>
          <el-table-column label="媒体类型" width="100">
            <template #default="{ row }">
              {{ Number((row.details as StreamRecord103Details).media_type || (row.details as StreamRecord103Details).payload_type || 0) === 2 ? '视频' : '图片' }}
            </template>
          </el-table-column>
          <el-table-column label="关联人脸编号" width="120">
            <template #default="{ row }">{{ rowFaceId(row) || '--' }}</template>
          </el-table-column>
          <el-table-column label="开始时间" width="180">
            <template #default="{ row }">{{ formatTime((row.details as StreamRecord103Details).start_timestamp || row.timestamp) }}</template>
          </el-table-column>
          <el-table-column label="结束时间" width="180">
            <template #default="{ row }">{{ formatTime((row.details as StreamRecord103Details).end_timestamp || row.timestamp) }}</template>
          </el-table-column>
          <el-table-column label="媒体路径" min-width="320" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="path-col">
                <span class="path-text">{{ (row.details as StreamRecord103Details).local_image_path || (row.details as StreamRecord103Details).media_url || (row.details as StreamRecord103Details).frame_image_url || '--' }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="220">
            <template #default="{ row }">
              <el-tag :type="row103StatusTagType(row)">
                {{ row103StatusText(row) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="声明/实收分片" width="130">
            <template #default="{ row }">
              {{ (row.details as StreamRecord103Details).total_packets || 0 }} / {{ (row.details as StreamRecord103Details).received_packets || 0 }}
            </template>
          </el-table-column>
          <el-table-column label="当前包序号" width="110">
            <template #default="{ row }">{{ (row.details as StreamRecord103Details).packet_index || '--' }}</template>
          </el-table-column>
          <el-table-column label="声明/实收字节" width="160">
            <template #default="{ row }">
              {{ formatBytes((row.details as StreamRecord103Details).media_total_size || 0) }} / {{ formatBytes((row.details as StreamRecord103Details).received_media_size || (row.details as StreamRecord103Details).payload_size || 0) }}
            </template>
          </el-table-column>
          <el-table-column label="当前分包长度" width="120">
            <template #default="{ row }">
              {{ formatBytes((row.details as StreamRecord103Details).chunk_length || 0) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="210" fixed="right">
            <template #default="{ row }">
              <el-button
                link
                type="primary"
                :disabled="!row103CanPreview(row)"
                @click="(row.details as StreamRecord103Details).media_kind === 'video'
                  ? openVideoPreviewDialog((row.details as StreamRecord103Details).media_url || '')
                  : openPreviewDialog((row.details as StreamRecord103Details).image_data_url)"
              >
                预览
              </el-button>
              <el-button link
                type="primary">
                <a
                  v-if="(row.details as StreamRecord103Details).media_kind === 'video' && row103DownloadUrl(row)"
                  class="table-link"
                  :href="row103DownloadUrl(row)"
                  download
                >
                  下载
                </a>
              </el-button>
              <el-button
                v-if="(row.details as StreamRecord103Details).media_kind === 'video'"
                link
                type="danger"
                :disabled="!row103CanPreview(row)"
                @click="deleteMediaRow(row)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </template>

        <el-table-column label="协议帧预览" min-width="210" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="frame-col">
              <span class="mono frame-preview-text" :title="framePreviewText(row)">{{ framePreviewText(row) }}</span>
              <el-button link type="primary" :icon="View" @click="loadFrameDetail(row)">查看完整帧</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
        />
      </div>
    </el-card>

    <el-dialog v-model="frameDialogVisible" :title="frameDialogTitle" :width="frameDialogWidth" destroy-on-close>
      <div v-loading="frameDialogLoading" class="frame-dialog-body">
        <pre class="frame-text">{{ frameHex || '--' }}</pre>
      </div>
    </el-dialog>

    <el-dialog
      v-model="previewDialogVisible"
      title="103 媒体预览"
      width="78vw"
      align-center
      destroy-on-close
    >
      <CanvasDetectionImage
        v-if="previewMediaType === 'image'"
        :image-url="previewImageUrl"
        :targets="[]"
        :height="560"
      />
      <video v-else class="preview-video" :src="previewImageUrl" controls style="width:100%;max-height:70vh;background:#000" />
    </el-dialog>
  </div>
</template>

<style scoped>
.protocol-page {
  min-height: 100%;
  padding: 18px;
  background:
    radial-gradient(circle at 10% 6%, rgba(76, 125, 220, 0.08), transparent 30%),
    linear-gradient(180deg, #eef3fb 0%, #f6f8fc 100%);
}

.time-tip {
  margin-top: 10px;
  font-size: 12px;
  color: #6b7c93;
}

.hero-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  text-align: center;
  margin-bottom: 16px;
  padding: 24px;
  border: 1px solid rgba(91, 143, 249, 0.16);
  border-radius: 18px;
  color: #eaf2ff;
  background: radial-gradient(circle at 16% 0, color-mix(in srgb, var(--accent), transparent 58%), transparent 34%),
    linear-gradient(135deg, #13284f 0%, #0c1a35 100%);
  box-shadow: 0 14px 34px rgba(12, 26, 53, 0.16);
}

.hero-card h2 {
  margin: 4px 0 8px;
  font-size: 30px;
  letter-spacing: 0.03em;
  color: #eaf2ff;
}

.hero-card p {
  margin: 0;
  color: #b9cbec;
}

.eyebrow {
  color: var(--accent) !important;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.stat-grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
  overflow: visible;
}

.stat-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
  justify-content: center;
  min-height: 172px;
  padding: 22px 18px;
  border-radius: 16px;
  text-align: center;
  border: 1px solid rgba(91, 143, 249, 0.08);
  background: #fff;
  box-shadow: 0 10px 28px rgba(24, 42, 78, 0.08);
  overflow: visible;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.stat-card:hover {
  z-index: 30;
  transform: translateY(-4px);
  box-shadow: 0 18px 36px rgba(24, 42, 78, 0.14);
}

.stat-card .el-icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  color: #fff;
  background: linear-gradient(135deg, #5b8ff9, #35c2ff);
}

.stat-card-content {
  display: grid;
  gap: 4px;
  justify-items: center;
}

.stat-card span,
.stat-card small {
  display: block;
  color: #7a8aa0;
}

.stat-card strong {
  display: block;
  margin: 2px 0;
  color: #1f2f4d;
  font-size: 22px;
}

.explain-card:hover .hover-panel {
  transition-delay: 0.1s;
  opacity: 1;
  pointer-events: auto;
  transform: translateY(10px);
}

.hover-panel {
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

.hover-panel::before {
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

.hover-title {
  margin-bottom: 10px;
  color: #1f2f4d;
  font-weight: 700;
}

.hover-text {
  color: #587093;
  line-height: 1.5;
}

.chart-row {
  margin-bottom: 16px;
}

.panel-card {
  border: none;
  border-radius: 16px;
  box-shadow: 0 12px 32px rgba(24, 42, 78, 0.08);
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.chart-header span {
  font-weight: 700;
  color: #27405f;
}

.chart-header-copy {
  display: grid;
  gap: 4px;
}

.chart-header-copy small {
  color: #7b8fad;
  font-size: 12px;
  line-height: 1.4;
}

.chart {
  height: 300px;
}

.camera-chart-card {
  margin-bottom: 16px;
}

.camera-chart {
  height: 320px;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.filters {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-tip {
  display: inline-flex;
  align-items: center;
  color: #7c8faa;
  font-size: 12px;
}

.expand-panel {
  padding: 10px 14px 14px;
  background: #f7faff;
}

.expand-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.expand-title {
  color: #244266;
  font-weight: 700;
}

.expand-subtitle {
  color: #7a8ea9;
  font-size: 12px;
}

.nested-table {
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}

.expand-tip {
  color: #557099;
}

.detail-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  color: #245ea8;
  background: #eaf3ff;
}

.ghost-chip {
  color: #547193;
  background: #f0f5fb;
}

.mono {
  font-family: 'Consolas', 'Menlo', 'Monaco', monospace;
  font-size: 12px;
  color: #355179;
  margin-right: 6px;
}

.frame-col {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.frame-preview-text {
  display: block;
  width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.path-col {
  display: flex;
  align-items: center;
  gap: 10px;
}

.path-text {
  display: inline-block;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #4f6a8f;
}

.table-link {
  margin-right: 10px;
  color: var(--el-color-primary);
  text-decoration: none;
}

.table-link:hover {
  color: var(--el-color-primary-light-3);
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  padding-top: 14px;
}

.chart-row-stacked {
  row-gap: 18px;
}

.frame-dialog-body {
  height: 44vh;
  overflow: auto;
  border: 1px solid #e6ecf5;
  border-radius: 10px;
  background: #fbfdff;
}

.frame-text {
  margin: 0;
  padding: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.45;
  font-size: 12px;
  color: #2e476b;
  font-family: 'Consolas', 'Menlo', 'Monaco', monospace;
}

:deep(.el-table .row-error > td) {
  background: #fff3f2 !important;
}

:deep(.el-table .row-missing > td) {
  background: #fff9ee !important;
}

:deep(.el-table .row-error-missing > td) {
  background: #ffe9e6 !important;
}

:deep(.el-table__expanded-cell) {
  padding: 0 !important;
  background: #f7faff !important;
}

:deep(.nested-table),
:deep(.nested-table::before),
:deep(.nested-table .el-table__inner-wrapper::before) {
  border: none !important;
}

:deep(.nested-table th.el-table__cell),
:deep(.nested-table td.el-table__cell) {
  border-bottom: none !important;
}

:deep(.nested-table .el-table__header th.el-table__cell) {
  background: #f7fbff !important;
  color: #496687;
}

@media (max-width: 1200px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .stat-grid {
    grid-template-columns: 1fr;
  }

  .hero-card h2 {
    font-size: 24px;
  }

  .table-header {
    flex-direction: column;
    align-items: stretch;
  }

  .chart-header {
    align-items: stretch;
  }

  .chart-row-stacked {
    row-gap: 12px;
  }
}
</style>
