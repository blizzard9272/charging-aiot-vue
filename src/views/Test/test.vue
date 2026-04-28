<template>
  <div class="test-page" v-loading="loading">
    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar-row">
        <div class="toolbar-left">
          <el-select v-model="filters.protocol" clearable placeholder="协议" style="width: 120px">
            <el-option label="101" :value="101" />
            <el-option label="102" :value="102" />
            <el-option label="103" :value="103" />
          </el-select>

          <el-input-number v-model="filters.camId" :min="1" :step="1" controls-position="right" placeholder="cam_id" />

          <el-input-number v-model="filters.limit" :min="1" :max="200" :step="1" controls-position="right" />

          <el-button type="primary" @click="loadRecords">立即刷新</el-button>
          <el-button @click="togglePolling">{{ polling ? '暂停轮询' : '开启轮询' }}</el-button>
        </div>

        <div class="toolbar-right">
          <el-tag :type="polling ? 'success' : 'info'">{{ polling ? '轮询中' : '已暂停' }}</el-tag>
          <span class="meta-text">最近刷新: {{ lastRefreshText }}</span>
          <span class="meta-text">总记录: {{ total }}</span>
        </div>
      </div>
    </el-card>

    <el-row :gutter="16">
      <el-col :xs="24" :md="10" :lg="9">
        <el-card shadow="never" class="panel-card">
          <template #header>
            <div class="panel-title">最近接收记录</div>
          </template>

          <el-table :data="records" height="620" @row-click="handleRowClick" highlight-current-row :row-class-name="rowClassName">
            <el-table-column prop="record_id" label="record_id" width="110" />
            <el-table-column prop="protocol_id" label="协议" width="80" />
            <el-table-column prop="cam_id" label="摄像头" width="90" />
            <el-table-column label="时间戳" min-width="160">
              <template #default="scope">
                {{ formatTime(scope.row.timestamp) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="14" :lg="15">
        <el-card shadow="never" class="panel-card">
          <template #header>
            <div class="panel-title">解析详情预览</div>
          </template>

          <div v-if="!selectedRecord" class="empty-box">暂无数据，请等待发送端上传</div>

          <template v-else>
            <div class="meta-grid">
              <div>record_id: {{ selectedRecord.record_id }}</div>
              <div>protocol: {{ selectedRecord.protocol_id }}</div>
              <div>cam_id: {{ selectedRecord.cam_id }}</div>
              <div>source_file: {{ selectedRecord.source_file_name || '--' }}</div>
            </div>

            <el-divider />

            <div v-if="selectedRecord.protocol_id === 101">
              <div class="section-title">101 目标列表 ({{ details101?.count || 0 }})</div>
              <el-table :data="details101?.targets || []" size="small" max-height="240">
                <el-table-column prop="type" label="type" width="70" />
                <el-table-column prop="tid" label="tid" width="70" />
                <el-table-column prop="x1" label="x1" width="70" />
                <el-table-column prop="y1" label="y1" width="70" />
                <el-table-column prop="x2" label="x2" width="70" />
                <el-table-column prop="y2" label="y2" width="70" />
              </el-table>
            </div>

            <div v-else-if="selectedRecord.protocol_id === 102" class="mono-block">
              <div class="section-title">102 向量摘要</div>
              <div>payload_size: {{ details102?.payload_size || 0 }}</div>
              <div>hex_preview: {{ details102?.vector_hex_preview || '--' }}</div>
              <div>base64_preview: {{ details102?.vector_base64_preview || '--' }}</div>
            </div>

            <div v-else-if="selectedRecord.protocol_id === 103">
              <div class="section-title">103 图片预览</div>
              <div class="mono-block">payload_size: {{ details103?.payload_size || 0 }}</div>
              <div class="image-wrap">
                <img v-if="details103?.image_data_url" :src="details103.image_data_url" alt="frame image" />
                <div v-else class="empty-box">无图片数据</div>
              </div>
            </div>

            <el-divider />
            <div class="section-title">完整 JSON</div>
            <pre class="json-block">{{ selectedRecordJson }}</pre>
          </template>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchUploadStreamRecords, type UploadStreamRecord } from '@/api/uploadStream'

const POLL_INTERVAL = 2000

const loading = ref(false)
const polling = ref(true)
const total = ref(0)
const records = ref<UploadStreamRecord[]>([])
const selectedRecordId = ref<number | null>(null)
const lastRefreshAt = ref<number | null>(null)

const filters = reactive({
  protocol: undefined as 101 | 102 | 103 | undefined,
  camId: undefined as number | undefined,
  limit: 20
})

let timer: number | null = null

const selectedRecord = computed(() => {
  if (records.value.length === 0) return null
  if (selectedRecordId.value === null) return records.value[0]
  return records.value.find((item) => item.record_id === selectedRecordId.value) || records.value[0]
})

const details101 = computed(() => {
  const record = selectedRecord.value
  if (!record || record.protocol_id !== 101) return null
  return record.details as { count: number; targets: Array<Record<string, number>> }
})

const details102 = computed(() => {
  const record = selectedRecord.value
  if (!record || record.protocol_id !== 102) return null
  return record.details as { payload_size: number; vector_hex_preview: string; vector_base64_preview: string }
})

const details103 = computed(() => {
  const record = selectedRecord.value
  if (!record || record.protocol_id !== 103) return null
  return record.details as { payload_size: number; image_data_url: string }
})

const selectedRecordJson = computed(() => {
  if (!selectedRecord.value) return '{}'
  return JSON.stringify(selectedRecord.value, null, 2)
})

const lastRefreshText = computed(() => {
  if (lastRefreshAt.value === null) return '--'
  return new Date(lastRefreshAt.value).toLocaleString()
})

const formatTime = (timestamp: number) => {
  if (!timestamp) return '--'
  return new Date(timestamp).toLocaleString()
}

const stopPolling = () => {
  if (timer !== null) {
    window.clearInterval(timer)
    timer = null
  }
}

const startPolling = () => {
  stopPolling()
  timer = window.setInterval(() => {
    loadRecords(false)
  }, POLL_INTERVAL)
}

const handleRowClick = (row: UploadStreamRecord) => {
  selectedRecordId.value = row.record_id
}

const rowClassName = ({ row }: { row: UploadStreamRecord }) => {
  return row.record_id === selectedRecord.value?.record_id ? 'selected-row' : ''
}

const loadRecords = async (showLoading = true) => {
  if (showLoading) loading.value = true
  try {
    const res = await fetchUploadStreamRecords({
      limit: filters.limit,
      protocol: filters.protocol,
      cam_id: filters.camId,
      include_payload: 0
    })

    total.value = Number(res.data.total || 0)
    records.value = Array.isArray(res.data.records) ? res.data.records : []

    if (records.value.length > 0) {
      const hasSelected = selectedRecordId.value !== null
        && records.value.some((item) => item.record_id === selectedRecordId.value)
      if (!hasSelected) {
        selectedRecordId.value = records.value[0].record_id
      }
    } else {
      selectedRecordId.value = null
    }

    lastRefreshAt.value = Date.now()
  } catch (_err) {
    ElMessage.error('读取解析记录失败，请检查接口或服务状态')
  } finally {
    if (showLoading) loading.value = false
  }
}

const togglePolling = () => {
  polling.value = !polling.value
  if (polling.value) {
    startPolling()
    loadRecords(false)
  } else {
    stopPolling()
  }
}

onMounted(async () => {
  await loadRecords(true)
  if (polling.value) {
    startPolling()
  }
})

onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped>
.test-page {
  padding: 12px;
}

.toolbar-card {
  margin-bottom: 12px;
}

.toolbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.meta-text {
  font-size: 12px;
  color: #64748b;
}

.panel-card {
  height: calc(100vh - 220px);
}

.panel-title {
  font-weight: 600;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
  font-size: 13px;
  color: #334155;
}

.section-title {
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 8px;
}

.image-wrap {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  background: #020617;
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-wrap img {
  max-width: 100%;
  max-height: 360px;
  object-fit: contain;
}

.empty-box {
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
}

.mono-block {
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  color: #334155;
  word-break: break-all;
  line-height: 1.7;
}

.json-block {
  margin: 0;
  max-height: 260px;
  overflow: auto;
  background: #0f172a;
  color: #e2e8f0;
  padding: 10px;
  border-radius: 6px;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
}

@media (max-width: 900px) {
  .panel-card {
    height: auto;
  }

  .meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>