import type { CardinalDir, Cell, MazeController } from '../core/types';
import {
  CellMotionController,
  DIR_BACK,
  DIR_LEFT,
  DIR_RIGHT,
  cellCenter,
  neighborCell,
  poseToCell,
} from './mazeMotion';

type Mode = 'turn' | 'forward';

/** Parameter: hand ('left' | 'right'). Fails on maps with a loop (e.g. mz-island) by design (SPEC 5.4). */
export function createWallFollower(): MazeController {
  let cellSize = 0;
  let maxWheelSpeed = 0;
  let goal: Cell = { row: 0, col: 0 };
  let motion: CellMotionController;
  let heading: CardinalDir = 1; // East
  let targetDir: CardinalDir = 1;
  let mode: Mode = 'turn';
  let currentCell: Cell = { row: 0, col: 0 };
  let targetCell: Cell = { row: 0, col: 0 };
  let visited = new Set<string>();
  let done = false;

  return {
    id: 'wallFollower',
    reset(ctx) {
      cellSize = ctx.cellSize;
      maxWheelSpeed = ctx.maxWheelSpeed;
      goal = ctx.goal;
      motion = new CellMotionController(ctx.maxWheelSpeed, ctx.wheelBase);
      heading = 1;
      targetDir = 1;
      // Start in 'forward' mode with targetCell already at start: the first
      // step() call falls straight into the arrival-decision branch below,
      // which picks a direction from *live sensors* instead of blindly
      // assuming the start cell opens to the East.
      mode = 'forward';
      currentCell = { ...ctx.start };
      targetCell = { ...ctx.start };
      visited = new Set([`${ctx.start.row},${ctx.start.col}`]);
      done = false;
    },
    step(sensors, pose, _dt, params) {
      if (done) {
        return { vLeft: 0, vRight: 0, debug: { cell: currentCell, phase: 'done', cellsVisited: visited.size } };
      }

      if (mode === 'turn' && !motion.isAligned(pose.theta, targetDir)) {
        return { ...motion.turnTowards(pose.theta, targetDir), debug: { cell: currentCell, phase: 'navigating', cellsVisited: visited.size } };
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
        return { ...motion.driveForward(pose.theta, heading, speed), debug: { cell: poseToCell(pose, cellSize), phase: 'navigating', cellsVisited: visited.size } };
      }

      // Arrived.
      currentCell = targetCell;
      visited.add(`${currentCell.row},${currentCell.col}`);

      if (currentCell.row === goal.row && currentCell.col === goal.col) {
        done = true;
        return { vLeft: 0, vRight: 0, debug: { cell: currentCell, phase: 'done', cellsVisited: visited.size } };
      }

      const hand = params.hand === 'left' ? 'left' : 'right';
      const wallThreshold = cellSize * 0.6;
      const sideDir = hand === 'right' ? DIR_RIGHT[heading] : DIR_LEFT[heading];
      const sideOpen = (hand === 'right' ? sensors.right : sensors.left) > wallThreshold;
      const frontOpen = sensors.front > wallThreshold;
      const oppositeOpen = (hand === 'right' ? sensors.left : sensors.right) > wallThreshold;

      let next: CardinalDir;
      if (sideOpen) next = sideDir;
      else if (frontOpen) next = heading;
      else if (oppositeOpen) next = hand === 'right' ? DIR_LEFT[heading] : DIR_RIGHT[heading];
      else next = DIR_BACK[heading];

      targetDir = next;
      mode = 'turn';
      return { ...motion.turnTowards(pose.theta, targetDir), debug: { cell: currentCell, phase: 'navigating', cellsVisited: visited.size } };
    },
    isDone() {
      return done;
    },
  };
}
