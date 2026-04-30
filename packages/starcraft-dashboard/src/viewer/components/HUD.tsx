import { useDashboardStore } from '../store'

export function HUD() {
  const { entities, connectionStatus, fps, lastUpdate, toggleGrid, toggleLabels, setViewMode, viewMode } = useDashboardStore()
  
  const entityCount = entities.size
  const clusterCounts: Record<string, number> = {}
  for (const entity of entities.values()) {
    clusterCounts[entity.cluster] = (clusterCounts[entity.cluster] || 0) + 1
  }

  const timeSinceUpdate = lastUpdate ? Math.round((Date.now() - lastUpdate) / 1000) : '—'

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 56,
      background: 'linear-gradient(to bottom, rgba(0,10,25,0.95), rgba(0,10,25,0.7))',
      borderBottom: '1px solid #0a3a4a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      fontFamily: '"Courier New", monospace',
      color: '#00ff88',
      fontSize: 11,
      zIndex: 100,
    }}>
      {/* Left: Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: '#00ffff', fontWeight: 'bold', fontSize: 14 }}>⚙️ HERMES</span>
        <span style={{ color: '#888' }}>|</span>
        <span style={{ color: '#ffcc00' }}>STARCRRAFT BASE</span>
        <span style={{ 
          padding: '2px 6px', 
          background: connectionStatus === 'connected' ? '#00aa00' : '#aa0000',
          color: '#fff', 
          fontSize: 9,
          borderRadius: 2
        }}>
          {connectionStatus.toUpperCase()}
        </span>
      </div>

      {/* Center: Stats */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <Stat label="ENTS" value={entityCount.toString()} />
        <Stat label="FPS" value={fps.toString()} color={fps < 30 ? '#ff6600' : fps < 50 ? '#ffcc00' : '#00ff88'} />
        <Stat label="AGE" value={`${timeSinceUpdate}s`} />
        {Object.entries(clusterCounts).slice(0, 4).map(([k, v]) => (
          <Stat key={k} label={k.toUpperCase().substring(0, 4)} value={v.toString()} />
        ))}
      </div>

      {/* Right: Controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button 
          onClick={() => setViewMode(viewMode === '3d' ? 'top' : '3d')}
          style={btnStyle}
        >
          {viewMode === '3d' ? '📡 3D' : '🗺️ TOP'}
        </button>
        <button onClick={toggleGrid} style={btnStyle}>
          GRID: {useDashboardStore.getState().showGrid ? 'ON' : 'OFF'}
        </button>
        <button onClick={toggleLabels} style={btnStyle}>
          LBL: {useDashboardStore.getState().showLabels ? 'ON' : 'OFF'}
        </button>
        <span style={{ color: '#0a5a6a', fontSize: 10 }}>CLICK ENTITIES FOR INFO</span>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <span style={{ color: '#0a5a6a', fontSize: 9 }}>{label}</span>
      <span style={{ color: color || '#00ff88', fontWeight: 'bold', fontSize: 13 }}>{value}</span>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(0,50,80,0.8)',
  border: '1px solid #0a4a6a',
  color: '#00ff88',
  padding: '3px 8px',
  fontSize: 10,
  cursor: 'pointer',
  fontFamily: '"Courier New", monospace',
  borderRadius: 2,
}
