import { useMemo } from 'react';
import { getMazeMap } from '../maps/maze';
import { buildWallSegments } from '../sim/maze/grid';
import { MM_TO_M } from './coords';

const WALL_HEIGHT = 0.09;

export function Maze3D({ mapId }: { mapId: string }) {
  const map = getMazeMap(mapId);
  const segments = useMemo(() => buildWallSegments(map), [map]);
  const worldW = map.cols * map.cellSize * MM_TO_M;
  const worldH = map.rows * map.cellSize * MM_TO_M;
  const wallThickness = map.wallThickness * MM_TO_M;

  const startCenter: [number, number] = [(map.start.col + 0.5) * map.cellSize * MM_TO_M, (map.start.row + 0.5) * map.cellSize * MM_TO_M];
  const goalCenter: [number, number] = [(map.goal.col + 0.5) * map.cellSize * MM_TO_M, (map.goal.row + 0.5) * map.cellSize * MM_TO_M];

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[worldW / 2, 0, worldH / 2]} receiveShadow>
        <planeGeometry args={[worldW, worldH]} />
        <meshStandardMaterial color="#121216" />
      </mesh>
      <gridHelper args={[Math.max(worldW, worldH), Math.max(map.rows, map.cols), '#2a2a30', '#1c1c21']} position={[worldW / 2, 0.001, worldH / 2]} />

      {segments.map((seg, i) => {
        const x1 = seg.x1 * MM_TO_M;
        const z1 = seg.y1 * MM_TO_M;
        const x2 = seg.x2 * MM_TO_M;
        const z2 = seg.y2 * MM_TO_M;
        const cx = (x1 + x2) / 2;
        const cz = (z1 + z2) / 2;
        const length = Math.hypot(x2 - x1, z2 - z1);
        const angle = Math.atan2(z2 - z1, x2 - x1);
        return (
          <mesh key={i} castShadow receiveShadow position={[cx, WALL_HEIGHT / 2, cz]} rotation={[0, -angle, 0]}>
            <boxGeometry args={[length + wallThickness, WALL_HEIGHT, wallThickness]} />
            <meshStandardMaterial color="#5b5b66" />
          </mesh>
        );
      })}

      <mesh position={[startCenter[0], 0.002, startCenter[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[map.cellSize * MM_TO_M * 0.18, 24]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
      <mesh position={[goalCenter[0], 0.002, goalCenter[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[map.cellSize * MM_TO_M * 0.18, 24]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
    </group>
  );
}
