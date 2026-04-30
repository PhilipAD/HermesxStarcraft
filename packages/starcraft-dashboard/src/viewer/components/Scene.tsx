import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Text, Grid, Sky, Stars, Billboard } from '@react-three/drei'
import * as THREE from 'three'
import { useDashboardStore, type Entity } from '../store'
import { SCTerrain, getTerrainHeight } from './Terrain'

// ─── Ground ──────────────────────────────────────────────────────────────────────
// (Replaced by SCTerrain — kept for reference)
// function Ground({ showGrid }: { showGrid: boolean }) { ... }

// ─── SC Buildings ─────────────────────────────────────────────────────────────

function CommandCenter({ entity, isSelected, isHovered }: {
  entity: Entity; isSelected: boolean; isHovered: boolean
}) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const topRef = useRef<THREE.Mesh>(null!)
  const antennaRef = useRef<THREE.Mesh>(null!)
  const glowRef = useRef<THREE.PointLight>(null!)
  const tier = entity.tier || 1

  useFrame(({ clock }) => {
    if (meshRef.current && entity.activity === 'active') {
      meshRef.current.rotation.y = clock.elapsedTime * 0.15
    }
    if (antennaRef.current) {
      antennaRef.current.rotation.y = clock.elapsedTime * 2
    }
    if (glowRef.current) {
      glowRef.current.intensity = 1.5 + Math.sin(clock.elapsedTime * 3) * 0.5
    }
  })

  const color = new THREE.Color(entity.color)
  const emissiveColor = new THREE.Color(entity.emissive)
  const glowIntensity = isSelected ? 2.5 : isHovered ? 1.8 : entity.activity === 'active' ? 1.2 : 0.5
  const scale = Math.min(tier, 3) * 0.5 + 0.8

  return (
    <group position={[entity.x, entity.y, entity.z]}>
      {/* Main building body */}
      <mesh ref={meshRef} castShadow receiveShadow scale={[scale, scale * 0.8, scale]}>
        <boxGeometry args={[3, 2.5, 3]} />
        <meshStandardMaterial 
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={glowIntensity}
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>

      {/* Tower */}
      <mesh ref={topRef} position={[0, 2.8 * scale, 0]} castShadow>
        <boxGeometry args={[1.2, 2, 1.2]} />
        <meshStandardMaterial 
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={glowIntensity * 0.8}
          metalness={0.7}
          roughness={0.2}
        />
      </mesh>

      {/* Antenna with rotation */}
      <mesh ref={antennaRef} position={[0, 4.5 * scale, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.12, 2, 8]} />
        <meshStandardMaterial color="#888888" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Thruster glow */}
      <mesh position={[0, -1.5, 0]}>
        <cylinderGeometry args={[0.6, 0.8, 0.5, 12]} />
        <meshStandardMaterial 
          color="#ff6600"
          emissive="#ff4400"
          emissiveIntensity={2}
          transparent
          opacity={0.7}
        />
      </mesh>

      {/* Selection ring */}
      {isSelected && (
        <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[4 * scale, 4.5 * scale, 32]} />
          <meshBasicMaterial color="#00ffff" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}

      <pointLight ref={glowRef} color={emissiveColor} intensity={glowIntensity * 3} distance={20} position={[0, 3, 0]} />
      <HealthBar entity={entity} />
      <EntityLabel entity={entity} position={[0, 6 * scale, 0]} />
    </group>
  )
}

