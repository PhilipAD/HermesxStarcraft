import { useDashboardStore } from '../store'
import { entityDisplayLabel } from '../entityDisplay'

/**
 * Description popup for clicked Titan units.
 *
 * Titan's WorldComposer emits a postMessage of the form
 *   { type: 'titan:selected-units', units: TitanSelectedUnit[] }
 * whenever the user clicks a unit / building / drags a selection box.
 *
 * We render a side-card showing the unit name, owner, hp/shields, and any
 * Hermes entity that maps onto the unit type (so the user can see what part of
 * their Hermes stack a Command Center / Tech Building / SCV represents).
 */
export interface TitanSelectedUnit {
  id: number
  hermesId?: string | null
  typeId: number
  owner: number
  x: number
  y: number
  hp: number
  shields: number
  energy: number
  typeName: string | null
  isBuilding: boolean
  isResourceContainer: boolean
}

export interface TitanUnitInspectorProps {
  units: TitanSelectedUnit[]
  onClose: () => void
}

const HERMES_TYPE_HINTS: Record<string, string[]> = {
  CommandCenter: ['command_center', 'core_agent', 'CommandCenter'],
  TechBuilding: ['skill', 'TechBuilding'],
  SCV: ['worker', 'tool', 'SCV'],
  Marine: ['marine', 'session', 'Marine'],
  Refinery: ['refinery', 'cache', 'Refinery'],
  Barracks: ['barracks', 'queue', 'Barracks'],
  SupplyDepot: ['supply', 'memory', 'SupplyDepot'],
  Bunker: ['bunker', 'guard', 'Bunker'],
  MineralField: ['mineral', 'resource'],
  VespeneGeyser: ['vespene', 'fuel'],
}

export function TitanUnitInspector({ units, onClose }: TitanUnitInspectorProps) {
  const entities = useDashboardStore((s) => s.entities)

  if (!units || units.length === 0) return null

  const u = units[0]
  const typeName = u.typeName || `Unit#${u.typeId}`

  const matchedEntities = (() => {
    const hits = HERMES_TYPE_HINTS[typeName] || []
    if (hits.length === 0) return []
    const out: { id: string; label: string; scType: string; tooltip: string }[] = []
    for (const e of entities.values()) {
      for (const h of hits) {
        const lc = h.toLowerCase()
        if (
          e.scType === h ||
          e.id.toLowerCase().includes(lc) ||
          (e.label || '').toLowerCase().includes(lc)
        ) {
          out.push({
            id: e.id,
            label: e.label,
            scType: e.scType,
            tooltip: e.tooltip || '',
          })
          break
        }
      }
      if (out.length >= 6) break
    }
    return out
  })()

  return (
    <div
      data-testid="titan-unit-inspector"
      style={{
        position: 'fixed',
        left: 12,
        bottom: 12,
        width: 320,
        maxHeight: '60vh',
        background: 'rgba(4,12,24,0.92)',
        border: '1px solid #1e5a82',
        borderRadius: 4,
        color: '#bfe',
        fontFamily: '"Courier New", ui-monospace, monospace',
        fontSize: 11,
        zIndex: 1100,
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 10px',
          background: 'rgba(10,30,50,0.85)',
          borderBottom: '1px solid #153a52',
        }}
      >
        <strong style={{ color: '#5cf', flex: 1, letterSpacing: 1 }}>
          UNIT INSPECTOR
        </strong>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            color: '#9cf',
            border: '1px solid #1e5a82',
            padding: '1px 6px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 10,
          }}
          aria-label="close inspector"
        >
          x
        </button>
      </div>

      <div style={{ padding: '8px 12px', display: 'grid', gap: 4 }}>
        <div style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>
          {typeName}
          {u.isBuilding ? ' (building)' : u.isResourceContainer ? ' (resource)' : ''}
        </div>
        <div style={{ color: '#9cf' }}>
          ID <span style={{ color: '#fff' }}>{u.id}</span> · TypeID{' '}
          <span style={{ color: '#fff' }}>{u.typeId}</span> · Player{' '}
          <span style={{ color: '#fff' }}>{u.owner}</span>
        </div>
        <div style={{ color: '#9cf' }}>
          HP <span style={{ color: '#fff' }}>{u.hp}</span> · Shields{' '}
          <span style={{ color: '#fff' }}>{u.shields}</span> · Energy{' '}
          <span style={{ color: '#fff' }}>{u.energy}</span>
        </div>
        <div style={{ color: '#9cf' }}>
          POS{' '}
          <span style={{ color: '#fff' }}>
            ({u.x.toFixed(1)}, {u.y.toFixed(1)})
          </span>
        </div>
        {units.length > 1 && (
          <div style={{ color: '#888' }}>
            +{units.length - 1} more selected (click one to inspect)
          </div>
        )}
      </div>

      {matchedEntities.length > 0 && (
        <div
          style={{
            borderTop: '1px solid #153a52',
            padding: '6px 12px',
            background: 'rgba(10,20,30,0.6)',
          }}
        >
          <div style={{ color: '#5cf', fontSize: 10, marginBottom: 4 }}>
            HERMES ENTITIES MATCHING THIS UNIT TYPE
          </div>
          {matchedEntities.map((e) => (
            <div
              key={e.id}
              title={e.tooltip}
              style={{
                color: '#cfe',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontSize: 10,
                padding: '2px 0',
              }}
            >
              <span style={{ color: '#7af' }}>[{e.scType}]</span> {entityDisplayLabel(e)}
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          padding: '4px 12px',
          color: '#666',
          fontSize: 9,
          borderTop: '1px solid #153a52',
        }}
      >
        Drag mouse to rotate · right-drag to pan · wheel to zoom · click a unit
      </div>
    </div>
  )
}
