<template>
  <div class="workbench-container">
    <!-- 第一行: 状态统计卡片 -->
    <el-row :gutter="20" class="stat-row">
      <el-col :span="4" v-for="(stat, index) in statCards" :key="index">
        <el-card :class="['stat-card', stat.theme]" shadow="hover">
          <div class="stat-content">
            <div class="stat-icon-wrapper">
              <el-icon class="stat-icon"><component :is="stat.icon" /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-title">{{ stat.title }}</div>
              <div class="stat-value">{{ stat.value }}</div>
              <div class="stat-desc">{{ stat.desc }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 第二行: 2:1 分栏 -->
    <el-row :gutter="20" class="content-row">
      <!-- 左侧: 设备状态表格 (占 16 份) -->
      <el-col :span="16">
        <el-card class="box-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>设备状态</span>
              <el-button type="primary" link>查看全部</el-button>
            </div>
          </template>
          <el-table :data="deviceList" style="width: 100%" height="400">
            <el-table-column label="设备名称" min-width="180">
              <template #default="{ row }">
                <div class="device-name">{{ row.name }}</div>
                <div class="device-sub">{{ row.subName }}</div>
              </template>
            </el-table-column>
            <el-table-column prop="location" label="位置/通道" min-width="150" />
            <el-table-column prop="lastUpdate" label="最近采集状态" min-width="140" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === '启用' ? 'success' : 'danger'" effect="light">
                  {{ row.status }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <!-- 右侧: 最近事件时间轴 (占 8 份) -->
      <el-col :span="8">
        <el-card class="box-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>最近事件时间轴</span>
            </div>
          </template>
          <div class="timeline-wrapper">
            <el-timeline>
              <el-timeline-item
                v-for="(activity, index) in timelineData"
                :key="index"
                :type="activity.type"
                :timestamp="activity.time"
                placement="top"
              >
                <div class="timeline-content">
                  <div class="timeline-title">{{ activity.event }}</div>
                  <div class="timeline-detail">{{ activity.detail }}</div>
                  <el-link type="primary" :underline="false" style="font-size: 12px; margin-top: 5px;">查看片段 <el-icon><VideoCamera /></el-icon></el-link>
                </div>
              </el-timeline-item>
            </el-timeline>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  Monitor,
  VideoCamera,
  WarningFilled,
  Loading,
  User,
  DataLine
} from '@element-plus/icons-vue'

const statCards = ref([
  { title: '设备总数', value: '1,280', desc: '异常设备 0 台', icon: Monitor, theme: 'default' },
  { title: '监控视频数', value: '640', desc: '在线 635 / 离线 5', icon: VideoCamera, theme: 'default' },
  { title: '高风险告警', value: '3', desc: '需立即派单处理', icon: WarningFilled, theme: 'danger' },
  { title: '处理中视频', value: '12', desc: '正在进行事件分析', icon: Loading, theme: 'warning' },
  { title: '在线用户', value: '45', desc: '较昨日增加 12%', icon: User, theme: 'default' },
  { title: '今日访问量', value: '3,892', desc: '累计访问 12.4W+', icon: DataLine, theme: 'default' },
])

const deviceList = ref([
  { name: '充电桩 A 区 - 01号', subName: '直流快充 120kW', location: '朝阳区望京站 / CH-01', lastUpdate: '2023-10-25 14:32:11', status: '启用' },
  { name: '充电桩 A 区 - 02号', subName: '直流快充 120kW', location: '朝阳区望京站 / CH-02', lastUpdate: '2023-10-25 14:31:05', status: '启用' },
  { name: '充电桩 B 区 - 12号', subName: '交流慢充 7kW', location: '海淀区西二旗站 / CH-05', lastUpdate: '2023-10-25 14:28:43', status: '停用' },
  { name: '充电桩 C 区 - 08号', subName: '液冷超充 480kW', location: '大兴区首都机场站 / CH-01', lastUpdate: '2023-10-25 14:33:00', status: '启用' },
  { name: '摄像头 - A区入口', subName: '全景云台摄像机', location: '朝阳区望京站 / CAM-01', lastUpdate: '2023-10-25 14:33:15', status: '启用' }
])

const timelineData = ref([
  { time: '14:30:22', event: '充电桩A枪体未归位', detail: '关联：摄像头-A区02 / 发现车辆已驶离但枪体未归位', type: 'danger' },
  { time: '13:15:00', event: '温度过高预警', detail: '关联：充电桩B-05 / 设备温度达到警戒值(85℃)', type: 'warning' },
  { time: '11:42:12', event: '设备离线', detail: '关联：充电桩C-12 / 网络心跳丢失超时', type: 'info' },
  { time: '09:20:05', event: '烟雾/明火检测', detail: '关联：摄像头-D区全景 / 未发现异常', type: 'success' },
  { time: '08:00:00', event: '系统自动巡检完成', detail: '共巡检设备 1,280 台，发现异常 2 起', type: 'primary' }
])
</script>

<style scoped>
.workbench-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.stat-row {
  margin-bottom: 0;
}

.stat-card {
  border: none;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.04);
  transition: all 0.3s;
}

.stat-card.danger {
  background-color: #fff0f0;
}
.stat-card.danger .stat-icon { color: #f56c6c; }
.stat-card.danger .stat-title, .stat-card.danger .stat-value { color: #cf4d4d; }

.stat-card.warning {
  background-color: #fff8e6;
}
.stat-card.warning .stat-icon { color: #e6a23c; }
.stat-card.warning .stat-title, .stat-card.warning .stat-value { color: #b88230; }

.stat-card.default .stat-icon { color: #409eff; }

.stat-content {
  display: flex;
  align-items: center;
  gap: 15px;
}

.stat-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background-color: rgba(255, 255, 255, 0.6);
}

.stat-icon {
  font-size: 28px;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-title {
  font-size: 13px;
  color: #606266;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #303133;
  line-height: 1.2;
}

.stat-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.box-card {
  border: none;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.04);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  color: #303133;
}

.device-name {
  font-weight: bold;
  color: #303133;
}

.device-sub {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.timeline-wrapper {
  height: 400px;
  overflow-y: auto;
  padding-right: 15px;
}
.timeline-wrapper::-webkit-scrollbar {
  width: 6px;
}
.timeline-wrapper::-webkit-scrollbar-thumb {
  background: #dcdfe6;
  border-radius: 3px;
}

.timeline-content {
  background-color: #f8f9fa;
  padding: 10px 15px;
  border-radius: 6px;
  margin-top: 5px;
}

.timeline-title {
  font-size: 14px;
  font-weight: bold;
  color: #303133;
}

.timeline-detail {
  font-size: 13px;
  color: #606266;
  margin-top: 6px;
  line-height: 1.5;
}
</style>
