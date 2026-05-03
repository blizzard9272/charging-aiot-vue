<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import * as echarts from 'echarts'
import {
  CollectionTag,
  Monitor,
  Odometer,
  VideoCamera,
  WarningFilled
} from '@element-plus/icons-vue'
import { getMediaMtxHealth, getMonitorList, getWorkbenchAudit } from '@/api/device'
import type { MediaMtxHealthResult, WorkbenchAuditLog } from '@/api/device'
import type { CameraDeviceVO, DeviceQueryParams } from '@/shared/types/monitor-center'

const loading = ref(false)
const chartLoading = ref(false)
const chartRef = ref<HTMLDivElement | null>(null)
const secondChartRef = ref<HTMLDivElement | null>(null)
let actionChart: echarts.ECharts | null = null
let errorChart: echarts.ECharts | null = null
let chartResizeObserver: ResizeObserver | null = null
let secondChartResizeObserver: ResizeObserver | null = null

const deviceList = ref<CameraDeviceVO[]>([])
const total = ref(0)
const mediaMtxHealth = ref<MediaMtxHealthResult | null>(null)
let healthTimer: number | null = null

const queryParams = reactive<DeviceQueryParams>({
  deviceName: '',
  groupId: '',
  protocolType: '',
  onlineStatus: '',
  statusFlag: '',
  page: 1,
  pageSize: 20
})

const auditStats = ref({
  groupCount: 0,
  deviceCount: 0,
  onlineDeviceCount: 0,
  pathCount: 0,
  createCount: 0,
  queryCount: 0,
  deleteCount: 0,
  rollbackCount: 0,
  errorCount: 0
})

const operationLogs = ref<WorkbenchAuditLog[]>([])
const rollbackLogs = ref<Array<Record<string, any>>>([])
const errorLogs = ref<Array<Record<string, any>>>([])

const errorFilterForm = reactive({
  httpCode: '',
  method: ''
})
const errorTimeRange = ref<string[]>([])

const rollbackFilterForm = reactive({
  pathName: '',
  reason: ''
})
const rollbackTimeRange = ref<string[]>([])

const operationFilterForm = reactive({
  eventType: '',
  resultStatus: '' as '' | 0 | 1
})

const operationTimeRange = ref<string[]>([])
const operationPageState = reactive({
  currentPage: 1,
  pageSize: 20,
  total: 0
})

const textIncludes = (value: unknown, keyword: string) => {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return true
  return String(value || '').toLowerCase().includes(kw)
}

const parseDateTime = (value: unknown) => {
  const text = String(value || '').trim()
  if (!text) return 0
  const ms = new Date(text.replace(/-/g, '/')).getTime()
  return Number.isFinite(ms) ? ms : 0
}

const inDateTimeRange = (value: unknown, range: string[]) => {
  if (!Array.isArray(range) || range.length !== 2) return true
  const current = parseDateTime(value)
  const start = parseDateTime(range[0])
  const end = parseDateTime(range[1])
  if (!current || !start || !end) return true
  return current >= start && current <= end
}

const errorHttpCodeOptions = computed(() => {
  const set = new Set<string>()
  errorLogs.value.forEach((row) => {
    const code = String(row?.http_code ?? '').trim()
    if (code) set.add(code)
  })
  return [...set].sort((a, b) => Number(a) - Number(b))
})

const errorMethodOptions = computed(() => {
  const set = new Set<string>()
  errorLogs.value.forEach((row) => {
    const method = String(row?.context?.method ?? '').trim().toUpperCase()
    if (method) set.add(method)
  })
  return [...set].sort()
})

const rollbackPathOptions = computed(() => {
  const set = new Set<string>()
  rollbackLogs.value.forEach((row) => {
    const path = String(row?.path_name ?? '').trim()
    if (path) set.add(path)
  })
  return [...set].sort()
})

