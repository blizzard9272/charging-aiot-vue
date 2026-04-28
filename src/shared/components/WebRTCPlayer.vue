<template>
  <div class="webrtc-player-wrap">
    <video
      ref="videoRef"
      class="webrtc-player-video"
      autoplay
      muted
      playsinline
      controls
    ></video>
    
    <!-- 播放器无源或等候时的占位UI -->
    <div v-if="statusText" class="status-overlay">{{ statusText }}</div>

    <!-- 顶部控制栏 -->
    <div class="controls-bar" v-if="!statusText">
      <el-button type="primary" link size="small" @click="handleSnapshot">截图</el-button>
      <el-button type="primary" link size="small" @click="handleFullscreen">全屏</el-button>
      <el-tooltip content="切换码流（敬请期待）" placement="bottom">
        <el-button type="primary" link size="small">清晰度</el-button>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  playUrl: string
  protocol: string
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const statusText = ref('准备连接...')

let peerConnection: RTCPeerConnection | null = null
let currentSessionId = 0

const cleanup = () => {
  if (peerConnection) {
    peerConnection.close()
    peerConnection = null
  }
  if (videoRef.value) {
    videoRef.value.srcObject = null
  }
}

const getOfferUrls = (url: string) => {
  // 根据 playUrl，比如 "http://172.18.7.124:8889/cam1/" 构造 SDP Offer 地址
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url
  return [
    `${baseUrl}/webrtc/offer`,
    `${baseUrl}/whep`
  ]
}

const initWebRTC = async (url: string) => {
  if (!videoRef.value) return
  if (!url) {
    statusText.value = '暂无播放地址'
    return
  }

  const sessionId = ++currentSessionId
  try {
    cleanup()
    statusText.value = '正在连接 WebRTC 视频流...'
    
    peerConnection = new RTCPeerConnection()
    
    peerConnection.ontrack = (event) => {
      if (!videoRef.value || sessionId !== currentSessionId) return
      if (videoRef.value.srcObject !== event.streams[0]) {
        videoRef.value.srcObject = event.streams[0]
        statusText.value = '' // 连接成功，隐藏状态遮罩
      }
    }
    
    peerConnection.addTransceiver('video', { direction: 'recvonly' })
    peerConnection.addTransceiver('audio', { direction: 'recvonly' })
    
    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)
    
    let answerSdp = ''
    let lastError: any = null
    const offerUrls = getOfferUrls(url)
    
    for (const offerUrl of offerUrls) {
      try {
        const response = await fetch(offerUrl, {
          method: 'POST',
          body: offer.sdp,
          headers: {
            'Content-Type': 'application/sdp'
          }
        })
        
        if (!response.ok) {
          throw new Error(`服务端拒绝连接: ${response.status}`)
        }
        
        answerSdp = await response.text()
        break
      } catch (error) {
        lastError = error
      }
    }
    
    if (!answerSdp) {
      throw lastError || new Error('WebRTC SDP 应答为空')
    }
    
    if (sessionId !== currentSessionId || !peerConnection) return
    
    await peerConnection.setRemoteDescription(new RTCSessionDescription({
      type: 'answer',
      sdp: answerSdp
    }))
  } catch (error: any) {
    console.error('WebRTC 握手中失败:', error)
    statusText.value = `连接失败: ${error.message}`
  }
}

// 模拟 HLS / FLV 播放占位 (备用协议)
const initOtherPlayer = (url: string, proto: string) => {
  statusText.value = `暂未加载 ${proto.toUpperCase()} 播放器核心支持段，地址：${url}`
}

const setupPlayer = () => {
  cleanup()
  if (!props.playUrl) {
    statusText.value = '视频地址为空或设备已离线'
    return
  }

  // 根据协议初始化播放形式
  if (props.protocol.toLowerCase() === 'webrtc') {
    initWebRTC(props.playUrl)
  } else {
    initOtherPlayer(props.playUrl, props.protocol)
  }
}

watch(() => props.playUrl, (newUrl) => {
  if (newUrl) {
    setupPlayer()
  } else {
    cleanup()
    statusText.value = '视频已被停止'
  }
})

onMounted(() => {
  setupPlayer()
})

onUnmounted(() => {
  currentSessionId += 1
  cleanup()
})

// 底部控制栏功能 
const handleSnapshot = () => {
  if (!videoRef.value) return
  const canvas = document.createElement('canvas')
  canvas.width = videoRef.value.videoWidth
  canvas.height = videoRef.value.videoHeight
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.drawImage(videoRef.value, 0, 0, canvas.width, canvas.height)
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/jpeg')
    link.download = `snapshot_${new Date().getTime()}.jpg`
    link.click()
    ElMessage.success('截图已保存')
  }
}

const handleFullscreen = () => {
  if (videoRef.value) {
    if (videoRef.value.requestFullscreen) {
      videoRef.value.requestFullscreen()
    }
  }
}
</script>

<style scoped>
.webrtc-player-wrap {
  width: 100%;
  aspect-ratio: 16 / 9; /* 固定 16:9 展示 */
  position: relative;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.webrtc-player-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.status-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
  background: rgba(0, 0, 0, 0.6);
  padding: 16px;
  text-align: center;
  z-index: 10;
}

.controls-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 10px 15px;
  background: linear-gradient(rgba(0,0,0,0.7), transparent);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  opacity: 0;
  transition: opacity 0.3s;
  z-index: 20;
}

.webrtc-player-wrap:hover .controls-bar {
  opacity: 1;
}

:deep(.el-button--link) {
  color: #fff !important;
}
:deep(.el-button--link:hover) {
  color: #409eff !important;
}
</style>
