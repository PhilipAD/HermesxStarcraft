import { useDashboardStore } from '../store'
import { isHermesDiagQuery } from '../hermes-diag-query'

function hasHermesDiag(): boolean {
  if (typeof window === 'undefined') return false
  return isHermesDiagQuery(window.location.search)
}

export function HermesDiagOverlay() {
  const cascEnabled = import.meta.env.VITE_CASCBRIDGE === '1'
  const entityCount = useDashboardStore((s) => s.entities.size)
  const connectionStatus = useDashboardStore((s) => s.connectionStatus)

  if (!hasHermesDiag()) return null

  const sceneLabel = cascEnabled
    ? 'CascbridgeScene — billboards load DDS via /casc-assets -> casc-http:8080 (?png=1)'
    : 'ProceduralScene — colored boxes only (no Remastered textures). Restart dev with: npm run start:casc'

  return (
    <div
      style={{
        position: 'absolute',
        right: 8,
        top: 60,
        width: 420,
        maxHeight: '85vh',
        overflow: 'auto',
        zIndex: 2000,
        background: 'rgba(5,12,24,0.95)',
        border: '1px solid #0a6',
        color: '#9ec',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
        padding: 12,
        lineHeight: 1.4,
      }}
    >
      <div style={{ color: '#6cf', fontWeight: 'bold', marginBottom: 8 }}>hermesdiag=1</div>
      <div style={{ marginBottom: 10 }}>
        <strong>Scene:</strong> {sceneLabel}
      </div>
      <div style={{ marginBottom: 10 }}>
        <strong>Bridge WS:</strong> {connectionStatus} &nbsp;|&nbsp; <strong>Entities:</strong> {entityCount}
      </div>
      <div style={{ color: '#888', marginBottom: 8 }}>Browser checks (same origin as Vite):</div>
      <ol style={{ margin: 0, paddingLeft: 18 }}>
        <li style={{ marginBottom: 6 }}>
          <a href="/hermes-stack-diag.html" target="_blank" rel="noreferrer" style={{ color: '#8cf' }}>
            /hermes-stack-diag.html
          </a>
          — HTTP health, WS, CASC PNG through proxy
        </li>
        <li style={{ marginBottom: 6 }}>
          CASC-only (no bridge):{' '}
          <a href="/?cascdev=1" style={{ color: '#8cf' }}>
            /?cascdev=1
          </a>
          {cascEnabled ? ' (requires VITE_CASCBRIDGE=1; skips WS)' : ' — enable start:casc first'}
        </li>
        <li>
          Full dashboard: <span style={{ color: '#ccc' }}>/</span> (remove cascdev and hermesdiag when done)
        </li>
      </ol>
    </div>
  )
}
