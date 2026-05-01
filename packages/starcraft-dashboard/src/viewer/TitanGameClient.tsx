import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { TitanHermesOverlay } from './components/TitanHermesOverlay'
import { TitanMapPicker } from './components/TitanMapPicker'
import { TitanUnitInspector, type TitanSelectedUnit } from './components/TitanUnitInspector'
import { TitanNativeHud } from './components/TitanNativeHud'
import { TitanLiveLog } from './components/TitanLiveLog'
import { useDashboardStore, type Entity } from './store'
import { scTypeForRace as scTypeForRaceImpl } from './race-mapping'
import type { StarCraftRace as StarCraftRaceType } from './race-mapping'

/**
 * Full-screen Titan Reactor (OpenBW + original CASC sprites/terrain).
 *
 * Titan on its own lands on the "wraith in space" HomeScene. To get the user to
 * an actual StarCraft map on boot we:
 *   1. Fetch /maps-list from the CASC HTTP server (which lists .scm/.scx files
 *      under SC_ROOT/Maps on disk).
 *   2. Pick a sensible default (prefer the user's last selection, else a known
 *      ladder/campaign map, else the first available map).
 *   3. Pass ?map=<url> to the Titan iframe. Titan's bootup now accepts ?map=
 *      and fires `queue-files`, which drives the MapScene (real terrain,
 *      doodads, tilesets).
 *
 * The user can swap maps in the overlay; the iframe reloads with a new ?map=.
 *
 * Run ./start-titan-client.sh to start casc-http (8080) + stubs (8090/8091)
 * + Titan (3344). Hermes bridge data is streamed live over ws://127.0.0.1:9121/ws
 * and shown in the Hermes HUD overlay.
 */
const DEFAULT_TITAN = 'http://127.0.0.1:3344'
const DEFAULT_CASC = 'http://127.0.0.1:8080'
const DEFAULT_RUNTIME = 'http://127.0.0.1:8090/'
const DEFAULT_PLUGINS = 'http://127.0.0.1:8091/'
const DEFAULT_BRIDGE_WS = 'ws://127.0.0.1:9121/ws'

const MAP_LS_KEY = 'hermes.titan.selectedMap'
const EDIT_LAYOUT_LS_KEY = 'hermes.titan.editLayout.v1'

type EditOverride = { scType?: string; editPx?: number; editPy?: number }
type StarCraftRace = StarCraftRaceType

const BUILDING_OPTIONS = [
  'CommandCenter',
  'SupplyDepot',
  'Refinery',
  'Barracks',
  'Factory',
  'Starport',
  'Academy',
  'EngineeringBay',
  'Armory',
  'ScienceFacility',
  'ComsatStation',
  'NuclearSilo',
  'ControlTower',
  'MachineShop',
  'CovertOps',
  'PhysicsLab',
  'Bunker',
  'MissileTurret',
]

const editButtonStyle = {
  background: '#11324a',
  color: '#cfe',
  border: '1px solid #1e5a82',
  padding: '5px 8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 11,
}

const editDangerButtonStyle = {
  ...editButtonStyle,
  color: '#fbb',
  border: '1px solid #7a2d2d',
}

// Preferred default map candidates, in priority order. First one that exists in
// the user's install is chosen. These are classic / commonly-installed maps.
const DEFAULT_MAP_CANDIDATES = [
  '(4)Blood Bath.scm',
  '(2)Boxer.scm',
  '(4)Lost Temple.scm',
  '(8)The Hunters.scm',
  '(4)Hunters.scm',
]

const TITAN_IFRAME_CODE_VERSION = 'boot-ui-fit-v4'

type MapFile = { path: string; name: string; size: number }

function scTypeForRace(entity: Entity, race: StarCraftRace) {
  return scTypeForRaceImpl(entity, race)
}

