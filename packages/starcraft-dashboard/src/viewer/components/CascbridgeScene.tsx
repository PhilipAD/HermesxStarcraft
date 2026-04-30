import { useEffect, useRef, Suspense, useMemo } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { OrbitControls, Text, Sky, Stars, Billboard } from '@react-three/drei'
import * as THREE from 'three'
import { useDashboardStore, type Entity } from '../store'
import { SCTerrain, getTerrainHeight } from './Terrain'

// ─── Cascbridge Configuration ─────────────────────────────────────────────────
// Same-origin in dev (Vite proxies /casc-assets -> Cascbridge) avoids CORS on GLTF loads
const CASC_BASE =
  import.meta.env.DEV && import.meta.env.VITE_CASCBRIDGE === '1'
    ? '/casc-assets'
    : 'http://127.0.0.1:8080'

function isCascbridgeEnabled(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as { __CASCBRIDGE_ENABLED__?: boolean }
  return w.__CASCBRIDGE_ENABLED__ === true || import.meta.env.VITE_CASCBRIDGE === '1'
}

// SCR CASC does not ship GLB unit models; use real in-archive DDS (same data CascLib reads as cascbridge).
const GAME_TEXTURE_MAP: Record<string, string> = {
  CommandCenter: '/HD2/glue/paltcx/xterranc.DDS',
  TechBuilding: '/HD2/glue/palta/terrana.DDS',
  Barracks: '/HD2/glue/paltb/terranb.DDS',
  SupplyDepot: '/HD2/game/consoles/terran/conover.DDS',
  Bunker: '/HD2/game/consoles/terran/pbrempt.DDS',
  Gateway: '/HD2/glue/palpa/protossa.DDS',
  VespeneGeyser: '/HD2/game/consoles/terran/pbrfull.DDS',
  SCV: '/HD2/game/consoles/terran/console_APM.DDS',
  Marine: '/HD2/game/consoles/terran/console_center.DDS',
  Zealot: '/HD2/glue/palpb/protossb.DDS',
}

// ─── Real CASC texture (DDS) on a billboard ───────────────────────────────
function CascbridgeRasterModel({ path, scale = 1 }: {
  path: string
  scale?: number | [number, number, number]
}) {
  const url = `${CASC_BASE}${path}?png=1`
  const tex = useLoader(THREE.TextureLoader, url)
  const [sx, sy] = typeof scale === 'number' ? [scale * 12, scale * 12] : [scale[0] * 10, scale[1] * 10]

  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
  }, [tex])

  return (
    <group position={[0, 2.5, 0]}>
      <Billboard follow>
        <mesh renderOrder={2}>
          <planeGeometry args={[sx, sy]} />
          <meshBasicMaterial
            map={tex}
            transparent
            side={THREE.DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </Billboard>
    </group>
  )
}

// ─── Fallback Procedural Models (when Cascbridge unavailable) ───────────────
function ProceduralModel({ type, entity, isSelected }: {
  type: string; entity: Entity; isSelected: boolean
}) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const color = new THREE.Color(entity.color)
  const emissiveColor = new THREE.Color(entity.emissive)
  const glow = isSelected ? 2 : entity.activity === 'active' ? 0.8 : 0.3

  useFrame(({ clock }) => {
    if (meshRef.current && entity.activity === 'active') {
      meshRef.current.rotation.y += 0.01
    }
  })

  const geometry = useMemo(() => {
    switch (type) {
      case 'CommandCenter': return <boxGeometry args={[3, 2.5, 3]} />
      case 'TechBuilding':  return <boxGeometry args={[2.5, 2, 2.5]} />
      case 'Barracks':      return <boxGeometry args={[2.5, 1.8, 2.5]} />
      case 'SupplyDepot':   return <boxGeometry args={[2.5, 2, 2.5]} />
      case 'Bunker':        return <boxGeometry args={[2.5, 2, 2.5]} />
      case 'Gateway':       return <boxGeometry args={[3, 2.5, 3]} />
      case 'VespeneGeyser': return <cylinderGeometry args={[1.5, 1.5, 0.5, 12]} />
      case 'SCV':           return <boxGeometry args={[0.8, 0.8, 0.8]} />
      case 'Marine':        return <boxGeometry args={[0.6, 0.8, 0.4]} />
      case 'Zealot':        return <boxGeometry args={[0.8, 1, 0.6]} />
      default:              return <boxGeometry args={[1, 1, 1]} />
    }
  }, [type])

  return (
    <group position={[entity.x, entity.y, entity.z]}>
      <mesh ref={meshRef} castShadow receiveShadow>
        {geometry}
        <meshStandardMaterial
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={glow}
          metalness={0.5}
          roughness={0.4}
        />
      </mesh>
      {isSelected && (
        <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[3, 3.5, 32]} />
          <meshBasicMaterial color="#00ffff" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}
      <Text
        position={[0, 2.5, 0]}
        fontSize={0.4}
        color={entity.color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {entity.label}
      </Text>
    </group>
  )
}

