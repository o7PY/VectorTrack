/**
 * Static maze validation (MapMaker.md, MZ00x) — pure functions over an
 * already-decoded cell/wall grid, so they run identically in the editor's
 * debounced live check and (eventually) inside a headless validation worker.
 *
 * Kept deliberately small, mirroring lineRules.ts: an interior wall inside a
 * multi-cell goal region, and a "wide open 3x3 area" heuristic, were both
 * dropped — the former is a niche edge case, and the latter fires on any
 * ordinary open room a casual maze author would draw on purpose. Both
 * produced warnings that weren't clearly actionable. See MapMaker.md "Known
 * simplifications".
 */
import type { Cell, MazeGoal } from '../../sim/core/types';
import type { MazeCellWalls } from '../../sim/maze/grid';
import { bfsDistances, goalCells, isInGoal } from '../../sim/maze/grid';

export type MazeIssueSeverity = 'error' | 'warning' | 'info';

export interface MazeValidationIssue {
  code: string;
  severity: MazeIssueSeverity;
  message: string;
  cells?: Cell[];
}

export interface MazeValidationInput {
  rows: number;
  cols: number;
  cellSizeMm: number;
  wallThicknessMm: number;
  cells: MazeCellWalls[][];
  start: Cell;
  goal: MazeGoal;
}

function isEnclosed(walls: MazeCellWalls): boolean {
  return walls.N && walls.E && walls.S && walls.W;
}

function cellKey(c: Cell): string {
  return `${c.row},${c.col}`;
}

const NEIGHBOR_DIRS = [
  { dir: 'N' as const, dr: -1, dc: 0 },
  { dir: 'E' as const, dr: 0, dc: 1 },
  { dir: 'S' as const, dr: 1, dc: 0 },
  { dir: 'W' as const, dr: 0, dc: -1 },
];

function findUnreachableRegions(input: MazeValidationInput, dist: number[][]): Cell[][] {
  const { rows, cols, cells } = input;
  const seen = new Set<string>();
  const regions: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (dist[r][c] !== Infinity) continue;
      const startKey = cellKey({ row: r, col: c });
      if (seen.has(startKey)) continue;
      const region: Cell[] = [];
      const queue: Cell[] = [{ row: r, col: c }];
      seen.add(startKey);
      let qi = 0;
      while (qi < queue.length) {
        const cur = queue[qi++];
        region.push(cur);
        const walls = cells[cur.row][cur.col];
        for (const { dir, dr, dc } of NEIGHBOR_DIRS) {
          if (walls[dir]) continue;
          const nr = cur.row + dr;
          const nc = cur.col + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          if (dist[nr][nc] !== Infinity) continue;
          const nKey = cellKey({ row: nr, col: nc });
          if (seen.has(nKey)) continue;
          seen.add(nKey);
          queue.push({ row: nr, col: nc });
        }
      }
      regions.push(region);
    }
  }
  return regions;
}

export function validateMazeStatic(input: MazeValidationInput): MazeValidationIssue[] {
  const { rows, cols, cells, start, goal } = input;
  const issues: MazeValidationIssue[] = [];
  const targets = goalCells(goal);

  if (isInGoal(start, goal)) {
    issues.push({ code: 'MZ001', severity: 'error', message: 'The start cell is inside the goal region.', cells: [start] });
  }

  const dist = bfsDistances(cells, rows, cols, [start]);
  const goalReachable = targets.some((t) => dist[t.row][t.col] !== Infinity);
  if (!goalReachable) {
    issues.push({ code: 'MZ002', severity: 'error', message: 'The goal is not reachable from the start cell.', cells: targets });
  }

  // Downgraded from 'error': an enclosed cell already makes the goal
  // unreachable, so MZ002 (a hard save-blocker) always fires alongside this
  // one in every case that matters — flagging it twice as a blocker would
  // just be the same fix required twice.
  const enclosedCells = [start, ...targets].filter((c) => isEnclosed(cells[c.row][c.col]));
  if (enclosedCells.length > 0) {
    issues.push({
      code: 'MZ003',
      severity: 'warning',
      message: 'The start cell or a goal cell is fully enclosed by four walls.',
      cells: enclosedCells,
    });
  }

  const unreachableRegions = findUnreachableRegions(input, dist).filter((region) => region.length >= 4);
  for (const region of unreachableRegions) {
    issues.push({
      code: 'MZ004',
      severity: 'warning',
      message: `A region of ${region.length} cells is unreachable from the start.`,
      cells: region,
    });
  }

  let reachableCount = 0;
  let openEdgeCount = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (dist[r][c] === Infinity) continue;
      reachableCount++;
      const walls = cells[r][c];
      if (!walls.E && c + 1 < cols && dist[r][c + 1] !== Infinity) openEdgeCount++;
      if (!walls.S && r + 1 < rows && dist[r + 1][c] !== Infinity) openEdgeCount++;
    }
  }
  if (reachableCount > 0 && openEdgeCount === reachableCount - 1) {
    issues.push({
      code: 'MZ005',
      severity: 'info',
      message: 'This maze has no loops (a perfect maze / spanning tree) — there is exactly one route to the goal.',
    });
  }

  return issues;
}

export interface MazeRobotGeometry {
  chassisWidthMm: number;
  sensorRangeMm: number;
}

export function validateMazePhysical(
  cellSizeMm: number,
  wallThicknessMm: number,
  robot: MazeRobotGeometry,
): MazeValidationIssue[] {
  const issues: MazeValidationIssue[] = [];
  const corridorWidthMm = cellSizeMm - wallThicknessMm;
  const turnClearanceMm = corridorWidthMm - robot.chassisWidthMm;

  if (corridorWidthMm <= robot.chassisWidthMm) {
    issues.push({
      code: 'MZP01',
      severity: 'error',
      message: `Corridor width (${corridorWidthMm} mm) is not wider than the robot's chassis (${robot.chassisWidthMm} mm) — it cannot physically enter.`,
    });
  } else if (turnClearanceMm < 20) {
    // Downgraded from 'error': this only matters in a dead end, and not
    // every maze has one — it's a real risk, not a guaranteed failure, so it
    // shouldn't block Save on its own.
    issues.push({
      code: 'MZP02',
      severity: 'warning',
      message: `Only ${turnClearanceMm.toFixed(0)} mm of turn clearance — the robot cannot turn around in a dead end.`,
    });
  } else if (turnClearanceMm < 60) {
    issues.push({
      code: 'MZP03',
      severity: 'warning',
      message: `Only ${turnClearanceMm.toFixed(0)} mm of turn clearance — tight; expect wall clips under aggressive algorithms.`,
    });
  }

  // Downgraded from 'error': degrades junction detection but doesn't make
  // the map unrunnable outright — a robot can still move and re-sense a cell
  // at a time, just less cleanly.
  if (robot.sensorRangeMm < cellSizeMm) {
    issues.push({
      code: 'MZP04',
      severity: 'warning',
      message: `The robot's sensor range (${robot.sensorRangeMm} mm) is shorter than the cell size (${cellSizeMm} mm) — it cannot see the far wall of its own cell.`,
    });
  }

  return issues;
}
