<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import type { CameraDeviceVO, DeviceFormDTO, MonitorGroupVO } from '@/shared/types/monitor-center'
import { getDeviceForm, getMonitorGroups, updateMonitorDevice } from '@/api/device'
import type { MediaMtxWarningItem } from '@/api/device'
import MediaMtxWarningsDialog from './MediaMtxWarningsDialog.vue'

type OpenMode = 'view' | 'edit'

defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
  (e: 'success'): void
}>()

const formRef = ref<FormInstance>()
const loading = ref(false)
const loadingForm = ref(false)
const groupOptions = ref<MonitorGroupVO[]>([])
const isEditMode = ref(false)
const originalSnapshot = ref<DeviceFormDTO | null>(null)
const warningDialogVisible = ref(false)
const warningItems = ref<MediaMtxWarningItem[]>([])

const drawerTitle = computed(() => (isEditMode.value ? '编辑流配置' : '流配置详情'))

const defaultFormData = (): DeviceFormDTO => ({
  deviceId: 0,
  groupId: 0,
  groupName: '',
  deviceName: '',
  deviceUuid: '',
  brand: '',
  model: '',
  protocolType: 1,
  ipAddress: '',
  port: 554,
  username: '',
  password: '',
  location: '',
  onlineStatus: 0,
  statusFlag: 1,
  pathId: null,
  pathUuid: '',
  pathName: '',
  sourceUrl: '',
  streamType: 1,
  recordEnabled: 0,
  recordPath: '',
  recordFormat: 'fmp4',
  recordPartDuration: 60,
  pathStatusFlag: 1
})

const formData = reactive<DeviceFormDTO>(defaultFormData())

const autoSourceUrl = computed(() => {
  const ip = String(formData.ipAddress || '').trim()
  const user = String(formData.username || '').trim()
  const pass = String(formData.password || '').trim()
  const port = Number(formData.port || 554)
  const streamType = Number(formData.streamType || 1)
  const channel = streamType === 2 ? 102 : 101

  if (!ip || !user || !pass) return ''

  return `rtsp://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${ip}:${port}/Streaming/Channels/${channel}`
})

const rules = reactive<FormRules<DeviceFormDTO>>({
  groupId: [{ required: true, message: '请选择分组', trigger: 'change' }],
  deviceName: [{ required: true, message: '请输入设备名称', trigger: 'blur' }],
  brand: [{ required: true, message: '请输入品牌', trigger: 'blur' }],
  model: [{ required: true, message: '请输入型号', trigger: 'blur' }],
  ipAddress: [{ required: true, message: '请输入主机地址/IP', trigger: 'blur' }],
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  pathName: [{ required: true, message: '请输入路径名称', trigger: 'blur' }],
  streamType: [{ required: true, message: '请选择码流类型', trigger: 'change' }]
})

const protocolTypeLabelMap: Record<number, string> = {
  1: 'RTSP',
  2: 'GB28181',
  3: 'ONVIF'
}

const getProtocolTypeLabel = (type: number) => protocolTypeLabelMap[type] || `未知(${type})`

