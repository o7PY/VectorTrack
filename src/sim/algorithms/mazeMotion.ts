import type { CardinalDir, Cell, Pose2D, WheelCommand } from '../core/types';
import { angleDiff } from '../core/kinematics';

export const DIR_DELTA: Record<CardinalDir, { dr: number; dc: number }> = {
  0: { dr: -1, dc: 0 }, // N
  1: { dr: 0, dc: 1 }, // E
  2: { dr: 1, dc: 0 }, // S
  3: { dr: 0, dc: -1 }, // W
};

// theta=0 faces +x (East); +y is South (matches sim/maze/grid.ts row/col axes).
export const DIR_ANGLE: Record<CardinalDir, number> = {
  0: -Math.PI / 2, // N
  1: 0, // E
  2: Math.PI / 2, // S
  3: Math.PI, // W
};

export const DIR_LEFT: Record<CardinalDir, CardinalDir> = { 0: 3, 1: 0, 2: 1, 3: 2 };
export const DIR_RIGHT: Record<CardinalDir, CardinalDir> = { 0: 1, 1: 2, 2: 3, 3: 0 };
export const DIR_BACK: Record<CardinalDir, CardinalDir> = { 0: 2, 1: 3, 2: 0, 3: 1 };
export const ALL_DIRS: CardinalDir[] = [0, 1, 2, 3];

export function poseToCell(pose: Pose2D, cellSize: number): Cell {
  return { row: Math.floor(pose.y / cellSize), col: Math.floor(pose.x / cellSize) };
}

export function cellCenter(cell: Cell, cellSize: number): { x: number; y: number } {
  return { x: (cell.col + 0.5) * cellSize, y: (cell.row + 0.5) * cellSize };
}

export function neighborCell(cell: Cell, dir: CardinalDir): Cell {
  const d = DIR_DELTA[dir];
  return { row: cell.row + d.dr, col: cell.col + d.dc };
}

/** Turn-in-place / drive-straight low-level controller for cell-to-cell maze navigation. */
export class CellMotionController {
  private maxWheelSpeed: number;

  constructor(maxWheelSpeed: number, _wheelBase: number) {
    this.maxWheelSpeed = maxWheelSpeed;
  }

  turnTowards(theta: number, targetDir: CardinalDir): WheelCommand {
    const diff = angleDiff(theta, DIR_ANGLE[targetDir]);
    const turnSpeed = clamp(diff * this.maxWheelSpeed * 1.5, -this.maxWheelSpeed * 0.85, this.maxWheelSpeed * 0.85);
    return { vLeft: -turnSpeed, vRight: turnSpeed };
  }

  driveForward(theta: number, targetDir: CardinalDir, speed: number): WheelCommand {
    const diff = angleDiff(theta, DIR_ANGLE[targetDir]);
    const corr = clamp(diff * this.maxWheelSpeed * 0.5, -speed, speed);
    return { vLeft: speed - corr, vRight: speed + corr };
  }

  isAligned(theta: number, targetDir: CardinalDir, eps = 0.03): boolean {
    return Math.abs(angleDiff(theta, DIR_ANGLE[targetDir])) < eps;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