function TechBuilding({ entity, isSelected, isHovered }: {
  entity: Entity; isSelected: boolean; isHovered: boolean
}) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const domeRef = useRef<THREE.Mesh>(null!)

  useFrame(({ clock }) => {
    if (domeRef.current) {
      domeRef.current.rotation.y = clock.elapsedTime * 0.5
    }
  })

  const color = new THREE.Color(entity.color)
  const emissiveColor = new THREE.Color(entity.emissive)
  const glowIntensity = isSelected ? 2 : isHovered ? 1.2 : entity.activity === 'active' ? 0.8 : 0.3

  return (
    <group position={[entity.x, entity.y, entity.z]}>
      <mesh ref={meshRef} castShadow receiveShadow>
        <boxGeometry args={[2.5, 2, 2.5]} />
        <meshStandardMaterial 
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={glowIntensity}
          metalness={0.5}
          roughness={0.4}
        />
      </mesh>
      
      {/* Tech dome (slowly rotating) */}
      <mesh ref={domeRef} position={[0, 1.8, 0]} castShadow>
        <sphereGeometry args={[1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial 
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={glowIntensity * 1.5}
          metalness={0.8}
          roughness={0.1}
          transparent
          opacity={0.75}
        />
      </mesh>

      {/* Tech arms */}
      {[[-1.2, 0], [1.2, 0], [0, 1.2], [0, -1.2]].map(([ax, az], i) => (
        <mesh key={i} position={[ax, 1.5, az]} castShadow>
          <boxGeometry args={[0.3, 0.8, 0.3]} />
          <meshStandardMaterial 
            color="#334455"
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>
      ))}

      {isSelected && (
        <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[3, 3.5, 32]} />
          <meshBasicMaterial color="#00ff88" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}

      <pointLight color={emissiveColor} intensity={glowIntensity * 2} distance={12} position={[0, 2, 0]} />
      <HealthBar entity={entity} />
      <EntityLabel entity={entity} position={[0, 3.8, 0]} />
    </group>
  )
}

function Barracks({ entity, isSelected, isHovered }: {
  entity: Entity; isSelected: boolean; isHovered: boolean
}) {
  const doorRef = useRef<THREE.Mesh>(null!)

  useFrame(({ clock }) => {
    if (doorRef.current && entity.activity === 'active') {
      doorRef.current.position.z = Math.sin(clock.elapsedTime * 4) * 0.1 + 0.1
    }
  })

  const color = new THREE.Color(entity.color)
  const emissiveColor = new THREE.Color(entity.emissive)
  const glowIntensity = isSelected ? 2 : isHovered ? 1.2 : entity.activity === 'active' ? 0.8 : 0.3

  return (
    <group position={[entity.x, entity.y, entity.z]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[2.5, 1.8, 2.5]} />
        <meshStandardMaterial 
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={glowIntensity}
          metalness={0.5}
          roughness={0.4}
        />
      </mesh>
      
      {/* Roof */}
      <mesh position={[0, 1.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[2.2, 1, 4]} />
        <meshStandardMaterial 
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={glowIntensity * 0.5}
          metalness={0.4}
          roughness={0.5}
        />
      </mesh>

      {/* Door (animated open/close when active) */}
      <mesh ref={doorRef} position={[0, 0, 1.3]} castShadow>
        <boxGeometry args={[0.8, 1.2, 0.1]} />
        <meshStandardMaterial color="#445566" metalness={0.7} roughness={0.3} />
      </mesh>

      {isSelected && (
        <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[3, 3.5, 32]} />
          <meshBasicMaterial color="#ff9900" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}

      <pointLight color={emissiveColor} intensity={glowIntensity * 2} distance={10} position={[0, 1.5, 0]} />
      <HealthBar entity={entity} />
      <EntityLabel entity={entity} position={[0, 3.2, 0]} />
    </group>
  )
}

function SupplyDepot({ entity, isSelected, isHovered }: {
  entity: Entity; isSelected: boolean; isHovered: boolean
}) {
  const color = new THREE.Color(entity.color)
  const emissiveColor = new THREE.Color(entity.emissive)
  const fillLevel = Math.min(1, entity.health / Math.max(1, entity.maxHealth))
  const glowIntensity = isSelected ? 1.5 : isHovered ? 1.0 : 0.4

  return (
    <group position={[entity.x, entity.y, entity.z]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[2, 1.5, 2]} />
        <meshStandardMaterial 
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={glowIntensity}
          metalness={0.4}
          roughness={0.6}
        />
      </mesh>

      {/* Supply level indicator (filling up) */}
      <mesh position={[0, -0.75 + fillLevel * 1.0, 0]}>
        <boxGeometry args={[1.8, fillLevel * 1.0, 1.8]} />
        <meshStandardMaterial 
          color={fillLevel > 0.6 ? '#00cc44' : fillLevel > 0.3 ? '#ccaa00' : '#cc2200'}
          emissive={fillLevel > 0.6 ? '#00aa22' : '#aa8800'}
          emissiveIntensity={0.8}
          transparent
          opacity={0.6}
        />
      </mesh>

      {isSelected && (
        <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.5, 3, 32]} />
          <meshBasicMaterial color="#6600ff" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}

      <HealthBar entity={entity} />
      <EntityLabel entity={entity} position={[0, 2.8, 0]} />
    </group>
  )
}

function Bunker({ entity, isSelected, isHovered }: {
  entity: Entity; isSelected: boolean; isHovered: boolean
}) {
  const color = new THREE.Color(entity.color)
  const emissiveColor = new THREE.Color(entity.emissive)
  const glowIntensity = isSelected ? 1.5 : isHovered ? 1.0 : 0.5

  return (
    <group position={[entity.x, entity.y, entity.z]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[2, 1.5, 2.5]} />
        <meshStandardMaterial 
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={glowIntensity}
          metalness={0.6}
          roughness={0.4}
        />
      </mesh>

      {/* Gun ports */}
      {[-0.6, 0.6].map((ox, i) => (
        <mesh key={i} position={[ox, 0.9, 1.3]} castShadow>
          <cylinderGeometry args={[0.12, 0.12, 0.5, 8]} />
          <meshStandardMaterial color="#333333" metalness={0.9} roughness={0.2} />
        </mesh>
      ))}

      {entity.activity === 'dead' && <SmokeEffect position={[0, 1.5, 0]} />}

      {isSelected && (
        <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.5, 3, 32]} />
          <meshBasicMaterial color="#ff0000" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}

      <HealthBar entity={entity} />
      <EntityLabel entity={entity} position={[0, 2.8, 0]} />
    </group>
  )
}

