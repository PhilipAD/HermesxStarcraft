import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { useWebSocket } from './hooks/useWebSocket'
import { useFPS } from './hooks/useFPS'
import { useDashboardStore } from './store'
import { Scene as ProceduralScene } from './components/Scene'
import { Scene as CascbridgeScene } from './components/CascbridgeScene'
import { TitanGameClient } from './TitanGameClient'
import { HUD } from './components/HUD'
import { EntityPanel } from './components/EntityPanel'
import { PerformanceMonitor } from './components/PerformanceMonitor'
import { HermesDiagOverlay } from './components/HermesDiagOverlay'
import { CascDevModeBanner } from './components/CascDevModeBanner'
import { getViewMode } from './view-mode'

const useCascbridgeAssets = import.meta.env.VITE_CASCBRIDGE === '1'
const Scene = useCascbridgeAssets ? CascbridgeScene : ProceduralScene

const WS_URL = `ws://127.0.0.1:9121/ws`

function DashboardApp() {
  useWebSocket(WS_URL)
  useFPS()

  const { connectionStatus, showGrid, showLabels, viewMode } = useDashboardStore()

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#0a1428' }}>
      <Canvas
        camera={{ position: [0, 40, 60], fov: 55 }}
        shadows
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          alpha: false,
        }}
        style={{ position: 'absolute', top: 0, left: 0 }}
        onCreated={(state) => {
          state.scene.background = new THREE.Color(0x0a1428)
          state.gl.setClearColor(0x0a1428)
          console.log('[SC-VIZ] Scene created — background set to 0x0a1428')
        }}
      >
        <Suspense fallback={null}>
          <Scene showGrid={showGrid} showLabels={showLabels} viewMode={viewMode} />
        </Suspense>
      </Canvas>

      <HUD />

      <EntityPanel />

      <PerformanceMonitor />

      <HermesDiagOverlay />

      <CascDevModeBanner />

      {connectionStatus !== 'connected' && (
        <div style={{
          position: 'absolute',
          top: 60,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 20px',
          background: connectionStatus === 'connecting' ? '#FF6600' : '#FF0000',
          color: '#000',
          fontFamily: 'Courier New',
          fontWeight: 'bold',
          fontSize: 12,
          borderRadius: 4,
          zIndex: 1000,
        }}>
          {connectionStatus === 'connecting' ? 'CONNECTING TO BRIDGE...' :
           connectionStatus === 'disconnected' ? 'DISCONNECTED - RECONNECTING...' :
           'CONNECTION ERROR'}
        </div>
      )}
    </div>
  )
}

export function App() {
  const mode = getViewMode(typeof window !== 'undefined' ? window.location.search : '')
  if (mode === 'dash' || mode === 'cascdev') {
    return <DashboardApp />
  }
  return <TitanGameClient />
}
