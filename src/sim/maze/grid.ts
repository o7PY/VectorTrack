import type { Cell } from '../core/types';
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
  goal: Cell;
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
