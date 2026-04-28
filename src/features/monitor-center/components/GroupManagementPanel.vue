<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Search, Refresh, Plus, Edit } from '@element-plus/icons-vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import {
  createMonitorGroup,
  getMonitorGroupDeviceList,
  updateMonitorGroup,
  type GroupDeviceListItem
} from '@/api/device'

type DialogMode = 'create' | 'edit'

interface GroupFormData {
  groupId?: number
  groupName: string
  sort: number
  statusFlag: number
}

const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const dialogMode = ref<DialogMode>('create')
const formRef = ref<FormInstance>()
const groupList = ref<GroupDeviceListItem[]>([])

const queryForm = reactive({
  groupName: '',
  statusFlag: '' as number | ''
})

const createDefaultGroupForm = (): GroupFormData => ({
  groupId: undefined,
  groupName: '',
  sort: Math.max(...groupList.value.map((item) => item.sort), 0) + 1,
  statusFlag: 1
})

const groupForm = reactive<GroupFormData>(createDefaultGroupForm())

const groupFormRules = reactive<FormRules<GroupFormData>>({
  groupName: [{ required: true, message: '请输入分组名称', trigger: 'blur' }],
  sort: [{ required: true, message: '请输入排序值', trigger: 'change' }],
  statusFlag: [{ required: true, message: '请选择状态', trigger: 'change' }]
})

const dialogTitle = computed(() => (dialogMode.value === 'create' ? '新增分组' : '编辑分组'))

const protocolLabelMap: Record<number, string> = {
  1: 'RTSP',
  2: 'GB28181',
  3: 'ONVIF'
}

const getProtocolLabel = (value: number | null) => {
  if (value === null || value === undefined) return '--'
  return protocolLabelMap[value] || `协议(${value})`
}

const getOnlineLabel = (value: number | null) => {
  if (value === 1) return '在线'
  if (value === 0) return '离线'
  return '未知'
}

const resetGroupForm = () => {
  Object.assign(groupForm, createDefaultGroupForm())
  formRef.value?.clearValidate()
}

const loadGroupList = async () => {
  loading.value = true
  try {
    const res = await getMonitorGroupDeviceList({
      groupName: queryForm.groupName.trim(),
      statusFlag: queryForm.statusFlag
    })
    groupList.value = Array.isArray(res.data) ? res.data : []
  } catch (error: any) {
    ElMessage.error(error.message || '加载分组失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  loadGroupList()
}

const handleReset = () => {
  queryForm.groupName = ''
  queryForm.statusFlag = ''
  loadGroupList()
}

const handleCreate = () => {
  dialogMode.value = 'create'
  resetGroupForm()
  dialogVisible.value = true
}

const handleEdit = (row: GroupDeviceListItem) => {
  dialogMode.value = 'edit'
  Object.assign(groupForm, {
    groupId: row.groupId,
    groupName: row.groupName,
    sort: row.sort,
    statusFlag: row.statusFlag
  })
  formRef.value?.clearValidate()
  dialogVisible.value = true
}

const handleDialogClosed = () => {
  resetGroupForm()
}

const handleSubmit = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
    submitting.value = true

    const payload = {
      groupId: groupForm.groupId,
      groupName: groupForm.groupName.trim(),
      sort: Number(groupForm.sort),
      statusFlag: Number(groupForm.statusFlag)
    }

    if (dialogMode.value === 'create') {
      await createMonitorGroup(payload)
      ElMessage.success('分组创建成功')
    } else {
      await updateMonitorGroup(payload)
      ElMessage.success('分组更新成功')
    }

    dialogVisible.value = false
    await loadGroupList()
  } catch (error: any) {
    if (error?.message) {
      ElMessage.error(error.message)
    }
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadGroupList()
})
</script>

<template>
  <div class="group-management-container">
    <div class="filter-container">
      <el-form :inline="true" class="filter-form" @submit.prevent>
        <el-form-item label="分组名称">
          <el-input
            v-model="queryForm.groupName"
            class="filter-input"
            clearable
            placeholder="请输入分组名称"
            @keyup.enter="handleSearch"
          />
        </el-form-item>

        <el-form-item label="状态">
          <el-select v-model="queryForm.statusFlag" clearable placeholder="全部" style="width: 160px">
            <el-option label="启用" :value="1" />
            <el-option label="禁用" :value="0" />
          </el-select>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :icon="Search" :loading="loading" @click="handleSearch">查询</el-button>
          <el-button :icon="Refresh" :disabled="loading" @click="handleReset">重置</el-button>
          <el-button type="success" :icon="Plus" :disabled="loading" @click="handleCreate">新增分组</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="table-container" v-loading="loading">
      <el-table :data="groupList" border stripe row-key="groupId">
        <el-table-column type="expand" width="50">
          <template #default="scope">
            <div class="device-list-wrapper">
              <el-empty v-if="!scope.row.devices || scope.row.devices.length === 0" description="暂无设备" />
              <el-table v-else :data="scope.row.devices" border size="small" style="width: 100%">
                <el-table-column prop="deviceName" label="设备名称" min-width="140" show-overflow-tooltip />
                <el-table-column label="品牌 / 型号" min-width="210">
                  <template #default="deviceScope">
                    {{ deviceScope.row.brand || '--' }} / {{ deviceScope.row.model || '--' }}
                  </template>
                </el-table-column>
                <el-table-column label="IP / 端口" min-width="180" show-overflow-tooltip>
                  <template #default="deviceScope">
                    {{ deviceScope.row.ipAddress || '--' }}
                    <span v-if="deviceScope.row.port">:{{ deviceScope.row.port }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="协议" width="110" align="center">
                  <template #default="deviceScope">
                    <el-tag effect="plain">{{ getProtocolLabel(deviceScope.row.protocolType) }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="在线状态" width="100" align="center">
                  <template #default="deviceScope">
                    <el-tag :type="deviceScope.row.onlineStatus === 1 ? 'success' : 'info'">
                      {{ getOnlineLabel(deviceScope.row.onlineStatus) }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="location" label="位置" min-width="180" show-overflow-tooltip />
              </el-table>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="groupName" label="分组名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="sort" label="排序" width="90" align="center" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="scope">
            <el-tag :type="scope.row.statusFlag === 1 ? 'success' : 'warning'">
              {{ scope.row.statusFlag === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="deviceCount" label="设备数" width="90" align="center" />
        <el-table-column prop="modifyTime" label="更新时间" min-width="170" />
        <el-table-column label="操作" width="120" fixed="right" align="center">
          <template #default="scope">
            <el-button type="primary" link :icon="Edit" @click="handleEdit(scope.row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="520px"
      destroy-on-close
      @closed="handleDialogClosed"
    >
      <el-form ref="formRef" :model="groupForm" :rules="groupFormRules" label-width="90px">
        <el-form-item label="分组名称" prop="groupName">
          <el-input v-model="groupForm.groupName" maxlength="100" show-word-limit placeholder="请输入分组名称" />
        </el-form-item>
        <el-form-item label="排序" prop="sort">
          <el-input-number v-model="groupForm.sort" :min="0" :max="9999" style="width: 100%" />
        </el-form-item>
        <el-form-item label="状态" prop="statusFlag">
          <el-radio-group v-model="groupForm.statusFlag">
            <el-radio :label="1">启用</el-radio>
            <el-radio :label="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.group-management-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.filter-container {
  background: #fff;
  padding: 18px 18px 0;
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
  width: 220px;
}

.table-container {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.04);
  flex: 1;
}

.device-list-wrapper {
  padding: 8px 12px;
  background: #fafbfd;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