const filteredErrorLogs = computed(() => {
  return errorLogs.value.filter((row) => {
    const httpCode = String(row?.http_code ?? '')
    const method = String(row?.context?.method || '').toUpperCase()

    if (!inDateTimeRange(row?.time, errorTimeRange.value)) return false
    if (errorFilterForm.httpCode && httpCode !== errorFilterForm.httpCode) return false
    if (errorFilterForm.method && method !== errorFilterForm.method) return false
    return true
  })
})

const filteredRollbackLogs = computed(() => {
  return rollbackLogs.value.filter((row) => {
    if (!inDateTimeRange(row?.time, rollbackTimeRange.value)) return false
    if (rollbackFilterForm.pathName && String(row?.path_name || '') !== rollbackFilterForm.pathName) return false
    if (!textIncludes(row?.reason, rollbackFilterForm.reason)) return false
    return true
  })
})

const filteredOperationLogs = computed(() => {
  return operationLogs.value
})

const resetErrorFilter = () => {
  errorFilterForm.httpCode = ''
  errorFilterForm.method = ''
  errorTimeRange.value = []
}

const resetRollbackFilter = () => {
  rollbackFilterForm.pathName = ''
  rollbackFilterForm.reason = ''
  rollbackTimeRange.value = []
}

const resetOperationFilter = () => {
  operationFilterForm.eventType = ''
  operationFilterForm.resultStatus = ''
  operationTimeRange.value = []
  operationPageState.currentPage = 1
}

const buildOperationQueryParams = () => {
  const params: {
    page: number
    pageSize: number
    startTime?: string
    endTime?: string
    eventType?: string
    resultStatus?: 0 | 1
  } = {
    page: operationPageState.currentPage,
    pageSize: operationPageState.pageSize
  }

  if (operationTimeRange.value.length === 2) {
    params.startTime = operationTimeRange.value[0]
    params.endTime = operationTimeRange.value[1]
  }

  if (operationFilterForm.eventType) {
    params.eventType = operationFilterForm.eventType
  }

  if (operationFilterForm.resultStatus !== '') {
    params.resultStatus = operationFilterForm.resultStatus
  }

  return params
}

const handleOperationFilterChange = () => {
  operationPageState.currentPage = 1
  fetchAuditStats()
}

const handleOperationReset = () => {
  resetOperationFilter()
  fetchAuditStats()
}

const handleOperationCurrentChange = (page: number) => {
  operationPageState.currentPage = page
  fetchAuditStats()
}

const handleOperationSizeChange = (size: number) => {
  operationPageState.pageSize = size
  operationPageState.currentPage = 1
  fetchAuditStats()
}

const updateCount = computed(() => {
  return operationLogs.value.filter((item) => {
    const type = String(item.event_type || '').toUpperCase()
    return type === 'UPDATE' || type === 'MODIFY'
  }).length
})

const statsCards = computed(() => {
  const recordingCount = deviceList.value.filter((item) => Number(item.recordEnabled) === 1).length
  const storageWarningCount = deviceList.value.filter((item) => Number(item.recordEnabled) === 1 && Number(item.onlineStatus) !== 1).length
  const health = mediaMtxHealth.value
  const healthStatus = health?.mediaMtxApiReachable ? '畅通' : '异常'
  const lastSuccess = health?.lastSuccessAt || '--'
  const failedCount = Number(health?.lastFailedCount || 0)
  const healthTone = health?.mediaMtxApiReachable ? 'tone-green' : 'tone-red'
  const failedTone = failedCount > 0 ? 'tone-red' : 'tone-cyan'

  return [
    { key: 'group-total', title: '分组数量', value: auditStats.value.groupCount, icon: CollectionTag, tone: 'tone-cyan' },
    { key: 'device-total', title: '设备总数', value: total.value, icon: Odometer, tone: 'tone-blue' },
    { key: 'online-total', title: '在线设备数', value: auditStats.value.onlineDeviceCount, icon: Monitor, tone: 'tone-green' },
    { key: 'recording-total', title: '录制中设备数', value: recordingCount, icon: VideoCamera, tone: 'tone-purple' },
    { key: 'mediamtx-health', title: 'MediaMTX API', value: healthStatus, icon: Monitor, tone: healthTone },
    { key: 'mediamtx-last-success', title: '最近回灌成功', value: lastSuccess, icon: CollectionTag, tone: 'tone-blue' },
    { key: 'mediamtx-failed', title: '最近回灌失败数', value: failedCount, icon: WarningFilled, tone: failedTone },
    { key: 'error-total', title: '异常统计数', value: auditStats.value.errorCount, icon: WarningFilled, tone: 'tone-red' },
    { key: 'storage-warning', title: '存储预警', value: storageWarningCount, icon: WarningFilled, tone: 'tone-amber' }
  ]
})

