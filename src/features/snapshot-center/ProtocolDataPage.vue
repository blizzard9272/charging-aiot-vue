<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import { Camera, Histogram, PictureFilled, UserFilled, View, WarningFilled } from '@element-plus/icons-vue'
import CanvasDetectionImage from '@/shared/components/CanvasDetectionImage.vue'
import {
  fetchProtocolFrame,
  fetchUploadStreamCameraOptions,
  fetchUploadStreamRecords,
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

const trendChartRef = ref<HTMLDivElement>()
const categoryChartRef = ref<HTMLDivElement>()
const cameraChartRef = ref<HTMLDivElement>()
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
  previewDialogVisible.value = true
}

const protocolInfo = computed(() => {
  if (protocol.value === 101) {
    return {
      title: '101 目标检测数据',
      desc: '按目标、坐标、置信度和原始协议帧追踪检测结果',
      color: '#37b26c',
      icon: UserFilled
    }
  }
  if (protocol.value === 102) {
    return {
      title: '102 特征向量数据',
      desc: '聚合向量维度、识别状态、特征文件与协议帧信息',
      color: '#e8a219',
      icon: Histogram
    }
  }
  return {
    title: '103 抓拍图片数据',
    desc: '展示图片状态，并按 camera+timestamp+frame_seq 优先关联 101 坐标进行可视化标注',
    color: '#2f75ff',
    icon: PictureFilled
  }
})

