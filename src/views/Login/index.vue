<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Lock, User } from '@element-plus/icons-vue'
import { login } from '@/api/auth'
import { setAuthToken, setAuthUser } from '@/utils/auth'

const route = useRoute()
const router = useRouter()
const loading = ref(false)

const formData = reactive({
  username: '',
  password: ''
})

const normalizePassword = async (text: string) => {
  const safeText = String(text || '')
  const subtle = window.crypto?.subtle
  if (!subtle) {
    return safeText
  }

  const encoder = new TextEncoder()
  const data = encoder.encode(safeText)
  const hashBuffer = await subtle.digest('SHA-256', data)
  const bytes = Array.from(new Uint8Array(hashBuffer))
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const handleLogin = async () => {
  if (!formData.username || !formData.password) {
    ElMessage.warning('请输入账号和密码')
    return
  }

  loading.value = true
  try {
    const encryptedPassword = await normalizePassword(formData.password)
    const response = await login({
      username: formData.username.trim(),
      password: encryptedPassword
    })

    const token = response?.data?.token || ''
    if (!token) {
      throw new Error('登录失败，未获取到令牌')
    }

    setAuthToken(token)
    setAuthUser(response.data.user || null)

    ElMessage.success('登录成功')
    const redirect = typeof route.query.redirect === 'string'
      ? route.query.redirect
      : '/monitor-center/workbench'
    router.replace(redirect)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <el-card shadow="hover" class="login-card">
      <div class="login-title">管理员登录</div>
      <div class="login-subtitle">默认账号: admin / 123456（首次登录后建议修改）</div>

      <el-form @submit.prevent>
        <el-form-item>
          <el-input
            v-model="formData.username"
            placeholder="请输入账号"
            :prefix-icon="User"
            clearable
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item>
          <el-input
            v-model="formData.password"
            type="password"
            show-password
            placeholder="请输入密码"
            :prefix-icon="Lock"
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-button
          type="primary"
          class="login-btn"
          :loading="loading"
          @click="handleLogin"
        >
          登录
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.login-page {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(120deg, #eef3fb 0%, #f6f9ff 100%);
}

.login-card {
  width: 380px;
  border: none;
  border-radius: 10px;
}

.login-title {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
  margin-bottom: 6px;
  text-align: center;
}

.login-subtitle {
  font-size: 12px;
  color: #909399;
  margin-bottom: 18px;
  text-align: center;
}

.login-btn {
  width: 100%;
}
</style>
