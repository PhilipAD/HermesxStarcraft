import { useDashboardStore } from '../store'
import { entityDisplayLabel } from '../entityDisplay'

export function EntityPanel() {
  const { selectedEntity, selectEntity, entities } = useDashboardStore()

  if (!selectedEntity) return null

  const entity = selectedEntity
  const healthPct = Math.round((entity.health / Math.max(1, entity.maxHealth)) * 100)
  const healthColor = healthPct > 60 ? '#00ff00' : healthPct > 30 ? '#ffcc00' : '#ff0000'
  const dashboardRoute = typeof entity.data?.dashboardRoute === 'string' ? entity.data.dashboardRoute : '/sessions'
  const dashboardBase = resolveDashboardBase(entity.data)
  const dashboardUrl = `${dashboardBase}${dashboardRoute.startsWith('/') ? dashboardRoute : `/${dashboardRoute}`}`
  const source = entity.data?.source
  const displayLabel = entityDisplayLabel(entity)

  return (
    <div style={{
      position: 'absolute',
      top: 70,
      right: 16,
      width: 320,
      maxHeight: 'calc(100vh - 90px)',
      overflow: 'auto',
      background: 'rgba(0,8,20,0.95)',
      border: '1px solid #0a4a6a',
      borderRadius: 4,
      fontFamily: '"Courier New", monospace',
      color: '#00ff88',
      fontSize: 11,
      zIndex: 200,
      boxShadow: '0 4px 20px rgba(0,100,150,0.3)',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 12px',
        background: 'rgba(0,60,100,0.5)',
        borderBottom: '1px solid #0a4a6a',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ color: '#00ffff', fontWeight: 'bold', fontSize: 13 }}>
            {entity.scType}
          </div>
          <div style={{ color: '#888', fontSize: 9 }}>
            CLUSTER: {entity.cluster.toUpperCase()}
          </div>
        </div>
        <button
          onClick={() => selectEntity(null)}
          style={{
            background: 'none',
            border: '1px solid #4a2a2a',
            color: '#ff6666',
            padding: '2px 8px',
            cursor: 'pointer',
            fontFamily: '"Courier New"',
            fontSize: 10,
          }}
        >
          ✕ CLOSE
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: 12 }}>
        {/* Label */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: '#0a5a6a', fontSize: 9, marginBottom: 2 }}>LABEL</div>
          <div style={{ color: '#00ff88', fontWeight: 'bold' }}>{displayLabel}</div>
        </div>

        {/* Tooltip */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: '#0a5a6a', fontSize: 9, marginBottom: 2 }}>TOOLTIP</div>
          <div style={{ color: '#aaa', fontSize: 10, lineHeight: 1.4 }}>{entity.tooltip}</div>
        </div>

        {/* Health */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: '#0a5a6a', fontSize: 9, marginBottom: 4 }}>HEALTH</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 8, background: '#111', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                width: `${healthPct}%`,
                height: '100%',
                background: healthColor,
                transition: 'width 0.3s',
              }} />
            </div>
            <span style={{ color: healthColor, fontSize: 10, minWidth: 35 }}>
              {entity.health}/{entity.maxHealth}
            </span>
          </div>
        </div>

        {/* Activity */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: '#0a5a6a', fontSize: 9, marginBottom: 2 }}>ACTIVITY</div>
          <span style={{
            padding: '2px 8px',
            background: entity.activity === 'active' ? '#003300' :
                        entity.activity === 'idle' ? '#333300' :
                        entity.activity === 'mining' ? '#003333' :
                        entity.activity === 'patrol' ? '#333300' : '#330000',
            color: entity.activity === 'active' ? '#00ff00' :
                   entity.activity === 'idle' ? '#ffff00' :
                   entity.activity === 'mining' ? '#00ffff' :
                   entity.activity === 'patrol' ? '#ffff00' : '#ff0000',
            borderRadius: 2,
            fontSize: 10,
            textTransform: 'uppercase',
          }}>
            {entity.activity}
          </span>
        </div>

        {/* Position */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: '#0a5a6a', fontSize: 9, marginBottom: 2 }}>POSITION</div>
          <div style={{ color: '#aaa', fontSize: 10 }}>
            X: {entity.x.toFixed(1)} Y: {entity.y.toFixed(1)} Z: {entity.z.toFixed(1)}
          </div>
        </div>

        {/* Tier */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: '#0a5a6a', fontSize: 9, marginBottom: 2 }}>TIER</div>
          <div style={{ 
            color: entity.tier >= 3 ? '#00ffff' : entity.tier >= 2 ? '#ffcc00' : '#ff9900',
            fontWeight: 'bold',
            fontSize: 12
          }}>
            {'★'.repeat(entity.tier)}
            {'☆'.repeat(Math.max(0, 3 - entity.tier))}
          </div>
        </div>

        {/* Age */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: '#0a5a6a', fontSize: 9, marginBottom: 2 }}>AGE</div>
          <div style={{ color: '#aaa', fontSize: 10 }}>{entity.age} ticks</div>
        </div>

        {/* Dashboard source */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: '#0a5a6a', fontSize: 9, marginBottom: 2 }}>DASHBOARD SOURCE</div>
          <div style={{ color: source?.kind === 'fallback-files' ? '#ffcc00' : '#00ff88', fontSize: 10, lineHeight: 1.4 }}>
            {source?.kind || 'dashboard-api'} → {dashboardRoute}
          </div>
          {source?.fallbackReason && (
            <div style={{ color: '#ff9966', fontSize: 9, lineHeight: 1.3 }}>
              {String(source.fallbackReason).substring(0, 120)}
            </div>
          )}
        </div>

        {/* Data */}
        <div style={{ 
          borderTop: '1px solid #0a3a4a', 
          paddingTop: 10,
          marginTop: 10
        }}>
          <div style={{ color: '#0a5a6a', fontSize: 9, marginBottom: 4 }}>DATA</div>
          <pre style={{ 
            color: '#6a9aaa', 
            fontSize: 9, 
            overflow: 'auto',
            maxHeight: 200,
            lineHeight: 1.3,
          }}>
            {JSON.stringify(entity.data, null, 2).substring(0, 500)}
          </pre>
        </div>

        {/* Actions */}
        <div style={{ 
          borderTop: '1px solid #0a3a4a', 
          paddingTop: 10,
          marginTop: 10,
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
        }}>
          <ActionBtn 
            label={entity.clickAction.split('_').join(' ')}
            onClick={() => window.open(dashboardUrl, '_blank', 'noopener,noreferrer')}
            color="#00aaff"
          />
          <ActionBtn 
            label="DESELECT" 
            onClick={() => selectEntity(null)}
            color="#666"
          />
        </div>
      </div>
    </div>
  )
}

function resolveDashboardBase(data: Record<string, any>): string {
  const fromSource = data?.source?.dashboardUrl
  if (typeof fromSource === 'string' && fromSource) return fromSource.replace(/\/+$/, '')
  const fromImportMeta = (import.meta.env as unknown as Record<string, string | undefined>).VITE_HERMES_DASHBOARD_URL
  if (typeof fromImportMeta === 'string' && fromImportMeta) return fromImportMeta.replace(/\/+$/, '')
  return 'http://127.0.0.1:9119'
}

function ActionBtn({ label, onClick, color }: { label: string; onClick: () => void; color: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'rgba(0,40,60,0.8)',
        border: `1px solid ${color}`,
        color: color,
        padding: '3px 8px',
        fontSize: 9,
        cursor: 'pointer',
        fontFamily: '"Courier New"',
        borderRadius: 2,
        textTransform: 'uppercase',
      }}
    >
      → {label}
    </button>
  )
}
