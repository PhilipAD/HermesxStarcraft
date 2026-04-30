import { useEffect, useState } from 'react'

/**
 * Native-feeling StarCraft HUD rendered from the live Titan Reactor
 * simulation. Titan's WorldComposer posts a `titan:hud` message every ~500ms
 * with per-player resources, supply, APM, current frame, game speed and
 * pause state. We subscribe to that and draw a classic SC-style top-bar +
 * bottom-left status panel on top of the iframe.
 *
 * Unlike the plugin-system runtime (which requires a full Vite build of
 * the Titan `runtime.tsx` + plugin packages), this HUD is rendered entirely
 * in the Hermes dashboard and needs no plugin infrastructure.
 */

export interface TitanHudPlayer {
  id: number
  name: string
  color: string
  race: string
  minerals: number
  vespeneGas: number
  supply: number
  supplyMax: number
  workerSupply: number
  armySupply: number
  apm: number
}

/** Per-player flat vectors from OpenBW buffer 9 (same layout as plugin-system-ui). */
export interface TitanHudProduction {
  units: number[][]
  upgrades: number[][]
  research: number[][]
}

export interface TitanHudState {
  frame: number
  friendlyTime: string
  gameSpeed: number
  isPaused: boolean
  isSandbox: boolean
  mapName: string
  mapSize: [number, number]
  players: TitanHudPlayer[]
  production?: TitanHudProduction
}

const gameSpeedLabel = (speed: number): string => {
  if (speed <= 0) return 'Slowest'
  const approx = [
    { s: 42, label: 'Slowest' },
    { s: 48, label: 'Slower' },
    { s: 56, label: 'Slow' },
    { s: 64, label: 'Normal' },
    { s: 78, label: 'Fast' },
    { s: 96, label: 'Faster' },
    { s: 120, label: 'Fastest' },
  ]
  let best = approx[0]
  let bestDelta = Math.abs(speed - best.s)
  for (const cand of approx) {
    const d = Math.abs(speed - cand.s)
    if (d < bestDelta) {
      best = cand
      bestDelta = d
    }
  }
  return best.label
}

// Classic Blizzard race colour accents (close to the SC HUD tint)
function summarizeTrainingQueue(flat: number[], maxSlots = 3): string {
  const parts: string[] = []
  for (let i = 0; i + 2 < flat.length && parts.length < maxSlots; i += 3) {
    const typeId = flat[i] ?? 0
    const count = flat[i + 1] ?? 0
    const progress = flat[i + 2] ?? 0
    if (!typeId) continue
    parts.push(`#${typeId}${count > 1 ? `x${count}` : ''} ${progress}%`)
  }
  return parts.join('  ')
}

const raceAccent = (race: string): string => {
  switch ((race || '').toLowerCase()) {
    case 'terran':
      return '#4fa3ff'
    case 'zerg':
      return '#8c4ad6'
    case 'protoss':
      return '#e3c33a'
    default:
      return '#64c857'
  }
}

