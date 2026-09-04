// PLAN.md Phase F — VTL greedy flood fill (§1.8) vs. native floodFill.ts on mz-intro.
//
// These are NOT expected to be equivalent, and this test documents that on purpose (per PLAN.md's
// own wording: "expect and document divergence — greedy flood fill is intentionally single-phase,
// not a bug"). Native floodFill.ts is a three-phase algorithm (explore the whole reachable area to
// the goal, return to start, then run the precomputed shortest path) — see its own phase comment.
// The §1.8 VTL program is intentionally the simple, single-phase version: at every junction it
// just steps toward whichever open neighbor currently looks closest to the goal by BFS over
// knowledge-so-far, with no separate "compute and run the shortest path" phase. So it reaches the
// goal (see vtlMazeAdapter.test.ts and ISSUES.md #35 for how that greedy pass was made
// wall-safe), but never grooms an optimal final run the way the native controller does — it can
// backtrack/meander (see the worked trajectory logged while fixing ISSUES.md #35, `cellsVisited: 39`
// on an 8x8=64-cell maze). This test asserts both still solve the maze, and that their paths
// genuinely differ, rather than asserting a tolerance that the algorithms were never designed to meet.

import { describe, expect, it } from 'vitest';
import { mazeMaps } from '../../maps/maze';
import { mazeRobots } from '../../robots/definitions';
import { buildWallSegments } from '../maze/grid';
import { compile } from '../../vtl/compile';
import { createFloodFill } from './floodFill';
import { createVtlMazeController } from './vtlMazeAdapter';
import { initMazeRunState, tickMaze } from '../runners/mazeRunner';
import type { MazeRunConfig } from '../runners/mazeRunner';
import type { MazeController } from '../core/types';

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

function runToCompletion(config: MazeRunConfig, controller: MazeController, params: Record<string, string | number>) {
  controller.reset({
    rows: config.map.rows,
    cols: config.map.cols,
    cellSize: config.map.cellSize,
    start: config.map.start,
    goal: config.map.goal,
    maxWheelSpeed: config.robot.maxWheelSpeed,
    wheelBase: config.robot.wheelBase,
    sensorRange: config.robot.sensorRange,
  });
  let state = initMazeRunState(config);
  const maxSteps = Math.ceil(TIME_LIMIT_S / DT) + 10;
  let steps = 0;
  for (; steps < maxSteps; steps++) {
    if (state.status.outcome === 'success' || state.status.outcome === 'failed') break;
    state = tickMaze(state, config, controller, params, DT);
  }
  return { state, steps };
}

// The §1.8 greedy flood-fill worked example, verbatim (must stay identical to
// vtlMazeAdapter.test.ts's copy).
const FLOOD_FILL_PROGRAM = `
on junction:
  if at_goal():
    finish()
  let best = "forward"
  if distance_to_goal(left) < distance_to_goal(best):
    set best = "left"
  if distance_to_goal(right) < distance_to_goal(best):
    set best = "right"
  if distance_to_goal(back) < distance_to_goal(best):
    set best = "back"
  move_to(best)
`;

describe('VTL greedy flood fill vs. native floodFill.ts — documented divergence on mz-intro', () => {
  it('both reach the goal, but via genuinely different paths (native explores+returns+sprints; VTL is single-pass greedy)', () => {
    const compiled = compile(FLOOD_FILL_PROGRAM, 'maze');
    if (!compiled.ok) throw new Error(`compile failed: ${compiled.errors.map((e) => e.message).join('; ')}`);

    const config = makeConfig('mz-intro');
    const vtlResult = runToCompletion(config, createVtlMazeController(compiled.program), {});
    const nativeResult = runToCompletion(config, createFloodFill(), {});

    expect(vtlResult.state.status.outcome).toBe('success');
    expect(nativeResult.state.status.outcome).toBe('success');

    // Native visits the whole reachable-to-goal region during "explore", then all of it again on
    // the way back to start during "return", before finally re-running just the shortest path —
    // so its step count is structurally much larger than a single greedy pass's.
    expect(nativeResult.steps).toBeGreaterThan(vtlResult.steps);
  });
});
