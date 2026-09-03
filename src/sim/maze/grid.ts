import type { Cell, MazeGoal } from '../core/types';
import type { WallSegment } from '../sensors/rangefinder';

export interface MazeCellWalls {
  N: boolean;
  E: boolean;
  S: boolean;
  W: boolean;
}

export interface MazeMap {
  id: string;
  name: string;
  description?: string;
  rows: number;
  cols: number;
  cellSize: number; // mm
  wallThickness: number; // mm
  cells: MazeCellWalls[][]; // [row][col]
  start: Cell;
  goal: MazeGoal;
}

export function isInGoal(cell: Cell, goal: MazeGoal): boolean {
  return (
    cell.row >= goal.row &&
    cell.row < goal.row + goal.height &&
    cell.col >= goal.col &&
    cell.col < goal.col + goal.width
  );
}

export function goalCells(goal: MazeGoal): Cell[] {
  const cells: Cell[] = [];
  for (let r = 0; r < goal.height; r++) {
    for (let c = 0; c < goal.width; c++) {
      cells.push({ row: goal.row + r, col: goal.col + c });
    }
  }
  return cells;
}

/** Center of the goal region in mm world coordinates. Reduces to the single-cell center for a 1x1 goal. */
export function goalCenterMm(goal: MazeGoal, cellSize: number): { x: number; y: number } {
  return { x: (goal.col + goal.width / 2) * cellSize, y: (goal.row + goal.height / 2) * cellSize };
}

/**
 * Row increases southward, column eastward — matching the world (x,y) axes
 * used by the kinematics core (theta=0 faces +x/East, +y is South).
 */
export function buildWallSegments(map: MazeMap): WallSegment[] {
  const segs: WallSegment[] = [];
  const { cellSize } = map;
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const walls = map.cells[r][c];
      const x0 = c * cellSize;
      const y0 = r * cellSize;
      const x1 = x0 + cellSize;
      const y1 = y0 + cellSize;
      if (walls.N) segs.push({ x1: x0, y1: y0, x2: x1, y2: y0 });
      if (walls.S) segs.push({ x1: x0, y1: y1, x2: x1, y2: y1 });
      if (walls.W) segs.push({ x1: x0, y1: y0, x2: x0, y2: y1 });
      if (walls.E) segs.push({ x1: x1, y1: y0, x2: x1, y2: y1 });
    }
  }
  return segs;
}

export function cellKey(c: Cell): string {
  return `${c.row},${c.col}`;
}

export function inBounds(map: MazeMap, c: Cell): boolean {
  return c.row >= 0 && c.row < map.rows && c.col >= 0 && c.col < map.cols;
}

const DIR_DELTA: Record<keyof MazeCellWalls, { dr: number; dc: number }> = {
  N: { dr: -1, dc: 0 },
  E: { dr: 0, dc: 1 },
  S: { dr: 1, dc: 0 },
  W: { dr: 0, dc: -1 },
};

/**
 * BFS distances over a fully-known cell/wall grid (ground truth). Used by the
 * map editor's static validation (MZ002/MZ004/MZ005) — a genuinely different
 * consumer from floodFill.ts's own flood, which operates over the robot's
 * partial, discovered knowledge instead of ground truth and so cannot share
 * this implementation.
 */
export function bfsDistances(cells: MazeCellWalls[][], rows: number, cols: number, sources: Cell[]): number[][] {
  const dist: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(Infinity));
  const queue: Cell[] = [];
  for (const s of sources) {
    if (dist[s.row][s.col] === 0) continue;
    dist[s.row][s.col] = 0;
    queue.push(s);
  }
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    const walls = cells[cur.row][cur.col];
    for (const dir of ['N', 'E', 'S', 'W'] as const) {
      if (walls[dir]) continue;
      const { dr, dc } = DIR_DELTA[dir];
      const n = { row: cur.row + dr, col: cur.col + dc };
      if (n.row < 0 || n.row >= rows || n.col < 0 || n.col >= cols) continue;
      if (dist[n.row][n.col] > dist[cur.row][cur.col] + 1) {
        dist[n.row][n.col] = dist[cur.row][cur.col] + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}
