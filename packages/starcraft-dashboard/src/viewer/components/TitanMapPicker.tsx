import { useMemo, useState } from 'react'

export interface TitanMapPickerMap {
  path: string
  name: string
  size: number
}

export interface TitanMapPickerProps {
  maps: TitanMapPickerMap[]
  selected: string | null
  onSelect: (path: string) => void
  onClose: () => void
}

/**
 * Modal-ish map picker overlay for the Titan iframe.
 * Filters the SC_ROOT/Maps listing and, on click, triggers a Titan iframe reload
 * with the new ?map=<url> so the MapScene boots fresh.
 */
export function TitanMapPicker({ maps, selected, onSelect, onClose }: TitanMapPickerProps) {
  const [filter, setFilter] = useState('')

  const filtered = useMemo(() => {
    if (!filter.trim()) return maps
    const f = filter.trim().toLowerCase()
    return maps.filter(
      (m) => m.name.toLowerCase().includes(f) || m.path.toLowerCase().includes(f),
    )
  }, [maps, filter])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,5,15,0.85)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"Courier New", ui-monospace, monospace',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 560,
          maxHeight: '80vh',
          background: '#061424',
          border: '1px solid #1e5a82',
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#cfe',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid #153a52',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <strong style={{ color: '#9cf', fontSize: 13 }}>PICK A STARCRAFT MAP</strong>
          <span style={{ color: '#888', fontSize: 11 }}>
            from SC_ROOT/Maps ({maps.length} files)
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
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
            close
          </button>
        </div>
        <div style={{ padding: 10, borderBottom: '1px solid #0b2232' }}>
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter by name (e.g. Lost Temple, Hunters)"
            style={{
              width: '100%',
              padding: '6px 8px',
              background: '#020a14',
              border: '1px solid #1e5a82',
              color: '#cfe',
              fontFamily: 'inherit',
              fontSize: 12,
            }}
          />
        </div>
        <div style={{ overflow: 'auto', flex: 1 }}>
          {filtered.length === 0 && (
            <div style={{ padding: 14, color: '#888', fontSize: 12 }}>
              No maps match "{filter}".
            </div>
          )}
          {filtered.slice(0, 400).map((m) => {
            const isSel = m.path === selected
            return (
              <div
                key={m.path}
                onClick={() => onSelect(m.path)}
                style={{
                  padding: '6px 12px',
                  borderBottom: '1px solid #0b2232',
                  fontSize: 12,
                  cursor: 'pointer',
                  background: isSel ? '#102a40' : 'transparent',
                  color: isSel ? '#fff' : '#cfe',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
                title={m.path}
              >
                <span
                  style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flex: 1,
                  }}
                >
                  {m.name}
                </span>
                <span style={{ color: '#7af', fontSize: 10 }}>
                  {(m.size / 1024).toFixed(0)} KB
                </span>
              </div>
            )
          })}
          {filtered.length > 400 && (
            <div style={{ padding: 10, color: '#888', fontSize: 11 }}>
              ({filtered.length - 400} more hidden, refine filter)
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