const normalizeGroups = (data: unknown): MonitorGroupVO[] => {
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

const syncGroupName = () => {
  const matched = groupOptions.value.find((item) => item.id === Number(formData.groupId))
  formData.groupName = matched?.groupName || ''
}

const applySnapshot = (snapshot: DeviceFormDTO | null) => {
  Object.assign(formData, defaultFormData(), snapshot || {})
}

const open = async (vo: CameraDeviceVO, mode: OpenMode = 'view') => {
  applySnapshot(null)
  originalSnapshot.value = null
  isEditMode.value = mode === 'edit'
  emit('update:visible', true)

  const deviceId = vo.deviceId ?? vo.id
  if (!deviceId) return

  loadingForm.value = true
  try {
    const [formRes, groupsRes] = await Promise.all([
      getDeviceForm(deviceId),
      getMonitorGroups()
    ])
    groupOptions.value = normalizeGroups(groupsRes.data)
    const snapshot = { ...defaultFormData(), ...(formRes.data || {}), deviceId }
    originalSnapshot.value = snapshot
    applySnapshot(snapshot)
    if (!formData.groupId && formData.groupName) {
      const matched = groupOptions.value.find((item) => item.groupName === formData.groupName)
      formData.groupId = matched?.id || 0
    }
    syncGroupName()
    formData.sourceUrl = autoSourceUrl.value || formData.sourceUrl
  } catch (error) {
    console.error('获取设备表单失败', error)
    ElMessage.error('获取设备详情失败')
  } finally {
    loadingForm.value = false
  }
}

const handleClose = () => {
  isEditMode.value = false
  emit('update:visible', false)
  formRef.value?.clearValidate()
}

const handleVisibleChange = (val: boolean) => {
  emit('update:visible', val)
}

const onSave = async () => {
  if (!isEditMode.value || !formRef.value) return

  try {
    await formRef.value.validate()
  } catch {
    return
  }

  loading.value = true
  try {
    syncGroupName()
    formData.sourceUrl = autoSourceUrl.value || formData.sourceUrl
    const payload: DeviceFormDTO = {
      deviceId: Number(formData.deviceId || 0),
      groupId: Number(formData.groupId || 0),
      groupName: String(formData.groupName || ''),
      deviceName: String(formData.deviceName || ''),
      deviceUuid: String(formData.deviceUuid || ''),
      brand: String(formData.brand || ''),
      model: String(formData.model || ''),
      protocolType: Number(formData.protocolType || 1),
      ipAddress: String(formData.ipAddress || ''),
      port: Number(formData.port || 554),
      username: String(formData.username || ''),
      password: String(formData.password || ''),
      location: String(formData.location || ''),
      onlineStatus: Number(formData.onlineStatus || 0),
      statusFlag: Number(formData.statusFlag || 1),
      pathId: formData.pathId == null ? null : Number(formData.pathId),
      pathUuid: String(formData.pathUuid || ''),
      pathName: String(formData.pathName || ''),
      sourceUrl: String(formData.sourceUrl || ''),
      streamType: Number(formData.streamType || 1),
      recordEnabled: Number(formData.recordEnabled || 0),
      recordPath: String(formData.recordPath || ''),
      recordFormat: String(formData.recordFormat || 'fmp4'),
      recordPartDuration: Number(formData.recordPartDuration || 60),
      pathStatusFlag: formData.pathStatusFlag == null ? 1 : Number(formData.pathStatusFlag)
    }

    const res = await updateMonitorDevice(payload)
    const warnings = Array.isArray(res.data?.mediaMtxWarnings) ? res.data.mediaMtxWarnings : []
    if (warnings.length > 0) {
      warningItems.value = warnings
      warningDialogVisible.value = true
    } else {
      ElMessage.success('设备更新成功')
    }
    emit('success')
    handleClose()
  } catch (error: any) {
    ElMessage.error(error.message || '更新失败')
  } finally {
    loading.value = false
  }
}

const enableEditMode = () => {
  isEditMode.value = true
}

const cancelEditMode = () => {
  applySnapshot(originalSnapshot.value)
  isEditMode.value = false
  formRef.value?.clearValidate()
}

defineExpose({
  open
})
</script>

<template>
  <el-drawer
    :model-value="visible"
    :title="drawerTitle"
    direction="rtl"
    size="720px"
    :modal="true"
    :append-to-body="false"
    :close-on-click-modal="true"
    class="device-edit-drawer"
    destroy-on-close
    @update:model-value="handleVisibleChange"
    @close="handleClose"
  >
    <el-form ref="formRef" :model="formData" :rules="rules" label-width="110px" class="compact-form" v-loading="loadingForm">
      <div class="mode-bar">
        <el-tag v-if="!isEditMode" type="info">当前为查看模式</el-tag>
        <el-tag v-else type="success">当前为编辑模式</el-tag>
      </div>

      <el-divider content-position="left" class="section-title">基础信息</el-divider>
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="分组" prop="groupId">
            <el-select v-model="formData.groupId" placeholder="请选择分组" style="width: 100%" :disabled="!isEditMode" @change="syncGroupName">
              <el-option v-for="group in groupOptions" :key="group.id" :label="group.groupName" :value="group.id" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="设备名称" prop="deviceName">
            <el-input v-model="formData.deviceName" placeholder="请输入设备名称" :disabled="!isEditMode" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="设备UUID">
            <el-input v-model="formData.deviceUuid" readonly />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="品牌" prop="brand">
            <el-input v-model="formData.brand" placeholder="请输入设备品牌" :disabled="!isEditMode" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="型号" prop="model">
            <el-input v-model="formData.model" placeholder="请输入设备型号" :disabled="!isEditMode" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="接入协议类型">
            <el-input :model-value="getProtocolTypeLabel(formData.protocolType)" readonly />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="在线状态">
            <template v-if="!isEditMode">
              <el-tag :type="formData.onlineStatus === 1 ? 'success' : 'info'">
                {{ formData.onlineStatus === 1 ? '在线' : '离线' }}
              </el-tag>
            </template>
            <el-select v-else v-model="formData.onlineStatus" style="width: 100%">
              <el-option label="离线" :value="0" />
              <el-option label="在线" :value="1" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="设备状态" prop="statusFlag">
            <el-select v-model="formData.statusFlag" style="width: 100%" :disabled="!isEditMode">
              <el-option label="禁用" :value="0" />
              <el-option label="正常" :value="1" />
              <el-option label="删除" :value="4" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item label="物理位置" prop="location">
            <el-input v-model="formData.location" placeholder="请输入安装位置" :disabled="!isEditMode" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-divider content-position="left" class="section-title">设备接入信息</el-divider>
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="主机/IP" prop="ipAddress">
            <el-input v-model="formData.ipAddress" placeholder="例如：192.168.1.100" :disabled="!isEditMode" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="端口" prop="port">
            <el-input-number v-model="formData.port" :min="1" :max="65535" style="width: 100%" :disabled="!isEditMode" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="账号" prop="username">
            <el-input v-model="formData.username" placeholder="请输入账号" :disabled="!isEditMode" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="密码" prop="password">
            <el-input v-model="formData.password" type="password" show-password placeholder="请输入密码" :disabled="!isEditMode" />
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item label="路径名称" prop="pathName">
            <el-input v-model="formData.pathName" placeholder="例如：cam1" :disabled="!isEditMode" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="路径UUID">
            <el-input v-model="formData.pathUuid" readonly />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="码流类型" prop="streamType">
            <el-select v-model="formData.streamType" style="width: 100%" :disabled="!isEditMode">
              <el-option label="主码流 (101)" :value="1" />
              <el-option label="子码流 (102)" :value="2" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item label="源流地址" prop="sourceUrl">
            <el-input :model-value="autoSourceUrl || formData.sourceUrl || '--'" readonly />
          </el-form-item>
        </el-col>
      </el-row>

      <el-divider content-position="left" class="section-title">录像配置</el-divider>
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="录像开关" prop="recordEnabled">
            <el-switch
              v-model="formData.recordEnabled"
              :active-value="1"
              :inactive-value="0"
              active-text="启用"
              inactive-text="禁用"
              :disabled="!isEditMode"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="分段时长(秒)" prop="recordPartDuration">
            <el-input-number
              v-model="formData.recordPartDuration"
              :step="5"
              :min="5"
              :max="600"
              style="width: 100%"
              :disabled="!isEditMode"
            />
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item label="录像路径" prop="recordPath">
            <el-input v-model="formData.recordPath" placeholder="请输入录像保存路径" :disabled="!isEditMode" />
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item label="录像格式" prop="recordFormat">
            <el-select v-model="formData.recordFormat" style="width: 100%" :disabled="!isEditMode">
              <el-option label="fmp4" value="fmp4" />
              <el-option label="mp4" value="mp4" />
              <el-option label="mpegts" value="mpegts" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="路径状态" prop="pathStatusFlag">
            <el-select v-model="formData.pathStatusFlag" style="width: 100%" :disabled="!isEditMode">
              <el-option label="禁用" :value="0" />
              <el-option label="正常" :value="1" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose">关闭</el-button>
        <el-button v-if="!isEditMode" type="primary" @click="enableEditMode">编辑</el-button>
        <el-button v-if="isEditMode" @click="cancelEditMode">取消编辑</el-button>
        <el-button v-if="isEditMode" type="primary" :loading="loading" @click="onSave">保存</el-button>
      </span>
    </template>
  </el-drawer>

  <MediaMtxWarningsDialog
    v-model:visible="warningDialogVisible"
    :warnings="warningItems"
    title="编辑完成，但 MediaMTX 有警告"
  />
</template>

<style scoped>
.compact-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

.compact-form :deep(.el-divider) {
  margin: 18px 0;
}

.compact-form :deep(.section-title .el-divider__text) {
  font-size: 17px;
  font-weight: 700;
  color: #303133;
}

.device-edit-drawer:deep(.el-drawer) {
  top: 60px;
  height: calc(100vh - 60px) !important;
}

.device-edit-drawer:deep(.el-drawer__header) {
  margin-bottom: 0;
  padding: 16px 20px;
  border-bottom: 1px solid #ebeef5;
}

.device-edit-drawer:deep(.el-drawer__body) {
  padding: 16px 20px;
  overflow-y: auto;
}

.device-edit-drawer:deep(.el-drawer__footer) {
  padding: 12px 20px;
  border-top: 1px solid #ebeef5;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.mode-bar {
  margin-bottom: 10px;
}
</style>