const resolveResultType = (status: number | null | undefined) => {
  return Number(status) === 1 ? 'success' : 'danger'
}

const resolveResultLabel = (status: number | null | undefined) => {
  return Number(status) === 1 ? '成功' : '失败'
}

const fetchDeviceList = async () => {
  loading.value = true
  try {
    const res = await getMonitorList(queryParams)
    if (res.data) {
      deviceList.value = res.data.records || []
      total.value = res.data.total || 0
    }
  } finally {
    loading.value = false
  }
}

const updateActionChart = () => {
  if (!actionChart) return

  const values = [
    { value: auditStats.value.createCount, name: '新增' },
    { value: auditStats.value.queryCount, name: '查询' },
    { value: updateCount.value, name: '修改' },
    { value: auditStats.value.deleteCount, name: '删除' },
    { value: auditStats.value.rollbackCount, name: '回滚' }
  ]

  actionChart.setOption({
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', left: 'left' },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 4,
          borderColor: '#fff',
          borderWidth: 2
        },
        data: values,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }
    ]
  })
}

const updateErrorChart = () => {
  if (!errorChart) return
  errorChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 30, right: 20, top: 24, bottom: 30, containLabel: true },
    xAxis: {
      type: 'category',
      data: ['成功', '错误', '警告', '回滚'],
      axisLine: { lineStyle: { color: '#d8e3f4' } },
      axisLabel: { color: '#6a768a' }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#edf2fb' } },
      axisLabel: { color: '#8a95a8' }
    },
    series: [
      {
        type: 'bar',
        data: [
          auditStats.value.queryCount + auditStats.value.createCount + updateCount.value + auditStats.value.deleteCount,
          auditStats.value.errorCount,
          0,
          auditStats.value.rollbackCount
        ],
        barWidth: 24,
        itemStyle: {
          borderRadius: [8, 8, 0, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#4f88ff' },
            { offset: 1, color: '#2f6df6' }
          ])
        },
        showBackground: true,
        backgroundStyle: { color: '#f2f6fd' }
      }
    ]
  })
}

const fetchAuditStats = async () => {
  chartLoading.value = true
  try {
    const res = await getWorkbenchAudit({
      limit: 200,
      ...buildOperationQueryParams()
    })
    if (res.data) {
      if (res.data.stats) {
        auditStats.value = res.data.stats
      }
      operationLogs.value = res.data.operationLogs || []
      operationPageState.total = Number(res.data.operationPage?.total || operationLogs.value.length)
      rollbackLogs.value = res.data.rollbackLogs || []
      errorLogs.value = res.data.errorLogs || []
    }
  } finally {
    chartLoading.value = false
    updateActionChart()
    updateErrorChart()
  }
}

const fetchMediaMtxHealth = async () => {
  try {
    const res = await getMediaMtxHealth()
    mediaMtxHealth.value = res.data || null
  } catch (_error) {
    mediaMtxHealth.value = null
  }
}

