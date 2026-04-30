import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// ─── SC-style heightmap terrain ─────────────────────────────────────────────
export function SCTerrain({ showGrid }: { showGrid: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null!)

  // Procedural SC-style heightmap — create a real map surface
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(200, 200, 80, 80)
    const pos = geo.attributes.position.array as Float32Array
    
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i]
      const y = pos[i + 1]
      
      // Central plateau (main base area) — like SC natural expansion
      const distFromCenter = Math.sqrt(x * x + y * y)
      const onPlateau = distFromCenter < 25
      const onRamp = distFromCenter > 20 && distFromCenter < 28
      
      // Multi-octave noise for natural terrain
      let height = 0
      height += Math.sin(x * 0.08) * Math.cos(y * 0.08) * 3.0
      height += Math.sin(x * 0.15 + 1.3) * Math.cos(y * 0.15 + 0.7) * 1.5
      height += (Math.random() - 0.5) * 0.3
      
      // Central base plateau
      if (onPlateau) {
        height = height * 0.3 + 2.0
      }
      // Ramp leading up
      else if (onRamp) {
        const rampFactor = 1 - Math.abs(distFromCenter - 24) / 4
        height = 0.5 + rampFactor * 1.5
      }
      // Low areas (mineral fields / natural)
      else if (distFromCenter > 35 && distFromCenter < 50) {
        height = -1.0 + Math.sin(x * 0.2) * 0.5
      }
      // Distant areas
      else if (distFromCenter > 60) {
        height = -2 + Math.random() * 0.5
      }
      
      pos[i + 2] = height
    }
    
    geo.computeVertexNormals()
    return geo
  }, [])

  // Creep/ground color variation texture
  const creepTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')!
    
    // Base SC dark teal ground
    ctx.fillStyle = '#0a1520'
    ctx.fillRect(0, 0, 512, 512)
    
    // Add organic variation patches (creep-like)
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * 512
      const y = Math.random() * 512
      const r = Math.random() * 40 + 10
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, 'rgba(10, 60, 40, 0.6)')
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = grad
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
    
    // Add subtle grid lines (build tiles)
    ctx.strokeStyle = 'rgba(0, 100, 80, 0.15)'
    ctx.lineWidth = 1
    for (let i = 0; i < 512; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke()
    }
    
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(12, 12)
    return tex
  }, [])

  return (
    <group>
      {/* Main terrain mesh */}
      <mesh 
        ref={meshRef} 
        geometry={geometry}
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, 0, 0]}
        receiveShadow
      >
        <meshStandardMaterial 
          map={creepTexture}
          color="#0a2030"
          roughness={0.95}
          metalness={0.05}
          bumpScale={0.5}
        />
      </mesh>

      {/* Ground plane base (fills gaps below terrain) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3, 0]} receiveShadow>
        <planeGeometry args={[300, 300]} />
        <meshStandardMaterial color="#050a10" roughness={1} metalness={0} />
      </mesh>

      {/* SC-style grid overlay */}
      {showGrid && (
        <gridHelper args={[200, 50, '#0a3040', '#0a2530']} position={[0, 0.05, 0]} />
      )}

      {/* Mineral fields scattered like real SC maps */}
      <MineralField position={[45, 0, 0]} />
      <MineralField position={[-45, 0, 0]} />
      <MineralField position={[0, 0, 45]} />
      <MineralField position={[0, 0, -45]} />
      <MineralField position={[38, 0, 38]} />
      <MineralField position={[-38, 0, -38]} />
      <MineralField position={[38, 0, -38]} />
      <MineralField position={[-38, 0, 38]} />

      {/* Vespene geysers (back of base) */}
      <VespeneGeyserDoodad position={[8, 0, -20]} />
      <VesspeneGeyserDoodad position={[-8, 0, -20]} />

      {/* Rocks / doodads */}
      {[[-50, 20], [55, -30], [-30, 55], [60, 40]].map(([rx, rz], i) => (
        <RockDoodad key={i} position={[rx, 0, rz]} />
      ))}
    </group>
  )
}

