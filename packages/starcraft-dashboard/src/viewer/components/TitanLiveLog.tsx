import { useMemo, useState } from 'react'
import { useDashboardStore, type LiveEvent } from '../store'

/**
 * Hermes change feed: adds, removes, updates, moves, snapshots, connection.
 *
 * The bridge updates the React store in real time, but the Titan iframe is
 * intentionally NOT updated on every delta (that caused massive engine
 * kill/spawn churn). When new Hermes deltas arrive after the map is live,
 * this panel shows them in the log and enables "Reload Titan" so the user
 * can remount the iframe and apply the full snapshot in one shot. The
 * reload control stays hidden until mapReady so startup deltas do not arm it.
 */
export interface TitanLiveLogProps {
  /** True after Titan world-ready, race selected, and first hermes:entities apply ack (map + units ready). */
  mapReady: boolean
  onReloadTitan: () => void
}

const KIND_COLORS: Record<LiveEvent['kind'], string> = {
  add: '#5fdb6f',
  remove: '#ff6b6b',
  update: '#ffd166',
  update_batch: '#e0c36a',
  move: '#9cb8ff',
  move_batch: '#88a8dd',
  snapshot: '#5cf',
  connection: '#c08cff',
}

const KIND_LABELS: Record<LiveEvent['kind'], string> = {
  add: 'spawn',
  remove: 'kill',
  update: 'update',
  update_batch: 'batch Δ',
  move: 'move',
  move_batch: 'batch mv',
  snapshot: 'snap',
  connection: 'conn',
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export function TitanLiveLog({ mapReady, onReloadTitan }: TitanLiveLogProps) {
  const eventLog = useDashboardStore((s) => s.eventLog)
  const eventLogPaused = useDashboardStore((s) => s.eventLogPaused)
  const togglePaused = useDashboardStore((s) => s.toggleEventLogPaused)
  const clearLog = useDashboardStore((s) => s.clearEventLog)
  const pendingCount = useDashboardStore((s) => s.pendingDeltaCount)
  const summary = useDashboardStore((s) => s.lastDeltaSummary)
  const connectionStatus = useDashboardStore((s) => s.connectionStatus)
  const [collapsed, setCollapsed] = useState(true)

  const recent = useMemo(() => eventLog.slice(-50).reverse(), [eventLog])
  const hasPending = pendingCount > 0
  const reloadArmed = mapReady && hasPending

  const reloadLabel = hasPending
    ? `reload titan (${pendingCount})`
    : 'reload titan'

  const reloadTitle = !mapReady
    ? 'Available after the map loads, a race is selected, and Hermes units/buildings are applied in Titan.'
    : hasPending
      ? `Full Titan iframe remount, then apply current Hermes entities. ${pendingCount} bridge changes since last reload.`
      : 'No new Hermes deltas since last Titan reload. Map is already in sync with the store.'

  const headerStatusColor =
    connectionStatus === 'connected' ? '#2faa4e' :
    connectionStatus === 'connecting' ? '#e39b0a' : '#c43838'

  const summaryLine = !mapReady
    ? 'map loading — reload locked'
    : summary
      ? `+${summary.added} / -${summary.removed} / Δ${summary.updated} / →${summary.moved} @ ${formatTime(summary.ts)}`
      : hasPending
        ? `${pendingCount} pending`
        : 'no pending changes'

  return (
    <div
      data-testid="titan-live-log"
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        left: 'auto',
        width: 400,
        maxWidth: 'min(400px, calc(100vw - 24px))',
        minWidth: 280,
        background: 'rgba(4,12,24,0.94)',
        border: `1px solid ${reloadArmed ? '#5fdb6f' : '#1e5a82'}`,
        borderRadius: 4,
        color: '#bfe',
        fontFamily: '"Courier New", ui-monospace, monospace',
        fontSize: 11,
        zIndex: 1100,
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: reloadArmed
          ? '0 4px 24px rgba(95,219,111,0.35)'
          : '0 4px 24px rgba(0,0,0,0.7)',
        transition: 'border-color 200ms, box-shadow 200ms',
      }}
    >
      <div
        style={{
          padding: '6px 10px',
          background: 'rgba(10,30,50,0.85)',
          borderBottom: '1px solid #153a52',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: headerStatusColor,
            boxShadow: `0 0 6px ${headerStatusColor}`,
          }}
        />
        <span style={{ color: '#5cf', fontWeight: 'bold', letterSpacing: 1 }}>
          HERMES LIVE LOG
        </span>
        <span style={{ color: reloadArmed ? '#5fdb6f' : '#789' }}>
          {summaryLine}
        </span>
        <div style={{ flex: 1 }} />
        {mapReady ? (
          <button
            type="button"
            data-testid="titan-live-log-reload"
            onClick={onReloadTitan}
            disabled={!reloadArmed}
            title={reloadTitle}
            style={{
              background: reloadArmed ? '#0d3a1a' : '#0a1a26',
              color: reloadArmed ? '#aef5b5' : '#456',
              border: `1px solid ${reloadArmed ? '#3fa55a' : '#1e3a52'}`,
              padding: '3px 10px',
              cursor: reloadArmed ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              fontSize: 11,
            }}
          >
            {reloadLabel}
          </button>
        ) : null}
        <button
          type="button"
          onClick={togglePaused}
          title={eventLogPaused ? 'Resume capturing live events' : 'Pause capturing live events'}
          style={{
            background: '#11324a',
            color: eventLogPaused ? '#ffd166' : '#cfe',
            border: '1px solid #1e5a82',
            padding: '3px 8px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 11,
          }}
        >
          {eventLogPaused ? 'resume' : 'pause'}
        </button>
        <button
          type="button"
          onClick={clearLog}
          title="Clear the event log"
          style={{
            background: '#11324a',
            color: '#cfe',
            border: '1px solid #1e5a82',
            padding: '3px 8px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 11,
          }}
        >
          clear
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'Expand log' : 'Collapse log'}
          style={{
            background: '#11324a',
            color: '#cfe',
            border: '1px solid #1e5a82',
            padding: '3px 8px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 11,
            minWidth: 24,
          }}
        >
          {collapsed ? '+' : '-'}
        </button>
      </div>
      {!collapsed && (
        <div
          style={{
            maxHeight: 220,
            overflow: 'auto',
            padding: '6px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {recent.length === 0 && (
            <div style={{ color: '#789', padding: '6px 4px' }}>
              {connectionStatus === 'connected'
                ? 'No Hermes activity yet. Start a session, run a cron, add a key.'
                : `Bridge ${connectionStatus}. Waiting for Hermes WebSocket…`}
            </div>
          )}
          {recent.map((ev) => {
            const color = KIND_COLORS[ev.kind] || '#bfe'
            return (
              <div
                key={ev.id}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'baseline',
                  borderBottom: '1px dashed rgba(40,80,110,0.4)',
                  padding: '2px 0',
                }}
              >
                <span style={{ color: '#789', minWidth: 60 }}>
                  {formatTime(ev.ts)}
                </span>
                <span
                  style={{
                    color,
                    minWidth: 50,
                    textTransform: 'uppercase',
                    fontWeight: 'bold',
                  }}
                >
                  {KIND_LABELS[ev.kind]}
                </span>
                <span style={{ color: '#cfe', flex: 1, wordBreak: 'break-word' }}>
                  {ev.label}
                </span>
                {ev.detail && (
                  <span style={{ color: '#789' }}>{ev.detail}</span>
                )}
              </div>
            )
          })}
        </div>
      )}
      {reloadArmed && !collapsed && (
        <div
          style={{
            padding: '4px 10px',
            borderTop: '1px solid #153a52',
            background: 'rgba(15,40,30,0.6)',
            color: '#aef5b5',
          }}
        >
          Hermes changed — click Reload Titan to remount the map and apply units or buildings
        </div>
      )}
    </div>
  )
}
