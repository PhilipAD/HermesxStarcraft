import { useMemo, useState } from 'react'
import { useDashboardStore, type Entity } from '../store'
import { entityDisplayLabel } from '../entityDisplay'

/**
 * HUD + entity panel rendered on top of the Titan iframe.
 * pointerEvents: 'none' on the outer layer lets clicks pass through to Titan
 * except on interactive children (buttons, list items) that re-enable pointer events.
 */
export interface TitanHermesOverlayProps {
  onOpenMapPicker?: () => void
  chosenMapPath?: string | null
  mapCount?: number
  mapListError?: string | null
  entitiesOverride?: Map<string, Entity>
  editMode?: boolean
  onResetRaceSelection?: () => void
  /**
   * Click handler for an entity row. The dashboard wires this to a
   * postMessage that tells the Titan iframe to pan the camera to the
   * mapped SC unit and select it (which in turn opens the unit
   * inspector via the existing titan:selected-units round-trip).
   */
  onFocusEntity?: (hermesId: string) => void
}

export function TitanHermesOverlay({
  onOpenMapPicker,
  chosenMapPath,
  mapCount = 0,
  mapListError = null,
  entitiesOverride,
  editMode = false,
  onResetRaceSelection,
  onFocusEntity,
}: TitanHermesOverlayProps = {}) {
  const storeEntities = useDashboardStore((s) => s.entities)
  const entities = entitiesOverride ?? storeEntities
  const connectionStatus = useDashboardStore((s) => s.connectionStatus)
  const [panelOpen, setPanelOpen] = useState<boolean>(false)

  const mapBasename = chosenMapPath ? chosenMapPath.split('/').pop() : null

  const clusterCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of entities.values()) {
      counts[e.cluster] = (counts[e.cluster] || 0) + 1
    }
    return counts
  }, [entities])

  const sortedEntities = useMemo(() => {
    return Array.from(entities.values())
      .sort((a, b) => b.tier - a.tier || b.health - a.health)
  }, [entities])

  const statusColor =
    connectionStatus === 'connected'
      ? '#2faa4e'
      : connectionStatus === 'connecting'
        ? '#e39b0a'
        : '#c43838'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1000,
        fontFamily: '"Courier New", ui-monospace, monospace',
        color: '#bfe',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 40,
          background: 'linear-gradient(to bottom, rgba(0,10,25,0.92), rgba(0,10,25,0.55))',
          borderBottom: '1px solid #0a3a4a',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 16,
          fontSize: 12,
          pointerEvents: 'auto',
        }}
      >
        <span style={{ color: '#5cf', fontWeight: 'bold' }}>HERMES × TITAN</span>
        <span style={{ color: '#888' }}>|</span>
        <span
          style={{
            padding: '2px 8px',
            background: statusColor,
            color: '#fff',
            fontSize: 10,
            borderRadius: 2,
          }}
          title={`Bridge WS ${connectionStatus}`}
        >
          BRIDGE {connectionStatus.toUpperCase()}
        </span>
        <span style={{ color: '#888' }}>|</span>
        <span>
          ENTS <strong style={{ color: '#fff' }}>{entities.size}</strong>
        </span>
        {Object.entries(clusterCounts)
          .slice(0, 4)
          .map(([k, v]) => (
            <span key={k} style={{ color: '#9cf' }}>
              {k.toUpperCase().slice(0, 4)}{' '}
              <strong style={{ color: '#fff' }}>{v}</strong>
            </span>
          ))}
        <span style={{ color: '#888' }}>|</span>
        <button
          onClick={() => onOpenMapPicker && onOpenMapPicker()}
          title={
            mapListError
              ? `maps-list error: ${mapListError}`
              : `${mapCount} map file(s) from SC_ROOT/Maps`
          }
          style={{
            background: 'transparent',
            color: mapListError ? '#faa' : '#9cf',
            border: '1px solid #1e5a82',
            padding: '2px 8px',
            cursor: onOpenMapPicker ? 'pointer' : 'default',
            fontFamily: 'inherit',
            fontSize: 11,
            maxWidth: 260,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          MAP {mapBasename || (mapListError ? 'none (error)' : 'home scene')}
        </button>
        <div style={{ flex: 1 }} />
        <button
          data-testid="titan-edit-mode-toggle"
          disabled
          title="WIP"
          style={{
            background: '#13202c',
            color: '#6f8790',
            border: '1px solid #263b48',
            padding: '2px 10px',
            cursor: 'not-allowed',
            fontFamily: 'inherit',
            fontSize: 11,
            opacity: 0.75,
          }}
        >
          {editMode ? 'EDIT MODE ON' : 'edit mode'}
        </button>
        <button
          data-testid="titan-race-select-reset"
          onClick={() => onResetRaceSelection && onResetRaceSelection()}
          title="Reload Titan and return to the StarCraft race selection screen"
          style={{
            background: '#11324a',
            color: '#cfe',
            border: '1px solid #1e5a82',
            padding: '2px 10px',
            cursor: onResetRaceSelection ? 'pointer' : 'default',
            fontFamily: 'inherit',
            fontSize: 11,
          }}
        >
          race select
        </button>
        <button
          onClick={() => setPanelOpen((v) => !v)}
          style={{
            background: '#11324a',
            color: '#cfe',
            border: '1px solid #1e5a82',
            padding: '2px 10px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 11,
          }}
        >
          {panelOpen ? 'hide entities' : 'show entities'}
        </button>
      </div>

      {panelOpen && (
        <div
          style={{
            position: 'absolute',
            top: 48,
            right: 8,
            bottom: 8,
            width: 280,
            background: 'rgba(4,12,24,0.88)',
            border: '1px solid #153a52',
            borderRadius: 4,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              padding: '8px 10px',
              background: 'rgba(10,30,50,0.7)',
              borderBottom: '1px solid #153a52',
              fontSize: 11,
              color: '#9cf',
              letterSpacing: 1,
            }}
          >
            HERMES ENTITIES ({sortedEntities.length} / {entities.size})
          </div>
          <div style={{ overflow: 'auto', flex: 1 }}>
            {sortedEntities.length === 0 && (
              <div style={{ padding: 12, color: '#888', fontSize: 11 }}>
                Waiting for bridge data…
              </div>
            )}
            {sortedEntities.map((e) => {
              // VespeneGeyser entities are intentionally not spawned by the
              // Titan bridge (they live on the map as neutral resources).
              // Don't pretend they're clickable.
              const focusable = e.scType !== 'VespeneGeyser'
              const clickable = typeof onFocusEntity === 'function' && focusable
              const displayLabel = entityDisplayLabel(e)
              return (
                <div
                  key={e.id}
                  data-hermes-entity-id={e.id}
                  data-hermes-clickable={clickable ? '1' : '0'}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={
                    clickable ? () => onFocusEntity!(e.id) : undefined
                  }
                  onKeyDown={
                    clickable
                      ? (ev) => {
                          if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault()
                            onFocusEntity!(e.id)
                          }
                        }
                      : undefined
                  }
                  style={{
                    padding: '6px 10px',
                    borderBottom: '1px solid #0b2232',
                    fontSize: 11,
                    cursor: clickable ? 'pointer' : 'default',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    transition: 'background 80ms ease-out',
                  }}
                  onMouseEnter={(ev) => {
                    if (!clickable) return
                    ;(ev.currentTarget as HTMLDivElement).style.background =
                      'rgba(20,60,100,0.55)'
                  }}
                  onMouseLeave={(ev) => {
                    if (!clickable) return
                    ;(ev.currentTarget as HTMLDivElement).style.background =
                      'transparent'
                  }}
                  title={
                    clickable
                      ? `Click to center the camera on ${displayLabel} (${e.scType})`
                      : `${e.scType} - ${e.tooltip || ''}`
                  }
                >
                  <span
                    style={{
                      color: '#cfe',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      flex: 1,
                    }}
                  >
                    {displayLabel}
                  </span>
                  <span style={{ color: '#7af', fontSize: 10 }}>{e.scType}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
