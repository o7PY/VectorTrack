// Shared maze wall-knowledge storage and BFS flood. Extracted out of `algorithms/floodFill.ts` so
// the native flood-fill controller and the VTL maze adapter's `distance_to_goal`/`can_move`
// builtins reuse the same BFS instead of each maintaining a private copy — internal-docs/
// Algorithms.md §1.6 ("`distance_to_goal` reuses the existing multi-source BFS from `floodFill.ts`
// — do not write a second one"), PLAN.md Phase E.

import type { CardinalDir, Cell } from '../core/types';
import { ALL_DIRS, DIR_BACK, DIR_LEFT, DIR_RIGHT, neighborCell } from '../algorithms/mazeMotion';

export interface WallKnowledge {
  N?: boolean;
  E?: boolean;
  S?: boolean;
  W?: boolean;
}

const DIR_NAME: Record<CardinalDir, keyof WallKnowledge> = { 0: 'N', 1: 'E', 2: 'S', 3: 'W' };

function key(c: Cell): string {
  return `${c.row},${c.col}`;
}

function inBoundsRC(rows: number, cols: number, c: Cell): boolean {
  return c.row >= 0 && c.row < rows && c.col >= 0 && c.col < cols;
}

/** Mutable per-run record of what a robot has discovered about the maze's walls so far. */
export class MazeWallKnowledge {
  private rows: number;
  private cols: number;
  private known: Map<string, WallKnowledge>;

  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this.known = new Map();
  }

  /**
   * `assumeOpen` controls how an undiscovered wall is treated:
   *  - true (optimistic, used while exploring): unknown = open, so the flood
   *    lures the robot toward undiscovered territory — that's what makes
   *    exploration converge on the goal quickly.
   *  - false (conservative, used once a path is already confirmed): unknown
   *    = wall, so replanning only ever uses edges the robot has actually
   *    driven. Using "optimistic" here would let a later, still-unconfirmed
   *    "shortcut" keep looking better than the known-good route every time
   *    it's rediscovered, which never converges.
   */
  hasWall(c: Cell, dir: CardinalDir, assumeOpen: boolean): boolean {
    const known = this.known.get(key(c))?.[DIR_NAME[dir]];
    if (known !== undefined) return known;
    return !assumeOpen;
  }

  markWall(c: Cell, dir: CardinalDir, isWall: boolean): void {
    const k = this.known.get(key(c)) ?? {};
    k[DIR_NAME[dir]] = isWall;
    this.known.set(key(c), k);

    const n = neighborCell(c, dir);
    if (inBoundsRC(this.rows, this.cols, n)) {
      const nk = this.known.get(key(n)) ?? {};
      nk[DIR_NAME[DIR_BACK[dir]]] = isWall;
      this.known.set(key(n), nk);
    }
  }

  observeWalls(cell: Cell, facing: CardinalDir, front: number, left: number, right: number, threshold: number): void {
    this.markWall(cell, facing, front <= threshold);
    this.markWall(cell, DIR_LEFT[facing], left <= threshold);
    this.markWall(cell, DIR_RIGHT[facing], right <= threshold);
  }
}

/** Multi-source BFS over `knowledge`'s discovered walls. Shared by floodFill.ts and vtlMazeAdapter.ts. */
export function computeFlood(rows: number, cols: number, targets: Cell[], knowledge: MazeWallKnowledge, assumeOpen: boolean): number[][] {
  const dist: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(Infinity));
  for (const t of targets) dist[t.row][t.col] = 0;
  const queue: Cell[] = [...targets];
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    for (const dir of ALL_DIRS) {
      if (knowledge.hasWall(cur, dir, assumeOpen)) continue;
      const n = neighborCell(cur, dir);
      if (!inBoundsRC(rows, cols, n)) continue;
      if (dist[n.row][n.col] > dist[cur.row][cur.col] + 1) {
        dist[n.row][n.col] = dist[cur.row][cur.col] + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}
