/**
 * Hermes StarCraft Dashboard — Bridge Service
 * 
 * Reads Hermes Agent state (SQLite + filesystem) and pushes
 * delta updates to connected Three.js viewers via WebSocket.
 * 
 * Architecture:
 *   Hermes SQLite (state.db) ──→ Bridge ──→ WebSocket ──→ Three.js Viewer
 *   Hermes filesystem ──────────→ Bridge ──→ HTTP REST  ──→ Viewer
 * 
 * Zero Hermes core changes. Fully standalone.
 */

import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import { HermesStateReader } from './hermesState.js'
import { DashboardStateReader } from './dashboardState.js'
import { EntityMapper } from './entityMapper.js'
import { DeltaEngine } from './deltaEngine.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BRIDGE_PORT = 9121
const HERMES_HOME = process.env.HERMES_HOME || path.join(process.env.HOME || '/home/rdpuser', '.hermes')

// ─── Express App ───────────────────────────────────────────────────────────
const app = express()
app.use(express.json())

// CORS for local development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  next()
})

// ─── State Management ──────────────────────────────────────────────────────
const fallbackStateReader = new HermesStateReader(HERMES_HOME)
const stateReader = new DashboardStateReader(fallbackStateReader)
const entityMapper = new EntityMapper(path.join(__dirname, '../config/mapping.json'))
const deltaEngine = new DeltaEngine()

// Current entity snapshot
let currentEntities: Entity[] = []
let lastHash = ''

// ─── HTTP API ─────────────────────────────────────────────────────────────
app.get('/api/state', (req, res) => {
  res.json({ entities: currentEntities, timestamp: Date.now() })
})

app.get('/api/state/full', async (req, res) => {
  const full = await stateReader.getFullState()
  const mapped = entityMapper.mapState(full)
  res.json({ entities: mapped, timestamp: Date.now(), hermes: full })
})

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    entities: currentEntities.length,
    hermesHome: HERMES_HOME,
    memoryUsage: process.memoryUsage()
  })
})

// ─── WebSocket Server ──────────────────────────────────────────────────────
const httpServer = createServer(app)
const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

const clients = new Set<WebSocket>()

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress
  console.log(`[Bridge] Client connected: ${ip} (total: ${clients.size + 1})`)
  clients.add(ws)

  // Send current state immediately on connect
  const snapshot = {
    type: 'snapshot',
    entities: currentEntities,
    timestamp: Date.now(),
    mapping: entityMapper.getMappingSummary()
  }
  ws.send(JSON.stringify(snapshot))

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      handleClientMessage(ws, msg)
    } catch (e) {
      console.warn('[Bridge] Invalid message from client:', e)
    }
  })

  ws.on('close', () => {
    clients.delete(ws)
    console.log(`[Bridge] Client disconnected: ${ip} (remaining: ${clients.size})`)
  })

  ws.on('error', (err) => {
    console.error(`[Bridge] WS error: ${err.message}`)
    clients.delete(ws)
  })
})

function handleClientMessage(ws: WebSocket, msg: any) {
  switch (msg.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
      break
    case 'request_full_state':
      stateReader.getFullState()
        .then(full => {
          const mapped = entityMapper.mapState(full)
          currentEntities = mapped
          ws.send(JSON.stringify({ type: 'snapshot', entities: mapped, timestamp: Date.now() }))
        })
        .catch(err => {
          ws.send(JSON.stringify({ type: 'error', message: err instanceof Error ? err.message : String(err), timestamp: Date.now() }))
        })
      break
    case 'subscribe':
      // Already subscribed by default
      break
  }
}

// ─── Broadcast Helper ───────────────────────────────────────────────────────
function broadcast(data: any, exclude?: WebSocket) {
  const msg = JSON.stringify(data)
  for (const client of clients) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(msg)
    }
  }
}

// ─── Polling Loop ───────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 3000

async function pollHermes() {
  try {
    const raw = await stateReader.getFullState()
    const newEntities = entityMapper.mapState(raw)
    
    // Compute delta
    const delta = deltaEngine.computeDelta(currentEntities, newEntities)
    
    if (deltaEngine.hasChanges(delta)) {
      currentEntities = newEntities
      
      // Broadcast to all connected clients
      broadcast({
        type: 'delta',
        delta,
        entities: newEntities,
        timestamp: Date.now()
      })
      
      console.log(`[Bridge] Delta: +${delta.added.length} -${delta.removed.length} ~${delta.updated.length} (total: ${newEntities.length})`)
    }
  } catch (err) {
    console.error('[Bridge] Poll error:', err)
  }
}

// ─── Startup ───────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║  Hermes StarCraft Dashboard — Bridge Service  ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log(`[Config] Hermes Home: ${HERMES_HOME}`)
  console.log(`[Config] Bridge Port: ${BRIDGE_PORT}`)
  console.log(`[Config] Poll Interval: ${POLL_INTERVAL_MS}ms`)

  // Initial state load
  try {
    const raw = await stateReader.getFullState()
    currentEntities = entityMapper.mapState(raw)
    console.log(`[Bridge] Initial load: ${currentEntities.length} entities`)
  } catch (err) {
    console.warn('[Bridge] Initial load failed (will retry):', err)
  }

  // Start polling
  setInterval(pollHermes, POLL_INTERVAL_MS)

  // Start server
  httpServer.listen(BRIDGE_PORT, '127.0.0.1', () => {
    console.log(`[Bridge] HTTP/WS server running on http://127.0.0.1:${BRIDGE_PORT}`)
    console.log(`[Bridge] WebSocket endpoint: ws://127.0.0.1:${BRIDGE_PORT}/ws`)
    console.log(`[Bridge] Ready for connections...`)
  })

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[Bridge] Shutting down...')
    wss.close()
    httpServer.close()
    process.exit(0)
  })
}

main().catch(console.error)

// ─── Types ─────────────────────────────────────────────────────────────────
export interface Entity {
  id: string
  type: string
  scType: string  // StarCraft entity type (CommandCenter, Marine, SCV, etc.)
  cluster: string
  label: string
  tooltip: string
  x: number
  y: number
  z: number
  health: number
  maxHealth: number
  activity: 'idle' | 'active' | 'building' | 'mining' | 'patrol' | 'dead'
  color: number
  emissive: number
  scale: [number, number, number]
  clickAction: string
  data: Record<string, any>
  tier: number
  age: number  // seconds since entity first appeared
}

export interface Delta {
  added: Entity[]
  removed: string[]   // entity IDs removed
  updated: Entity[]
  moved: { id: string; x: number; y: number; z: number }[]
}