export function TitanNativeHud() {
  const [hud, setHud] = useState<TitanHudState | null>(null)

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (!ev.data || typeof ev.data !== 'object') return
      if (ev.data.type !== 'titan:hud') return
      const d = ev.data as TitanHudState & { type: string }
      setHud({
        frame: d.frame,
        friendlyTime: d.friendlyTime,
        gameSpeed: d.gameSpeed,
        isPaused: !!d.isPaused,
        isSandbox: !!d.isSandbox,
        mapName: d.mapName,
        mapSize: d.mapSize,
        players: Array.isArray(d.players) ? d.players : [],
        production:
          d.production &&
          Array.isArray(d.production.units) &&
          Array.isArray(d.production.upgrades) &&
          Array.isArray(d.production.research)
            ? d.production
            : undefined,
      })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // The Titan iframe is cross-origin (different port) so we cannot dispatch
  // a KeyboardEvent directly. Instead we postMessage { type: 'hermes:open-menu' }
  // and the Titan-side GameScene listens for it and toggles its menu state.
  const openMenu = () => {
    try {
      const iframe = document.querySelector('iframe') as HTMLIFrameElement | null
      iframe?.contentWindow?.postMessage({ type: 'hermes:open-menu' }, '*')
    } catch (err) {
      console.warn('[TitanNativeHud] failed to open menu:', err)
    }
  }

  if (!hud) return null

  const activePlayers = hud.players.filter(
    (p) => p.supplyMax > 0 || p.minerals > 0 || p.workerSupply > 0 || p.armySupply > 0
  )

  return (
    <>
      {/* Top bar: time, speed, pause/sandbox state, resources per active player */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          padding: '6px 12px',
          pointerEvents: 'none',
          fontFamily: 'Conthrax, "Courier New", monospace',
          color: '#e6f4ff',
          textShadow: '0 0 2px #000, 0 0 4px #000',
          zIndex: 50,
          gap: 12,
        }}
      >
        <div
          style={{
            background: 'rgba(4,12,24,0.72)',
            border: '1px solid rgba(100,200,87,0.35)',
            borderRadius: 3,
            padding: '6px 10px',
            fontSize: 12,
            lineHeight: 1.3,
            minWidth: 180,
          }}
        >
          <div style={{ fontSize: 13, letterSpacing: 1, color: '#9fe6ff' }}>
            {hud.mapName || 'StarCraft'}{' '}
            <span style={{ opacity: 0.55 }}>
              ({hud.mapSize?.[0]}x{hud.mapSize?.[1]})
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
            <span>
              <span style={{ color: '#ffd561' }}>T</span> {hud.friendlyTime}
            </span>
            <span>
              <span style={{ color: '#ffd561' }}>F</span> {hud.frame.toLocaleString()}
            </span>
            <span>
              <span style={{ color: '#ffd561' }}>x</span> {gameSpeedLabel(hud.gameSpeed)}
            </span>
          </div>
          {(hud.isPaused || hud.isSandbox) && (
            <div style={{ marginTop: 2, color: '#ff9f5c' }}>
              {hud.isPaused ? 'PAUSED' : ''}
              {hud.isSandbox ? ' SANDBOX/ENDLESS' : ''}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          {activePlayers.map((p) => (
            <div
              key={p.id}
              style={{
                background: 'rgba(4,12,24,0.78)',
                border: `1px solid ${raceAccent(p.race)}66`,
                borderRadius: 3,
                padding: '5px 9px',
                fontSize: 12,
                minWidth: 180,
                boxShadow: `0 0 8px ${raceAccent(p.race)}22 inset`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    background: p.color,
                    border: '1px solid #000',
                  }}
                />
                <span style={{ flex: 1, color: raceAccent(p.race) }}>
                  {p.name || `P${p.id}`}{' '}
                  <span style={{ opacity: 0.55 }}>{p.race}</span>
                </span>
                <span style={{ opacity: 0.65 }}>APM {p.apm}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 3,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <span title="Minerals" style={{ color: '#8ad5ff' }}>
                  M {p.minerals}
                </span>
                <span title="Vespene Gas" style={{ color: '#64c857' }}>
                  G {p.vespeneGas}
                </span>
                <span
                  title="Supply (used / max)"
                  style={{
                    color:
                      p.supply >= p.supplyMax && p.supplyMax > 0
                        ? '#ff7070'
                        : '#ffd561',
                  }}
                >
                  S {Math.floor(p.supply / 2)}/{Math.floor(p.supplyMax / 2)}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 2,
                  fontSize: 10,
                  opacity: 0.7,
                }}
              >
                <span>W {Math.floor(p.workerSupply / 2)}</span>
                <span>A {Math.floor(p.armySupply / 2)}</span>
              </div>
              {hud.production?.units[p.id] &&
                summarizeTrainingQueue(hud.production.units[p.id]!).length > 0 && (
                  <div
                    style={{
                      marginTop: 3,
                      fontSize: 9,
                      opacity: 0.78,
                      color: '#b8e7ff',
                      lineHeight: 1.25,
                    }}
                    title="Training queue (unit type id, engine progress %)"
                  >
                    Train {summarizeTrainingQueue(hud.production.units[p.id]!)}
                  </div>
                )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom-right: menu button + controls hint */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          right: 12,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          fontFamily: 'Conthrax, "Courier New", monospace',
          fontSize: 11,
          zIndex: 50,
          textShadow: '0 0 2px #000',
        }}
      >
        <div
          style={{
            padding: '5px 10px',
            background: 'rgba(4,12,24,0.7)',
            border: '1px solid rgba(100,200,87,0.35)',
            borderRadius: 3,
            color: '#9fe6ff',
            pointerEvents: 'none',
          }}
        >
          Left drag rotate &nbsp;|&nbsp; Right drag pan &nbsp;|&nbsp; Wheel zoom &nbsp;|&nbsp; Click unit
        </div>
        <button
          type="button"
          onClick={openMenu}
          style={{
            padding: '5px 12px',
            background: 'rgba(16,32,48,0.9)',
            border: '1px solid rgba(255,213,97,0.55)',
            color: '#ffd561',
            borderRadius: 3,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 11,
            textShadow: '0 0 2px #000',
            letterSpacing: 1,
          }}
          title="Open Titan in-game menu (ESC)"
        >
          MENU (ESC)
        </button>
      </div>
    </>
  )
}