function Gateway({ entity, isSelected, isHovered }: {
  entity: Entity; isSelected: boolean; isHovered: boolean
}) {
  const beamRef = useRef<THREE.Mesh>(null!)

  useFrame(({ clock }) => {
    if (beamRef.current) {
      beamRef.current.scale.y = 1 + Math.sin(clock.elapsedTime * 5) * 0.3
      ;(beamRef.current.material as THREE.MeshStandardMaterial).opacity = 0.4 + Math.sin(clock.elapsedTime * 5) * 0.2
    }
  })

  const color = new THREE.Color(entity.color)
  const emissiveColor = new THREE.Color(entity.emissive)
  const glowIntensity = isSelected ? 2 : isHovered ? 1.2 : entity.activity === 'active' ? 0.8 : 0.3

  return (
    <group position={[entity.x, entity.y, entity.z]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[2.5, 2.2, 2.5]} />
        <meshStandardMaterial 
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={glowIntensity}
          metalness={0.5}
          roughness={0.3}
        />
      </mesh>

      {/* Energy beam (animated) */}
      <mesh ref={beamRef} position={[0, 2.8, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 2, 8]} />
        <meshStandardMaterial 
          color="#aa00ff"
          emissive="#aa00ff"
          emissiveIntensity={3}
          transparent
          opacity={0.6}
        />
      </mesh>

      {/* Warp effect rings */}
      {[0.5, 1.0, 1.5].map((yOff, i) => (
        <mesh key={i} position={[0, 2 + yOff, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.5 + i * 0.3, 0.05, 8, 24]} />
          <meshStandardMaterial 
            color="#cc00ff"
            emissive="#cc00ff"
            emissiveIntensity={2}
            transparent
            opacity={0.3 - i * 0.08}
          />
        </mesh>
      ))}

      {isSelected && (
        <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[3, 3.5, 32]} />
          <meshBasicMaterial color="#aa00ff" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}

      <pointLight color="#aa00ff" intensity={glowIntensity * 3} distance={15} position={[0, 2, 0]} />
      <HealthBar entity={entity} />
      <EntityLabel entity={entity} position={[0, 4.5, 0]} />
    </group>
  )
}

