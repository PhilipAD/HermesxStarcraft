import { create } from 'zustand'

export interface Entity {
  id: string
  type: string
  scType: string
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
  age: number
}

export interface Delta {
  added: Entity[]
  removed: string[]
  updated: Entity[]
  moved: { id: string; x: number; y: number; z: number }[]
}

/**
 * Live entity event recorded for the on-screen event log.
 *
 * The bridge sends every Hermes change as a delta, which we feed into
 * this rolling buffer so users can see (in real time) what was just
 * spawned, killed, moved or relabeled, without ever having to reload the
 * Titan iframe.
 */
export type LiveEventKind =
  | 'add'
  | 'remove'
  | 'update'
  | 'update_batch'
  | 'move'
  | 'move_batch'
  | 'snapshot'
  | 'connection'

export interface LiveEvent {
  id: number
  ts: number
  kind: LiveEventKind
  entityId?: string
  scType?: string
  label: string
  detail?: string
}

export const LIVE_EVENT_LOG_MAX = 100

/**
 * Per-batch summary of the most recent Hermes delta from the bridge.
 * Drives the live-log panel and enables "Reload Titan" when the store has
 * moved ahead of the last iframe sync (full remount + one postMessage).
 */
export interface PendingDeltaSummary {
  added: number
  removed: number
  updated: number
  moved: number
  ts: number
}

interface DashboardStore {
  entities: Map<string, Entity>
  selectedEntity: Entity | null
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error'
  wsUrl: string
  fps: number
  lastUpdate: number
  cameraTarget: [number, number, number]
  viewMode: '3d' | 'top'
  showGrid: boolean
  showLabels: boolean
  hoveredEntity: Entity | null
  eventLog: LiveEvent[]
  eventLogPaused: boolean
  pendingDeltaCount: number
  lastDeltaSummary: PendingDeltaSummary | null

  // Actions
  setEntities: (entities: Entity[]) => void
  applyDelta: (delta: Delta) => void
  selectEntity: (entity: Entity | null) => void
  setHoveredEntity: (entity: Entity | null) => void
  setConnectionStatus: (status: DashboardStore['connectionStatus']) => void
  setFPS: (fps: number) => void
  setCameraTarget: (target: [number, number, number]) => void
  setViewMode: (mode: DashboardStore['viewMode']) => void
  toggleGrid: () => void
  toggleLabels: () => void
  clearEventLog: () => void
  toggleEventLogPaused: () => void
  markRefreshed: () => void
}

let __liveEventCounter = 0
function nextEventId(): number {
  __liveEventCounter = (__liveEventCounter + 1) & 0x7fffffff
  return __liveEventCounter
}

function appendEvents(log: LiveEvent[], next: LiveEvent[], paused: boolean): LiveEvent[] {
  if (paused || next.length === 0) return log
  const merged = log.concat(next)
  if (merged.length <= LIVE_EVENT_LOG_MAX) return merged
  return merged.slice(merged.length - LIVE_EVENT_LOG_MAX)
}

const LOG_BATCH_THRESHOLD = 5

/**
 * Many Hermes-driven fields change together (layout, stage, activity). The
 * bridge still applies the full delta; the UI log collapses large bursts so
 * one session does not scroll fifty nearly-identical lines.
 */
