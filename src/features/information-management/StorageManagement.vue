<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchStorageSettings, updateStorageSettings, type StorageCategorySetting, type StorageMigrationSummary } from '@/api/storageSettings'

const loading = ref(false)
const saving = ref(false)
const records = ref<StorageCategorySetting[]>([])
const migrationSummary = ref<StorageMigrationSummary | null>(null)
const editedMap = ref<Record<string, string>>({})

const totalCategories = computed(() => records.value.length)
const recommendedCategories = computed(() => records.value.filter((item) => Number(item.is_recommended) === 1).length)
const customCategories = computed(() => Math.max(0, totalCategories.value - recommendedCategories.value))
const recommendedRate = computed(() => {
  if (totalCategories.value <= 0) return 0
  return Math.round((recommendedCategories.value / totalCategories.value) * 100)
})
const mediaCategory = computed(() => records.value.find((item) => item.category_key === 'image'))

const summaryCards = computed(() => [
  {
    key: 'total',
    value: totalCategories.value,
    label: '存储类别',
    desc: '当前参与管理的目录模板总数',
    tone: 'blue'
  },
  {
    key: 'recommended',
    value: recommendedCategories.value,
    label: '推荐结构',
    desc: `占比 ${recommendedRate.value}%`,
    tone: 'green'
  },
  {
    key: 'custom',
    value: customCategories.value,
    label: '自定义结构',
    desc: '偏离推荐模板的类别数量',
    tone: 'amber'
  }
])

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