function VespeneGeyser({ entity, isSelected, isHovered }: {
  entity: Entity; isSelected: boolean; isHovered: boolean
}) {
  const coreRef = useRef<THREE.Mesh>(null!)
  const scale = Math.min(entity.scale[0], 2.5)

  useFrame(({ clock }) => {
    if (coreRef.current) {
      coreRef.current.rotation.y = clock.elapsedTime * 0.5
    }
  })

  return (
    <group position={[entity.x, entity.y, entity.z]}>
      <mesh ref={coreRef} castShadow>
        <icosahedronGeometry args={[1.5 * scale, 1]} />
        <meshStandardMaterial 
          color="#00ffff"
          emissive="#00aaff"
          emissiveIntensity={isSelected ? 2.5 : isHovered ? 1.8 : 1.2}
          metalness={0.9}
          roughness={0.1}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Orbiting crystals */}
      {[0, 1, 2, 3, 4, 5].map(i => {
        const angle = (i / 6) * Math.PI * 2
        const radius = 2.5 * scale
        return (
          <mesh 
            key={i} 
            position={[
              Math.cos(angle) * radius,
              1 + Math.sin(i * 1.5) * 0.5,
              Math.sin(angle) * radius
            ]}
          >
            <octahedronGeometry args={[0.35, 0]} />
            <meshStandardMaterial 
              color="#00ffff"
              emissive="#00aaff"
              emissiveIntensity={1.5}
              metalness={0.9}
              roughness={0.1}
            />
          </mesh>
        )
      })}

      <pointLight color="#00ffff" intensity={4} distance={25} position={[0, 1.5, 0]} />
      <EntityLabel entity={entity} position={[0, 4 * scale, 0]} />
    </group>
  )
}

// ─── SC Units ────────────────────────────────────────────────────────────────

function SCVUnit({ entity, isSelected, isHovered }: {
  entity: Entity; isSelected: boolean; isHovered: boolean
}) {
  const groupRef = useRef<THREE.Group>(null!)
  const drillRef = useRef<THREE.Mesh>(null!)
  const bobOffset = useMemo(() => Math.random() * Math.PI * 2, [])
  const orbitAngle = useMemo(() => Math.random() * Math.PI * 2, [])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime

    if (entity.activity === 'mining' || entity.activity === 'active') {
      // Mining: orbit around position + bob up/down
      const orbitSpeed = 1.5
      const orbitRadius = 3
      groupRef.current.position.x = entity.x + Math.cos(t * orbitSpeed + orbitAngle) * orbitRadius
      groupRef.current.position.z = entity.z + Math.sin(t * orbitSpeed + orbitAngle) * orbitRadius
      groupRef.current.position.y = entity.y + Math.sin(t * 3 + bobOffset) * 0.3
      groupRef.current.rotation.y = -t * orbitSpeed + orbitAngle
    } else if (entity.activity === 'patrol') {
      // Patrol: gentle figure-8 movement
      groupRef.current.position.x = entity.x + Math.sin(t * 0.8) * 4
      groupRef.current.position.z = entity.z + Math.sin(t * 1.2) * 3
      groupRef.current.position.y = entity.y + Math.sin(t * 2 + bobOffset) * 0.15
    } else {
      // Idle: slight hover bob
      groupRef.current.position.set(entity.x, entity.y + Math.sin(t * 1.5 + bobOffset) * 0.1, entity.z)
    }

    // Animated drill
    if (drillRef.current) {
      drillRef.current.rotation.z = t * 8
    }
  })

  const color = new THREE.Color(entity.color)
  const emissiveColor = new THREE.Color(entity.emissive)

  return (
    <group ref={groupRef} position={[entity.x, entity.y, entity.z]}>
      {/* Body */}
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial 
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={isSelected ? 2 : isHovered ? 1.2 : 0.6}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>

      {/* Head */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[0.35, 0.35, 0.35]} />
        <meshStandardMaterial 
          color="#667788"
          emissive="#223344"
          emissiveIntensity={0.3}
          metalness={0.6}
          roughness={0.4}
        />
      </mesh>

      {/* Animated drill arm */}
      <mesh ref={drillRef} position={[0.35, -0.1, 0]} rotation={[0, 0, -Math.PI / 4]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.6, 6]} />
        <meshStandardMaterial color="#ffaa00" metalness={0.95} roughness={0.05} emissive="#ff6600" emissiveIntensity={0.5} />
      </mesh>

      {/* Hover jets */}
      <mesh position={[0.15, -0.35, 0.15]}>
        <cylinderGeometry args={[0.06, 0.08, 0.1, 6]} />
        <meshStandardMaterial color="#ff4400" emissive="#ff2200" emissiveIntensity={2} transparent opacity={0.8} />
      </mesh>
      <mesh position={[-0.15, -0.35, -0.15]}>
        <cylinderGeometry args={[0.06, 0.08, 0.1, 6]} />
        <meshStandardMaterial color="#ff4400" emissive="#ff2200" emissiveIntensity={2} transparent opacity={0.8} />
      </mesh>

      {isSelected && (
        <mesh position={[0, -0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.8, 1.0, 16]} />
          <meshBasicMaterial color="#ffff00" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}

      <HealthBar entity={entity} />
      <EntityLabel entity={entity} position={[0, 1.0, 0]} />
    </group>
  )
}

