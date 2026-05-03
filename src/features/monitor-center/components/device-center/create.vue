<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import type { CreateDeviceDTO, MonitorGroupVO } from '@/shared/types/monitor-center'
import { createMonitorDevice, getMonitorGroups } from '@/api/device'
import type { MediaMtxWarningItem } from '@/api/device'
import MediaMtxWarningsDialog from './components/MediaMtxWarningsDialog.vue'

interface CreateCameraForm {
  groupId: number | ''
  deviceName: string
  brand: string
  model: string
  protocolType: 1 | 2 | 3
  ipAddress: string
  port: number
  username: string
  password: string
  confirmPassword: string
  location: string
  onlineStatus: 0 | 1
  streamType: 1 | 2
  pathName: string
  recordEnabled: 0 | 1
  recordPartDuration: number
  recordPath: string
  recordFormat: 'fmp4' | 'mp4' | 'mpegts'
}

const router = useRouter()
const formRef = ref<FormInstance>()
const submitLoading = ref(false)
const groupOptions = ref<MonitorGroupVO[]>([])
const warningDialogVisible = ref(false)
const warningItems = ref<MediaMtxWarningItem[]>([])
const pendingRedirect = ref(false)

const generateDeviceUuid = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '')
  }
  return `dev_${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16)}`
}

const autoDeviceUuid = ref(generateDeviceUuid())

const defaultFormData = (): CreateCameraForm => ({
  groupId: '',
  deviceName: '',
  brand: '',
  model: '',
  protocolType: 1,
  ipAddress: '',
  port: 554,
  username: '',
  password: '',
  confirmPassword: '',
  location: '',
  onlineStatus: 0,
  streamType: 1,
  pathName: '',
  recordEnabled: 0,
  recordPartDuration: 60,
  recordPath: '',
  recordFormat: 'fmp4'
})

const formData = reactive<CreateCameraForm>(defaultFormData())

const autoSourceUrl = computed(() => {
  const ip = formData.ipAddress.trim()
  const user = formData.username.trim()
  const pass = formData.password.trim()
  const port = Number(formData.port || 554)
  const channel = formData.streamType === 2 ? 102 : 101
  if (!ip || !user || !pass) return '--'

  return `rtsp://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${ip}:${port}/Streaming/Channels/${channel}`
})

const validateConfirmPassword = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  if (!value) {
    callback(new Error('请再次输入拉流密码'))
    return
  }
  if (value !== formData.password) {
    callback(new Error('两次输入的密码不一致'))
    return
  }
  callback()
}

const rules = reactive<FormRules<CreateCameraForm>>({
  groupId: [{ required: true, message: '请选择分组', trigger: 'change' }],
  deviceName: [{ required: true, message: '请输入设备名称', trigger: 'blur' }],
  brand: [{ required: true, message: '请输入品牌', trigger: 'blur' }],
  model: [{ required: true, message: '请输入型号', trigger: 'blur' }],
  protocolType: [{ required: true, message: '请选择接入协议', trigger: 'change' }],
  ipAddress: [{ required: true, message: '请输入主机地址/IP', trigger: 'blur' }],
  port: [{ required: true, message: '请输入端口号', trigger: 'change' }],
  username: [{ required: true, message: '请输入拉流账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入拉流密码', trigger: 'blur' }],
  confirmPassword: [{ validator: validateConfirmPassword, trigger: 'blur' }],
  location: [{ required: true, message: '请输入安装位置', trigger: 'blur' }],
  onlineStatus: [{ required: true, message: '请选择在线状态', trigger: 'change' }],
  streamType: [{ required: true, message: '请选择码流类型', trigger: 'change' }],
  pathName: [{ required: true, message: '请输入 path_name', trigger: 'blur' }],
  recordPartDuration: [{ required: true, message: '请输入切片时长', trigger: 'change' }],
  recordFormat: [{ required: true, message: '请选择录像格式', trigger: 'change' }]
})

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

const fetchGroups = async () => {
  try {
    const res = await getMonitorGroups()
    groupOptions.value = normalizeGroups(res.data)
  } catch (_error) {
    groupOptions.value = []
    ElMessage.error('获取分组列表失败')
  }
}

const handleSubmit = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
  } catch {
    return
  }

  submitLoading.value = true
  try {
    const payload: CreateDeviceDTO = {
      deviceUuid: autoDeviceUuid.value,
      groupId: Number(formData.groupId),
      deviceName: formData.deviceName,
      brand: formData.brand,
      model: formData.model,
      protocolType: formData.protocolType,
      ipAddress: formData.ipAddress,
      port: formData.port,
      username: formData.username,
      password: formData.password,
      confirmPassword: formData.confirmPassword,
      location: formData.location,
      onlineStatus: formData.onlineStatus,
      streamType: formData.streamType,
      pathName: formData.pathName,
      recordEnabled: formData.recordEnabled,
      recordPath: formData.recordPath,
      recordFormat: formData.recordFormat,
      recordPartDuration: formData.recordPartDuration
    }

    const res = await createMonitorDevice(payload)
    const warnings = Array.isArray(res.data?.mediaMtxWarnings) ? res.data.mediaMtxWarnings : []
    if (warnings.length > 0) {
      warningItems.value = warnings
      warningDialogVisible.value = true
      pendingRedirect.value = true
    } else {
      ElMessage.success('新增摄像头成功')
      router.push('/device-center')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '新增摄像头失败')
  } finally {
    submitLoading.value = false
  }
}

const handleWarningDialogClose = (visible: boolean) => {
  warningDialogVisible.value = visible
  if (!visible && pendingRedirect.value) {
    pendingRedirect.value = false
    router.push('/device-center')
  }
}

