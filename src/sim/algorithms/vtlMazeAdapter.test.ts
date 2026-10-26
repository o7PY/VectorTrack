import { describe, expect, it } from 'vitest';
import { mazeMaps } from '../../maps/maze';
import { mazeRobots } from '../../robots/definitions';
import { compile } from '../../vtl/compile';
import { buildWallSegments } from '../maze/grid';
import { initMazeRunState, tickMaze } from '../runners/mazeRunner';
import type { MazeRunConfig } from '../runners/mazeRunner';
import type { MazeController, MazeControllerContext } from '../core/types';
import { createVtlMazeController } from './vtlMazeAdapter';

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

function ctxOf(config: MazeRunConfig): MazeControllerContext {
  return {
    rows: config.map.rows,
    cols: config.map.cols,
    cellSize: config.map.cellSize,
    start: config.map.start,
    goal: config.map.goal,
    maxWheelSpeed: config.robot.maxWheelSpeed,
    wheelBase: config.robot.wheelBase,
    sensorRange: config.robot.sensorRange,
  };
}

function runToCompletion(config: MazeRunConfig, controller: MazeController, params: Record<string, string | number> = {}) {
  controller.reset(ctxOf(config));
  let state = initMazeRunState(config);
  const maxSteps = Math.ceil(TIME_LIMIT_S / DT) + 10;
  for (let i = 0; i < maxSteps; i++) {
    if (state.status.outcome === 'success' || state.status.outcome === 'failed') break;
    state = tickMaze(state, config, controller, params, DT);
  }
  return state;
}

// The §1.8 worked examples, verbatim from Algorithms.md.
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

function compileMaze(source: string) {
  const result = compile(source, 'maze');
  if (!result.ok) throw new Error(`compile failed: ${result.errors.map((e) => e.message).join('; ')}`);
  return result.program;
}

describe('createVtlMazeController — left-hand wall follower (§1.8) headless on mz-intro', () => {
  it('reaches the goal', () => {
    const program = compileMaze(WALL_FOLLOWER_PROGRAM);
    const config = makeConfig('mz-intro');
    const result = runToCompletion(config, createVtlMazeController(program));
    expect(result.status.outcome).toBe('success');
  });
});

describe('createVtlMazeController — greedy flood fill (§1.8) headless on mz-intro', () => {
  it('reaches the goal', () => {
    const program = compileMaze(FLOOD_FILL_PROGRAM);
    const config = makeConfig('mz-intro');
    const result = runToCompletion(config, createVtlMazeController(program));
    expect(result.status.outcome).toBe('success');
  });
});

describe('createVtlMazeController — builtins', () => {
  const config = makeConfig('mz-intro');

  function stepUntilFirstJunctionDecision(source: string, onHalt?: (code: string) => void) {
    const program = compileMaze(source);
    const controller = createVtlMazeController(program, undefined, onHalt && ((h) => onHalt(h.code)));
    controller.reset(ctxOf(config));
    let state = initMazeRunState(config);
    for (let i = 0; i < 5; i++) state = tickMaze(state, config, controller, {}, DT);
    return state;
  }

  it('move_to called twice in one "on junction" halts with VTL013', () => {
    // move_to() throws VtlEventStop, which only ends its own event *block* (Interpreter.runEvent
    // continues to the next block of the same event name) — so triggering "called twice" requires
    // two separate "on junction" blocks, not two calls within one.
    let haltCode: string | undefined;
    stepUntilFirstJunctionDecision(
      'on junction:\n  move_to(forward)\non junction:\n  move_to(back)\n',
      (c) => (haltCode = c),
    );
    expect(haltCode).toBe('VTL013');
  });

  it('move_to called from "on tick" halts with VTL013', () => {
    let haltCode: string | undefined;
    stepUntilFirstJunctionDecision('on tick:\n  move_to(forward)\n', (c) => (haltCode = c));
    expect(haltCode).toBe('VTL013');
  });

  it('finish() only completes the run when the robot is actually in the goal region', () => {
    const program = compileMaze('on junction:\n  finish()\n');
    const controller = createVtlMazeController(program);
    controller.reset(ctxOf(config));
    let state = initMazeRunState(config);
    // mz-intro's start cell isn't the goal, so this finish() call is ignored and the run keeps
    // going (and eventually times out, since the program never calls move_to()).
    for (let i = 0; i < 5; i++) state = tickMaze(state, config, controller, {}, DT);
    expect(controller.isDone()).toBe(false);
  });

  it('cell_row()/cell_col() report the start cell before any move', () => {
    const logged: Record<string, unknown> = {};
    const program = compileMaze('on junction:\n  log("row", cell_row())\n  log("col", cell_col())\n  move_to(forward)\n');
    const controller = createVtlMazeController(program, (label, value) => {
      logged[label] = value;
    });
    controller.reset(ctxOf(config));
    let state = initMazeRunState(config);
    for (let i = 0; i < 5; i++) state = tickMaze(state, config, controller, {}, DT);
    expect(logged.row).toBe(config.map.start.row);
    expect(logged.col).toBe(config.map.start.col);
  });
});