function MarineUnit({ entity, isSelected, isHovered }: {
  entity: Entity; isSelected: boolean; isHovered: boolean
}) {
  const groupRef = useRef<THREE.Group>(null!)
  const gunRef = useRef<THREE.Mesh>(null!)
  const bobOffset = useMemo(() => Math.random() * Math.PI * 2, [])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime

    if (entity.activity === 'patrol' || entity.activity === 'active') {
      // Squad patrol: move in loose formation
      const patrolRadius = 4 + (entity.id.charCodeAt(0) % 5)
      groupRef.current.position.x = entity.x + Math.cos(t * 0.4 + entity.id.charCodeAt(0) * 0.5) * patrolRadius
      groupRef.current.position.z = entity.z + Math.sin(t * 0.4 + entity.id.charCodeAt(0) * 0.5) * patrolRadius
      groupRef.current.position.y = entity.y + Math.sin(t * 3 + bobOffset) * 0.08
      // Face movement direction
      groupRef.current.rotation.y = Math.atan2(
        Math.cos(t * 0.4 + entity.id.charCodeAt(0) * 0.5),
        Math.sin(t * 0.4 + entity.id.charCodeAt(0) * 0.5)
      )
    } else {
      // Idle: stand tall, slight sway
      groupRef.current.position.set(entity.x, entity.y, entity.z)
      groupRef.current.rotation.y = Math.sin(t * 0.5 + bobOffset) * 0.15
    }

    // Gun recoil
    if (gunRef.current) {
      gunRef.current.position.x = 0.35 + Math.sin(t * 6) * (entity.activity === 'active' ? 0.05 : 0)
    }
  })

  const color = new THREE.Color(entity.color)

  return (
    <group ref={groupRef} position={[entity.x, entity.y, entity.z]}>
      {/* Body (armored) */}
      <mesh castShadow>
        <capsuleGeometry args={[0.18, 0.45, 4, 8]} />
        <meshStandardMaterial 
          color={color}
          emissive={entity.activity === 'active' ? '#ff2200' : '#110000'}
          emissiveIntensity={isSelected ? 1.2 : isHovered ? 0.8 : 0.4}
          metalness={0.6}
          roughness={0.4}
        />
      </mesh>

      {/* Helmet */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshStandardMaterial 
          color="#334455"
          emissive="#001122"
          emissiveIntensity={0.2}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>

      {/* Gun */}
      <mesh ref={gunRef} position={[0.35, 0, 0]} castShadow>
        <boxGeometry args={[0.5, 0.08, 0.08]} />
        <meshStandardMaterial color="#222222" metalness={0.95} roughness={0.1} />
      </mesh>

      {/* Visor glow */}
      <mesh position={[0, 0.45, 0.15]}>
        <boxGeometry args={[0.12, 0.06, 0.02]} />
        <meshStandardMaterial color="#00ff88" emissive="#00ff88" emissiveIntensity={3} />
      </mesh>

      {isSelected && (
        <mesh position={[0, -0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.6, 0.8, 16]} />
          <meshBasicMaterial color="#ff3300" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}

      <HealthBar entity={entity} />
      <EntityLabel entity={entity} position={[0, 0.9, 0]} />
    </group>
  )
}

function ZealotUnit({ entity, isSelected, isHovered }: {
  entity: Entity; isSelected: boolean; isHovered: boolean
}) {
  const groupRef = useRef<THREE.Group>(null!)
  const bladeRefs = useRef<[THREE.Mesh, THREE.Mesh] | [null, null]>([null, null])
  const bobOffset = useMemo(() => Math.random() * Math.PI * 2, [])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime

    if (entity.activity === 'patrol' || entity.activity === 'active') {
      // Zealot charge patrol
      groupRef.current.position.x = entity.x + Math.cos(t * 0.6 + entity.id.charCodeAt(0)) * 5
      groupRef.current.position.z = entity.z + Math.sin(t * 0.6 + entity.id.charCodeAt(0)) * 5
      groupRef.current.position.y = entity.y + Math.abs(Math.sin(t * 4)) * 0.2
      groupRef.current.rotation.y = t * 0.6 + entity.id.charCodeAt(0)
    } else {
      groupRef.current.position.set(entity.x, entity.y, entity.z)
    }

    // Blade energy pulse
    bladeRefs.current.forEach((blade, i) => {
      if (blade && blade.material instanceof THREE.MeshStandardMaterial) {
        blade.material.emissiveIntensity = 1.5 + Math.sin(t * 6 + i) * 1.0
      }
    })
  })

  const color = new THREE.Color(entity.color)

  return (
    <group ref={groupRef} position={[entity.x, entity.y, entity.z]}>
      {/* Body */}
      <mesh castShadow>
        <coneGeometry args={[0.4, 1.4, 6]} />
        <meshStandardMaterial 
          color={color}
          emissive="#003300"
          emissiveIntensity={isSelected ? 1.8 : isHovered ? 1.2 : 0.6}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>

      {/* Energy blades */}
      <mesh 
        ref={el => { if (bladeRefs.current[0]) bladeRefs.current[0] = el as THREE.Mesh }} 
        position={[0.6, 0.3, 0]} 
        rotation={[0, 0, -0.6]}
        castShadow
      >
        <boxGeometry args={[0.8, 0.06, 0.12]} />
        <meshStandardMaterial 
          color="#00ff00"
          emissive="#00ff00"
          emissiveIntensity={2}
          transparent
          opacity={0.85}
        />
      </mesh>
      <mesh 
        ref={el => { if (bladeRefs.current[1]) bladeRefs.current[1] = el as THREE.Mesh }} 
        position={[-0.6, 0.3, 0]} 
        rotation={[0, 0, 0.6]}
        castShadow
      >
        <boxGeometry args={[0.8, 0.06, 0.12]} />
        <meshStandardMaterial 
          color="#00ff00"
          emissive="#00ff00"
          emissiveIntensity={2}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Glow base */}
      <mesh position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.5, 12]} />
        <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={1.5} transparent opacity={0.6} />
      </mesh>

      {isSelected && (
        <mesh position={[0, -0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.8, 1.0, 16]} />
          <meshBasicMaterial color="#00ff00" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}

      <HealthBar entity={entity} />
      <EntityLabel entity={entity} position={[0, 2, 0]} />
    </group>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function HealthBar({ entity }: { entity: Entity }) {
  const pct = Math.min(1, entity.health / Math.max(1, entity.maxHealth))
  const color = pct > 0.6 ? '#00ee44' : pct > 0.3 ? '#eecc00' : '#ee2200'

  return (
    <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[2, 0.15]} />
      <meshBasicMaterial color="#000000" transparent opacity={0.75} />
    </mesh>
  )
}

