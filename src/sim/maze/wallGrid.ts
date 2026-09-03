import type { MazeCellWalls } from './grid';

/**
 * Edge-based wall storage: each wall is stored exactly once, shared by the
 * two cells it separates. This is the editor's canonical source of truth —
 * storing per-cell N/E/S/W flags instead would mean every wall exists twice
 * (cell A's east flag AND cell B's west flag) and every edit has to keep both
 * copies in sync, which is a bug factory. The runtime sim still consumes
 * per-cell flags (`MazeCellWalls`); `wallGridToCells` derives them from this.
 */
export interface MazeWallGrid {
  rows: number;
  cols: number;
  /** Horizontal segments, (rows+1) rows x cols cols. hWalls[r*cols+c] = wall between cell (r-1,c) and (r,c); r=0 is the top border, r=rows the bottom border. */
  hWalls: Uint8Array;
  /** Vertical segments, rows rows x (cols+1) cols. vWalls[r*(cols+1)+c] = wall between cell (r,c-1) and (r,c); c=0 is the left border, c=cols the right border. */
  vWalls: Uint8Array;
}

export function createWallGrid(rows: number, cols: number, filled: boolean): MazeWallGrid {
  const hWalls = new Uint8Array((rows + 1) * cols).fill(filled ? 1 : 0);
  const vWalls = new Uint8Array(rows * (cols + 1)).fill(filled ? 1 : 0);
  return { rows, cols, hWalls, vWalls };
}

/** Every border wall closed, every interior wall open — one empty room. Used as the editor's default canvas: unlike `createWallGrid(rows, cols, true)`, this starts out fully reachable so a brand-new draft never fails MZ002 (goal unreachable) before the author has touched anything. */
export function createBorderOnlyWallGrid(rows: number, cols: number): MazeWallGrid {
  const grid = createWallGrid(rows, cols, false);
  for (let c = 0; c < cols; c++) {
    setHWall(grid, 0, c, true);
    setHWall(grid, rows, c, true);
  }
  for (let r = 0; r < rows; r++) {
    setVWall(grid, r, 0, true);
    setVWall(grid, r, cols, true);
  }
  return grid;
}

function hIndex(grid: MazeWallGrid, r: number, c: number): number {
  return r * grid.cols + c;
}

function vIndex(grid: MazeWallGrid, r: number, c: number): number {
  return r * (grid.cols + 1) + c;
}

export function getHWall(grid: MazeWallGrid, r: number, c: number): boolean {
  return grid.hWalls[hIndex(grid, r, c)] !== 0;
}

export function setHWall(grid: MazeWallGrid, r: number, c: number, present: boolean): void {
  grid.hWalls[hIndex(grid, r, c)] = present ? 1 : 0;
}

export function getVWall(grid: MazeWallGrid, r: number, c: number): boolean {
  return grid.vWalls[vIndex(grid, r, c)] !== 0;
}

export function setVWall(grid: MazeWallGrid, r: number, c: number, present: boolean): void {
  grid.vWalls[vIndex(grid, r, c)] = present ? 1 : 0;
}

export function cellsToWallGrid(cells: MazeCellWalls[][], rows: number, cols: number): MazeWallGrid {
  const grid = createWallGrid(rows, cols, false);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const walls = cells[r][c];
      if (walls.N) setHWall(grid, r, c, true);
      if (walls.S) setHWall(grid, r + 1, c, true);
      if (walls.W) setVWall(grid, r, c, true);
      if (walls.E) setVWall(grid, r, c + 1, true);
    }
  }
  return grid;
}

export function wallGridToCells(grid: MazeWallGrid): MazeCellWalls[][] {
  const { rows, cols } = grid;
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      N: getHWall(grid, r, c),
      S: getHWall(grid, r + 1, c),
      W: getVWall(grid, r, c),
      E: getVWall(grid, r, c + 1),
    })),
  );
}
