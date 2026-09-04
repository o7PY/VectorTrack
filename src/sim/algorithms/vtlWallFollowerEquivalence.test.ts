// PLAN.md Phase F — VTL left-hand wall follower (§1.8) must reproduce native wallFollower.ts's
// trajectory on mz-intro within tolerance. The §1.8 program checks left-then-forward-then-right-
// then-back, which is native wallFollower.ts's `hand: 'left'` priority order exactly, and both
// observe walls with the same `cellSize * 0.6` threshold, so the two should make identical
// turn-by-turn decisions and stay locked together pose-wise.

import { describe, expect, it } from 'vitest';
import { mazeMaps } from '../../maps/maze';
import { mazeRobots } from '../../robots/definitions';
import { buildWallSegments } from '../maze/grid';
import { compile } from '../../vtl/compile';
import { createWallFollower } from './wallFollower';
import { createVtlMazeController } from './vtlMazeAdapter';
import { initMazeRunState, tickMaze } from '../runners/mazeRunner';
import type { MazeRunConfig } from '../runners/mazeRunner';

const TIME_LIMIT_S = 120;
const DT = 1 / 120;

function makeConfig(mapId: string, robotId = 'mz-probe'): MazeRunConfig {
  const map = mazeMaps.find((m) => m.id === mapId)!;
  const robot = mazeRobots.find((r) => r.id === robotId)!;
  return {
    map,
    segments: buildWallSegments(map),
    robot,
    timeLimitS: TIME_LIMIT_S,
    collisionRadius: robot.wheelBase * 0.5,
  };
}

// The §1.8 left-hand wall-follower worked example, verbatim (must stay identical to
// vtlMazeAdapter.test.ts's copy).
const WALL_FOLLOWER_PROGRAM = `
on junction:
  if can_move(left):
    move_to(left)
  elif can_move(forward):
    move_to(forward)
  elif can_move(right):
    move_to(right)
  else:
    move_to(back)
`;

describe('VTL wall follower vs. native wallFollower.ts — equivalence on mz-intro', () => {
  it('tracks the native left-hand controller within a tight pose tolerance, tick for tick', () => {
    const compiled = compile(WALL_FOLLOWER_PROGRAM, 'maze');
    if (!compiled.ok) throw new Error(`compile failed: ${compiled.errors.map((e) => e.message).join('; ')}`);

    const config = makeConfig('mz-intro');
    const ctx = {
      rows: config.map.rows,
      cols: config.map.cols,
      cellSize: config.map.cellSize,
      start: config.map.start,
      goal: config.map.goal,
      maxWheelSpeed: config.robot.maxWheelSpeed,
      wheelBase: config.robot.wheelBase,
      sensorRange: config.robot.sensorRange,
    };

    const vtlController = createVtlMazeController(compiled.program);
    vtlController.reset(ctx);
    let vtlState = initMazeRunState(config);

    const nativeController = createWallFollower();
    nativeController.reset(ctx);
    let nativeState = initMazeRunState(config);

    const maxSteps = Math.ceil(TIME_LIMIT_S / DT) + 10;
    for (let i = 0; i < maxSteps; i++) {
      const vtlDone = vtlState.status.outcome === 'success' || vtlState.status.outcome === 'failed';
      const nativeDone = nativeState.status.outcome === 'success' || nativeState.status.outcome === 'failed';
      if (vtlDone && nativeDone) break;

      if (!vtlDone) vtlState = tickMaze(vtlState, config, vtlController, {}, DT);
      if (!nativeDone) nativeState = tickMaze(nativeState, config, nativeController, { hand: 'left' }, DT);

      const dist = Math.hypot(vtlState.pose.x - nativeState.pose.x, vtlState.pose.y - nativeState.pose.y);
      expect(dist).toBeLessThan(5); // mm
      expect(Math.abs(vtlState.pose.theta - nativeState.pose.theta)).toBeLessThan(0.05); // radians
    }

    expect(nativeState.status.outcome).toBe('success');
    expect(vtlState.status.outcome).toBe('success');
  });
});
