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
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  entities: new Map(),
  selectedEntity: null,
  connectionStatus: 'connecting',
  wsUrl: `ws://${window.location.hostname}:9121/ws`,
  fps: 0,
  lastUpdate: 0,
  cameraTarget: [0, 0, 0],
  viewMode: '3d',
  showGrid: true,
  showLabels: true,
  hoveredEntity: null,

  setEntities: (entities) => set({
    entities: new Map(entities.map(e => [e.id, e])),
    lastUpdate: Date.now()
  }),

  applyDelta: (delta) => set(state => {
    const newEntities = new Map(state.entities)
    const removed = Array.isArray(delta.removed) ? delta.removed : []
    const added = Array.isArray(delta.added) ? delta.added : []
    const updated = Array.isArray(delta.updated) ? delta.updated : []
    const moved = Array.isArray(delta.moved) ? delta.moved : []
    
    // Remove deleted
    for (const id of removed) {
      newEntities.delete(id)
    }
    
    // Add new
    for (const entity of added) {
      newEntities.set(entity.id, entity)
    }
    
    // Update existing
    for (const entity of updated) {
      newEntities.set(entity.id, entity)
    }
    
    // Move (optimized: just update position without full re-render)
    for (const move of moved) {
      const existing = newEntities.get(move.id)
      if (existing) {
        newEntities.set(move.id, { ...existing, x: move.x, y: move.y, z: move.z })
      }
    }
    
    return { entities: newEntities, lastUpdate: Date.now() }
  }),

  selectEntity: (entity) => set({ selectedEntity: entity }),
  setHoveredEntity: (entity) => set({ hoveredEntity: entity }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setFPS: (fps) => set({ fps }),
  setCameraTarget: (target) => set({ cameraTarget: target }),
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleGrid: () => set(s => ({ showGrid: !s.showGrid })),
  toggleLabels: () => set(s => ({ showLabels: !s.showLabels })),
}))