describe('createVtlMazeController — hotSwap (Algorithms.md §3.2 live editing semantics)', () => {
  const config = makeConfig('mz-intro');

  // "on tick" fires every step() call regardless of whether the robot has physically reached its
  // next cell, so it's a much cheaper way to exercise hotSwap than waiting out real cell-to-cell
  // travel between "on junction" firings.
  it('preserves a state value across hotSwap when the name and value type still match', () => {
    const logged: Record<string, unknown> = {};
    const v1 = compileMaze('state counter = 0\non tick:\n  set counter = counter + 1\n');
    const controller = createVtlMazeController(v1, (label, value) => (logged[label] = value));
    controller.reset(ctxOf(config));
    let state = initMazeRunState(config);
    for (let i = 0; i < 3; i++) state = tickMaze(state, config, controller, {}, DT);
    // counter is now 3.

    const v2 = compileMaze('state counter = 0\non tick:\n  set counter = counter + 10\n  log("counter", counter)\n');
    controller.hotSwap(v2);
    tickMaze(state, config, controller, {}, DT);
    // If state weren't preserved, this would read 10 (0 + 10) instead of 13 (3 + 10).
    expect(logged.counter).toBe(13);
  });

  it('drops a state that no longer exists in the new program and initializes a brand-new one to its declared default', () => {
    const logged: Record<string, unknown> = {};
    const v1 = compileMaze('state old = 42\non tick:\n  set old = old + 1\n');
    const controller = createVtlMazeController(v1);
    controller.reset(ctxOf(config));
    let state = initMazeRunState(config);
    state = tickMaze(state, config, controller, {}, DT);

    const v2 = compileMaze('state fresh = 7\non tick:\n  log("fresh", fresh)\n');
    controller.hotSwap(v2);
    const controllerWithLog = createVtlMazeController(v2, (label, value) => (logged[label] = value));
    controllerWithLog.reset(ctxOf(config));
    tickMaze(state, config, controllerWithLog, {}, DT);
    expect(logged.fresh).toBe(7);
  });

  it('re-defaults a state whose value type changed (number -> string) rather than keeping the mismatched value', () => {
    const logged: Record<string, unknown> = {};
    const v1 = compileMaze('state mode = 5\non tick:\n  let x = mode\n');
    const controller = createVtlMazeController(v1, (label, value) => (logged[label] = value));
    controller.reset(ctxOf(config));
    let state = initMazeRunState(config);
    state = tickMaze(state, config, controller, {}, DT);

    const v2 = compileMaze('state mode = "idle"\non tick:\n  log("mode", mode)\n');
    controller.hotSwap(v2);
    tickMaze(state, config, controller, {}, DT);
    expect(logged.mode).toBe('idle');
  });

  it('un-halts on hotSwap so a fixed program can run again after a runtime halt', () => {
    let haltCode: string | undefined;
    const v1 = compileMaze('on tick:\n  move_to(forward)\n'); // VTL013: move_to isn't allowed from "on tick".
    const controller = createVtlMazeController(v1, undefined, (h) => (haltCode = h.code));
    controller.reset(ctxOf(config));
    let state = initMazeRunState(config);
    state = tickMaze(state, config, controller, {}, DT);
    expect(haltCode).toBe('VTL013');

    const v2 = compileMaze('on junction:\n  move_to(forward)\n');
    controller.hotSwap(v2);
    expect(() => tickMaze(state, config, controller, {}, DT)).not.toThrow();
  });

  it('preserves array contents across hotSwap when the name and length still match (v0.3.1.md §K.13)', () => {
    const logged: Record<string, unknown> = {};
    const v1 = compileMaze('state buf[3] = 0\non tick:\n  set buf[0] = 5\n  set buf[1] = 6\n  set buf[2] = 7\n');
    const controller = createVtlMazeController(v1, (label, value) => (logged[label] = value));
    controller.reset(ctxOf(config));
    let state = initMazeRunState(config);
    state = tickMaze(state, config, controller, {}, DT);
    // buf is now [5, 6, 7].

    const v2 = compileMaze('state buf[3] = 0\non tick:\n  log("buf0", buf[0])\n  log("buf2", buf[2])\n');
    controller.hotSwap(v2);
    tickMaze(state, config, controller, {}, DT);
    // If the array weren't preserved across the hotSwap, these would both be 0.
    expect(logged.buf0).toBe(5);
    expect(logged.buf2).toBe(7);
  });

  it('resets array contents to the declared fill value across hotSwap when the length changes (v0.3.1.md §K.13)', () => {
    const logged: Record<string, unknown> = {};
    const v1 = compileMaze('state buf[3] = 0\non tick:\n  set buf[0] = 9\n  set buf[1] = 9\n  set buf[2] = 9\n');
    const controller = createVtlMazeController(v1, (label, value) => (logged[label] = value));
    controller.reset(ctxOf(config));
    let state = initMazeRunState(config);
    state = tickMaze(state, config, controller, {}, DT);
    // buf is now [9, 9, 9].

    const v2 = compileMaze('state buf[4] = 3\non tick:\n  log("buf0", buf[0])\n  log("buf3", buf[3])\n');
    controller.hotSwap(v2);
    tickMaze(state, config, controller, {}, DT);
    // A length change (3 -> 4) resets to the new declared fill value (3), not a truncated/padded [9,...].
    expect(logged.buf0).toBe(3);
    expect(logged.buf3).toBe(3);
  });
});
