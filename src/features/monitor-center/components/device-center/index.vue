<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import DeviceFilter from './components/DeviceFilter.vue'
import DeviceTable from './components/DeviceTable.vue'
import WebRTCPlayer from '@/shared/components/WebRTCPlayer.vue'
import DeviceEditDialog from './components/DeviceEditDialog.vue'
import MediaMtxWarningsDialog from './components/MediaMtxWarningsDialog.vue'
import SyncCameraConfigResultDialog from '../SyncCameraConfigResultDialog.vue'
import type { CameraDeviceVO, DeviceQueryParams, MonitorGroupVO } from '@/shared/types/monitor-center'
import { deleteMonitorDevice, getDeleteMonitorDeviceCheck, getMonitorList, getMonitorGroups, syncCameraConfig } from '@/api/device'
import type { MediaMtxWarningItem, SyncCameraConfigResult } from '@/api/device'

// 分页与查询参数
const queryParams = reactive<DeviceQueryParams>({
  deviceName: '',
  brand: '',
  model: '',
  ipAddress: '',
  groupId: '',
  protocolType: '',
  onlineStatus: '',
  statusFlag: '',
  page: 1,
  pageSize: 20
})

const total = ref(0)
const loading = ref(false)
const deviceList = ref<CameraDeviceVO[]>([])
const groupOptions = ref<MonitorGroupVO[]>([])
const warningDialogVisible = ref(false)
const warningItems = ref<MediaMtxWarningItem[]>([])
const syncResultDialogVisible = ref(false)
const syncResult = ref<SyncCameraConfigResult | null>(null)
const router = useRouter()

const normalizeGroups = (data: any): MonitorGroupVO[] => {
  if (!Array.isArray(data)) return []
  return data
    .map((item: any) => {
      const id = Number(item?.id ?? item?.groupId)
      const groupName = String(item?.groupName ?? item?.name ?? '').trim()
      if (!Number.isFinite(id) || !groupName) return null
      return { id, groupName }
    })
    .filter((item): item is MonitorGroupVO => item !== null)
}

const fetchGroupOptions = async () => {
  try {
    const res = await getMonitorGroups()
    groupOptions.value = normalizeGroups(res.data)
  } catch (error) {
    groupOptions.value = []
    ElMessage.error('获取分组列表失败')
  }
}

// 获取数据 API
const fetchDeviceList = async () => {
  loading.value = true
  try {
    const res = await getMonitorList(queryParams)
    if (res.data) {
      deviceList.value = res.data.records || []
      total.value = res.data.total || 0
    }
  } catch (error) {
    ElMessage.error('获取设备列表失败')
  } finally {
    loading.value = false
  }
}

// 事件处理
const handleSearch = (filterData: {
  deviceName: string
  brand: string
  model: string
  ipAddress: string
  groupId: number | ''
  protocolType: number | ''
  onlineStatus: number | ''
  statusFlag: number | ''
}) => {
  queryParams.deviceName = filterData.deviceName
  queryParams.brand = filterData.brand
  queryParams.model = filterData.model
  queryParams.ipAddress = filterData.ipAddress
  queryParams.groupId = filterData.groupId
  queryParams.protocolType = filterData.protocolType
  queryParams.onlineStatus = filterData.onlineStatus
  queryParams.statusFlag = filterData.statusFlag
  queryParams.page = 1
  fetchDeviceList()
}

const handleSizeChange = (val: number) => {
  queryParams.pageSize = val
  fetchDeviceList()
}

const handleCurrentChange = (val: number) => {
  queryParams.page = val
  fetchDeviceList()
}

const handleCreate = () => {
  router.push('/device-center/create')
}

const handleSyncConfig = async () => {
  loading.value = true
  try {
    const res = await syncCameraConfig()
    const result = res.data || null
    syncResult.value = result
    syncResultDialogVisible.value = true
    if (result && result.failedCount > 0) {
      ElMessage.warning(`配置同步完成，但有 ${result.failedCount} 条失败，${result.skippedCount} 条跳过`)
    } else {
      ElMessage.success(`配置同步完成：成功 ${result?.successCount ?? 0} 条，跳过 ${result?.skippedCount ?? 0} 条`)
    }
    await fetchDeviceList()
  } catch (error: any) {
    ElMessage.error(error.message || '配置同步失败')
  } finally {
    loading.value = false
  }
}

const streamServerIp = (import.meta.env.VITE_STREAM_SERVER_IP as string) || window.location.hostname || '127.0.0.1'
const streamWebRtcPort = Number(import.meta.env.VITE_STREAM_WEBRTC_PORT || 8889)

const generatePlayUrl = (pathName: string, protocol: 'webrtc' | 'hls' = 'webrtc') => {
  const cleanPath = String(pathName || '').replace(/^\/+/, '')
  if (!cleanPath) return ''

  if (protocol === 'hls') {
    return `http://${streamServerIp}:8888/${cleanPath}/index.m3u8`
  }

  return `http://${streamServerIp}:${streamWebRtcPort}/${cleanPath}/`
}

const isHttpUrl = (value: unknown) => {
  const text = String(value || '').trim()
  return /^https?:\/\//i.test(text)
}

