const fs = require('fs');
const content = "
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import DeviceFilter from './components/DeviceFilter.vue'
import DeviceTable from './components/DeviceTable.vue'
import WebRTCPlayer from '@/components/WebRTCPlayer.vue'
import DeviceEditDialog from './components/DeviceEditDialog.vue'
import type { CameraDeviceVO, DeviceQueryParams } from './types'
import { getMonitorList } from '@/api/device'

// 分页与查询参数
const queryParams = reactive<DeviceQueryParams>({
  deviceName: '',
  onlineStatus: '',
  pageNum: 1,
  pageSize: 10
})

const total = ref(0)
const loading = ref(false)
const deviceList = ref<CameraDeviceVO[]>([])

// 获取数据 API
const fetchDeviceList = async () => {
  loading.value = true
  try {
    const res = await getMonitorList(queryParams)
    if (res.data) {
      deviceList.value = res.data.rows || []
      total.value = res.data.total || 0
    }
  } catch (error) {
    ElMessage.error('获取设备列表失败')
  } finally {
    loading.value = false
  }
}

// 事件处理
const handleSearch = (filterData: { deviceName: string; onlineStatus: number | '' }) => {
  queryParams.deviceName = filterData.deviceName
  queryParams.onlineStatus = filterData.onlineStatus
  queryParams.pageNum = 1
  fetchDeviceList()
}

const handleSizeChange = (val: number) => {
  queryParams.pageSize = val
  fetchDeviceList()
}

const handleCurrentChange = (val: number) => {
  queryParams.pageNum = val
  fetchDeviceList()
}

// 表格操作动作
const dialogVisible = ref(false)
const currentPlayUrl = ref('')
const currentProtocol = ref('')
const currentDialogTitle = ref('监控预览')

const handlePlay = (row: CameraDeviceVO) => {
  currentPlayUrl.value = row.playUrl
  currentProtocol.value = row.streamProtocol
  currentDialogTitle.value = \\ - \\
  dialogVisible.value = true
}

const editDialogVisible = ref(false)
const editDialogRef = ref<InstanceType<typeof DeviceEditDialog>>()

const handleEdit = (row: CameraDeviceVO) => {
  editDialogVisible.value = true
  // 等待 DOM 更新后调用组件内的 open 方法进行数据初始化回显
  setTimeout(() => {
    if (editDialogRef.value) {
      editDialogRef.value.open(row)
    }
  }, 0)
}

const handleDelete = (row: CameraDeviceVO) => {
  ElMessageBox.confirm('确定要删除该监控设备吗?', '警告', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    ElMessage.success(\已删除设备 \\)
    fetchDeviceList()
  }).catch(() => {})
}

// WebSocket 预留逻辑
let ws: WebSocket | null = null
const initWebSocket = () => {}

onMounted(() => {
  fetchDeviceList()
  initWebSocket()
})

onUnmounted(() => {
  if (ws) ws.close()
})
</script>

<template>
  <div class="device-center-container">
    <DeviceFilter :loading="loading" @search="handleSearch" />
    
    <div class="table-container">
      <DeviceTable 
        :data="deviceList" 
        :loading="loading"
        @play="handlePlay"
        @edit="handleEdit"
        @delete="handleDelete"
      />
      
      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="queryParams.pageNum"
          v-model:page-size="queryParams.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </div>

    <!-- 视频播放弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="currentDialogTitle"
      width="1000px"
      align-center
      destroy-on-close
    >
      <div class="player-container">
        <WebRTCPlayer 
          :play-url="currentPlayUrl"
          :protocol="currentProtocol"
        />
      </div>
    </el-dialog>

    <!-- 设备编辑弹窗 -->
    <DeviceEditDialog 
      ref="editDialogRef"
      v-model:visible="editDialogVisible"
      @success="fetchDeviceList"
    />
  </div>
</template>

<style scoped>
.device-center-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.table-container {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.04);
  flex: 1;
}

.pagination-wrapper {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.player-container {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #000;
}
</style>
"
fs.writeFileSync('f:/VueProjects/ChargingAiot/src/views/DeviceCenter/index.vue', content, 'utf8');
