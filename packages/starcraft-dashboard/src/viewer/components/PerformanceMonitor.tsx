import { useState, useEffect } from 'react'
import { useDashboardStore } from '../store'

export function PerformanceMonitor() {
  const { fps, entities, connectionStatus } = useDashboardStore()
  const [show, setShow] = useState(false)
  const [memory, setMemory] = useState({ used: 0, total: 0 })

  useEffect(() => {
    const interval = setInterval(() => {
      if ('memory' in performance) {
        const m = (performance as any).memory
        setMemory({ used: Math.round(m.usedJSHeapSize / 1024 / 1024), total: Math.round(m.jsHeapSizeLimit / 1024 / 1024) })
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setShow(s => !s)}
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          background: 'rgba(0,8,20,0.9)',
          border: '1px solid #0a4a6a',
          color: '#0a5a6a',
          padding: '4px 10px',
          fontSize: 10,
          cursor: 'pointer',
          fontFamily: '"Courier New", monospace',
          borderRadius: 2,
          zIndex: 100,
        }}
      >
        PERF {show ? '▲' : '▼'}
      </button>

      {show && (
        <div style={{
          position: 'absolute',
          bottom: 48,
          right: 16,
          background: 'rgba(0,5,15,0.95)',
          border: '1px solid #0a3a5a',
          padding: 12,
          fontFamily: '"Courier New", monospace',
          fontSize: 10,
          color: '#0a5a6a',
          borderRadius: 3,
          zIndex: 100,
          minWidth: 200,
        }}>
          <PerfRow label="FPS" value={fps} good={fps >= 50} warn={fps >= 30} />
          <PerfRow label="ENTS" value={entities.size} warn={entities.size >= 300} />
          <PerfRow label="MEM" value={`${memory.used}MB`} warn={memory.used >= 200} />
          <PerfRow label="WS" value={connectionStatus} good={connectionStatus === 'connected'} />
          <PerfRow label="RENDERER" value="WebGL 2" />
          <PerfRow label="THREE.JS" value="0.169.0" />
          <div style={{ marginTop: 6, color: '#0a3a4a', fontSize: 9 }}>
            CPU ONLY MODE | PAGE VISIBILITY: ACTIVE
          </div>
        </div>
      )}
    </>
  )
}

function PerfRow({ label, value, good, warn }: { label: string; value: string | number; good?: boolean; warn?: boolean }) {
  const color = good ? '#00ff00' : warn ? '#ffcc00' : '#0a5a6a'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
      <span>{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  )
}
