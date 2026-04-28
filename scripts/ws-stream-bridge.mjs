import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const eventFile = path.resolve(__dirname, '../../charging-aiot-php/runtime/ws_events.jsonl')
const wsPort = Number(process.env.STREAM_WS_PORT || 8080)
const wsPath = process.env.STREAM_WS_PATH || '/ws/stream'
const HEARTBEAT_INTERVAL_MS = Number(process.env.STREAM_WS_HEARTBEAT_MS || 15000)
const IDLE_TIMEOUT_MS = Number(process.env.STREAM_WS_IDLE_TIMEOUT_MS || 45000)
const PONG_TIMEOUT_MS = Number(process.env.STREAM_WS_PONG_TIMEOUT_MS || Math.max(12000, HEARTBEAT_INTERVAL_MS * 2))

const clients = new Set()
const clientState = new Map()
const recentEvents = []
const MAX_RECENT = 50

let fileCursor = 0
let readBuffer = ''
let reading = false

const ensureEventFile = () => {
  const dir = path.dirname(eventFile)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  if (!fs.existsSync(eventFile)) {
    fs.writeFileSync(eventFile, '')
  }
}

const rememberEvent = (event) => {
  recentEvents.unshift(event)
  if (recentEvents.length > MAX_RECENT) {
    recentEvents.length = MAX_RECENT
  }
}

const broadcast = (payload) => {
  const text = JSON.stringify(payload)
  clients.forEach((client) => {
    if (client.readyState === 1) {
      try {
        client.send(text)
      } catch (_error) {
        clients.delete(client)
        clientState.delete(client)
      }
    }
  })
}

const touchClient = (socket) => {
  const prev = clientState.get(socket) || { lastSeen: Date.now(), awaitingPong: false, pingSentAt: 0 }
  clientState.set(socket, {
    ...prev,
    lastSeen: Date.now(),
    awaitingPong: false,
    pingSentAt: 0
  })
}

const heartbeat = () => {
  const now = Date.now()
  clients.forEach((socket) => {
    const state = clientState.get(socket) || { lastSeen: now, awaitingPong: false, pingSentAt: 0 }

    const idleTooLong = now - state.lastSeen > IDLE_TIMEOUT_MS
    if (idleTooLong || socket.readyState !== 1) {
      try {
        socket.terminate()
      } catch (_error) {
        // ignore terminate error
      }
      clients.delete(socket)
      clientState.delete(socket)
      return
    }

    if (state.awaitingPong) {
      if (state.pingSentAt > 0 && now - state.pingSentAt > PONG_TIMEOUT_MS) {
        try {
          socket.terminate()
        } catch (_error) {
          // ignore terminate error
        }
        clients.delete(socket)
        clientState.delete(socket)
      }
      return
    }

    try {
      state.awaitingPong = true
      state.pingSentAt = now
      state.lastSeen = now
      clientState.set(socket, state)
      socket.ping()
    } catch (_error) {
      clients.delete(socket)
      clientState.delete(socket)
      try {
        socket.terminate()
      } catch (_terminateError) {
        // ignore terminate error
      }
    }
  })
}

const processLines = (textBlock) => {
  const merged = readBuffer + textBlock
  const normalized = merged.replace(/\\n/g, '\n')
  const lines = normalized.split(/\r?\n/)
  readBuffer = lines.pop() || ''

  let count = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    try {
      const event = JSON.parse(trimmed)
      rememberEvent(event)
      broadcast(event)
      count += 1
    } catch (_error) {
      // ignore malformed line
    }
  }

  return count
}

const readNewBytes = () => {
  if (reading) return
  reading = true

  try {
    const stat = fs.statSync(eventFile)

    if (stat.size < fileCursor) {
      fileCursor = 0
      readBuffer = ''
    }

    if (stat.size === fileCursor) {
      return
    }
    const fd = fs.openSync(eventFile, 'r')
    try {
      const bytesToRead = stat.size - fileCursor
      const chunkBuffer = Buffer.allocUnsafe(bytesToRead)
      const readBytes = fs.readSync(fd, chunkBuffer, 0, bytesToRead, fileCursor)
      if (readBytes > 0) {
        const count = processLines(chunkBuffer.toString('utf8', 0, readBytes))
        if (count > 0) {
          console.log(`[ws-stream-bridge] published ${count} event(s)`)
        }
        fileCursor += readBytes
      }
    } finally {
      fs.closeSync(fd)
    }
  } finally {
    reading = false
  }
}

ensureEventFile()
fileCursor = fs.statSync(eventFile).size

const wss = new WebSocketServer({
  port: wsPort,
  path: wsPath
})

wss.on('connection', (socket) => {
  clients.add(socket)
  touchClient(socket)

  if (recentEvents.length > 0) {
    socket.send(JSON.stringify({ records: recentEvents }))
  }

  socket.on('message', (raw) => {
    touchClient(socket)

    try {
      const payload = JSON.parse(String(raw))
      if (payload && typeof payload === 'object' && payload.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }))
      }
      if (payload && typeof payload === 'object' && payload.type === 'pong') {
        const state = clientState.get(socket)
        if (state) {
          state.awaitingPong = false
          state.pingSentAt = 0
          state.lastSeen = Date.now()
          clientState.set(socket, state)
        }
      }
    } catch (_error) {
      // ignore non-json frames
    }
  })

  socket.on('pong', () => {
    const state = clientState.get(socket)
    if (!state) return
    state.awaitingPong = false
    state.pingSentAt = 0
    state.lastSeen = Date.now()
    clientState.set(socket, state)
  })

  socket.on('close', () => {
    clients.delete(socket)
    clientState.delete(socket)
  })

  socket.on('error', () => {
    clients.delete(socket)
    clientState.delete(socket)
  })
})

const attachWatcher = () => {
  try {
    return fs.watch(eventFile, (eventType) => {
      if (eventType === 'rename') {
        ensureEventFile()
      }
      readNewBytes()
    })
  } catch (error) {
    console.error('[ws-stream-bridge] fs.watch failed, fallback to polling:', error?.message || error)
    return null
  }
}

let fileWatcher = attachWatcher()

process.on('uncaughtException', (error) => {
  console.error('[ws-stream-bridge] uncaughtException:', error)
})

process.on('unhandledRejection', (error) => {
  console.error('[ws-stream-bridge] unhandledRejection:', error)
})

setInterval(() => {
  if (!fileWatcher) {
    fileWatcher = attachWatcher()
  }
  ensureEventFile()
  readNewBytes()
}, 1500)

setInterval(() => {
  heartbeat()
}, HEARTBEAT_INTERVAL_MS)

console.log(`[ws-stream-bridge] listening on ws://localhost:${wsPort}${wsPath}`)
console.log(`[ws-stream-bridge] watching ${eventFile}`)
