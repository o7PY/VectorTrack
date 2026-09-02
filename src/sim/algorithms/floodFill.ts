import type { CardinalDir, Cell, MazeController } from '../core/types';
import {
  ALL_DIRS,
  CellMotionController,
  DIR_BACK,
  DIR_LEFT,
  DIR_RIGHT,
  cellCenter,
  neighborCell,
} from './mazeMotion';

type Phase = 'explore' | 'return' | 'run' | 'done';
type Mode = 'turn' | 'forward';

interface WallKnowledge {
  N?: boolean;
  E?: boolean;
  S?: boolean;
  W?: boolean;
}

const DIR_NAME: Record<CardinalDir, keyof WallKnowledge> = { 0: 'N', 1: 'E', 2: 'S', 3: 'W' };

function key(c: Cell): string {
  return `${c.row},${c.col}`;
}

function inBounds(rows: number, cols: number, c: Cell): boolean {
  return c.row >= 0 && c.row < rows && c.col >= 0 && c.col < cols;
}

/** No tunable parameters. Two-phase: explore to goal, then compute shortest path and run it (SPEC 5.4). */
export function createFloodFill(): MazeController {
  let rows = 0;
  let cols = 0;
  let cellSize = 0;
  let maxWheelSpeed = 0;
  let start: Cell = { row: 0, col: 0 };
  let goal: Cell = { row: 0, col: 0 };
  let motion: CellMotionController;

  let known: Map<string, WallKnowledge>;
  let heading: CardinalDir = 1;
  let targetDir: CardinalDir = 1;
  let mode: Mode = 'turn';
  let phase: Phase = 'explore';
  let currentCell: Cell = { row: 0, col: 0 };
  let targetCell: Cell = { row: 0, col: 0 };
  let visited = new Set<string>();
  let path: CardinalDir[] = [];
  let pathIndex = 0;
  let hasTraveled = false;

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
  function hasWall(c: Cell, dir: CardinalDir, assumeOpen: boolean): boolean {
    const known_ = known.get(key(c))?.[DIR_NAME[dir]];
    if (known_ !== undefined) return known_;
    return !assumeOpen;
  }

  function markWall(c: Cell, dir: CardinalDir, isWall: boolean): void {
    const k = known.get(key(c)) ?? {};
    k[DIR_NAME[dir]] = isWall;
    known.set(key(c), k);

    const n = neighborCell(c, dir);
    if (inBounds(rows, cols, n)) {
      const nk = known.get(key(n)) ?? {};
      nk[DIR_NAME[DIR_BACK[dir]]] = isWall;
      known.set(key(n), nk);
    }
  }

  function computeFlood(target: Cell, assumeOpen: boolean): number[][] {
    const dist: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(Infinity));
    dist[target.row][target.col] = 0;
    const queue: Cell[] = [target];
    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++];
      for (const dir of ALL_DIRS) {
        if (hasWall(cur, dir, assumeOpen)) continue;
        const n = neighborCell(cur, dir);
        if (!inBounds(rows, cols, n)) continue;
        if (dist[n.row][n.col] > dist[cur.row][cur.col] + 1) {
          dist[n.row][n.col] = dist[cur.row][cur.col] + 1;
          queue.push(n);
        }
      }
    }
    return dist;
  }

  function bestNeighborDir(
    cell: Cell,
    dist: number[][],
    preferHeading: CardinalDir,
    assumeOpen: boolean,
    preferUnvisited = false,
  ): CardinalDir | null {
    let best: CardinalDir | null = null;
    let bestDist = Infinity;
    let bestUnvisited = false;
    for (const dir of ALL_DIRS) {
      if (hasWall(cell, dir, assumeOpen)) continue;
      const n = neighborCell(cell, dir);
      if (!inBounds(rows, cols, n)) continue;
      const d = dist[n.row][n.col];
      const unvisited = preferUnvisited && !visited.has(key(n));
      // On a graph with a cycle (e.g. mz-island's loop), re-flooding from
      // scratch every step can make "the other way around" look marginally
      // shorter as walls are discovered, causing the explorer to reverse
      // mid-loop forever. Preferring any not-yet-visited neighbor over a
      // shorter-but-already-explored one keeps exploration moving forward.
      const better = unvisited && !bestUnvisited ? true : unvisited === bestUnvisited && d < bestDist;
      if (better) {
        bestDist = d;
        best = dir;
        bestUnvisited = unvisited;
      } else if (unvisited === bestUnvisited && d === bestDist && dir === preferHeading) {
        best = dir;
      }
    }
    return best;
  }

  function observeWalls(cell: Cell, facing: CardinalDir, front: number, left: number, right: number, threshold: number): void {
    markWall(cell, facing, front <= threshold);
    markWall(cell, DIR_LEFT[facing], left <= threshold);
    markWall(cell, DIR_RIGHT[facing], right <= threshold);
  }

  function planPath(from: Cell, to: Cell): CardinalDir[] {
    const dist = computeFlood(to, false);
    const dirs: CardinalDir[] = [];
    let cur = from;
    let guard = rows * cols * 4 + 4;
    while ((cur.row !== to.row || cur.col !== to.col) && guard-- > 0) {
      const dir = bestNeighborDir(cur, dist, dirs.length ? dirs[dirs.length - 1] : heading, false);
      if (dir === null) break;
      dirs.push(dir);
      cur = neighborCell(cur, dir);
    }
    return dirs;
  }

  return {
    id: 'floodFill',
    reset(ctx) {
      rows = ctx.rows;
      cols = ctx.cols;
      cellSize = ctx.cellSize;
      maxWheelSpeed = ctx.maxWheelSpeed;
      start = ctx.start;
      goal = ctx.goal;
      motion = new CellMotionController(ctx.maxWheelSpeed, ctx.wheelBase);
      known = new Map();
      heading = 1;
      targetDir = 1;
      // Start in 'forward' mode with targetCell already at start: the first
      // step() call falls straight into the arrival-decision branch below,
      // which picks a direction from *live sensors* instead of blindly
      // assuming the start cell opens to the East.
      mode = 'forward';
      phase = 'explore';
      currentCell = { ...ctx.start };
      targetCell = { ...ctx.start };
      visited = new Set([key(start)]);
      path = [];
      pathIndex = 0;
      hasTraveled = false;
    },
    step(sensors, pose, _dt, _params) {
      if (phase === 'done') {
        return { vLeft: 0, vRight: 0, debug: { cell: currentCell, phase, cellsVisited: visited.size } };
      }

      if (mode === 'turn' && !motion.isAligned(pose.theta, targetDir)) {
        return { ...motion.turnTowards(pose.theta, targetDir), debug: { cell: currentCell, phase, cellsVisited: visited.size } };
      }
      if (mode === 'turn') {
        heading = targetDir;
        mode = 'forward';
        targetCell = neighborCell(currentCell, heading);
      }

      const target = cellCenter(targetCell, cellSize);
      const dist = Math.hypot(pose.x - target.x, pose.y - target.y);

      if (dist >= cellSize * 0.1) {
        const speed = maxWheelSpeed * 0.9;
        return { ...motion.driveForward(pose.theta, heading, speed), debug: { cell: currentCell, phase, cellsVisited: visited.size } };
      }

      // Arrived at targetCell.
      currentCell = targetCell;
      visited.add(key(currentCell));
      // We just physically drove through this edge, so it's confirmed open —
      // sensors alone would never tell us this (they only cover the facing,
      // left and right sides at arrival, never straight behind). Skip this
      // on the very first (synthetic) "arrival" at the start cell, since we
      // didn't actually travel from anywhere.
      if (hasTraveled) markWall(currentCell, DIR_BACK[heading], false);
      hasTraveled = true;

      if (phase === 'explore' || phase === 'return') {
        const threshold = cellSize * 0.6;
        observeWalls(currentCell, heading, sensors.front, sensors.left, sensors.right, threshold);

        if (phase === 'explore' && currentCell.row === goal.row && currentCell.col === goal.col) {
          phase = 'return';
        } else if (phase === 'return' && currentCell.row === start.row && currentCell.col === start.col) {
          path = planPath(start, goal);
          pathIndex = 0;
          phase = 'run';
          targetDir = path[pathIndex] ?? heading;
          mode = 'turn';
          return { ...motion.turnTowards(pose.theta, targetDir), debug: { cell: currentCell, phase, cellsVisited: visited.size } };
        }

        // Explore optimistically (unknown=open) to seek out the goal through
        // undiscovered territory; return conservatively (unknown=wall) so
        // replanning only ever retraces edges already confirmed open.
        const optimistic = phase === 'explore';
        const floodTarget = phase === 'explore' ? goal : start;
        const flood = computeFlood(floodTarget, optimistic);
        const next = bestNeighborDir(currentCell, flood, heading, optimistic, optimistic) ?? DIR_BACK[heading];
        targetDir = next;
        mode = 'turn';
        return { ...motion.turnTowards(pose.theta, targetDir), debug: { cell: currentCell, phase, cellsVisited: visited.size } };
      }

      // phase === 'run': follow the precomputed shortest path.
      if (currentCell.row === goal.row && currentCell.col === goal.col) {
        phase = 'done';
        return { vLeft: 0, vRight: 0, debug: { cell: currentCell, phase, cellsVisited: visited.size } };
      }
      pathIndex++;
      targetDir = path[pathIndex] ?? heading;
      mode = 'turn';
      return { ...motion.turnTowards(pose.theta, targetDir), debug: { cell: currentCell, phase, cellsVisited: visited.size } };
    },
    isDone() {
      return phase === 'done';
    },
  };
}