function collapseVerboseHermesEvents(events: LiveEvent[], ts: number): LiveEvent[] {
  const leading = events.filter(e => e.kind === 'remove' || e.kind === 'add')
  const updates = events.filter(e => e.kind === 'update')
  const moves = events.filter(e => e.kind === 'move')
  const out: LiveEvent[] = [...leading]

  if (updates.length > LOG_BATCH_THRESHOLD) {
    const ids = [...new Set(updates.map(e => e.entityId).filter(Boolean))] as string[]
    const preview = ids.slice(0, 8).join(', ')
    out.push({
      id: nextEventId(),
      ts,
      kind: 'update_batch',
      label: `${updates.length} entity updates (one Hermes poll)`,
      detail: preview ? `${preview}${ids.length > 8 ? ', …' : ''}` : undefined,
    })
  } else {
    out.push(...updates)
  }

  if (moves.length > LOG_BATCH_THRESHOLD) {
    out.push({
      id: nextEventId(),
      ts,
      kind: 'move_batch',
      label: `${moves.length} layout moves (one Hermes poll)`,
      detail: 'cluster positions shifted together',
    })
  } else {
    out.push(...moves)
  }

  return out
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  entities: new Map(),
  selectedEntity: null,
  connectionStatus: 'connecting',
  wsUrl: `ws://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:9121/ws`,
  fps: 0,
  lastUpdate: 0,
  cameraTarget: [0, 0, 0],
  viewMode: '3d',
  showGrid: true,
  showLabels: true,
  hoveredEntity: null,
  eventLog: [],
  eventLogPaused: false,
  pendingDeltaCount: 0,
  lastDeltaSummary: null,

  setEntities: (entities) => set(state => {
    const ts = Date.now()
    const events: LiveEvent[] = [{
      id: nextEventId(),
      ts,
      kind: 'snapshot',
      label: `snapshot (${entities.length} entities)`,
      detail: `replaced live entity set`,
    }]
    return {
      entities: new Map(entities.map(e => [e.id, e])),
      lastUpdate: ts,
      eventLog: appendEvents(state.eventLog, events, state.eventLogPaused),
      pendingDeltaCount: 0,
      lastDeltaSummary: null,
    }
  }),

  applyDelta: (delta) => set(state => {
    const newEntities = new Map(state.entities)
    const removed = Array.isArray(delta.removed) ? delta.removed : []
    const added = Array.isArray(delta.added) ? delta.added : []
    const updated = Array.isArray(delta.updated) ? delta.updated : []
    const moved = Array.isArray(delta.moved) ? delta.moved : []

    const ts = Date.now()
    const events: LiveEvent[] = []

    for (const id of removed) {
      const prev = newEntities.get(id)
      newEntities.delete(id)
      events.push({
        id: nextEventId(),
        ts,
        kind: 'remove',
        entityId: id,
        scType: prev?.scType,
        label: prev?.label ? `kill ${prev.label}` : `kill ${id}`,
        detail: prev ? `${prev.scType} (${prev.cluster})` : undefined,
      })
    }

    for (const entity of added) {
      newEntities.set(entity.id, entity)
      events.push({
        id: nextEventId(),
        ts,
        kind: 'add',
        entityId: entity.id,
        scType: entity.scType,
        label: `spawn ${entity.label || entity.id}`,
        detail: `${entity.scType} (${entity.cluster})`,
      })
    }

    for (const entity of updated) {
      const prev = newEntities.get(entity.id)
      newEntities.set(entity.id, entity)
      const activityChanged = prev?.activity && prev.activity !== entity.activity
      events.push({
        id: nextEventId(),
        ts,
        kind: 'update',
        entityId: entity.id,
        scType: entity.scType,
        label: `update ${entity.label || entity.id}`,
        detail: activityChanged
          ? `${prev?.activity} -> ${entity.activity}`
          : `${entity.scType} (${entity.cluster})`,
      })
    }

    for (const move of moved) {
      const existing = newEntities.get(move.id)
      if (existing) {
        newEntities.set(move.id, { ...existing, x: move.x, y: move.y, z: move.z })
        events.push({
          id: nextEventId(),
          ts,
          kind: 'move',
          entityId: move.id,
          scType: existing.scType,
          label: `move ${existing.label || move.id}`,
          detail: `to (${Math.round(move.x)}, ${Math.round(move.y)}, ${Math.round(move.z)})`,
        })
      }
    }

    const changeCount = added.length + removed.length + updated.length + moved.length
    const nextPendingCount = changeCount > 0
      ? state.pendingDeltaCount + changeCount
      : state.pendingDeltaCount
    const nextSummary: PendingDeltaSummary | null = changeCount > 0
      ? {
        added: added.length,
        removed: removed.length,
        updated: updated.length,
        moved: moved.length,
        ts,
      }
      : state.lastDeltaSummary

    const logEvents = collapseVerboseHermesEvents(events, ts)

    return {
      entities: newEntities,
      lastUpdate: ts,
      eventLog: appendEvents(state.eventLog, logEvents, state.eventLogPaused),
      pendingDeltaCount: nextPendingCount,
      lastDeltaSummary: nextSummary,
    }
  }),

  selectEntity: (entity) => set({ selectedEntity: entity }),
  setHoveredEntity: (entity) => set({ hoveredEntity: entity }),
  setConnectionStatus: (status) => set(state => {
    if (state.connectionStatus === status) return {}
    const event: LiveEvent = {
      id: nextEventId(),
      ts: Date.now(),
      kind: 'connection',
      label: `bridge ${status}`,
      detail: `${state.connectionStatus} -> ${status}`,
    }
    return {
      connectionStatus: status,
      eventLog: appendEvents(state.eventLog, [event], state.eventLogPaused),
    }
  }),
  setFPS: (fps) => set({ fps }),
  setCameraTarget: (target) => set({ cameraTarget: target }),
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleGrid: () => set(s => ({ showGrid: !s.showGrid })),
  toggleLabels: () => set(s => ({ showLabels: !s.showLabels })),
  clearEventLog: () => set({ eventLog: [] }),
  toggleEventLogPaused: () => set(s => ({ eventLogPaused: !s.eventLogPaused })),
  markRefreshed: () => set({ pendingDeltaCount: 0, lastDeltaSummary: null }),
}))