const initChart = async () => {
  await nextTick()
  if (!chartRef.value || !secondChartRef.value) return
  if (actionChart) {
    actionChart.dispose()
  }
  if (errorChart) {
    errorChart.dispose()
  }
  actionChart = echarts.init(chartRef.value)
  errorChart = echarts.init(secondChartRef.value)

  if (chartResizeObserver) {
    chartResizeObserver.disconnect()
    chartResizeObserver = null
  }
  if (secondChartResizeObserver) {
    secondChartResizeObserver.disconnect()
    secondChartResizeObserver = null
  }
  
  if (typeof ResizeObserver !== 'undefined') {
    chartResizeObserver = new ResizeObserver(() => {
      actionChart?.resize()
    })
    chartResizeObserver.observe(chartRef.value)

    secondChartResizeObserver = new ResizeObserver(() => {
      errorChart?.resize()
    })
    secondChartResizeObserver.observe(secondChartRef.value)
  }

  updateActionChart()
  updateErrorChart()
}

const handleResize = () => {
  actionChart?.resize()
}

const handleExternalSyncFinished = async () => {
  await Promise.all([fetchDeviceList(), fetchAuditStats(), fetchMediaMtxHealth()])
}

onMounted(async () => {
  await Promise.all([fetchDeviceList(), fetchAuditStats(), fetchMediaMtxHealth()])
  await initChart()
  healthTimer = window.setInterval(() => {
    fetchMediaMtxHealth()
  }, 15000)
  window.addEventListener('resize', handleResize)
  window.addEventListener('monitor-center-sync-finished', handleExternalSyncFinished)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('monitor-center-sync-finished', handleExternalSyncFinished)
  if (healthTimer !== null) {
    window.clearInterval(healthTimer)
    healthTimer = null
  }
  if (chartResizeObserver) {
    chartResizeObserver.disconnect()
    chartResizeObserver = null
  }
  actionChart?.dispose()
  actionChart = null
})
</script>

