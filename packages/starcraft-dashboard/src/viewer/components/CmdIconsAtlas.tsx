import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Render a single SC command icon from the cmdicons.grp atlas.
 *
 * The atlas is built server-side by the `casc-http` server's
 * `/cmdicons/atlas.png` + `/cmdicons/atlas.json` endpoints. We fetch each
 * once and cache them in a module-scoped promise so the HUD can drop
 * <CmdIcon iconId={...} /> anywhere without worrying about lifecycles.
 *
 * Unknown / out-of-range iconIds render an empty placeholder so the
 * caller never has to guard.
 */

interface AtlasFrame {
  x: number
  y: number
  w: number
  h: number
  cw: number
  ch: number
  ox: number
  oy: number
}
interface AtlasManifest {
  tilesPerRow: number
  tileW: number
  tileH: number
  count: number
  atlasW: number
  atlasH: number
  frames: AtlasFrame[]
}

const DEFAULT_BASE = 'http://127.0.0.1:8080'

interface AtlasState {
  url: string
  manifest: AtlasManifest
}

let _loader: Promise<AtlasState | null> | null = null

function loadAtlas(base: string): Promise<AtlasState | null> {
  if (_loader) return _loader
  const root = base.replace(/\/$/, '')
  _loader = (async () => {
    try {
      const r = await fetch(root + '/cmdicons/atlas.json')
      if (!r.ok) return null
      const manifest = (await r.json()) as AtlasManifest
      return { url: root + '/cmdicons/atlas.png', manifest }
    } catch {
      return null
    }
  })()
  return _loader
}

export function useCmdIconsAtlas(base = DEFAULT_BASE) {
  const [state, setState] = useState<AtlasState | null>(null)
  useEffect(() => {
    let cancelled = false
    loadAtlas(base).then((s) => {
      if (!cancelled) setState(s)
    })
    return () => {
      cancelled = true
    }
  }, [base])
  return state
}

interface CmdIconProps {
  iconId: number
  size?: number
  base?: string
  title?: string
  onClick?: () => void
}

export function CmdIcon({ iconId, size = 32, base = DEFAULT_BASE, title, onClick }: CmdIconProps) {
  const atlas = useCmdIconsAtlas(base)
  if (!atlas || iconId < 0 || iconId >= atlas.manifest.count) {
    return (
      <div
        title={title}
        style={{
          width: size,
          height: size,
          background: 'rgba(40,52,72,0.5)',
          border: '1px solid #2a3242',
          borderRadius: 3,
          cursor: onClick ? 'pointer' : 'default',
        }}
        onClick={onClick}
      />
    )
  }
  const f = atlas.manifest.frames[iconId]
  const scaleX = size / atlas.manifest.tileW
  const scaleY = size / atlas.manifest.tileH
  return (
    <div
      title={title}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${atlas.url})`,
        backgroundPosition: `-${f.x * scaleX}px -${f.y * scaleY}px`,
        backgroundSize: `${atlas.manifest.atlasW * scaleX}px ${
          atlas.manifest.atlasH * scaleY
        }px`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated' as const,
        cursor: onClick ? 'pointer' : 'default',
        border: '1px solid #2a3242',
        borderRadius: 3,
      }}
    />
  )
}

interface CmdIconGridProps {
  count?: number
  base?: string
  iconSize?: number
}

/**
 * Diagnostic / browse view: renders the entire icon atlas as a grid so
 * the user can pick an iconId visually.
 */
export function CmdIconGrid({ count, base = DEFAULT_BASE, iconSize = 28 }: CmdIconGridProps) {
  const atlas = useCmdIconsAtlas(base)
  const ids = useMemo(() => {
    const max = atlas?.manifest.count ?? 0
    const limit = count != null ? Math.min(count, max) : max
    const out: number[] = []
    for (let i = 0; i < limit; i++) out.push(i)
    return out
  }, [atlas, count])
  if (!atlas) return <div style={{ opacity: 0.6 }}>loading atlas...</div>
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${iconSize + 6}px, 1fr))`,
        gap: 4,
        padding: 4,
      }}
    >
      {ids.map((id) => (
        <CmdIcon key={id} iconId={id} size={iconSize} title={`iconId=${id}`} />
      ))}
    </div>
  )
}

/**
 * Module-side reset hook for tests / hot reload.
 */
export function _resetCmdIconsCache() {
  _loader = null
}

// Re-export the ref-based hook for advanced consumers that want to render
// onto a canvas directly (e.g. minimap overlay).
export function useCmdIconsImage(base = DEFAULT_BASE) {
  const atlas = useCmdIconsAtlas(base)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!atlas) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = atlas.url
    img.onload = () => {
      imgRef.current = img
      setLoaded(true)
    }
    return () => {
      imgRef.current = null
      setLoaded(false)
    }
  }, [atlas])
  return { atlas, image: imgRef.current, loaded }
}