function EntityLabel({ entity, position }: { entity: Entity; position: [number, number, number] }) {
  return (
    <Billboard position={position} follow lockX={false} lockY={false} lockZ={false}>
      <Text
        fontSize={1.1}
        color="#00ff88"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.08}
        outlineColor="#000000"
        maxWidth={8}
      >
        {entity.label.substring(0, 18)}
      </Text>
      <Text
        fontSize={0.75}
        color="#aaaaaa"
        anchorX="center"
        anchorY="top"
        maxWidth={8}
      >
        {entity.scType} · {entity.activity || 'idle'}
      </Text>
    </Billboard>
  )
}

function SmokeEffect({ position }: { position: [number, number, number] }) {
  const pointsRef = useRef<THREE.Points>(null!)
  const positions = useMemo(() => {
    const arr = new Float32Array(30 * 3)
    for (let i = 0; i < 30; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 1.5
      arr[i * 3 + 1] = Math.random() * 3
      arr[i * 3 + 2] = (Math.random() - 0.5) * 1.5
    }
    return arr
  }, [])

  useFrame(({ clock }) => {
    if (pointsRef.current) {
      const pos = pointsRef.current.geometry.attributes.position.array as Float32Array
      for (let i = 0; i < 30; i++) {
        pos[i * 3 + 1] = (clock.elapsedTime * 0.5 + i * 0.2) % 3
      }
      pointsRef.current.geometry.attributes.position.needsUpdate = true
    }
  })

  return (
    <points ref={pointsRef} position={position}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={30} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color="#555555" size={0.35} transparent opacity={0.55} />
    </points>
  )
}