<template>
  <div class="workbench-panel">
    <section class="stats-grid">
      <article v-for="card in statsCards" :key="card.key" class="stats-card" :class="card.tone">
        <div class="stats-icon"><component :is="card.icon" :size="18" /></div>
        <div class="stats-meta">
          <p class="stats-title">{{ card.title }}</p>
          <p class="stats-value">{{ card.value }}</p>
        </div>
      </article>
    </section>

    <el-card shadow="never" class="chart-card" v-loading="chartLoading">
      <div class="panel-head">
        <h3>行为统计</h3>
      </div>
      <div class="chart-container" style="display: flex; gap: 12px;">
        <div ref="chartRef" class="chart-box" style="flex: 1; height: 240px;" />
        <div ref="secondChartRef" class="chart-box" style="flex: 1; height: 240px;" />
      </div>
    </el-card>

    <section class="audit-tables-grid" v-loading="chartLoading">
      <el-card shadow="never" class="table-card audit-card">
        <div class="panel-head">
          <h3>异常日志信息</h3>
        </div>
        <el-form :inline="true" class="table-filter" @submit.prevent>
          <el-form-item label="时间区间">
            <el-date-picker
              v-model="errorTimeRange"
              type="datetimerange"
              range-separator="至"
              start-placeholder="开始时间"
              end-placeholder="结束时间"
              value-format="YYYY-MM-DD HH:mm:ss"
              style="width: 340px"
            />
          </el-form-item>
          <el-form-item label="状态码">
            <el-select v-model="errorFilterForm.httpCode" clearable placeholder="全部" style="width: 120px">
              <el-option v-for="code in errorHttpCodeOptions" :key="code" :label="code" :value="code" />
            </el-select>
          </el-form-item>
          <el-form-item label="请求方法">
            <el-select v-model="errorFilterForm.method" clearable placeholder="全部" style="width: 130px">
              <el-option v-for="method in errorMethodOptions" :key="method" :label="method" :value="method" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button @click="resetErrorFilter">重置</el-button>
          </el-form-item>
        </el-form>
        <el-table :data="filteredErrorLogs" class="saas-table" border max-height="420" empty-text="暂无异常日志">
          <el-table-column prop="time" label="时间" min-width="170" />
          <el-table-column prop="http_code" label="状态码" width="100" align="center" />
          <el-table-column prop="message" label="错误信息" min-width="220" show-overflow-tooltip />
          <el-table-column label="请求信息" min-width="220" show-overflow-tooltip>
            <template #default="scope">
              {{ scope.row?.context?.method || '--' }} {{ scope.row?.context?.uri || '--' }}
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card shadow="never" class="table-card audit-card">
        <div class="panel-head">
          <h3>回滚日志信息</h3>
        </div>
        <el-form :inline="true" class="table-filter" @submit.prevent>
          <el-form-item label="时间区间">
            <el-date-picker
              v-model="rollbackTimeRange"
              type="datetimerange"
              range-separator="至"
              start-placeholder="开始时间"
              end-placeholder="结束时间"
              value-format="YYYY-MM-DD HH:mm:ss"
              style="width: 340px"
            />
          </el-form-item>
            <el-form-item label="流路径">
            <el-select v-model="rollbackFilterForm.pathName" clearable placeholder="全部" style="width: 200px">
              <el-option v-for="pathName in rollbackPathOptions" :key="pathName" :label="pathName" :value="pathName" />
            </el-select>
          </el-form-item>
          <el-form-item label="回滚原因">
            <el-input v-model="rollbackFilterForm.reason" placeholder="reason" clearable style="width: 180px" />
          </el-form-item>
          <el-form-item>
            <el-button @click="resetRollbackFilter">重置</el-button>
          </el-form-item>
        </el-form>
        <el-table :data="filteredRollbackLogs" class="saas-table" border max-height="420" empty-text="暂无回滚日志">
          <el-table-column prop="time" label="时间" min-width="170" />
          <el-table-column prop="path_name" label="流路径" min-width="180" show-overflow-tooltip />
          <el-table-column prop="reason" label="回滚原因" min-width="220" show-overflow-tooltip />
          <el-table-column label="阶段" min-width="140" show-overflow-tooltip>
            <template #default="scope">{{ scope.row?.context?.stage || '--' }}</template>
          </el-table-column>
          <el-table-column label="设备ID" width="110" align="center">
            <template #default="scope">{{ scope.row?.context?.device_id ?? '--' }}</template>
          </el-table-column>
          <el-table-column label="源地址" min-width="220" show-overflow-tooltip>
            <template #default="scope">{{ scope.row?.context?.source_url || '--' }}</template>
          </el-table-column>
          <el-table-column label="请求方法" width="110" align="center">
            <template #default="scope">{{ scope.row?.context?.method || '--' }}</template>
          </el-table-column>
          <el-table-column label="请求地址" min-width="220" show-overflow-tooltip>
            <template #default="scope">{{ scope.row?.context?.uri || '--' }}</template>
          </el-table-column>
        </el-table>
      </el-card>

    </section>

    <el-card shadow="never" class="table-card">
      <div class="panel-head">
        <h3>操作审计明细</h3>
      </div>
      <el-form :inline="true" class="table-filter" @submit.prevent>
        <el-form-item label="时间区间">
          <el-date-picker
            v-model="operationTimeRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 340px"
            @change="handleOperationFilterChange"
          />
        </el-form-item>
        <el-form-item label="事件类型">
          <el-select v-model="operationFilterForm.eventType" clearable placeholder="全部" style="width: 120px" @change="handleOperationFilterChange">
            <el-option label="CREATE" value="CREATE" />
            <el-option label="QUERY" value="QUERY" />
            <el-option label="UPDATE" value="UPDATE" />
            <!-- <el-option label="MODIFY" value="MODIFY" /> -->
            <el-option label="DELETE" value="DELETE" />
            <el-option label="ROLLBACK" value="ROLLBACK" />
          </el-select>
        </el-form-item>
        <el-form-item label="结果">
          <el-select v-model="operationFilterForm.resultStatus" clearable placeholder="全部" style="width: 120px" @change="handleOperationFilterChange">
            <el-option label="成功" :value="1" />
            <el-option label="失败" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button @click="handleOperationReset">重置</el-button>
        </el-form-item>
      </el-form>
      <el-table :data="filteredOperationLogs" class="saas-table" border max-height="320" empty-text="暂无操作审计日志">
        <el-table-column prop="create_time" label="时间" min-width="170" />
        <el-table-column prop="event_type" label="事件类型" min-width="110" />
        <el-table-column prop="action_name" label="动作名称" min-width="150" show-overflow-tooltip />
        <el-table-column prop="path_name" label="流路径" min-width="170" show-overflow-tooltip />
        <el-table-column label="结果" width="100" align="center">
          <template #default="scope">
            <el-tag size="small" :type="resolveResultType(scope.row.result_status)">
              {{ resolveResultLabel(scope.row.result_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="error_message" label="错误信息" min-width="220" show-overflow-tooltip>
          <template #default="scope">{{ scope.row.error_message || '--' }}</template>
        </el-table-column>
      </el-table>
      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="operationPageState.currentPage"
          v-model:page-size="operationPageState.pageSize"
          :page-sizes="[20, 50, 100, 200]"
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="operationPageState.total"
          @size-change="handleOperationSizeChange"
          @current-change="handleOperationCurrentChange"
        />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.workbench-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: linear-gradient(180deg, #f7f9fc 0%, #f4f7fb 100%);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}

.stats-card {
  border-radius: 14px;
  border: 1px solid #e4eaf4;
  padding: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.stats-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(40, 91, 175, 0.12);
}

.stats-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.75);
  color: #2a3c5d;
}

.stats-title {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.stats-meta {
  flex: 1;
  min-width: 0;
}

.stats-value {
  margin: 4px 0 0;
  font-size: 22px;
  font-weight: 700;
  color: #1e293b;
}

.tone-blue {
  background: linear-gradient(160deg, #eff6ff 0%, #e6f0ff 100%);
}

.tone-cyan {
  background: linear-gradient(160deg, #ecfeff 0%, #e2f9ff 100%);
}

.tone-green {
  background: linear-gradient(160deg, #ecfdf5 0%, #def8ed 100%);
}

.tone-purple {
  background: linear-gradient(160deg, #f5f3ff 0%, #ece8ff 100%);
}

.tone-red {
  background: linear-gradient(160deg, #fff1f2 0%, #ffe5e8 100%);
}

.tone-amber {
  background: linear-gradient(160deg, #fffbeb 0%, #fff4d1 100%);
}

.chart-card,
.filter-card,
.table-card {
  border: 1px solid #e5ebf5;
  border-radius: 14px;
  background: #ffffff;
  overflow: hidden;
}

:deep(.chart-card .el-card__body),
:deep(.table-card .el-card__body) {
  border-radius: 14px;
}

.panel-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #25324b;
}

.table-filter {
  margin: 10px 0 12px;
}

.chart-box {
  width: 100%;
  height: 240px;
}

.audit-tables-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.audit-card {
  min-width: 0;
}

.stream-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stream-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #475569;
}

.copy-btn {
  color: #4f6fae;
}

.badge-label {
  margin-left: 6px;
  color: #64748b;
  font-size: 12px;
  text-transform: lowercase;
}

.record-badge-wrap {
  display: inline-flex;
  align-items: center;
}

.pulse-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}

.pulse-dot.is-recording {
  background: #ef4444;
  box-shadow: 0 0 0 rgba(239, 68, 68, 0.7);
  animation: pulse 1.5s infinite;
}

.pulse-dot.is-idle {
  background: #9ca3af;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(239, 68, 68, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
  }
}

.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}

.action-buttons :deep(.el-button) {
  margin-left: 0;
  padding: 2px 0;
}

.action-buttons :deep(.el-button span) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

:deep(.saas-table) {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #e8eef8;
}

:deep(.saas-table .el-table__row > td) {
  transition: background-color 0.18s ease;
}

:deep(.saas-table .el-table__body tr:hover > td) {
  background: #edf5ff !important;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

@media (max-width: 1600px) {
  .stats-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .audit-tables-grid {
    grid-template-columns: 1fr;
  }
}
</style>