const applyRecommendedTemplates = () => {
  const map: Record<string, string> = {}
  records.value.forEach((item) => {
    map[item.category_key] = item.default_template
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
    ElMessage.success('存储路径已更新，历史文件迁移已执行')
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
  <div class="storage-page" v-loading="loading">
    <el-card shadow="never" class="page-card">
      <template #header>
        <div class="page-header">
          <div>
            <div class="title">存储管理</div>
            <div class="subtitle">维护协议文件目录模板，并支持按当前模板迁移历史文件。</div>
          </div>
          <div class="actions">
            <el-button @click="loadData">刷新</el-button>
            <el-button @click="resetTemplates">撤销修改</el-button>
            <el-button @click="applyRecommendedTemplates">恢复推荐结构</el-button>
            <el-button type="primary" :loading="saving" @click="saveSettings">保存并迁移</el-button>
          </div>
        </div>
      </template>

      <div class="overview-panel">
        <div class="summary-grid">
          <div
            v-for="card in summaryCards"
            :key="card.key"
            class="summary-card"
            :class="`tone-${card.tone}`"
          >
            <div class="summary-top">
              <span>{{ card.label }}</span>
              <strong>{{ card.value }}</strong>
            </div>
            <p>{{ card.desc }}</p>
          </div>
        </div>

        <div class="health-card">
          <div class="health-head">
            <div>
              <div class="health-title">结构健康度</div>
              <div class="health-subtitle">当前模板与推荐结构的贴合程度</div>
            </div>
            <strong>{{ recommendedRate }}%</strong>
          </div>
          <div class="health-bar">
            <div class="health-fill" :style="{ width: `${recommendedRate}%` }"></div>
          </div>
          <div class="health-meta">
            <span>推荐模板 {{ recommendedCategories }} 项</span>
            <span>自定义模板 {{ customCategories }} 项</span>
          </div>
          <div class="health-note">
            103 建议使用 <code>media</code> 目录名。
            当前媒体目录：<code>{{ mediaCategory?.path_template || '--' }}</code>
          </div>
        </div>
      </div>

      <div class="guide-block">
        <div class="guide-title">推荐目录结构</div>
        <div class="guide-text">
          建议按 <code>storage/{date}/protocol_{protocol}/{camera}/{category}</code> 组织文件。
          103 既可能是图片也可能是视频，因此推荐使用 <code>media</code>；
          102 向量建议放在 <code>vector/batch_{batch}</code> 下。
        </div>
      </div>

      <el-table :data="tableRows" stripe>
        <el-table-column prop="name" label="类别" width="140" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="Number(row.is_recommended) === 1 ? 'success' : 'warning'">
              {{ Number(row.is_recommended) === 1 ? '推荐' : '自定义' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="用途说明" min-width="240" />
        <el-table-column label="当前模板" min-width="360">
          <template #default="{ row }">
            <el-input
              v-model="editedMap[row.category_key]"
              placeholder="storage/{date}/protocol_{protocol}/{camera}/..."
            />
          </template>
        </el-table-column>
        <el-table-column prop="default_template" label="推荐模板" min-width="280" show-overflow-tooltip />
        <el-table-column label="占位符" width="150">
          <template #default="{ row }">
            {{ (row.placeholders || []).join(' / ') || '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="example_path" label="示例结果" min-width="300" show-overflow-tooltip />
      </el-table>

      <div class="tips">
        <div>必填占位符：`{date}`、`{protocol}`、`{camera}`。</div>
        <div>`embedding` 类别额外要求 `{batch}`，用于区分 102 向量的批次目录。</div>
        <div>如果你已经迁移过一次，页面只负责后续模板维护，不会自动回滚已有目录。</div>
      </div>
    </el-card>

    <el-card v-if="migrationSummary" shadow="never" class="page-card">
      <template #header>
        <div class="section-title">最近一次迁移结果</div>
      </template>
      <div class="migration-row">
        <div class="migration-item">
          <strong>{{ migrationSummary.updated_rows }}</strong>
          <span>更新数据库记录</span>
        </div>
        <div class="migration-item">
          <strong>{{ migrationSummary.moved_files }}</strong>
          <span>迁移文件数量</span>
        </div>
        <div class="migration-item">
          <strong>{{ migrationSummary.missing_files }}</strong>
          <span>源文件缺失</span>
        </div>
        <div class="migration-item">
          <strong>{{ migrationSummary.errors }}</strong>
          <span>迁移错误</span>
        </div>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.storage-page {
  min-height: calc(100vh - 140px);
}

.page-card {
  margin-bottom: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.title {
  font-size: 18px;
  font-weight: 700;
  color: #303133;
}

.subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.overview-panel {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.summary-card,
.health-card,
.migration-item {
  border: 1px solid #ebeef5;
  border-radius: 10px;
  background: #fff;
}

.summary-card {
  position: relative;
  overflow: hidden;
  padding: 14px 16px;
}

.summary-card::after {
  content: '';
  position: absolute;
  right: -20px;
  bottom: -28px;
  width: 90px;
  height: 90px;
  border-radius: 50%;
  opacity: 0.08;
}

.tone-blue::after {
  background: #409eff;
}

.tone-green::after {
  background: #67c23a;
}

.tone-amber::after {
  background: #e6a23c;
}

.summary-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
}

.summary-top span {
  color: #606266;
  font-size: 13px;
}

.summary-top strong {
  color: #303133;
  font-size: 28px;
  line-height: 1;
}

.summary-card p {
  margin: 10px 0 0;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}

.health-card {
  padding: 16px;
  background: linear-gradient(180deg, #fbfdff 0%, #f6f9fd 100%);
}

.health-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.health-title,
.section-title,
.guide-title {
  font-size: 14px;
  font-weight: 700;
  color: #303133;
}

.health-subtitle {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
}

.health-head strong {
  color: #409eff;
  font-size: 26px;
  line-height: 1;
}

.health-bar {
  height: 10px;
  margin-top: 16px;
  border-radius: 999px;
  background: #edf2f7;
  overflow: hidden;
}

.health-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #67c23a 0%, #409eff 100%);
}

.health-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  color: #606266;
  font-size: 12px;
}

.health-note {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  color: #606266;
  background: #f5f7fa;
  line-height: 1.6;
  font-size: 12px;
}

.health-note code,
.guide-text code {
  padding: 2px 6px;
  border-radius: 6px;
  color: #1f5ea8;
  background: #eaf3ff;
}

.guide-block {
  margin-bottom: 16px;
  padding: 14px 16px;
  border-radius: 10px;
  background: #f7f9fc;
}

.guide-text {
  margin-top: 8px;
  color: #606266;
  line-height: 1.7;
  font-size: 13px;
}

.tips {
  margin-top: 12px;
  color: #909399;
  font-size: 12px;
  line-height: 1.7;
}

.migration-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.migration-item {
  padding: 14px 16px;
  background: #fafcff;
}

.migration-item strong {
  display: block;
  color: #409eff;
  font-size: 22px;
  line-height: 1.2;
}

.migration-item span {
  display: block;
  margin-top: 6px;
  color: #606266;
  font-size: 13px;
}

@media (max-width: 1200px) {
  .page-header {
    flex-direction: column;
  }

  .actions {
    justify-content: flex-start;
  }

  .overview-panel {
    grid-template-columns: 1fr;
  }

  .summary-grid,
  .migration-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .summary-grid,
  .migration-row {
    grid-template-columns: 1fr;
  }

  .health-meta {
    flex-direction: column;
  }
}
</style>