// ─── Mineral Field (classic SC blue crystals) ─────────────────────────────────
function MineralField({ position }: { position: [number, number, number] }) {
  const groupRef = useRef<THREE.Group>(null!)
  
  useFrame(({ clock }) => {
    if (groupRef.current) {
      // Subtle shimmer
      groupRef.current.children.forEach((child, i) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissiveIntensity = 0.3 + Math.sin(clock.elapsedTime * 2 + i) * 0.15
        }
      })
    }
  })

  return (
    <group ref={groupRef} position={position}>
      {[[-1.2, 0, 0], [0, 0, 0], [1.2, 0, 0], [-0.6, 0, 1], [0.6, 0, 1]].map((offset, i) => (
        <mesh key={i} position={[offset[0], 0.8 + (i < 3 ? 0 : 0.5), offset[2]]} castShadow>
          <dodecahedronGeometry args={[0.8 + Math.random() * 0.4, 0]} />
          <meshStandardMaterial 
            color={i % 2 === 0 ? '#2299cc' : '#1a7a9a'} 
            emissive="#0a4466"
            emissiveIntensity={0.4}
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>
      ))}
      <pointLight color="#00ccff" intensity={2} distance={12} position={[0, 2, 0]} />
    </group>
  )
}

// ─── Vespene Geyser Doodad ───────────────────────────────────────────────────
function VespeneGeyserDoodad({ position }: { position: [number, number, number] }) {
  const meshRef = useRef<THREE.Mesh>(null!)
  
  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = clock.elapsedTime * 0.3
    }
  })

  return (
    <group position={position}>
      <mesh ref={meshRef} position={[0, 1, 0]} castShadow>
        <icosahedronGeometry args={[2, 0]} />
        <meshStandardMaterial 
          color="#00ddaa" 
          emissive="#00aa66"
          emissiveIntensity={0.8}
          metalness={0.9}
          roughness={0.1}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Orbiting energy rings */}
      {[1.5, 2.5, 3.5].map((radius, i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius, 0.08, 8, 32]} />
          <meshStandardMaterial 
            color="#00ffaa"
            emissive="#00ffaa"
            emissiveIntensity={1}
            transparent
            opacity={0.4 - i * 0.1}
          />
        </mesh>
      ))}
      <pointLight color="#00ffaa" intensity={3} distance={15} position={[0, 2, 0]} />
    </group>
  )
}

// Typo fix: the function name above is correct but the usage had a typo
function VesspeneGeyserDoodad({ position }: { position: [number, number, number] }) {
  return <VespeneGeyserDoodad position={position} />
}

// ─── Rock Doodad ──────────────────────────────────────────────────────────────
function RockDoodad({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.8, 0]} castShadow>
        <dodecahedronGeometry args={[1.5 + Math.random(), 0]} />
        <meshStandardMaterial 
          color="#2a3a4a"
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>
      <mesh position={[1, 0.4, 0.5]} castShadow>
        <dodecahedronGeometry args={[0.8, 0]} />
        <meshStandardMaterial color="#1a2a3a" roughness={0.9} metalness={0.1} />
      </mesh>
    </group>
  )
}

// ─── Get terrain height at world position ─────────────────────────────────────
// Export for use in entity positioning
export function getTerrainHeight(worldX: number, worldZ: number): number {
  const distFromCenter = Math.sqrt(worldX * worldX + worldZ * worldZ)
  const onPlateau = distFromCenter < 25
  const onRamp = distFromCenter > 20 && distFromCenter < 28
  
  let height = 0
  height += Math.sin(worldX * 0.08) * Math.cos(worldZ * 0.08) * 3.0
  height += Math.sin(worldX * 0.15 + 1.3) * Math.cos(worldZ * 0.15 + 0.7) * 1.5
  
  if (onPlateau) height = height * 0.3 + 2.0
  else if (onRamp) height = 0.5 + (1 - Math.abs(distFromCenter - 24) / 4) * 1.5
  else if (distFromCenter > 35 && distFromCenter < 50) height = -1.0 + Math.sin(worldX * 0.2) * 0.5
  else if (distFromCenter > 60) height = -2
  
  return height
}
