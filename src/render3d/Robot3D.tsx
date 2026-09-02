import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/useStore';
import { headingToThreeY, worldToThree } from './coords';

export function Robot3D({ color, size = 1 }: { color: string; size?: number }) {
  const group = useRef<THREE.Group>(null);

  const wheelRadius = 0.03 * size;
  const wheelThickness = 0.016 * size;
  const w = 0.09 * size;
  const l = 0.13 * size;
  const chassisH = 0.045 * size;

  useFrame(() => {
    const { pose } = useStore.getState();
    if (!group.current) return;
    const [x, , z] = worldToThree(pose.x, pose.y);
    // Group origin sits at wheel-axle height, exactly one wheel radius above
    // the floor, so the wheels' bottoms touch the ground plane at y=0.
    group.current.position.set(x, wheelRadius, z);
    group.current.rotation.y = headingToThreeY(pose.theta);
  });

  return (
    <group ref={group}>
      <mesh castShadow position={[0, chassisH / 2, 0]}>
        <boxGeometry args={[l, chassisH, w]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]} position={[-l * 0.15, 0, w / 2 + wheelThickness / 2]}>
        <cylinderGeometry args={[wheelRadius, wheelRadius, wheelThickness, 16]} />
        <meshStandardMaterial color="#18181b" />
      </mesh>
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]} position={[-l * 0.15, 0, -w / 2 - wheelThickness / 2]}>
        <cylinderGeometry args={[wheelRadius, wheelRadius, wheelThickness, 16]} />
        <meshStandardMaterial color="#18181b" />
      </mesh>
      <mesh rotation={[0, 0, -Math.PI / 2]} position={[l / 2 + wheelRadius * 0.4, chassisH / 2, 0]}>
        <coneGeometry args={[chassisH * 0.3, chassisH * 0.6, 8]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
    </group>
  );
}