const cameraText = (record: UploadStreamRecord) => record.camera_id || `cam${record.cam_id || '-'}`
const formatTime = (timestamp: number) => (timestamp ? dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss') : '--')

const formatBytes = (value: number) => {
  if (!value) return '0 B'
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
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

const row103TrackId = (row: UploadStreamRecord) => {
  const details = row.details as StreamRecord103Details & { tid?: unknown; track_id?: unknown }
  const fromDetails = parseTrackId(details.tid ?? details.track_id)
  if (fromDetails > 0) return fromDetails
  const fromRecord = parseTrackId((row as UploadStreamRecord & { track_id?: unknown }).track_id)
  if (fromRecord > 0) return fromRecord
  const normalized = (row.normalized_json || {}) as Record<string, unknown>
  return parseTrackId(normalized.track_id)
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

const filteredRecords = computed(() => {
  return records.value
})

const mergedRecordIds = (row: UploadStreamRecord) => {
  const normalized = (row.normalized_json || {}) as Record<string, unknown>
  const ids = normalized.merged_record_ids
  return Array.isArray(ids) ? ids.map((item) => Number(item)).filter((item) => Number.isFinite(item)) : [row.record_id]
}

const mergedQualityState = (row: UploadStreamRecord): QualityState => {
  const ids = mergedRecordIds(row)
  let hasError = false
  let hasMissing = false
  ids.forEach((id) => {
    const state = tableQuality.value.stateMap.get(`${row.protocol_id}-${id}`) || 'normal'
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
    const mergedRow: UploadStreamRecord = {
      ...first,
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

  return mergedRows.sort((a, b) => b.timestamp - a.timestamp || b.record_id - a.record_id)
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
  const activeDays = new Set(all.map((item) => dayjs(item.timestamp).format('YYYY-MM-DD')))
  const latestActiveDate = latest ? dayjs(latest.timestamp).format('YYYY-MM-DD') : '--'
  const avgPerBatch = batchSet.size > 0 ? Math.round(all.length / batchSet.size) : 0
  const avgPerCamera = cameraSet.size > 0 ? Math.round(all.length / cameraSet.size) : 0

  if (protocol.value === 101) {
    const targetTotal = all.reduce((sum, item) => sum + Number((item.details as StreamRecord101Details).count || 0), 0)
    const personTotal = all.filter((item) => Number((item.details as StreamRecord101Details).obj_type ?? (item.details as StreamRecord101Details).targets?.[0]?.type) === 0).length
    const trackSet = new Set(all.flatMap((item) => (item.details as StreamRecord101Details).targets.map((target) => target.tid)))
    return [
      { label: '总记录', value: aggregateTotal.value, sub: `当前页 ${records.value.length}`, icon: Histogram },
      { label: '批次数', value: batchSet.size, sub: `均值 ${avgPerBatch}/批`, icon: Camera },
      { label: '摄像头数', value: cameraSet.size, sub: `均值 ${avgPerCamera}/摄像头`, icon: Camera },
      { label: '活跃天数', value: activeDays.size, sub: `最近活跃日 ${latestActiveDate}`, icon: Histogram },
      { label: '目标数量', value: targetTotal, sub: `轨迹 ${trackSet.size}`, icon: UserFilled },
      { label: '人员记录', value: personTotal, sub: `非人 ${Math.max(0, aggregateTotal.value - personTotal)}`, icon: UserFilled },
      { label: '出错记录', value: aggregateQuality.value.errorCount, sub: '结构/序列异常', icon: WarningFilled },
      { label: '缺失记录', value: aggregateQuality.value.missingCount, sub: `推算缺失帧 ${aggregateQuality.value.missingFrames}`, icon: WarningFilled },
      { label: '最新事件时间', value: latest ? dayjs(latest.timestamp).format('YYYY-MM-DD HH:mm:ss') : '--', sub: latest ? cameraText(latest) : '--', icon: protocolInfo.value.icon },
      { label: '最早事件时间', value: earliest ? dayjs(earliest.timestamp).format('YYYY-MM-DD HH:mm:ss') : '--', sub: earliest ? cameraText(earliest) : '--', icon: protocolInfo.value.icon }
    ]
  }

  if (protocol.value === 102) {
    const bytes = all.reduce((sum, item) => sum + Number((item.details as StreamRecord102Details).payload_size || 0), 0)
    const recognized = all.filter((item) => Boolean((item.details as StreamRecord102Details).person_name)).length
    return [
      { label: '总记录', value: aggregateTotal.value, sub: `当前页 ${records.value.length}`, icon: Histogram },
      { label: '批次数', value: batchSet.size, sub: `均值 ${avgPerBatch}/批`, icon: Camera },
      { label: '摄像头数', value: cameraSet.size, sub: `均值 ${avgPerCamera}/摄像头`, icon: Camera },
      { label: '活跃天数', value: activeDays.size, sub: `最近活跃日 ${latestActiveDate}`, icon: Histogram },
      { label: '向量大小', value: formatBytes(bytes), sub: '全量累计', icon: protocolInfo.value.icon },
      { label: '人员命中', value: recognized, sub: `未命中 ${aggregateTotal.value - recognized}`, icon: UserFilled },
      { label: '出错记录', value: aggregateQuality.value.errorCount, sub: '结构/序列异常', icon: WarningFilled },
      { label: '缺失记录', value: aggregateQuality.value.missingCount, sub: `推算缺失帧 ${aggregateQuality.value.missingFrames}`, icon: WarningFilled },
      { label: '最新事件时间', value: latest ? dayjs(latest.timestamp).format('YYYY-MM-DD HH:mm:ss') : '--', sub: latest ? cameraText(latest) : '--', icon: protocolInfo.value.icon },
      { label: '最早事件时间', value: earliest ? dayjs(earliest.timestamp).format('YYYY-MM-DD HH:mm:ss') : '--', sub: earliest ? cameraText(earliest) : '--', icon: protocolInfo.value.icon }
    ]
  }

  const imageBytes = all.reduce((sum, item) => sum + Number((item.details as StreamRecord103Details).payload_size || 0), 0)
  const success = all.filter((item) => (item.details as StreamRecord103Details).image_fetch_status === 'success').length
  return [
    { label: '总记录', value: aggregateTotal.value, sub: `当前页 ${records.value.length}`, icon: Histogram },
    { label: '批次数', value: batchSet.size, sub: `均值 ${avgPerBatch}/批`, icon: Camera },
    { label: '摄像头数', value: cameraSet.size, sub: `均值 ${avgPerCamera}/摄像头`, icon: Camera },
    { label: '活跃天数', value: activeDays.size, sub: `最近活跃日 ${latestActiveDate}`, icon: Histogram },
    { label: '图片大小', value: formatBytes(imageBytes), sub: '全量累计', icon: protocolInfo.value.icon },
    { label: '下载成功', value: success, sub: `异常 ${aggregateTotal.value - success}`, icon: PictureFilled },
    { label: '出错记录', value: aggregateQuality.value.errorCount, sub: '含图片下载失败', icon: WarningFilled },
    { label: '缺失记录', value: aggregateQuality.value.missingCount, sub: `推算缺失帧 ${aggregateQuality.value.missingFrames}`, icon: WarningFilled },
    { label: '最新事件时间', value: latest ? dayjs(latest.timestamp).format('YYYY-MM-DD HH:mm:ss') : '--', sub: latest ? cameraText(latest) : '--', icon: protocolInfo.value.icon },
    { label: '最早事件时间', value: earliest ? dayjs(earliest.timestamp).format('YYYY-MM-DD HH:mm:ss') : '--', sub: earliest ? cameraText(earliest) : '--', icon: protocolInfo.value.icon }
  ]
})

const timelineData = computed(() => {
  const map = new Map<string, number>()
  aggregateRecords.value.forEach((item) => {
    const key = dayjs(item.timestamp).format('YYYY-MM-DD')
    map.set(key, (map.get(key) || 0) + 1)
  })
  return [...map.entries()].sort((a, b) => (a[0] > b[0] ? 1 : -1))
})

const todayTimelineData = computed(() => {
  const today = dayjs().format('YYYY-MM-DD')
  const map = new Map<string, number>()
  aggregateRecords.value
    .filter((item) => dayjs(item.timestamp).format('YYYY-MM-DD') === today)
    .forEach((item) => {
      const key = dayjs(item.timestamp).format('HH:mm')
      map.set(key, (map.get(key) || 0) + 1)
    })
  return [...map.entries()].sort((a, b) => (a[0] > b[0] ? 1 : -1))
})

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

const rowTargets = (row: UploadStreamRecord) => {
  const key = buildFrameLinkKey(row)
  const timestampKey = `${cameraText(row)}_${row.timestamp}`
  const allTargets = dedupeVisualTargets([
    ...(imageTargetsMap.value.get(key) || []),
    ...(imageTargetsByTimestampMap.value.get(timestampKey) || [])
  ])
  const trackId = row103TrackId(row)
  if (trackId <= 0) return allTargets
  const matched = allTargets.filter((target) => Number(target.tid) === trackId)
  return matched.length ? matched : allTargets
}

const row101VisualTargets = (row: UploadStreamRecord) => {
  const details = row.details as StreamRecord101Details
  const targets = Array.isArray(details.targets) ? details.targets.filter(isVisualTarget) : []
  return targets
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

const row103PersonCount = (row: UploadStreamRecord) => {
  const linkedCount = rowTargets(row).length
  if (linkedCount > 0) return linkedCount
  const details = row.details as StreamRecord103Details
  const personCount = Number(details.person_count || 0)
  return personCount > 0 ? personCount : 0
}

const renderCharts = async () => {
  await nextTick()
  if (trendChartRef.value) {
    trendChart = trendChart || echarts.init(trendChartRef.value)
    trendChart.setOption({
      grid: { left: 36, right: 16, top: 28, bottom: 28 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: timelineData.value.map(([date]) => date), axisLine: { lineStyle: { color: '#8ba6d6' } } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(139,166,214,.18)' } } },
      series: [{ type: 'line', smooth: true, areaStyle: {}, data: timelineData.value.map(([, count]) => count), color: protocolInfo.value.color }]
    })
  }
  if (categoryChartRef.value) {
    categoryChart = categoryChart || echarts.init(categoryChartRef.value)
    const todayRows = todayTimelineData.value.length ? todayTimelineData.value : [['暂无数据', 0] as [string, number]]
    categoryChart.setOption({
      grid: { left: 40, right: 16, top: 30, bottom: 52 },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: todayRows.map(([time]) => time),
        axisLine: { lineStyle: { color: '#8ba6d6' } },
        axisLabel: { color: '#557099', interval: 0, rotate: todayRows.length > 12 ? 25 : 0 }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(139,166,214,.18)' } },
        axisLabel: { color: '#6f83a5' }
      },
      series: [{
        type: 'line',
        smooth: true,
        areaStyle: {},
        data: todayRows.map(([, value]) => value),
        itemStyle: { color: protocolInfo.value.color },
        lineStyle: { width: 2 },
        label: { show: true, position: 'top', color: '#4c6488', formatter: '{c}' }
      }]
    })
  }
  if (cameraChartRef.value) {
    cameraChart = cameraChart || echarts.init(cameraChartRef.value)
    const cameraRows = cameraDistributionData.value.length ? cameraDistributionData.value : [{ name: '暂无数据', value: 0 }]
    cameraChart.setOption({
      grid: { left: 110, right: 24, top: 20, bottom: 24 },
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
        itemStyle: { color: '#5b8ff9', borderRadius: [0, 6, 6, 0] },
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
  await renderCharts()
}, { deep: true })

onMounted(async () => {
  await loadCameraOptions()
  await resetAndReloadAll()
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
      <div v-for="card in statCards" :key="card.label" class="stat-card">
        <el-icon><component :is="card.icon" /></el-icon>
        <div>
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <small>{{ card.sub }}</small>
        </div>
      </div>
    </div>

    <el-row :gutter="18" class="chart-row">
      <el-col :xl="16" :lg="15" :md="24">
        <el-card shadow="never" class="panel-card">
          <template #header>按天统计数据量（全量）</template>
          <div ref="trendChartRef" class="chart"></div>
        </el-card>
      </el-col>
      <el-col :xl="8" :lg="9" :md="24">
        <el-card shadow="never" class="panel-card">
          <template #header>当日按时间趋势</template>
          <div ref="categoryChartRef" class="chart"></div>
        </el-card>
      </el-col>
    </el-row>
    <el-card shadow="never" class="panel-card camera-chart-card">
      <template #header>按摄像头归类统计（全量）</template>
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
      </template>

      <el-table :data="tableDisplayRecords" height="520" stripe :row-class-name="tableRowClassName">
        <el-table-column label="ID" width="110">
          <template #default="{ row }">{{ rowDisplayId(row) }}</template>
        </el-table-column>
        <el-table-column label="摄像头" width="120">
          <template #default="{ row }">{{ cameraText(row) }}</template>
        </el-table-column>
        <el-table-column prop="batch_id" label="批次" width="90" />
        <el-table-column label="事件时间" width="180">
          <template #default="{ row }">{{ formatTime(row.timestamp) }}</template>
        </el-table-column>
        <el-table-column label="质检状态" width="120">
          <template #default="{ row }">
            <el-tag :type="qualityTagType(mergedQualityState(row))">
              {{ qualityLabel(mergedQualityState(row)) }}
            </el-tag>
          </template>
        </el-table-column>

        <template v-if="protocol === 101">
          <el-table-column label="目标个数" width="100">
            <template #default="{ row }">{{ row101TargetCount(row) }}</template>
          </el-table-column>
          <el-table-column label="目标类型" width="100">
            <template #default="{ row }">{{ objTypeText(row101VisualTargets(row)[0]?.type ?? (row.details as StreamRecord101Details).obj_type) }}</template>
          </el-table-column>
          <el-table-column label="目标ID" width="110">
            <template #default="{ row }">{{ row101VisualTargets(row)[0]?.tid ?? '--' }}</template>
          </el-table-column>
          <el-table-column label="坐标">
            <template #default="{ row }">
              <span v-for="target in row101VisualTargets(row)" :key="`${target.tid}-${target.object_index}`" class="mono">
                ({{ target.x1 }},{{ target.y1 }})-({{ target.x2 }},{{ target.y2 }})
              </span>
              <span v-if="row101VisualTargets(row).length === 0">--</span>
            </template>
          </el-table-column>
          <el-table-column label="置信度" width="100">
            <template #default="{ row }">{{ row101VisualTargets(row)[0]?.conf ?? '--' }}</template>
          </el-table-column>
        </template>

        <template v-else-if="protocol === 102">
          <el-table-column label="目标个数" width="100">
            <template #default="{ row }">{{ row102TargetCount(row) }}</template>
          </el-table-column>
          <el-table-column label="目标类型" width="100">
            <template #default="{ row }">{{ objTypeText((row.details as StreamRecord102Details).obj_type) }}</template>
          </el-table-column>
          <el-table-column label="人员" width="130">
            <template #default="{ row }">{{ (row.details as StreamRecord102Details).person_name || '--' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="120">
            <template #default="{ row }">{{ (row.details as StreamRecord102Details).status || '--' }}</template>
          </el-table-column>
          <el-table-column label="维度/大小" width="150">
            <template #default="{ row }">{{ (row.details as StreamRecord102Details).embedding_dim || 0 }} / {{ formatBytes((row.details as StreamRecord102Details).payload_size) }}</template>
          </el-table-column>
          <el-table-column label="特征文件" show-overflow-tooltip>
            <template #default="{ row }">{{ (row.details as StreamRecord102Details).embedding_file_path || '--' }}</template>
          </el-table-column>
        </template>

        <template v-else>
          <el-table-column label="图片路径" min-width="300" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="path-col">
                <span class="path-text">{{ (row.details as StreamRecord103Details).local_image_path || (row.details as StreamRecord103Details).frame_image_url || '--' }}</span>
                <el-button
                  link
                  type="primary"
                  :disabled="!(row.details as StreamRecord103Details).image_data_url"
                  @click="openPreviewDialog((row.details as StreamRecord103Details).image_data_url)"
                >
                  预览
                </el-button>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <el-tag :type="(row.details as StreamRecord103Details).image_fetch_status === 'success' ? 'success' : 'warning'">
                {{ (row.details as StreamRecord103Details).image_fetch_status || '--' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="人/动物/车" width="140">
            <template #default="{ row }">
              {{ row103PersonCount(row) }} /
              {{ (row.details as StreamRecord103Details).animal_count || 0 }} /
              {{ (row.details as StreamRecord103Details).car_count || 0 }}
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
      title="抓拍图片预览"
      width="78vw"
      align-center
      destroy-on-close
    >
      <CanvasDetectionImage
        :image-url="previewImageUrl"
        :targets="[]"
        :height="560"
      />
    </el-dialog>
  </div>
</template>

<style scoped>
.protocol-page {
  min-height: 100%;
  padding: 18px;
  background: #f0f2f5;
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
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 18px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(24, 42, 78, 0.08);
}

.stat-card .el-icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  color: #fff;
  background: linear-gradient(135deg, #5b8ff9, #35c2ff);
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

.chart-row {
  margin-bottom: 16px;
}

.panel-card {
  border: none;
  border-radius: 16px;
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

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  padding-top: 14px;
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
}
</style>

