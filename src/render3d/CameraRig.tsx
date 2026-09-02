import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/useStore';
import type { CameraPreset } from '../store/useStore';
import { worldToThree } from './coords';

interface OrbitControlsHandle {
  target: THREE.Vector3;
  update: () => void;
}

const CHASE_DISTANCE = 0.55;
const CHASE_HEIGHT = 0.32;
const CHASE_FOLLOW_RATE = 4.5; // higher = camera catches up to the ideal chase pose faster

export function CameraRig({ preset, center }: { preset: CameraPreset; center: [number, number] }) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsHandle | null>(null);
  const appliedRef = useRef<string>('');
  const idealPos = new THREE.Vector3();

  useEffect(() => {
    const key = `${preset}:${center[0]}:${center[1]}`;
    if (appliedRef.current === key) return;
    appliedRef.current = key;
    const [cx, cz] = center;

    if (preset === 'top') {
      camera.position.set(cx, 3.6, cz + 0.0001);
      controlsRef.current?.target.set(cx, 0, cz);
    } else if (preset === 'chase') {
      const { pose } = useStore.getState();
      const [rx, , rz] = worldToThree(pose.x, pose.y);
      camera.position.set(rx - Math.cos(pose.theta) * CHASE_DISTANCE, CHASE_HEIGHT, rz - Math.sin(pose.theta) * CHASE_DISTANCE);
      controlsRef.current?.target.set(rx, 0.05, rz);
    } else {
      camera.position.set(cx + 2.2, 1.9, cz + 2.2);
      controlsRef.current?.target.set(cx, 0, cz);
    }
    controlsRef.current?.update();
  }, [preset, center, camera]);

  useFrame((_, delta) => {
    if (preset !== 'chase') return;
    const { pose } = useStore.getState();
    const [rx, , rz] = worldToThree(pose.x, pose.y);

    // Always swings around to sit behind the robot along its *current*
    // heading and look toward it, instead of just translating a fixed
    // offset (which would drift out of alignment the instant the robot
    // turns). Smoothly follows rather than snapping, so OrbitControls drag
    // still has room to feel responsive before being pulled back.
    idealPos.set(rx - Math.cos(pose.theta) * CHASE_DISTANCE, CHASE_HEIGHT, rz - Math.sin(pose.theta) * CHASE_DISTANCE);
    const followT = 1 - Math.exp(-CHASE_FOLLOW_RATE * delta);
    camera.position.lerp(idealPos, followT);
    controlsRef.current?.target.set(rx, 0.05, rz);
    controlsRef.current?.update();
  });

  return <OrbitControls ref={controlsRef as never} enableDamping dampingFactor={0.12} />;
}
