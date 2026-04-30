import { useEffect, useMemo, useState } from 'react'
import type {
  ApiResult,
  CapabilityDescriptor,
  HermesApiManifest,
} from '../hermes-api-client'

/**
 * Hermes API control panel
 *
 * Discoverability + manual-test surface for every capability the iframe's
 * `__hermesAPI` exposes. The dashboard imports it once; users can collapse
 * it. Each capability is rendered as a row with its name, domain badge,
 * availability indicator, and a one-click test button (with arg input
 * when required).
 *
 * This is the "single seam" the user asked for: anything the iframe can
 * do is reachable from this panel without writing code.
 */

interface Props {
  manifest: HermesApiManifest | null
  invoke: <T = unknown>(path: string, args?: unknown[]) => Promise<ApiResult<T>>
  initialOpen?: boolean
}

interface InvocationLog {
  id: number
  path: string
  args: unknown[]
  result: ApiResult
  at: number
}

export function HermesApiPanel({ manifest, invoke, initialOpen = false }: Props) {
  const [open, setOpen] = useState(initialOpen)
  const [filter, setFilter] = useState('')
  const [argDrafts, setArgDrafts] = useState<Record<string, string>>({})
  const [log, setLog] = useState<InvocationLog[]>([])
  const [counter, setCounter] = useState(0)

  const grouped = useMemo(() => {
    if (!manifest) return new Map<string, CapabilityDescriptor[]>()
    const m = new Map<string, CapabilityDescriptor[]>()
    for (const cap of manifest.manifest) {
      if (filter && !cap.name.toLowerCase().includes(filter.toLowerCase())) continue
      const list = m.get(cap.domain) ?? []
      list.push(cap)
      m.set(cap.domain, list)
    }
    return m
  }, [manifest, filter])

  if (!manifest) {
    return (
      <div style={panelStyle()}>
        <div style={headerStyle()} onClick={() => setOpen((v) => !v)}>
          <span>Hermes API</span>
          <span style={{ opacity: 0.6, fontSize: 11 }}>waiting for ready signal...</span>
        </div>
      </div>
    )
  }

  const featureCount = Object.values(manifest.features).filter(Boolean).length
  const totalFeatures = Object.keys(manifest.features).length

  const runCapability = async (cap: CapabilityDescriptor) => {
    const argsStr = argDrafts[cap.name] ?? ''
    let args: unknown[] = []
    if (cap.args && cap.args.length > 0 && argsStr.trim()) {
      try {
        args = JSON.parse('[' + argsStr + ']')
      } catch {
        args = argsStr
          .split(',')
          .map((s) => s.trim())
          .map((s) => {
            if (s === 'true') return true
            if (s === 'false') return false
            if (s === 'null') return null
            const n = Number(s)
            if (!Number.isNaN(n)) return n
            return s.replace(/^['"]|['"]$/g, '')
          })
      }
    }
    const result = await invoke(cap.name, args)
    setCounter((c) => c + 1)
    setLog((prev) =>
      [
        {
          id: counter + 1,
          path: cap.name,
          args,
          result,
          at: Date.now(),
        },
        ...prev,
      ].slice(0, 50),
    )
  }

  return (
    <div style={panelStyle()}>
      <div style={headerStyle()} onClick={() => setOpen((v) => !v)}>
        <span>
          Hermes API <span style={{ opacity: 0.6 }}>v{manifest.version}</span>
        </span>
        <span
          style={{
            background: featureCount === totalFeatures ? '#1f8a3b' : '#7a5b00',
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 11,
            marginLeft: 'auto',
          }}
        >
          {featureCount}/{totalFeatures} optional WASM exports
        </span>
        <span style={{ opacity: 0.6 }}>{open ? 'v' : '>'}</span>
      </div>
      {open ? (
        <div style={bodyStyle()}>
          <input
            value={filter}
            placeholder="Filter capabilities..."
            onChange={(e) => setFilter(e.target.value)}
            style={inputStyle()}
          />
          <div style={{ overflow: 'auto', maxHeight: '50vh' }}>
            {Array.from(grouped.entries()).map(([domain, caps]) => (
              <div key={domain} style={domainBlockStyle()}>
                <div style={domainHeaderStyle()}>
                  {domain}{' '}
                  <span style={{ opacity: 0.5, fontSize: 10 }}>{caps.length}</span>
                </div>
                {caps.map((cap) => {
                  const enabled = cap.available
                  return (
                    <div key={cap.name} style={rowStyle(enabled)}>
                      <div style={{ flex: '1 0 auto', minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                          <span
                            style={{
                              color: enabled ? '#7fdb88' : '#dd9b6c',
                              fontFamily: 'monospace',
                              fontSize: 12,
                            }}
                          >
                            {cap.name.split('.').slice(1).join('.')}
                          </span>
                          {cap.requires ? (
                            <span style={{ color: '#dd9b6c', fontSize: 10 }}>
                              needs {cap.requires}
                            </span>
                          ) : null}
                        </div>
                        <div style={{ opacity: 0.7, fontSize: 11 }}>
                          {cap.description}
                        </div>
                        {cap.args && cap.args.length > 0 ? (
                          <input
                            value={argDrafts[cap.name] ?? ''}
                            placeholder={cap.args.join(', ')}
                            onChange={(e) =>
                              setArgDrafts((p) => ({
                                ...p,
                                [cap.name]: e.target.value,
                              }))
                            }
                            style={argInputStyle()}
                          />
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={!enabled}
                        onClick={() => runCapability(cap)}
                        style={runButtonStyle(enabled)}
                      >
                        run
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid #333', marginTop: 6, paddingTop: 6 }}>
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
              recent invocations
            </div>
            <div style={{ maxHeight: 160, overflow: 'auto', fontSize: 11 }}>
              {log.length === 0 ? (
                <div style={{ opacity: 0.5 }}>nothing yet</div>
              ) : (
                log.map((l) => (
                  <div key={l.id} style={logRowStyle(l.result.ok)}>
                    <span style={{ fontFamily: 'monospace' }}>{l.path}</span>
                    <span style={{ opacity: 0.6 }}>
                      {' '}
                      ({l.args.length} args)
                    </span>
                    <pre
                      style={{
                        margin: '2px 0 0 0',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        opacity: 0.8,
                      }}
                    >
                      {tryStringify(l.result)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function tryStringify(v: unknown) {
  try {
    const s = JSON.stringify(v, null, 2)
    return s.length > 1200 ? s.slice(0, 1200) + ' ... [truncated]' : s
  } catch {
    return String(v)
  }
}

function panelStyle(): React.CSSProperties {
  return {
    position: 'fixed',
    right: 12,
    bottom: 12,
    width: 480,
    maxWidth: '40vw',
    background: 'rgba(8, 12, 18, 0.92)',
    color: '#dde',
    border: '1px solid #2a3242',
    borderRadius: 6,
    fontFamily: 'system-ui, sans-serif',
    fontSize: 12,
    boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
    zIndex: 99,
  }
}
function headerStyle(): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    cursor: 'pointer',
    userSelect: 'none',
    fontWeight: 600,
  }
}
function bodyStyle(): React.CSSProperties {
  return {
    padding: '6px 10px 10px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    borderTop: '1px solid #1f2632',
  }
}
function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: '5px 8px',
    background: '#11161e',
    color: '#dde',
    border: '1px solid #2a3242',
    borderRadius: 4,
    boxSizing: 'border-box',
  }
}
function domainBlockStyle(): React.CSSProperties {
  return { marginTop: 8 }
}
function domainHeaderStyle(): React.CSSProperties {
  return {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    opacity: 0.55,
    margin: '4px 0',
  }
}
function rowStyle(enabled: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '6px 0',
    borderTop: '1px solid #1a2030',
    opacity: enabled ? 1 : 0.55,
  }
}
function argInputStyle(): React.CSSProperties {
  return {
    width: '100%',
    marginTop: 3,
    padding: '3px 6px',
    background: '#0c1018',
    color: '#9ab',
    border: '1px solid #1d2432',
    borderRadius: 3,
    fontSize: 11,
    fontFamily: 'monospace',
    boxSizing: 'border-box',
  }
}
function runButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    flex: '0 0 auto',
    padding: '4px 10px',
    background: enabled ? '#1f3a52' : '#252b35',
    color: enabled ? '#cde' : '#666',
    border: '1px solid ' + (enabled ? '#2c4d6b' : '#2a2f38'),
    borderRadius: 3,
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontSize: 11,
  }
}
function logRowStyle(okFlag: boolean): React.CSSProperties {
  return {
    padding: '4px 6px',
    marginBottom: 2,
    background: okFlag ? '#11251a' : '#2a1414',
    borderLeft: '2px solid ' + (okFlag ? '#1f8a3b' : '#aa3434'),
    borderRadius: 3,
  }
}