// ─── Entity Renderer ─────────────────────────────────────────────────────────

function EntityRenderer({ entity }: { entity: Entity }) {
  const { selectedEntity, selectEntity } = useDashboardStore()
  const isSelected = selectedEntity?.id === entity.id

  const handleClick = (e: any) => {
    e.stopPropagation()
    selectEntity(isSelected ? null : entity)
  }

  const props = { entity, isSelected, isHovered: false }

  switch (entity.scType) {
    case 'CommandCenter': return <CommandCenter {...props} />
    case 'TechBuilding': return <TechBuilding {...props} />
    case 'Barracks': return <Barracks {...props} />
    case 'SupplyDepot': return <SupplyDepot {...props} />
    case 'Bunker': return <Bunker {...props} />
    case 'Gateway': return <Gateway {...props} />
    case 'VespeneGeyser': return <VespeneGeyser {...props} />
    case 'SCV': return <SCVUnit {...props} />
    case 'Marine': return <MarineUnit {...props} />
    case 'Zealot': return <ZealotUnit {...props} />
    default:
      return (
        <group position={[entity.x, entity.y, entity.z]}>
          <mesh castShadow onClick={handleClick}>
            <boxGeometry args={entity.scale} />
            <meshStandardMaterial color={entity.color} emissive={entity.emissive} emissiveIntensity={0.3} />
          </mesh>
        </group>
      )
  }
}

// ─── Main Scene ───────────────────────────────────────────────────────────────

export function Scene({ showGrid, showLabels, viewMode }: {
  showGrid: boolean
  showLabels: boolean
  viewMode: string
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

  // Snap entities to terrain height
  const terrainEntities = useMemo(() => {
    return Array.from(entities.values()).map(entity => ({
      ...entity,
      y: getTerrainHeight(entity.x, entity.z) + 0.5
    }))
  }, [entities])

  console.log('[SC-VIZ] ProceduralScene — terrain + entities:', terrainEntities.length)

  return (
    <>
      {/* ====== GUARANTEED LIGHTING ====== */}
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

      {/* Sky */}
      <Sky 
        distance={450000} 
        sunPosition={[100, 50, 100]} 
        inclination={0.6} 
        azimuth={0.25}
        turbidity={5}
        rayleigh={0.5}
      />
      <Stars radius={300} depth={60} count={2000} factor={4} fade speed={0.5} />

      {/* Fog — SC void feel */}
      <fog attach="fog" args={['#050a10', 100, 280]} />

      {/* SC Terrain (heightmap + minerals + rocks) */}
      <SCTerrain showGrid={showGrid} />

      {/* Camera Controls */}
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

      {/* Entities (terrain-snapped) */}
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
