<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchStorageSettings, updateStorageSettings, type StorageCategorySetting, type StorageMigrationSummary } from '@/api/storageSettings'

const loading = ref(false)
const saving = ref(false)
const records = ref<StorageCategorySetting[]>([])
const migrationSummary = ref<StorageMigrationSummary | null>(null)

const editedMap = ref<Record<string, string>>({})

const tableRows = computed(() => {
  return records.value.map((item) => ({
    ...item,
    edited_template: editedMap.value[item.category_key] ?? item.path_template
  }))
})

const loadData = async () => {
  loading.value = true
  try {
    const res = await fetchStorageSettings()
    records.value = Array.isArray(res.data.records) ? res.data.records : []
    const map: Record<string, string> = {}
    records.value.forEach((item) => {
      map[item.category_key] = item.path_template
    })
    editedMap.value = map
  } catch (_error) {
    ElMessage.error('存储配置加载失败')
  } finally {
    loading.value = false
  }
}

const resetTemplates = () => {
  const map: Record<string, string> = {}
  records.value.forEach((item) => {
    map[item.category_key] = item.path_template
  })
  editedMap.value = map
}

const saveSettings = async () => {
  const settings = records.value.map((item) => ({
    category_key: item.category_key,
    path_template: String(editedMap.value[item.category_key] || '').trim()
  }))

  if (settings.some((item) => item.path_template === '')) {
    ElMessage.warning('路径模板不能为空')
    return
  }

  saving.value = true
  try {
    const res = await updateStorageSettings({
      settings,
      run_migration: 1
    })
    records.value = Array.isArray(res.data.records) ? res.data.records : []
    migrationSummary.value = res.data.migration || null
    resetTemplates()
    ElMessage.success('存储路径已更新，历史数据迁移已执行')
  } catch (_error) {
    ElMessage.error('保存失败，请检查模板格式')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await loadData()
})
</script>

<template>
  <div class="storage-management-page" v-loading="loading">
    <el-card shadow="never" class="header-card">
      <div class="head-row">
        <div>
          <h2>存储管理</h2>
          <p>所有路径均相对 `charging-aiot-php`，支持在线修改并自动迁移历史数据。</p>
        </div>
        <div class="head-actions">
          <el-button @click="loadData">刷新</el-button>
          <el-button @click="resetTemplates">撤销修改</el-button>
          <el-button type="primary" :loading="saving" @click="saveSettings">保存并迁移</el-button>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="panel-card">
      <el-table :data="tableRows" stripe>
        <el-table-column prop="name" label="类别" width="170" />
        <el-table-column prop="description" label="用途说明" min-width="320" />
        <el-table-column label="相对路径模板（相对 charging-aiot-php）" min-width="380">
          <template #default="{ row }">
            <el-input
              v-model="editedMap[row.category_key]"
              placeholder="storage/{date}/{protocol}/{camera}/..."
            />
          </template>
        </el-table-column>
        <el-table-column prop="example_path" label="示例结果" min-width="320" show-overflow-tooltip />
      </el-table>
      <div class="tips">
        <div>模板占位符：`{date}`、`{protocol}`、`{camera}`；向量目录额外支持 `{batch}`。</div>
        <div>示例：`storage/{date}/{protocol}/{camera}/embedding/batch_{batch}`。</div>
      </div>
    </el-card>

    <el-card v-if="migrationSummary" shadow="never" class="panel-card">
      <template #header>最近一次迁移结果</template>
      <div class="summary-grid">
        <div class="summary-item"><strong>{{ migrationSummary.updated_rows }}</strong><span>更新数据库记录</span></div>
        <div class="summary-item"><strong>{{ migrationSummary.moved_files }}</strong><span>迁移文件数</span></div>
        <div class="summary-item"><strong>{{ migrationSummary.missing_files }}</strong><span>源文件缺失</span></div>
        <div class="summary-item"><strong>{{ migrationSummary.errors }}</strong><span>迁移错误</span></div>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.storage-management-page {
  min-height: 100%;
  padding: 16px;
  background: #f5f7fa;
}

.header-card {
  margin-bottom: 14px;
}

.head-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.head-row h2 {
  margin: 0 0 6px;
  color: #1f2f4d;
}

.head-row p {
  margin: 0;
  color: #6f83a5;
}

.head-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.panel-card {
  margin-bottom: 14px;
  border: none;
  border-radius: 12px;
}

.tips {
  margin-top: 10px;
  color: #6f83a5;
  font-size: 13px;
  display: grid;
  gap: 4px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.summary-item {
  border-radius: 10px;
  background: #f7fbff;
  border: 1px solid #dbe9ff;
  padding: 12px;
}

.summary-item strong {
  display: block;
  font-size: 22px;
  color: #2f75ff;
}

.summary-item span {
  color: #5d7398;
}
</style>

