import type { MazeCellWalls } from '../../sim/maze/grid';

/** Deterministic PRNG (mulberry32) so generated mazes are stable across runs/reloads. */
export function mulberry32(seed: number): () => number {
  let s = seed;
  return function random() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type WallKey = keyof MazeCellWalls;
const OPPOSITE: Record<WallKey, WallKey> = { N: 'S', E: 'W', S: 'N', W: 'E' };
const DELTA: Record<WallKey, [number, number]> = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] };

/** Recursive-backtracker perfect maze (spanning tree — no loops, fully connected). */
export function generatePerfectMaze(rows: number, cols: number, seed: number): MazeCellWalls[][] {
  const rand = mulberry32(seed);
  const cells: MazeCellWalls[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ N: true, E: true, S: true, W: true })),
  );
  const visited: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));

  const stack: [number, number][] = [[0, 0]];
  visited[0][0] = true;

  while (stack.length > 0) {
    const [r, c] = stack[stack.length - 1];
    const dirs: WallKey[] = ['N', 'E', 'S', 'W'];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }

    let carved = false;
    for (const dir of dirs) {
      const [dr, dc] = DELTA[dir];
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || visited[nr][nc]) continue;
      cells[r][c][dir] = false;
      cells[nr][nc][OPPOSITE[dir]] = false;
      visited[nr][nc] = true;
      stack.push([nr, nc]);
      carved = true;
      break;
    }
    if (!carved) stack.pop();
  }

  return cells;
}

/**
 * Opens `count` extra, randomly-chosen (already-closed) interior walls in an
 * existing maze, turning a perfect maze's single spanning-tree path into one
 * with real loops/branches — each opening reconnects two cells that were
 * already connected via the tree, so it creates an alternate route rather
 * than a dead end. Deterministic per `seed`.
 */
export function addRandomLoops(cells: MazeCellWalls[][], rows: number, cols: number, seed: number, count: number): void {
  const rand = mulberry32(seed);
  const dirs: WallKey[] = ['N', 'E', 'S', 'W'];
  let added = 0;
  let attempts = 0;
  while (added < count && attempts < count * 100) {
    attempts++;
    const r = Math.floor(rand() * rows);
    const c = Math.floor(rand() * cols);
    const dir = dirs[Math.floor(rand() * dirs.length)];
    const [dr, dc] = DELTA[dir];
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
    if (!cells[r][c][dir]) continue; // already open — not a new loop
    openWall(cells, r, c, dir);
    added++;
  }
}

/** Opens the wall between (row,col) and its neighbor in `dir`, creating one graph cycle. */
export function openWall(cells: MazeCellWalls[][], row: number, col: number, dir: WallKey): void {
  const [dr, dc] = DELTA[dir];
  const nr = row + dr;
  const nc = col + dc;
  cells[row][col][dir] = false;
  cells[nr][nc][OPPOSITE[dir]] = false;
}

export function wallExists(cells: MazeCellWalls[][], row: number, col: number, dir: WallKey): boolean {
  return cells[row][col][dir];
}

/** BFS distance (in cells) from `from` over the currently-open walls. */
export function bfsDistances(cells: MazeCellWalls[][], rows: number, cols: number, fromRow: number, fromCol: number): number[][] {
  const dist = Array.from({ length: rows }, () => new Array(cols).fill(Infinity));
  dist[fromRow][fromCol] = 0;
  const queue: [number, number][] = [[fromRow, fromCol]];
  let qi = 0;
  while (qi < queue.length) {
    const [r, c] = queue[qi++];
    for (const dir of ['N', 'E', 'S', 'W'] as WallKey[]) {
      if (cells[r][c][dir]) continue;
      const [dr, dc] = DELTA[dir];
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (dist[nr][nc] > dist[r][c] + 1) {
        dist[nr][nc] = dist[r][c] + 1;
        queue.push([nr, nc]);
      }
    }
  }
  return dist;
}

/**
 * Carves a solid rectangular grid whose only openings are a single-width
 * spiral corridor from an outer edge into the center cell.
 */
export function generateSpiralMaze(rows: number, cols: number): { cells: MazeCellWalls[][]; start: { row: number; col: number }; goal: { row: number; col: number } } {
  const cells: MazeCellWalls[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ N: true, E: true, S: true, W: true })),
  );

  // Walk a shrinking rectangular spiral of cell coordinates from the top-left
  // inward, carving the wall between each consecutive pair as we go.
  let top = 0;
  let bottom = rows - 1;
  let left = 0;
  let right = cols - 1;
  const path: [number, number][] = [];

  while (top <= bottom && left <= right) {
    for (let c = left; c <= right; c++) path.push([top, c]);
    top++;
    for (let r = top; r <= bottom; r++) path.push([r, right]);
    right--;
    if (top <= bottom) {
      for (let c = right; c >= left; c--) path.push([bottom, c]);
      bottom--;
    }
    if (left <= right) {
      for (let r = bottom; r >= top; r--) path.push([r, left]);
      left++;
    }
  }

  for (let i = 0; i < path.length - 1; i++) {
    const [r1, c1] = path[i];
    const [r2, c2] = path[i + 1];
    const dr = r2 - r1;
    const dc = c2 - c1;
    const dir: WallKey = dr === -1 ? 'N' : dr === 1 ? 'S' : dc === 1 ? 'E' : 'W';
    openWall(cells, r1, c1, dir);
  }

  const start = { row: path[0][0], col: path[0][1] };
  const goal = { row: path[path.length - 1][0], col: path[path.length - 1][1] };
  return { cells, start, goal };
}
