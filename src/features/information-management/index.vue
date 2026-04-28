<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { createPersonnel, deletePersonnel, getPersonnelPage, updatePersonnel, type PersonnelRecord } from '@/api/personnel'
import { getAuthUser } from '@/utils/auth'

const loading = ref(false)
const saving = ref(false)
const currentUser = getAuthUser()

const pageState = reactive({ page: 1, pageSize: 10, total: 0 })
const keyword = ref('')
const records = ref<PersonnelRecord[]>([])
const dialogVisible = ref(false)
const isEditMode = ref(false)
const formRef = ref<FormInstance>()

const formData = reactive({
  user_id: 0,
  username: '',
  password: '',
  role: 3,
  nickname: '',
  tel: '',
  email: ''
})

const formRules: FormRules = {
  username: [{ required: true, message: '请输入登录账号', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
  nickname: [{ required: true, message: '请输入昵称/姓名', trigger: 'blur' }]
}

const roleOptions = [
  { label: '超级管理员', value: 1 },
  { label: '管理员', value: 2 },
  { label: '管理人员', value: 3 },
  { label: '维护人员', value: 4 }
]

const roleText = (role: number) => {
  const map: Record<number, string> = { 1: '超级管理员', 2: '管理员', 3: '管理人员', 4: '维护人员' }
  return map[Number(role) || 0] || String(role)
}

const sha256 = async (text: string) => {
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(String(text || '')))
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const resetForm = () => {
  formData.user_id = 0
  formData.username = ''
  formData.password = ''
  formData.role = 3
  formData.nickname = ''
  formData.tel = ''
  formData.email = ''
}

const loadPage = async () => {
  loading.value = true
  try {
    const response = await getPersonnelPage({ page: pageState.page, pageSize: pageState.pageSize, role: '', keyword: keyword.value.trim() })
    pageState.total = response.data.total || 0
    records.value = response.data.records || []
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { pageState.page = 1; loadPage() }
const handleResetSearch = () => { keyword.value = ''; pageState.page = 1; loadPage() }
const openCreateDialog = () => { isEditMode.value = false; resetForm(); dialogVisible.value = true }

const isCurrentUser = (row: PersonnelRecord) => {
  if (!currentUser) return false
  return row.user_id === currentUser.user_id || row.username === currentUser.username
}

const openEditDialog = (row: PersonnelRecord) => {
  if (isCurrentUser(row)) { ElMessage.warning('不允许修改当前登录用户'); return }
  isEditMode.value = true
  formData.user_id = row.user_id
  formData.username = row.username
  formData.password = ''
  formData.role = Number(row.role) || 3
  formData.nickname = row.nickname
  formData.tel = row.tel
  formData.email = row.email
  dialogVisible.value = true
}

const handleDelete = async (row: PersonnelRecord) => {
  if (isCurrentUser(row)) { ElMessage.warning('不允许删除当前登录用户'); return }
  await ElMessageBox.confirm(`确认删除人员【${row.username}】吗？`, '删除确认', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' })
  await deletePersonnel(row.user_id)
  ElMessage.success('删除成功')
  if (records.value.length === 1 && pageState.page > 1) pageState.page -= 1
  await loadPage()
}

const handleSave = async () => {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  if (!isEditMode.value && !formData.password.trim()) { ElMessage.warning('新增人员必须填写初始密码'); return }

  saving.value = true
  try {
    const payload: any = {
      user_id: formData.user_id,
      username: formData.username.trim(),
      role: Number(formData.role),
      nickname: formData.nickname.trim(),
      tel: formData.tel.trim(),
      email: formData.email.trim()
    }
    if (formData.password.trim()) payload.password = await sha256(formData.password.trim())
    if (isEditMode.value) { await updatePersonnel(payload); ElMessage.success('更新成功') }
    else { await createPersonnel(payload); ElMessage.success('创建成功') }
    dialogVisible.value = false
    await loadPage()
  } finally {
    saving.value = false
  }
}

onMounted(() => { loadPage() })
</script>

<template>
  <div class="personnel-page">
    <el-card>
      <template #header>
        <div class="page-header">
          <div>
            <div class="title">人员管理</div>
            <div class="subtitle">新增、编辑、删除人员信息</div>
          </div>
          <el-button type="primary" @click="openCreateDialog">新增人员</el-button>
        </div>
      </template>
      <div class="toolbar">
        <el-input v-model="keyword" clearable placeholder="按账号/昵称/手机号搜索" style="width: 280px" @keyup.enter="handleSearch" />
        <el-button type="primary" @click="handleSearch">查询</el-button>
        <el-button @click="handleResetSearch">重置</el-button>
      </div>
      <el-table v-loading="loading" :data="records" border stripe>
        <!-- <el-table-column prop="user_id" label="user_id" width="90" />
        <el-table-column prop="user__uuid" label="user__uuid" min-width="230" show-overflow-tooltip /> -->
        <el-table-column prop="username" label="账号" min-width="120" />
        <el-table-column prop="nickname" label="昵称" min-width="120" />
        <el-table-column prop="role" label="角色" width="100">
          <template #default="{ row }">{{ roleText(Number(row.role) || 0) }}</template>
        </el-table-column>
        <el-table-column prop="tel" label="手机号" min-width="120" />
        <el-table-column prop="email" label="邮箱" min-width="150" />
        <el-table-column prop="createtime" label="创建时间" min-width="160" />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link :disabled="isCurrentUser(row)" @click="openEditDialog(row)">编辑</el-button>
            <el-button type="danger" link :disabled="isCurrentUser(row)" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination background layout="total, prev, pager, next, sizes" :total="pageState.total" v-model:current-page="pageState.page" v-model:page-size="pageState.pageSize" :page-sizes="[10, 20, 50]" @current-change="loadPage" @size-change="loadPage" />
      </div>
    </el-card>
    <el-dialog v-model="dialogVisible" :title="isEditMode ? '编辑人员' : '新增人员'" width="620px" destroy-on-close>
      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="100px">
        <el-form-item label="登录账号" prop="username">
          <el-input v-model="formData.username" maxlength="64" />
        </el-form-item>
        <el-form-item label="登录密码">
          <el-input v-model="formData.password" type="password" show-password :placeholder="isEditMode ? '不修改密码可留空' : '请输入初始密码'" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="formData.role" style="width: 100%">
            <el-option v-for="item in roleOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="昵称/姓名" prop="nickname">
          <el-input v-model="formData.nickname" maxlength="64" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="formData.tel" maxlength="32" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="formData.email" maxlength="128" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.personnel-page { min-height: calc(100vh - 140px); }
.page-header { display: flex; justify-content: space-between; align-items: center; }
.title { font-size: 18px; font-weight: 700; color: #303133; }
.subtitle { margin-top: 4px; font-size: 12px; color: #909399; }
.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.pager { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