export function TitanGameClient() {
  const titanBase = import.meta.env.VITE_TITAN_WEB_URL || DEFAULT_TITAN
  const cascBase = import.meta.env.VITE_CASC_HTTP_URL || DEFAULT_CASC
  const runtime = import.meta.env.VITE_TITAN_STUB_RUNTIME_URL || DEFAULT_RUNTIME
  const plugins = import.meta.env.VITE_TITAN_STUB_PLUGINS_URL || DEFAULT_PLUGINS
  const bridgeWs = import.meta.env.VITE_BRIDGE_WS_URL || DEFAULT_BRIDGE_WS

  useWebSocket(bridgeWs)

  const [maps, setMaps] = useState<MapFile[]>([])
  const [mapListError, setMapListError] = useState<string | null>(null)
  const [selectedMapPath, setSelectedMapPath] = useState<string | null>(() => {
    try {
      return localStorage.getItem(MAP_LS_KEY)
    } catch {
      return null
    }
  })
  const [selectedRace, setSelectedRace] = useState<StarCraftRace | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedUnits, setSelectedUnits] = useState<TitanSelectedUnit[]>([])
  const [raceResetToken, setRaceResetToken] = useState(0)
  const [editingHermesId, setEditingHermesId] = useState<string | null>(null)
  const [draftScType, setDraftScType] = useState<string | null>(null)
  const [deferredTypeApplyIds, setDeferredTypeApplyIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [editMode, setEditMode] = useState(false)
  const [editOverrides, setEditOverrides] = useState<Record<string, EditOverride>>(() => {
    try {
      const raw = localStorage.getItem(EDIT_LAYOUT_LS_KEY)
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  })
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const deferredTypeApplyIdsRef = useRef<Set<string>>(new Set())
  const [titanWorldReady, setTitanWorldReady] = useState(false)
  /** True only after Titan applies `hermes:entities` (map + Hermes units settled). */
  const [entitiesAppliedReady, setEntitiesAppliedReady] = useState(false)
  const [iframeReloadNonce, setIframeReloadNonce] = useState(0)

  useEffect(() => {
    if (!editMode) return
    const selectedEditable = selectedUnits.find((u) => u.isBuilding && u.hermesId)
    if (selectedEditable?.hermesId) {
      setEditingHermesId(selectedEditable.hermesId)
      setDraftScType(null)
    }
  }, [editMode, selectedUnits])

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (!ev.data || typeof ev.data !== 'object') return
      if (ev.data.type === 'titan:selected-units') {
        const units = Array.isArray(ev.data.units) ? ev.data.units : []
        setSelectedUnits(units)
      } else if (ev.data.type === 'titan:world-ready') {
        setEntitiesAppliedReady(false)
        setTitanWorldReady(true)
      } else if (ev.data.type === 'titan:hermes-entities-applied') {
        setEntitiesAppliedReady(true)
      } else if (ev.data.type === 'titan:race-selected') {
        setEntitiesAppliedReady(false)
        const race = ev.data.race
        if (race === 'terran' || race === 'zerg' || race === 'protoss') {
          setSelectedRace(race)
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Hermes entity store: updated by the bridge WebSocket (snapshots + deltas).
  // We do NOT push every change into the Titan iframe automatically — that
  // caused huge kill/spawn churn. Instead we sync once when the iframe world
  // becomes ready (after boot, map change, or manual full reload) and the
  // user clicks "Reload Titan" when new Hermes deltas are pending.
  const entities = useDashboardStore((s) => s.entities)
  const effectiveEntities = useMemo(() => {
    const next = new Map<string, Entity>()
    for (const e of entities.values()) {
      const override = editOverrides[e.id]
      const deferred = deferredTypeApplyIds.has(e.id)
      next.set(e.id, {
        ...e,
        scType:
          override?.scType && !deferred
            ? override.scType
            : e.scType,
      })
    }
    return next
  }, [entities, editOverrides, deferredTypeApplyIds])

  const entitiesRef = useRef(entities)
  const effectiveEntitiesRef = useRef(effectiveEntities)
  const editOverridesRef = useRef(editOverrides)
  const titanWorldReadyRef = useRef(titanWorldReady)
  const selectedRaceRef = useRef(selectedRace)
  entitiesRef.current = entities
  effectiveEntitiesRef.current = effectiveEntities
  editOverridesRef.current = editOverrides
  titanWorldReadyRef.current = titanWorldReady
  selectedRaceRef.current = selectedRace

  const persistEditOverrides = (next: Record<string, EditOverride>) => {
    setEditOverrides(next)
    try {
      localStorage.setItem(EDIT_LAYOUT_LS_KEY, JSON.stringify(next))
    } catch {}
  }

  const readSavedEditOverrides = (): Record<string, EditOverride> => {
    try {
      const raw = localStorage.getItem(EDIT_LAYOUT_LS_KEY)
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  const saveEditOverridesForReload = (next: Record<string, EditOverride>) => {
    try {
      localStorage.setItem(EDIT_LAYOUT_LS_KEY, JSON.stringify(next))
    } catch {}
  }

  const broadcastEntitiesToIframe = useCallback((): boolean => {
    if (!titanWorldReadyRef.current) return false
    const race = selectedRaceRef.current
    if (!race) return false
    const iframe = iframeRef.current
    if (!iframe || !iframe.contentWindow) return false
    const payload: Array<Pick<Entity, 'id' | 'scType' | 'x' | 'y' | 'z' | 'activity' | 'label'> & { editPx?: number; editPy?: number }> = []
    for (const e of effectiveEntitiesRef.current.values()) {
      const override = editOverridesRef.current[e.id]
      const liveOverride = deferredTypeApplyIdsRef.current.has(e.id)
        ? undefined
        : override
      payload.push({
        id: e.id,
        scType: scTypeForRace(
          {
            ...e,
            scType: deferredTypeApplyIdsRef.current.has(e.id)
              ? entitiesRef.current.get(e.id)?.scType ?? e.scType
              : e.scType,
          },
          race,
        ),
        x: e.x,
        y: e.y,
        z: e.z,
        activity: e.activity,
        label: e.label,
        editPx: liveOverride?.editPx,
        editPy: liveOverride?.editPy,
      })
    }
    try {
      iframe.contentWindow.postMessage({ type: 'hermes:entities', entities: payload }, '*')
      return true
    } catch (err) {
      console.warn('[TitanGameClient] failed to post hermes:entities', err)
      return false
    }
  }, [])

  const markRefreshed = useDashboardStore((s) => s.markRefreshed)

  useEffect(() => {
    if (!titanWorldReady || !selectedRace) return
    // Drop Hermes deltas that arrived during iframe boot (race screen, map
    // load) so the live-log "Reload Titan" control does not arm from startup
    // noise. Then push the first post-map snapshot into Titan.
    markRefreshed()
    broadcastEntitiesToIframe()
  }, [titanWorldReady, selectedRace, broadcastEntitiesToIframe, markRefreshed])

  const handleFullReloadTitan = useCallback(() => {
    setEntitiesAppliedReady(false)
    setIframeReloadNonce((n) => n + 1)
    setTitanWorldReady(false)
  }, [])

  // When the iframe reloads (e.g. user picked a different map) we need to
  // re-await the next world-ready signal before the bridge becomes usable.
  const onIframeLoad = () => {
    setEntitiesAppliedReady(false)
    setTitanWorldReady(false)
  }

  // Click handler for the entity list: tells the iframe to pan the camera
  // to this Hermes entity's mapped SC unit AND select it (which fires the
  // existing `titan:selected-units` postMessage so the unit inspector
  // pops up — single-click does both).
  const focusEntityInIframe = (hermesId: string) => {
    const iframe = iframeRef.current
    if (!iframe || !iframe.contentWindow) return
    if (!titanWorldReady) {
      console.warn(
        '[TitanGameClient] focus-entity ignored: Titan world not ready yet',
      )
      return
    }
    try {
      iframe.contentWindow.postMessage(
        { type: 'hermes:focus-entity', id: hermesId },
        '*',
      )
    } catch (err) {
      console.warn('[TitanGameClient] failed to post hermes:focus-entity', err)
    }
  }

  // Optional override: ?map=<path> on the outer Hermes URL pins a specific map.
  const outerMapOverride = useMemo(() => {
    try {
      const q = new URLSearchParams(window.location.search)
      return q.get('map')
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    const url = `${cascBase.replace(/\/$/, '')}/maps-list`
    console.log('[TitanGameClient] fetching maps list:', url)
    fetch(url, { signal: ac.signal, cache: 'force-cache' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`maps-list HTTP ${r.status}`)
        const j = (await r.json()) as { files?: MapFile[] }
        const files = Array.isArray(j.files) ? j.files : []
        console.log('[TitanGameClient] maps list loaded:', files.length, 'files')
        setMaps(files)
        setMapListError(null)
      })
      .catch((err) => {
        if (ac.signal.aborted) return
        const msg = String(err && err.message) || String(err)
        console.warn('[TitanGameClient] maps-list fetch failed:', msg)
        setMapListError(msg)
      })
    return () => ac.abort()
  }, [cascBase])

  const chosenMapPath = useMemo(() => {
    if (outerMapOverride) return outerMapOverride
    // Do not boot Titan into the bundled replay while /maps-list is still
    // loading. That creates a replay iframe first, then swaps to a map iframe
    // later, which looks like the map never opens and can leave the user
    // staring at Titan's wraith/home scene. Start with a known map path
    // immediately, then refine it once the real map list arrives.
    if (maps.length === 0) {
      return selectedMapPath || DEFAULT_MAP_CANDIDATES[0]
    }
    if (selectedMapPath && maps.some((m) => m.path === selectedMapPath)) {
      return selectedMapPath
    }
    for (const cand of DEFAULT_MAP_CANDIDATES) {
      const hit = maps.find((m) => m.name === cand || m.path.endsWith('/' + cand))
      if (hit) return hit.path
    }
    // Fallback: first .scm or .scx we can find, then the stable default.
    const fallback = maps.find((m) => /\.(scm|scx)$/i.test(m.name))
    return fallback ? fallback.path : DEFAULT_MAP_CANDIDATES[0]
  }, [outerMapOverride, selectedMapPath, maps])

  const src = useMemo(() => {
    const q = new URLSearchParams()
    q.set('assetServerUrl', cascBase.replace(/\/$/, ''))
    q.set('runtime', runtime.replace(/\/$/, '') + '/')
    q.set('plugins', plugins.replace(/\/$/, '') + '/')
    // Hermes embedders never want Titan's first-run modal; we show our own HUD.
    q.set('hideWelcome', '1')
    // Hermes embed: keep the simulation alive forever as ONE continuous
    // session. When the replay reaches its last frame we flip OpenBW into
    // sandbox mode (see replay-scene.tsx) so the world keeps ticking without
    // rewinding or restarting. This is the user-preferred "infinite time,
    // no loop" behaviour.
    q.set('endless', '1')
    // Hermes embed: hide Titan's minimap. The StarCraft command HUD remains,
    // but the map rectangle no longer covers the lower-left play area.
    q.set('nominimap', '1')
    // Hermes embed: hide the OS cursor everywhere inside the iframe so the
    // only cursor the user sees is the in-game StarCraft cursor sprite.
    q.set('hideOsCursor', '1')
    // Hermes embed: classic StarCraft camera pan — moving the mouse to the
    // EDGE of the screen pans the camera. No click-and-drag panning.
    q.set('edgePan', '1')
    // Hermes embed: turn on the bundled Titan HUD (resources bar, command
    // card, supply, APM, unit wireframe) without needing any plugin to be
    // installed/loaded from the plugin runtime.
    q.set('hud', '1')
    // Hermes embed: boot the camera looking at the MAP CENTER (where the
    // Hermes Command Center / Battlecruiser is spawned at world 0,0,0)
    // instead of the player-0 start location which is in a corner.
    q.set('hermesCenter', '1')
    // Hermes embed: limit vision to the Hermes-owned player (#0) so fog of
    // war behaves like a real game if Titan overlays are re-enabled.
    q.set('fogOfWar', '1')
    // Hermes embed: Titan owns the splash/race/loading boot UI. It sends
    // `titan:race-selected` back to this dashboard before loading the map.
    q.set('hermesBoot', '1')
    if (raceResetToken > 0) {
      q.set('hermesResetRace', String(raceResetToken))
    }
    // Force VM-safe Titan rendering from the embed URL. Real-GPU/full-quality
    // sessions can still override by opening Titan directly without this param.
    q.set('webglCompat', '1')
    // Bust normal Chrome/Vite iframe/module cache after renderer fallback changes.
    q.set('titanCodeVersion', TITAN_IFRAME_CODE_VERSION)
    if (new URLSearchParams(window.location.search).has('trace')) {
      q.set('trace', '1')
    }
    const mapUrl = `${cascBase.replace(/\/$/, '')}/maps/${chosenMapPath
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`
    q.set('map', mapUrl)
    const built = `${titanBase.replace(/\/$/, '')}/?${q.toString()}`
    console.log('[TitanGameClient] iframe src:', built)
    return built
  }, [titanBase, cascBase, runtime, plugins, chosenMapPath, raceResetToken])

  const resetRaceSelection = () => {
    setSelectedRace(null)
    setSelectedUnits([])
    setEntitiesAppliedReady(false)
    setTitanWorldReady(false)
    setEditMode(false)
    setRaceResetToken((token) => token + 1)
  }

  const pickMap = (p: string) => {
    try {
      localStorage.setItem(MAP_LS_KEY, p)
    } catch {}
    setSelectedMapPath(p)
    setPickerOpen(false)
  }

  const selectedEditUnit = editMode
    ? selectedUnits.find(
        (u) => u.isBuilding && u.hermesId && u.hermesId === editingHermesId,
      ) ?? selectedUnits.find((u) => u.isBuilding && u.hermesId)
    : undefined
  const selectedEditEntity = editingHermesId
    ? effectiveEntities.get(editingHermesId)
    : undefined
  const selectedEditOverride = selectedEditEntity
    ? editOverrides[selectedEditEntity.id] ?? {}
    : undefined

  const updateSelectedEdit = (patch: EditOverride) => {
    if (!selectedEditEntity) return
    const savedOverrides = readSavedEditOverrides()
    const current = savedOverrides[selectedEditEntity.id] ?? editOverrides[selectedEditEntity.id] ?? {}
    const basePx = current.editPx ?? selectedEditUnit?.x ?? 0
    const basePy = current.editPy ?? selectedEditUnit?.y ?? 0
    const nextOverride: EditOverride = {
      ...current,
      ...patch,
      scType: patch.scType ?? draftScType ?? current.scType ?? selectedEditEntity.scType,
      editPx:
        patch.editPx ??
        current.editPx ??
        Math.round(basePx),
      editPy:
        patch.editPy ??
        current.editPy ??
        Math.round(basePy),
    }
    deferredTypeApplyIdsRef.current.add(selectedEditEntity.id)
    saveEditOverridesForReload({
      ...savedOverrides,
      [selectedEditEntity.id]: nextOverride,
    })
  }

  const nudgeSelectedEdit = (dx: number, dy: number) => {
    if (!selectedEditEntity) return
    const savedOverrides = readSavedEditOverrides()
    const current = savedOverrides[selectedEditEntity.id] ?? editOverrides[selectedEditEntity.id] ?? {}
    updateSelectedEdit({
      editPx: Math.round((current.editPx ?? selectedEditUnit?.x ?? 0) + dx),
      editPy: Math.round((current.editPy ?? selectedEditUnit?.y ?? 0) + dy),
    })
  }

  const resetSelectedEdit = () => {
    if (!selectedEditEntity) return
    const next = { ...editOverrides }
    delete next[selectedEditEntity.id]
    setDraftScType(null)
    setDeferredTypeApplyIds((prev) => {
      const nextIds = new Set(prev)
      nextIds.delete(selectedEditEntity.id)
      deferredTypeApplyIdsRef.current.delete(selectedEditEntity.id)
      return nextIds
    })
    persistEditOverrides(next)
  }

  const clearAllEdits = () => {
    setDraftScType(null)
    deferredTypeApplyIdsRef.current.clear()
    setDeferredTypeApplyIds(new Set())
    persistEditOverrides({})
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <iframe
        ref={iframeRef}
        // Force full reload when we change the chosen map so Titan re-runs bootup.
        key={`${chosenMapPath || 'nomap'}:${TITAN_IFRAME_CODE_VERSION}:${iframeReloadNonce}`}
        title="Titan Reactor (StarCraft original client renderer)"
        src={src}
        onLoad={onIframeLoad}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 0,
          cursor: 'none',
        }}
      />
      <TitanNativeHud />
      <TitanHermesOverlay
        onOpenMapPicker={() => setPickerOpen(true)}
        chosenMapPath={chosenMapPath}
        mapCount={maps.length}
        mapListError={mapListError}
        onFocusEntity={focusEntityInIframe}
        entitiesOverride={effectiveEntities}
        editMode={editMode}
        onResetRaceSelection={resetRaceSelection}
      />
      <TitanLiveLog
        mapReady={titanWorldReady && !!selectedRace && entitiesAppliedReady}
        onReloadTitan={handleFullReloadTitan}
      />
      {editMode && (
        <div
          data-testid="titan-edit-panel"
          style={{
            position: 'fixed',
            left: 12,
            top: 52,
            width: 340,
            maxHeight: 'calc(100vh - 70px)',
            overflow: 'auto',
            background: 'rgba(4,12,24,0.94)',
            border: '1px solid #1e5a82',
            borderRadius: 4,
            color: '#bfe',
            fontFamily: '"Courier New", ui-monospace, monospace',
            fontSize: 11,
            zIndex: 1200,
            pointerEvents: 'auto',
            boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
          }}
        >
          <div
            style={{
              padding: '8px 10px',
              background: 'rgba(10,30,50,0.85)',
              borderBottom: '1px solid #153a52',
              color: '#5cf',
              fontWeight: 'bold',
              letterSpacing: 1,
            }}
          >
            EDIT BUILDING LAYOUT
          </div>
          <div style={{ padding: 10, display: 'grid', gap: 10 }}>
            {!selectedEditEntity && (
              <div style={{ color: '#9cf', lineHeight: 1.5 }}>
                Click any Hermes-spawned building in the map to edit it. Pan stays
                locked; use wheel zoom to get close before selecting.
              </div>
            )}
            {selectedEditEntity && (
              <>
                <div>
                  <div style={{ color: '#fff', fontWeight: 'bold' }}>
                    {selectedEditEntity.label}
                  </div>
                  <div style={{ color: '#9cf' }}>
                    {selectedEditEntity.id}
                    {selectedEditUnit ? ` · unit ${selectedEditUnit.id}` : ' · respawning'}
                  </div>
                  <div style={{ color: '#9cf' }}>
                    pos{' '}
                    <span style={{ color: '#fff' }}>
                      {Math.round(selectedEditOverride?.editPx ?? selectedEditUnit?.x ?? 0)},{' '}
                      {Math.round(selectedEditOverride?.editPy ?? selectedEditUnit?.y ?? 0)}
                    </span>
                  </div>
                </div>
                <label style={{ display: 'grid', gap: 4, color: '#9cf' }}>
                  Building type
                  <select
                    data-testid="titan-edit-building-select"
                    value={draftScType ?? selectedEditEntity.scType}
                    onChange={(ev) => setDraftScType(ev.target.value)}
                    style={{
                      background: '#071522',
                      color: '#cfe',
                      border: '1px solid #1e5a82',
                      padding: '6px',
                      fontFamily: 'inherit',
                    }}
                  >
                    {BUILDING_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ color: '#5cf' }}>Move / replace</div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      gap: 6,
                    }}
                  >
                    <span />
                    <button data-testid="titan-edit-nudge-north" onClick={() => nudgeSelectedEdit(0, -32)} style={editButtonStyle}>
                      north
                    </button>
                    <span />
                    <button data-testid="titan-edit-nudge-west" onClick={() => nudgeSelectedEdit(-32, 0)} style={editButtonStyle}>
                      west
                    </button>
                    <button data-testid="titan-edit-save-here" onClick={() => updateSelectedEdit({ scType: draftScType ?? selectedEditEntity.scType })} style={editButtonStyle}>
                      save here
                    </button>
                    <button data-testid="titan-edit-nudge-east" onClick={() => nudgeSelectedEdit(32, 0)} style={editButtonStyle}>
                      east
                    </button>
                    <span />
                    <button data-testid="titan-edit-nudge-south" onClick={() => nudgeSelectedEdit(0, 32)} style={editButtonStyle}>
                      south
                    </button>
                    <span />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button data-testid="titan-edit-reset-selected" onClick={resetSelectedEdit} style={editButtonStyle}>
                    reset selected
                  </button>
                  <button data-testid="titan-edit-clear-all" onClick={clearAllEdits} style={editDangerButtonStyle}>
                    clear all saved
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <TitanUnitInspector
        units={selectedUnits}
        onClose={() => setSelectedUnits([])}
      />
      {pickerOpen && (
        <TitanMapPicker
          maps={maps}
          selected={chosenMapPath}
          onSelect={pickMap}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
