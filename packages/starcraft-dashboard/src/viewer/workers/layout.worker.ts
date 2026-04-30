/**
 * Self-Organizing Layout Web Worker — StarCraft Empire Edition
 * 
 * Authentic SC base layout:
 * - Command Center at center (main base, fixed)
 * - Tech buildings cluster nearby (Engineering Bay, Armory, etc.)
 * - Production buildings on the flank (Barracks, Factory)
 * - Units patrol in loose formations outside base
 * - Resources (Vespene Geysers) positioned at back/sides
 * - Supply Depots form a wall
 * 
 * Force-directed simulation with SC constraints.
 */

interface LayoutEntity {
  id: string
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  cluster: string
  mass: number
  fixed: boolean
  scType: string
  activity: string
}

interface ClusterCenter {
  x: number
  y: number
  z: number
  type: 'base' | 'resource' | 'production' | 'defense' | 'units'
}

interface LayoutConfig {
  repulsion: number
  attraction: number
  gravity: number
  damping: number
  minDist: number
  maxSpeed: number
  iterationsPerFrame: number
}

const DEFAULT_CONFIG: LayoutConfig = {
  repulsion: 600,
  attraction: 0.008,
  gravity: 0.015,
  damping: 0.88,
  minDist: 3.5,
  maxSpeed: 2.5,
  iterationsPerFrame: 12,
}

let entities = new Map<string, LayoutEntity>()
let config = DEFAULT_CONFIG
let running = false
let animationId: ReturnType<typeof setTimeout> | null = null

// SC-style zone centers (where different building types tend to cluster)
const ZONE_CENTERS: Record<string, ClusterCenter> = {
  command:    { x:  0,   y: 0, z:  0,   type: 'base' },
  tech:       { x:  8,   y: 0, z:  8,   type: 'base' },
  production: { x: -10,  y: 0, z:  5,   type: 'production' },
  resource:   { x:  0,   y: 0, z: -18,  type: 'resource' },
  units:      { x:  15,  y: 0, z:  12,  type: 'production' },
  memory:     { x: -8,   y: 0, z: -8,   type: 'defense' },
  cron:       { x:  12,  y: 0, z: -10,  type: 'units' },
}

// ─── Message Handlers ────────────────────────────────────────────────────────
self.onmessage = (event: MessageEvent) => {
  const { type, data } = event.data

  switch (type) {
    case 'init':
      initEntities(data.entities)
      break
    case 'update_config':
      config = { ...config, ...data }
      break
    case 'tick':
      tick()
      break
    case 'start':
      if (!running) {
        running = true
        scheduleTick()
      }
      break
    case 'stop':
      running = false
      if (animationId) {
        clearTimeout(animationId)
        animationId = null
      }
      break
    case 'add_entity':
      addEntity(data.entity)
      break
    case 'remove_entity':
      entities.delete(data.id)
      break
  }
}

// ─── Entity Management ────────────────────────────────────────────────────────
function initEntities(entityData: any[]) {
  entities.clear()

  for (const e of entityData) {
    entities.set(e.id, {
      id: e.id,
      x: e.x || 0,
      y: e.y || 0,
      z: e.z || 0,
      vx: 0,
      vy: 0,
      vz: 0,
      cluster: e.cluster || 'command',
      mass: e.tier || 1,
      fixed: e.scType === 'CommandCenter', // CC is always fixed at center
      scType: e.scType || 'Unknown',
      activity: e.activity || 'idle',
    })
  }
}

function addEntity(entity: any) {
  entities.set(entity.id, {
    id: entity.id,
    x: entity.x || 0,
    y: entity.y || 0,
    z: entity.z || 0,
    vx: 0,
    vy: 0,
    vz: 0,
    cluster: entity.cluster || 'command',
    mass: entity.tier || 1,
    fixed: entity.scType === 'CommandCenter',
    scType: entity.scType || 'Unknown',
    activity: entity.activity || 'idle',
  })
}

// ─── SC-Style Zone Assignment ───────────────────────────────────────────────
function getZoneCenter(entity: LayoutEntity): ClusterCenter {
  // Map Hermes cluster/scType to SC zone
  switch (entity.scType) {
    case 'CommandCenter':
      return ZONE_CENTERS.command
    case 'TechBuilding':
      return ZONE_CENTERS.tech
    case 'Barracks':
    case 'Factory':
      return ZONE_CENTERS.production
    case 'SupplyDepot':
      return { x: 4, y: 0, z: 4, type: 'defense' } // Wall position
    case 'Bunker':
      return { x: -5, y: 0, z: 10, type: 'defense' }
    case 'Gateway':
      return ZONE_CENTERS.production
    case 'VespeneGeyser':
      return ZONE_CENTERS.resource
    case 'SCV':
      return { x: 5, y: 0, z: -15, type: 'units' } // Near resources
    case 'Marine':
    case 'Zealot':
      return ZONE_CENTERS.units
    default:
      return ZONE_CENTERS.command
  }
}

