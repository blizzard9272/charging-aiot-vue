<script setup lang="ts">
import { ref } from 'vue'
import { Search, Refresh } from '@element-plus/icons-vue'
import type { MonitorGroupVO } from '@/shared/types/monitor-center'

const props = defineProps<{
  loading: boolean
  groups: MonitorGroupVO[]
}>()

const emit = defineEmits<{
  (e: 'search', params: {
    deviceName: string
    brand: string
    model: string
    ipAddress: string
    groupId: number | ''
    protocolType: number | ''
    onlineStatus: number | ''
    statusFlag: number | ''
  }): void
}>()

const formData = ref({
  deviceName: '',
  brand: '',
  model: '',
  ipAddress: '',
  groupId: '' as number | '',
  protocolType: '' as number | '',
  onlineStatus: '' as number | '',
  statusFlag: '' as number | ''
})

const handleSearch = () => {
  emit('search', formData.value)
}

const handleReset = () => {
  formData.value.deviceName = ''
  formData.value.brand = ''
  formData.value.model = ''
  formData.value.ipAddress = ''
  formData.value.groupId = ''
  formData.value.protocolType = ''
  formData.value.onlineStatus = ''
  formData.value.statusFlag = ''
  emit('search', formData.value)
}
</script>

<template>
  <div class="filter-container">
    <el-form :inline="true" :model="formData" class="filter-form">
      <el-form-item label="设备名称">
        <el-input
          class="filter-input"
          v-model="formData.deviceName"
          placeholder="请输入设备名称"
          clearable
          @keyup.enter="handleSearch"
        />
      </el-form-item>

      <el-form-item label="品牌">
        <el-input
          class="filter-input"
          v-model="formData.brand"
          placeholder="请输入品牌"
          clearable
          @keyup.enter="handleSearch"
        />
      </el-form-item>

      <el-form-item label="型号">
        <el-input
          class="filter-input"
          v-model="formData.model"
          placeholder="请输入型号"
          clearable
          @keyup.enter="handleSearch"
        />
      </el-form-item>

      <el-form-item label="主机IP">
        <el-input
          class="filter-input"
          v-model="formData.ipAddress"
          placeholder="请输入主机IP"
          clearable
          @keyup.enter="handleSearch"
        />
      </el-form-item>

      <el-form-item label="分组">
        <el-select v-model="formData.groupId" placeholder="全部" clearable style="width: 160px">
          <el-option
            v-for="group in props.groups"
            :key="group.id"
            :label="group.groupName"
            :value="group.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="协议类型">
        <el-select v-model="formData.protocolType" placeholder="全部" clearable style="width: 140px">
          <el-option label="RTSP" :value="1" />
          <el-option label="GB28181" :value="2" />
          <el-option label="ONVIF" :value="3" />
        </el-select>
      </el-form-item>

      <el-form-item label="在线状态">
        <el-select v-model="formData.onlineStatus" placeholder="全部" clearable style="width: 120px">
          <el-option label="在线" :value="1" />
          <el-option label="离线" :value="0" />
        </el-select>
      </el-form-item>

      <el-form-item label="设备状态">
        <el-select v-model="formData.statusFlag" placeholder="全部" clearable style="width: 120px">
          <el-option label="启用" :value="1" />
          <el-option label="禁用" :value="0" />
          <el-option label="注销" :value="4" />
        </el-select>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :icon="Search" :loading="props.loading" @click="handleSearch">查询</el-button>
        <el-button :icon="Refresh" @click="handleReset">重置</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<style scoped>
.filter-container {
  background: #fff;
  padding: 18px 18px 0 18px;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.04);
  margin-bottom: 20px;
}

.filter-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
}

.filter-input {
  width: 200px;
}

.filter-form :deep(.el-form-item__content) {
  min-width: 120px;
}
</style>
