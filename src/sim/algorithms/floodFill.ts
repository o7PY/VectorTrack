import type { CardinalDir, Cell, MazeController, MazeGoal } from '../core/types';
import { goalCells, isInGoal } from '../maze/grid';
import { MazeWallKnowledge, computeFlood as sharedComputeFlood } from '../maze/motionLayer';
import { ALL_DIRS, CellMotionController, DIR_BACK, cellCenter, neighborCell } from './mazeMotion';

type Phase = 'explore' | 'return' | 'run' | 'done';
type Mode = 'turn' | 'forward';

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
  let goal: MazeGoal = { row: 0, col: 0, width: 1, height: 1 };
  let motion: CellMotionController;

  let knowledge: MazeWallKnowledge;
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

  function computeFlood(targets: Cell[], assumeOpen: boolean): number[][] {
    return sharedComputeFlood(rows, cols, targets, knowledge, assumeOpen);
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
      if (knowledge.hasWall(cell, dir, assumeOpen)) continue;
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

  function planPath(from: Cell, targets: Cell[]): CardinalDir[] {
    const dist = computeFlood(targets, false);
    const targetKeys = new Set(targets.map(key));
    const dirs: CardinalDir[] = [];
    let cur = from;
    let guard = rows * cols * 4 + 4;
    while (!targetKeys.has(key(cur)) && guard-- > 0) {
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
      knowledge = new MazeWallKnowledge(ctx.rows, ctx.cols);
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
      if (hasTraveled) knowledge.markWall(currentCell, DIR_BACK[heading], false);
      hasTraveled = true;

      if (phase === 'explore' || phase === 'return') {
        const threshold = cellSize * 0.6;
        knowledge.observeWalls(currentCell, heading, sensors.front, sensors.left, sensors.right, threshold);

        if (phase === 'explore' && isInGoal(currentCell, goal)) {
          phase = 'return';
        } else if (phase === 'return' && currentCell.row === start.row && currentCell.col === start.col) {
          path = planPath(start, goalCells(goal));
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
        const floodTargets = phase === 'explore' ? goalCells(goal) : [start];
        const flood = computeFlood(floodTargets, optimistic);
        const next = bestNeighborDir(currentCell, flood, heading, optimistic, optimistic) ?? DIR_BACK[heading];
        targetDir = next;
        mode = 'turn';
        return { ...motion.turnTowards(pose.theta, targetDir), debug: { cell: currentCell, phase, cellsVisited: visited.size } };
      }

      // phase === 'run': follow the precomputed shortest path.
      if (isInGoal(currentCell, goal)) {
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
