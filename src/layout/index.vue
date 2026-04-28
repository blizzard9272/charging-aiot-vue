<script setup lang="ts">
import { ref } from 'vue'
import Sidebar from './components/Sidebar.vue'
import Header from './components/Header.vue'

const isCollapse = ref(false)

const toggleCollapse = () => {
  isCollapse.value = !isCollapse.value
}
</script>

<template>
  <el-container class="layout-container">
    <el-aside width="auto" class="layout-aside">
      <div class="logo-container">
        <span v-if="!isCollapse" class="logo-text">充电桩 AIoT 监控平台</span>
        <span v-else class="logo-text-mini">AIoT</span>
      </div>
      <Sidebar :is-collapse="isCollapse" />
    </el-aside>
    
    <el-container class="layout-main-wrapper">
      <el-header class="layout-header">
        <Header :is-collapse="isCollapse" @toggle-collapse="toggleCollapse" />
      </el-header>
      
      <el-main class="layout-main">
        <!-- 路由内容区 -->
        <router-view v-slot="{ Component, route }">
          <transition name="fade-transform" mode="out-in">
            <component :is="Component" :key="route.fullPath" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout-container {
  height: 100%;
  overflow: hidden;
  background-color: #f4f7f9;
}

.layout-aside {
  background: linear-gradient(180deg, #0d2247 0%, #081a37 100%);
  transition: width 0.3s;
  display: flex;
  flex-direction: column;
  height: 100%;
  border-right: 1px solid rgba(109, 146, 207, 0.25);
}

.logo-container {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(120deg, rgba(15, 42, 86, 0.96), rgba(8, 29, 61, 0.94));
  color: #ffffff;
  overflow: hidden;
  white-space: nowrap;
  box-shadow: inset 0 -1px 0 rgba(109, 146, 207, 0.22);
}

.logo-text {
  font-size: 18px;
  font-weight: bold;
}

.logo-text-mini {
  font-size: 14px;
  font-weight: bold;
}

.layout-main-wrapper {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

.layout-header {
  flex: 0 0 60px;
  height: 60px;
  padding: 0;
  background-color: #fff;
  border-bottom: 1px solid #dcdfe6;
}

.layout-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background-color: #f4f7f9;
  padding: 20px;
  box-sizing: border-box;
}

/* 路由切换动画 */
.fade-transform-enter-active,
.fade-transform-leave-active {
  transition: all 0.3s;
}
.fade-transform-enter-from {
  opacity: 0;
  transform: translateX(-30px);
}
.fade-transform-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
