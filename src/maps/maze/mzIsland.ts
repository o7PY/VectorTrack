import type { Cell } from '../../sim/core/types';
import type { MazeCellWalls, MazeMap } from '../../sim/maze/grid';
import { bfsDistances, generatePerfectMaze, openWall } from './generator';

const ROWS = 12;
const COLS = 12;
const CELL_SIZE = 180;
const WALL_THICKNESS = 12;

// Ring occupies the perimeter of rows[4..11] x cols[4..11] — the far corner
// from start, diagonally opposite (0,0) — with the interior (rows[5..10] x
// cols[5..10], a 6x6 sub-maze directly inside the ring's boundary — no gap
// row/col between them) reachable from the ring through exactly one
// doorway. A hand-on-wall follower that hugs the ring's *outer* face circles
// it forever without ever crossing that doorway — the classic "loop defeats
// wall-following" case — while flood fill's global knowledge finds it. This
// is constructed directly (not searched for) because it's straightforward
// to reason about and verify exactly: build a single loop with a single
// interior doorway, and confirm.
const RING_MIN = 4;
const RING_MAX = 11;
const INTERIOR_MIN = RING_MIN + 1;
const INTERIOR_SIZE = RING_MAX - RING_MIN - 1;

function buildRingPath(): Cell[] {
  const path: Cell[] = [];
  for (let c = RING_MIN; c <= RING_MAX; c++) path.push({ row: RING_MIN, col: c }); // top edge, L->R
  for (let r = RING_MIN + 1; r <= RING_MAX; r++) path.push({ row: r, col: RING_MAX }); // right edge, T->B
  for (let c = RING_MAX - 1; c >= RING_MIN; c--) path.push({ row: RING_MAX, col: c }); // bottom edge, R->L
  for (let r = RING_MAX - 1; r >= RING_MIN + 1; r--) path.push({ row: r, col: RING_MIN }); // left edge, B->T
  return path;
}

function carveConsecutive(cells: MazeCellWalls[][], path: Cell[], closeLoop: boolean): void {
  const dirBetween = (a: Cell, b: Cell): keyof MazeCellWalls => {
    if (b.row === a.row - 1) return 'N';
    if (b.row === a.row + 1) return 'S';
    if (b.col === a.col + 1) return 'E';
    return 'W';
  };
  for (let i = 0; i < path.length - 1; i++) {
    openWall(cells, path[i].row, path[i].col, dirBetween(path[i], path[i + 1]));
  }
  if (closeLoop) {
    const last = path[path.length - 1];
    const first = path[0];
    openWall(cells, last.row, last.col, dirBetween(last, first));
  }
}

function build(): MazeMap {
  const cells: MazeCellWalls[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ N: true, E: true, S: true, W: true })),
  );

  const start: Cell = { row: 0, col: 0 };
  const approach: Cell[] = [
    start,
    { row: 1, col: 0 },
    { row: 2, col: 0 },
    { row: 3, col: 0 },
    { row: 4, col: 0 },
    { row: 4, col: 1 },
    { row: 4, col: 2 },
    { row: 4, col: 3 },
    { row: 4, col: 4 },
  ];
  carveConsecutive(cells, approach, false);

  const ring = buildRingPath();
  carveConsecutive(cells, ring, true);

  // Interior sub-maze, spliced in at offset (INTERIOR_MIN, INTERIOR_MIN).
  // Must happen BEFORE opening the doorway below — splicing overwrites
  // whatever was at those cells, including a wall opened first.
  const interior = generatePerfectMaze(INTERIOR_SIZE, INTERIOR_SIZE, 99);
  for (let ir = 0; ir < INTERIOR_SIZE; ir++) {
    for (let ic = 0; ic < INTERIOR_SIZE; ic++) {
      cells[INTERIOR_MIN + ir][INTERIOR_MIN + ic] = interior[ir][ic];
    }
  }

  // The single doorway from the ring into the interior.
  const doorRing: Cell = { row: RING_MIN, col: INTERIOR_MIN + 1 };
  const doorInterior: Cell = { row: INTERIOR_MIN, col: INTERIOR_MIN + 1 };
  openWall(cells, doorRing.row, doorRing.col, 'S');

  // Goal: the interior cell farthest (by known interior corridors) from the
  // doorway, so reaching it demonstrates real navigation through the island.
  const doorLocal: Cell = { row: doorInterior.row - INTERIOR_MIN, col: doorInterior.col - INTERIOR_MIN };
  const dist = bfsDistances(interior, INTERIOR_SIZE, INTERIOR_SIZE, doorLocal.row, doorLocal.col);
  let goal: Cell = doorInterior;
  let best = -1;
  for (let ir = 0; ir < INTERIOR_SIZE; ir++) {
    for (let ic = 0; ic < INTERIOR_SIZE; ic++) {
      if (dist[ir][ic] > best && dist[ir][ic] !== Infinity) {
        best = dist[ir][ic];
        goal = { row: INTERIOR_MIN + ir, col: INTERIOR_MIN + ic };
      }
    }
  }

  return {
    id: 'mz-island',
    name: 'Island',
    description: 'Contains a loop — wall-follower fails, flood-fill succeeds.',
    rows: ROWS,
    cols: COLS,
    cellSize: CELL_SIZE,
    wallThickness: WALL_THICKNESS,
    cells,
    start,
    goal: { ...goal, width: 1, height: 1 },
  };
}

export const mzIsland = build();
