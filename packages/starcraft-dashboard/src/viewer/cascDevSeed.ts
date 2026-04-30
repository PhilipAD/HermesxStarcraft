import type { Entity } from './store'
import { useDashboardStore } from './store'

const demoEntities: Entity[] = [
  {
    id: 'cascdev-cc',
    type: 'commandcenter',
    scType: 'CommandCenter',
    cluster: 'command',
    label: 'CASC dev',
    tooltip: 'Demo entity for CASC texture check',
    x: 0,
    y: 0,
    z: 0,
    health: 100,
    maxHealth: 100,
    activity: 'idle',
    color: 0xffaa44,
    emissive: 0x224422,
    scale: [1, 1, 1],
    clickAction: 'none',
    data: {},
    tier: 1,
    age: 0,
  },
  {
    id: 'cascdev-marine',
    type: 'marine',
    scType: 'Marine',
    cluster: 'command',
    label: 'Marine',
    tooltip: 'Demo',
    x: 8,
    y: 0,
    z: 4,
    health: 40,
    maxHealth: 40,
    activity: 'idle',
    color: 0x4488ff,
    emissive: 0x001122,
    scale: [1, 1, 1],
    clickAction: 'none',
    data: {},
    tier: 0,
    age: 0,
  },
]

export function isCascDevMode(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('cascdev') === '1'
}

export function isCascDevBillboardMode(): boolean {
  return isCascDevMode() && import.meta.env.VITE_CASCBRIDGE === '1'
}

/**
 * ?cascdev=1 (dev only): seeds two demo entities. WebSocket stays off.
 * - npm start: ProceduralScene — real Three.js meshes (boxes), not archive GLBs.
 * - npm run start:casc: CascbridgeScene — same entities as DDS billboards (2D on quads), not unit meshes.
 * Full game 3D + sprites: use Titan (?titan=1), not this dashboard.
 */
export function seedCascDevIfRequested(): void {
  if (!import.meta.env.DEV) return
  if (!isCascDevMode()) return

  useDashboardStore.getState().setConnectionStatus('connected')
  useDashboardStore.getState().setEntities(demoEntities)

  if (import.meta.env.VITE_CASCBRIDGE === '1') {
    console.info('[cascdev] CascbridgeScene: two DDS->PNG billboards; bridge WS off for this URL.')
  } else {
    console.info(
      '[cascdev] ProceduralScene: two Three.js box meshes. For DDS billboards restart dev with npm run start:casc. For full in-game 3D use ?titan=1 (Titan).'
    )
  }
}
