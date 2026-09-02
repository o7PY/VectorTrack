import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { useStore } from '../store/useStore';
import { getLineMap } from '../maps/line';
import { getMazeMap } from '../maps/maze';
import { getLineRobot, getMazeRobot } from '../robots/definitions';
import { MM_TO_M } from './coords';
import { LineTrack3D } from './LineTrack3D';
import { Maze3D } from './Maze3D';
import { Robot3D } from './Robot3D';
import { CameraRig } from './CameraRig';

export function Scene3D() {
  const mode = useStore((s) => s.mode);
  const mapId = useStore((s) => s.mapId);
  const robotId = useStore((s) => s.robotId);
  const cameraPreset = useStore((s) => s.cameraPreset);

  const robotColor = mode === 'line' ? getLineRobot(robotId).color : getMazeRobot(robotId).color;

  const center = useMemo<[number, number]>(() => {
    if (mode === 'line') {
      const m = getLineMap(mapId);
      return [m.widthMm * MM_TO_M * 0.5, m.heightMm * MM_TO_M * 0.5];
    }
    const m = getMazeMap(mapId);
    return [m.cols * m.cellSize * MM_TO_M * 0.5, m.rows * m.cellSize * MM_TO_M * 0.5];
  }, [mode, mapId]);

  return (
    <Canvas shadows camera={{ fov: 50, near: 0.05, far: 100 }} className="h-full w-full">
      <color attach="background" args={['#0a0a0b']} />
      <ambientLight intensity={0.45} />
      <directionalLight
        position={[center[0] + 2, 4, center[1] + 1.5]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
      />
      {mode === 'line' ? <LineTrack3D mapId={mapId} /> : <Maze3D mapId={mapId} />}
      <Robot3D color={robotColor} />
      <CameraRig preset={cameraPreset} center={center} />
    </Canvas>
  );
}