// ─── Layout Algorithm ─────────────────────────────────────────────────────────
function tick() {
  const entities_arr = Array.from(entities.values())
  const n = entities_arr.length

  for (let iter = 0; iter < config.iterationsPerFrame; iter++) {
    // Reset forces
    for (const e of entities_arr) {
      e.vx = 0
      e.vy = 0
      e.vz = 0
    }

    // Pairwise repulsion (only check when within interaction range)
    for (let i = 0; i < n; i++) {
      const a = entities_arr[i]
      for (let j = i + 1; j < n; j++) {
        const b = entities_arr[j]

        const dx = b.x - a.x
        const dz = b.z - a.z
        const distSq = dx * dx + dz * dz
        const dist = Math.sqrt(distSq) || 0.001
        const minDist = config.minDist * (a.mass + b.mass) * 0.5

        if (dist < minDist * 6) {
          const force = config.repulsion / (distSq + 1)
          const fx = (dx / dist) * force
          const fz = (dz / dist) * force

          if (!a.fixed) {
            a.vx -= fx / a.mass
            a.vz -= fz / a.mass
          }
          if (!b.fixed) {
            b.vx += fx / b.mass
            b.vz += fz / b.mass
          }
        }
      }
    }

    // Zone gravity + SC-type-specific forces
    for (const e of entities_arr) {
      if (e.fixed) continue

      const zone = getZoneCenter(e)

      // Primary zone pull
      const pullStrength = config.gravity * (e.scType === 'SupplyDepot' ? 1.5 : 1.0)
      e.vx += (zone.x - e.x) * pullStrength
      e.vz += (zone.z - e.z) * pullStrength

      // SC-type separation (prevents overlap)
      if (e.scType === 'VespeneGeyser') {
        // Keep geysers apart
        for (const other of entities_arr) {
          if (other.id === e.id || other.scType !== 'VespeneGeyser') continue
          const dx = e.x - other.x
          const dz = e.z - other.z
          const dist = Math.sqrt(dx * dx + dz * dz) || 0.001
          if (dist < 8) {
            e.vx += (dx / dist) * 0.5
            e.vz += (dz / dist) * 0.5
          }
        }
      }

      // Supply depot wall effect (line up in a row)
      if (e.scType === 'SupplyDepot') {
        // Find other supply depots and form a line
        let wallX = 0
        let wallCount = 0
        for (const other of entities_arr) {
          if (other.id === e.id || other.scType !== 'SupplyDepot') continue
          wallX += other.x
          wallCount++
        }
        if (wallCount > 0) {
          wallX /= wallCount
          e.vx += (wallX - e.x) * 0.03
          e.vz += (4 - e.z) * 0.05 // Line up at z=4
        }
      }

      // Unit patrol separation (spread out)
      if (e.scType === 'Marine' || e.scType === 'Zealot' || e.scType === 'SCV') {
        for (const other of entities_arr) {
          if (other.id === e.id) continue
          const sameType = other.scType === e.scType
          const dx = e.x - other.x
          const dz = e.z - other.z
          const dist = Math.sqrt(dx * dx + dz * dz) || 0.001
          if (dist < 5) {
            const repel = sameType ? 0.3 : 0.1
            e.vx += (dx / dist) * repel
            e.vz += (dz / dist) * repel
          }
        }
      }

      // Ground constraint (terrain surface)
      e.vy = 0
      if (e.y < 0.5) {
        e.vy = 0.2
      }

      // Damping
      e.vx *= config.damping
      e.vy *= config.damping
      e.vz *= config.damping

      // Speed limit
      const speed = Math.sqrt(e.vx * e.vx + e.vy * e.vy + e.vz * e.vz)
      if (speed > config.maxSpeed) {
        const scale = config.maxSpeed / speed
        e.vx *= scale
        e.vy *= scale
        e.vz *= scale
      }
    }

    // Apply velocities
    for (const e of entities_arr) {
      if (e.fixed) continue
      e.x += e.vx
      e.y = Math.max(0, e.y + e.vy)
      e.z += e.vz

      // SC map boundary
      e.x = Math.max(-80, Math.min(80, e.x))
      e.z = Math.max(-80, Math.min(80, e.z))
    }
  }

  // Send results
  const positions = Array.from(entities.values()).map(e => ({
    id: e.id,
    x: e.x,
    y: e.y,
    z: e.z,
  }))

  self.postMessage({ type: 'positions', positions })
}

function scheduleTick() {
  if (!running) return
  animationId = setTimeout(() => {
    tick()
    scheduleTick()
  }, 50)
}
