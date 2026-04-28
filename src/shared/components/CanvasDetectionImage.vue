<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { StreamTarget } from '@/api/uploadStream'

const props = withDefaults(defineProps<{
  imageUrl: string
  targets?: StreamTarget[]
  height?: number
  lineColor?: string
}>(), {
  targets: () => [],
  height: 150,
  lineColor: '#2bd3ff'
})

defineEmits<{
  (e: 'click'): void
}>()

const hostRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const loadError = ref(false)

let drawToken = 0
let observer: ResizeObserver | null = null

const targetCount = computed(() => props.targets.length)

const normalizeBox = (target: StreamTarget) => {
  const left = Math.min(target.x1, target.x2)
  const right = Math.max(target.x1, target.x2)
  const top = Math.min(target.y1, target.y2)
  const bottom = Math.max(target.y1, target.y2)
  return {
    left,
    right,
    top,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  }
}

const drawImageAndBoxes = (img: HTMLImageElement) => {
  const host = hostRef.value
  const canvas = canvasRef.value
  if (!host || !canvas) return

  const cssWidth = Math.max(1, host.clientWidth)
  const cssHeight = Math.max(1, props.height)
  const dpr = Math.max(1, window.devicePixelRatio || 1)

  canvas.width = Math.round(cssWidth * dpr)
  canvas.height = Math.round(cssHeight * dpr)
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${cssHeight}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssWidth, cssHeight)
  ctx.fillStyle = '#0b1730'
  ctx.fillRect(0, 0, cssWidth, cssHeight)

  const scale = Math.min(cssWidth / img.naturalWidth, cssHeight / img.naturalHeight)
  const drawWidth = img.naturalWidth * scale
  const drawHeight = img.naturalHeight * scale
  const offsetX = (cssWidth - drawWidth) / 2
  const offsetY = (cssHeight - drawHeight) / 2

  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)

  if (props.targets.length <= 0) {
    return
  }

  ctx.strokeStyle = props.lineColor
  ctx.lineWidth = 2
  ctx.fillStyle = 'rgba(43, 211, 255, 0.18)'
  ctx.font = '12px Consolas'

  props.targets.forEach((target) => {
    const box = normalizeBox(target)
    const x = offsetX + box.left * scale
    const y = offsetY + box.top * scale
    const w = box.width * scale
    const h = box.height * scale

    ctx.fillRect(x, y, w, h)
    ctx.strokeRect(x, y, w, h)

    const label = `tid:${target.tid}`
    const labelY = Math.max(12, y - 4)
    ctx.fillStyle = 'rgba(8, 24, 50, 0.75)'
    const textWidth = ctx.measureText(label).width + 8
    ctx.fillRect(x, labelY - 12, textWidth, 14)
    ctx.fillStyle = '#e9f6ff'
    ctx.fillText(label, x + 4, labelY - 1)
    ctx.fillStyle = 'rgba(43, 211, 255, 0.18)'
  })
}

const redraw = () => {
  const canvas = canvasRef.value
  if (!canvas) return

  const currentToken = ++drawToken
  const src = (props.imageUrl || '').trim()

  if (!src) {
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    loadError.value = false
    return
  }

  loadError.value = false
  const img = new Image()
  img.onload = () => {
    if (currentToken !== drawToken) return
    drawImageAndBoxes(img)
  }
  img.onerror = () => {
    if (currentToken !== drawToken) return
    loadError.value = true
  }
  img.src = src
}

watch(
  () => [props.imageUrl, props.height, props.lineColor, props.targets],
  () => {
    redraw()
  },
  { deep: true }
)

onMounted(() => {
  redraw()

  if ('ResizeObserver' in window) {
    observer = new ResizeObserver(() => {
      redraw()
    })

    if (hostRef.value) {
      observer.observe(hostRef.value)
    }
  }
})

onUnmounted(() => {
  drawToken += 1
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div ref="hostRef" class="canvas-detection-image" :style="{ height: `${height}px` }">
    <canvas ref="canvasRef" class="canvas-surface" @click="$emit('click')" />
    <div v-if="loadError" class="canvas-fallback">图片加载失败</div>
    <div v-if="targetCount > 0" class="target-badge">{{ targetCount }} 个目标</div>
  </div>
</template>

<style scoped>
.canvas-detection-image {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: #0b1730;
}

.canvas-surface {
  display: block;
  width: 100%;
  height: 100%;
  cursor: zoom-in;
}

.canvas-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9fb6df;
  background: rgba(8, 23, 48, 0.95);
}

.target-badge {
  position: absolute;
  right: 8px;
  top: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  color: #e9f6ff;
  background: rgba(16, 68, 113, 0.82);
  border: 1px solid rgba(43, 211, 255, 0.42);
}
</style>