const handleReset = () => {
  autoDeviceUuid.value = generateDeviceUuid()
  Object.assign(formData, defaultFormData())
  formRef.value?.clearValidate()
}

const handleBack = () => {
  router.back()
}

onMounted(() => {
  fetchGroups()
})
</script>

<template>
  <div class="create-camera-page">
    <div class="page-header">
      <div class="page-title">新增摄像头</div>
      <el-button @click="handleBack">返回</el-button>
    </div>

    <div class="form-card">
      <el-form ref="formRef" :model="formData" :rules="rules" label-width="110px">
        <div class="section-card">
          <div class="section-title">设备信息</div>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="分组" prop="groupId">
                <el-select v-model="formData.groupId" placeholder="请选择分组" style="width: 100%">
                  <el-option v-for="group in groupOptions" :key="group.id" :label="group.groupName" :value="group.id" />
                </el-select>
              </el-form-item>
            </el-col>

            <el-col :span="12">
              <el-form-item label="设备名称" prop="deviceName">
                <el-input v-model="formData.deviceName" placeholder="请输入设备名称" />
              </el-form-item>
            </el-col>

            <el-col :span="12">
              <el-form-item label="品牌" prop="brand">
                <el-input v-model="formData.brand" placeholder="请输入品牌" />
              </el-form-item>
            </el-col>

            <el-col :span="12">
              <el-form-item label="型号" prop="model">
                <el-input v-model="formData.model" placeholder="请输入型号" />
              </el-form-item>
            </el-col>

            <el-col :span="24">
              <el-form-item label="安装位置" prop="location">
                <el-input v-model="formData.location" placeholder="请输入安装位置" />
              </el-form-item>
            </el-col>

            <el-col :span="12">
              <el-form-item label="在线状态" prop="onlineStatus">
                <el-radio-group v-model="formData.onlineStatus">
                  <el-radio :value="0">离线</el-radio>
                  <el-radio :value="1">在线</el-radio>
                </el-radio-group>
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <div class="section-card">
          <div class="section-title">流配置信息</div>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="path_name" prop="pathName">
                <el-input v-model="formData.pathName" placeholder="必填且唯一，例如：cam_gate_01" />
              </el-form-item>
            </el-col>

            <el-col :span="12">
              <el-form-item label="码流类型" prop="streamType">
                <el-select v-model="formData.streamType" style="width: 100%">
                  <el-option label="主码流 (101)" :value="1" />
                  <el-option label="子码流 (102)" :value="2" />
                </el-select>
              </el-form-item>
            </el-col>

            <el-col :span="12">
              <el-form-item label="IP地址" prop="ipAddress">
                <el-input v-model="formData.ipAddress" placeholder="例如：192.168.1.100" />
              </el-form-item>
            </el-col>

            <el-col :span="12">
              <el-form-item label="端口号" prop="port">
                <el-input-number v-model="formData.port" :min="1" :max="65535" style="width: 100%" />
              </el-form-item>
            </el-col>

            <el-col :span="12">
              <el-form-item label="拉流账号" prop="username">
                <el-input v-model="formData.username" placeholder="请输入拉流账号" />
              </el-form-item>
            </el-col>

            <el-col :span="12">
              <el-form-item label="拉流密码" prop="password">
                <el-input v-model="formData.password" type="password" show-password placeholder="请输入拉流密码" />
              </el-form-item>
            </el-col>

            <el-col :span="12">
              <el-form-item label="确认密码" prop="confirmPassword">
                <el-input v-model="formData.confirmPassword" type="password" show-password placeholder="请再次输入密码" />
              </el-form-item>
            </el-col>

            <el-col :span="12">
              <el-form-item label="录像设置" prop="recordEnabled">
                <el-switch
                  v-model="formData.recordEnabled"
                  :active-value="1"
                  :inactive-value="0"
                  active-text="开启"
                  inactive-text="关闭"
                />
              </el-form-item>
            </el-col>

            <el-col :span="12">
              <el-form-item label="切片时长(秒)" prop="recordPartDuration">
                <el-input-number v-model="formData.recordPartDuration" :min="5" :max="600" :step="5" style="width: 100%" />
              </el-form-item>
            </el-col>

            <el-col :span="12">
              <el-form-item label="录像格式" prop="recordFormat">
                <el-select v-model="formData.recordFormat" style="width: 100%">
                  <el-option label="fmp4" value="fmp4" />
                  <el-option label="mp4" value="mp4" />
                  <el-option label="mpegts" value="mpegts" />
                </el-select>
              </el-form-item>
            </el-col>

            <el-col :span="24">
              <el-form-item label="录像存储路径" prop="recordPath">
                <el-input v-model="formData.recordPath" placeholder="例如：/data/records/cam_gate_01" />
              </el-form-item>
            </el-col>

            <el-col :span="24">
              <el-form-item label="源地址(RTSP)">
                <el-input :model-value="autoSourceUrl" readonly />
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <div class="action-row">
          <el-button @click="handleReset">重置</el-button>
          <el-button type="primary" :loading="submitLoading" @click="handleSubmit">保存</el-button>
        </div>
      </el-form>
    </div>

    <MediaMtxWarningsDialog
      v-model:visible="warningDialogVisible"
      :warnings="warningItems"
      title="新增完成，但 MediaMTX 有警告"
      @update:visible="handleWarningDialogClose"
    />
  </div>
</template>

<style scoped>
.create-camera-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #303133;
}

.form-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.04);
}

.section-card {
  padding: 14px 14px 2px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fcfdff;
  margin-bottom: 14px;
}

.section-title {
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 700;
  color: #303133;
}

.action-row {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 10px;
}
</style>