// 表格操作动作
const dialogVisible = ref(false)
const currentPlayUrl = ref('')
const currentProtocol = ref('')
const currentDialogTitle = ref('监控预览')

const handlePlay = (row: CameraDeviceVO) => {
  if (row.onlineStatus !== 1) {
    ElMessage.warning('设备离线，暂不可监控')
    return
  }

  const backendDefaultPlayUrl = String(row.defaultStreamUrl || '').trim()
  const generatedPlayUrl = row.pathName ? generatePlayUrl(row.pathName, 'webrtc') : ''
  const fallbackSourceUrl = isHttpUrl(row.sourceUrl) ? String(row.sourceUrl || '').trim() : ''
  const playUrl = backendDefaultPlayUrl || generatedPlayUrl || fallbackSourceUrl
  if (!playUrl) {
    ElMessage.warning('该设备暂无可用默认流地址')
    return
  }
  console.log('[DeviceCenter] clicked play stream', {
    deviceId: row.deviceId,
    deviceName: row.deviceName,
    pathName: row.pathName,
    sourceUrl: row.sourceUrl,
    finalPlayUrl: playUrl
  })
  currentPlayUrl.value = playUrl
  currentProtocol.value = 'webrtc'
  currentDialogTitle.value = `监控预览 - ${row.deviceName}`
  dialogVisible.value = true
}

const editDialogVisible = ref(false)
const editDialogRef = ref<InstanceType<typeof DeviceEditDialog>>()

const handleViewConfig = (row: CameraDeviceVO) => {
  editDialogVisible.value = true
  setTimeout(() => {
    if (editDialogRef.value) {
      editDialogRef.value.open(row, 'view')
    }
  }, 0)
}

const handleEdit = (row: CameraDeviceVO) => {
  editDialogVisible.value = true
  // 等待 DOM 更新后调用组件内的 open 方法进行数据初始化回显
  setTimeout(() => {
    if (editDialogRef.value) {
      editDialogRef.value.open(row, 'edit')
    }
  }, 0)
}

const handleDelete = (row: CameraDeviceVO) => {
  const runDelete = async () => {
    try {
      await ElMessageBox.confirm('确定要删除该监控设备吗?', '警告', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      })
    } catch {
      return
    }

    // 用户确认后快速做一次后台预检查，超时不阻塞删除主流程
    try {
      const checkRes = await getDeleteMonitorDeviceCheck(row.deviceId, 800)
      const checkData = checkRes.data
      if (checkData?.mediaMtxPathExists) {
        const pathName = checkData.pathName || row.pathName || ''
        const pathLabel = pathName ? `（路径：${pathName}）` : ''
        await ElMessageBox.confirm(
          `检测到 MediaMTX 配置中存在对应条目${pathLabel}。继续删除时，系统会尝试同步删除 MediaMTX 配置；如果删除失败，会在结果里提示。是否继续删除？`,
          '二次确认',
          {
            confirmButtonText: '继续删除',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
      }
    } catch (error: any) {
      // 区分用户取消二次确认与检查请求异常/超时
      if (error === 'cancel' || error === 'close' || error?.action === 'cancel' || error?.action === 'close') {
        return
      }
      console.warn('[DeviceCenter] delete pre-check skipped', error)
    }

    loading.value = true
    try {
      const res = await deleteMonitorDevice(row.deviceId)
      const warnings = Array.isArray(res.data?.mediaMtxWarnings) ? res.data.mediaMtxWarnings : []
      if (warnings.length > 0) {
        warningItems.value = warnings
        warningDialogVisible.value = true
      } else {
        ElMessage.success(`已删除设备 ${row.deviceName}`)
      }
      await fetchDeviceList()
    } catch (error: any) {
      ElMessage.error(error.message || '删除设备失败')
    } finally {
      loading.value = false
    }
  }

  runDelete()
}

// WebSocket 预留逻辑
const initWebSocket = () => {}

onMounted(() => {
  fetchGroupOptions()
  fetchDeviceList()
  initWebSocket()
})

onUnmounted(() => {})
</script>

<template>
  <div class="device-center-container">
    <DeviceFilter :loading="loading" :groups="groupOptions" @search="handleSearch" />
    
    <div class="table-container">
      <div class="table-toolbar">
        <el-button :icon="Refresh" :loading="loading" @click="handleSyncConfig">同步配置</el-button>
        <el-button type="primary" :icon="Plus" @click="handleCreate">新增摄像头</el-button>
      </div>

      <DeviceTable 
        :data="deviceList" 
        :loading="loading"
        @play="handlePlay"
        @view-config="handleViewConfig"
        @edit="handleEdit"
        @delete="handleDelete"
      />
      
      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="queryParams.page"
          v-model:page-size="queryParams.pageSize"
          :page-sizes="[20, 50, 100]"
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

    <MediaMtxWarningsDialog
      v-model:visible="warningDialogVisible"
      :warnings="warningItems"
      title="删除完成，但 MediaMTX 有警告"
    />

    <SyncCameraConfigResultDialog
      v-model:visible="syncResultDialogVisible"
      :result="syncResult"
      title="同步配置结果"
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

.table-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
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