// ─── Entity Renderer ─────────────────────────────────────────────────────────
function EntityRenderer({ entity }: { entity: Entity }) {
  const selectedEntity = useDashboardStore(s => s.selectedEntity)
  const selectEntity = useDashboardStore(s => s.selectEntity)
  const isSelected = selectedEntity?.id === entity.id

  const handleClick = (e: any) => {
    e.stopPropagation()
    selectEntity(isSelected ? null : entity)
  }

  const props = { entity, isSelected }

  if (isCascbridgeEnabled() && GAME_TEXTURE_MAP[entity.scType]) {
    return (
      <group position={[entity.x, entity.y, entity.z]} onClick={handleClick}>
        <Suspense fallback={<ProceduralModel type={entity.scType} {...props} />}>
          <CascbridgeRasterModel
            path={GAME_TEXTURE_MAP[entity.scType]}
            scale={entity.scale}
          />
          {isSelected && (
            <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[3, 3.5, 32]} />
              <meshBasicMaterial color="#00ffff" transparent opacity={0.8} side={THREE.DoubleSide} />
            </mesh>
          )}
        </Suspense>
      </group>
    )
  }

  return (
    <group onClick={handleClick}>
      <ProceduralModel type={entity.scType} {...props} />
    </group>
  )
}

// ─── Quality-of-life components ─────────────────────────────────────────────
function SelectionRing() { return null }

// ─── Main Scene ──────────────────────────────────────────────────────────────
export function Scene({ showGrid, showLabels, viewMode }: {
  showGrid: boolean; showLabels: boolean; viewMode: string
}) {
  const entities = useDashboardStore(s => s.entities)
  const { camera } = useThree()

  useEffect(() => {
    if (viewMode === 'top') {
      camera.position.set(0, 120, 0.1)
    } else {
      camera.position.set(0, 50, 80)
    }
  }, [viewMode, camera])

  const terrainEntities = useMemo(() => {
    return Array.from(entities.values()).map(entity => ({
      ...entity,
      y: getTerrainHeight(entity.x, entity.z) + 0.5
    }))
  }, [entities])

  console.log('[SC-VIZ] CascbridgeScene — terrain + entities:', terrainEntities.length)

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.7} color="#8899bb" />
      <directionalLight
        position={[60, 100, 40]}
        intensity={1.8}
        color="#ddeeff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={250}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
      />
      <pointLight position={[-40, 30, -40]} intensity={1.0} color="#ff6600" />
      <pointLight position={[40, 30, 40]} intensity={1.0} color="#0066ff" />
      <pointLight position={[0, 15, 0]} intensity={1.0} color="#55aaff" />
      <hemisphereLight args={['#446688', '#112233', 0.5]} />

      {/* Sky / Atmosphere */}
      <Sky
        distance={450000}
        sunPosition={[100, 50, 100]}
        inclination={0.6}
        azimuth={0.25}
        turbidity={5}
        rayleigh={0.5}
      />
      <Stars radius={300} depth={60} count={2000} factor={4} fade speed={0.5} />
      <fog attach="fog" args={['#050a10', 100, 280]} />

      {/* Terrain */}
      <SCTerrain showGrid={showGrid} />

      {/* Camera */}
      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        minDistance={8}
        maxDistance={200}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, 2, 0]}
        dampingFactor={0.05}
        enableDamping
      />

      {/* Entities */}
      <group>
        {terrainEntities.map(entity => (
          <EntityRenderer key={entity.id} entity={entity} />
        ))}
      </group>

      {/* Click-to-deselect plane */}
      <mesh
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={() => useDashboardStore.getState().selectEntity(null)}
        visible={false}
      >
        <planeGeometry args={[500, 500]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </>
  )
}