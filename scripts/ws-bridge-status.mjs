import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const eventFile = path.resolve(__dirname, '../../charging-aiot-php/runtime/ws_events.jsonl')
const wsPort = Number(process.env.STREAM_WS_PORT || 8080)
const bridgeService = process.env.STREAM_WS_SERVICE || 'charging-ws-bridge'

const checkPort = (port, host = '127.0.0.1') => {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host })
    const done = (ok, message = '') => {
      socket.destroy()
      resolve({ ok, message })
    }

    socket.setTimeout(1500)
    socket.on('connect', () => done(true))
    socket.on('timeout', () => done(false, 'timeout'))
    socket.on('error', (error) => done(false, error?.message || 'connect failed'))
  })
}

const formatTs = (valueMs) => {
  if (!valueMs || !Number.isFinite(valueMs)) return '--'
  return new Date(valueMs).toISOString().replace('T', ' ').replace('Z', ' UTC')
}

const main = async () => {
  const portResult = await checkPort(wsPort)

  const runtimeDir = path.dirname(eventFile)
  const runtimeExists = fs.existsSync(runtimeDir)
  const fileExists = fs.existsSync(eventFile)
  const stat = fileExists ? fs.statSync(eventFile) : null

  console.log(`WS bridge service : ${bridgeService}`)
  console.log(`WS port           : ${wsPort} (${portResult.ok ? 'open' : `closed: ${portResult.message}`})`)
  console.log(`Runtime dir       : ${runtimeDir}`)
  console.log(`Runtime exists    : ${runtimeExists ? 'yes' : 'no'}`)
  console.log(`Event file        : ${eventFile}`)
  console.log(`Event file exists : ${fileExists ? 'yes' : 'no'}`)
  console.log(`Event file size   : ${stat ? stat.size : 0}`)
  console.log(`Event file mtime  : ${stat ? formatTs(stat.mtimeMs) : '--'}`)

  if (fileExists) {
    try {
      const data = fs.readFileSync(eventFile, 'utf8')
      const lines = data.split(/\r?\n/).filter((line) => line.trim() !== '')
      console.log(`Event lines       : ${lines.length}`)
      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1]
        console.log(`Last event sample : ${lastLine.slice(0, 220)}`)
      }
    } catch (error) {
      console.log(`Event read error  : ${error?.message || error}`)
    }
  }
}

main().catch((error) => {
  console.error('[ws-bridge-status] failed:', error)
  process.exit(1)
})
