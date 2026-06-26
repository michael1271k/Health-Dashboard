'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { MeshDistortMaterial, Sphere } from '@react-three/drei'
import type { Mesh } from 'three'
import * as THREE from 'three'

interface OrbSceneProps {
  battery: number  // 0–100
}

function OrbScene({ battery }: OrbSceneProps) {
  const meshRef = useRef<Mesh>(null)
  const t = battery / 100

  // Color: danger (#FF4D6D) at 0% → warn (#FFB020) at 40% → primary (#00E5A0) at 100%
  const color = useMemo(() => {
    if (t < 0.4) {
      return new THREE.Color('#FF4D6D').lerp(new THREE.Color('#FFB020'), t / 0.4)
    }
    return new THREE.Color('#FFB020').lerp(new THREE.Color('#00E5A0'), (t - 0.4) / 0.6)
  }, [t])

  useFrame((state) => {
    if (!meshRef.current) return
    const elapsed = state.clock.elapsedTime
    meshRef.current.rotation.x = Math.sin(elapsed * 0.3) * 0.1
    meshRef.current.rotation.y = elapsed * 0.2
    // Subtle breathing scale
    const breathe = 1 + Math.sin(elapsed * 1.5) * 0.02
    meshRef.current.scale.setScalar(breathe)
  })

  return (
    <Sphere ref={meshRef} args={[1, 64, 64]}>
      <MeshDistortMaterial
        color={color}
        distort={0.15 + (1 - t) * 0.2}  // more distorted when low battery
        speed={1.5}
        roughness={0.1}
        metalness={0.4}
        transparent
        opacity={0.9}
      />
    </Sphere>
  )
}

interface BatteryOrbProps {
  battery: number
}

export function BatteryOrb({ battery }: BatteryOrbProps) {
  return (
    <Canvas
      className="w-full h-full"
      camera={{ position: [0, 0, 2.5], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
      aria-hidden="true"  // decorative — value shown in text
    >
      <ambientLight intensity={0.5} />
      <pointLight position={[2, 2, 2]} intensity={1.5} color="#00E5A0" />
      <pointLight position={[-2, -1, 1]} intensity={0.8} color="#7C5CFF" />
      <OrbScene battery={battery} />
    </Canvas>
  )
}
