// Wraps a compiled VTL `Program` (mode "maze") in the existing `MazeController` interface, so
// `sim/runners/mazeRunner.ts` never learns VTL exists — internal-docs/Algorithms.md §1.6/§1.7,
// PLAN.md Phase E.
//
// The built-in motion layer (this file) owns cell-to-cell driving; the VTL program only answers
// "where next?" once per `on junction`. `move_to(dir)` captures the target cell once, at the call
// — never re-derived from live pose (INSIGHTS.md: the costliest bug class in this project's
// history).

import type { CardinalDir, Cell, MazeController, MazeControllerContext } from '../core/types';
import { goalCells, isInGoal } from '../maze/grid';
import { MazeWallKnowledge, computeFlood } from '../maze/motionLayer';
import { CellMotionController, DIR_BACK, DIR_LEFT, DIR_RIGHT, cellCenter, neighborCell } from './mazeMotion';
import type { Program } from '../../vtl/types';
import { MAZE_DIRECTION_CONSTANTS } from '../../vtl/builtins/maze';
import { createRunState, Interpreter, VtlEventStop, VtlRuntimeHalt, type VtlBuiltinFn, type VtlRunState, type VtlValue } from '../../vtl/interpreter';

export type VtlLogHandler = (label: string, value: VtlValue) => void;
export type VtlHaltHandler = (halt: VtlRuntimeHalt) => void;

const MAX_LOG_LABELS = 8;
const UNREACHABLE_SENTINEL = 1e6;

function key(c: Cell): string {
  return `${c.row},${c.col}`;
}

function resolveRelativeDir(word: VtlValue, heading: CardinalDir, line: number, column: number): CardinalDir {
  switch (word) {
    case 'forward':
      return heading;
    case 'back':
      return DIR_BACK[heading];
    case 'left':
      return DIR_LEFT[heading];
    case 'right':
      return DIR_RIGHT[heading];
    default:
      throw new VtlRuntimeHalt('VTL011', `"${String(word)}" isn't a direction (forward/back/left/right).`, line, column);
  }
}

/**
 * `hotSwap` lets `store/engine.ts` swap in a newly-recompiled program mid-run — Algorithms.md §3.2's
 * "compiling source edit -> hot-swap next tick, preserving state whose names/types still match."
 * Not part of the plain `MazeController` interface (`sim/runners/` must never learn VTL exists);
 * only vtl-aware callers hold a reference typed this way. In-flight cell-to-cell motion (current
 * heading, target cell, wall knowledge) is untouched — only the language-level `on tick`/
 * `on junction` logic and its `state`/`param` values change, at the next decision point.
 */
export interface VtlMazeController extends MazeController {
  hotSwap(newProgram: Program): void;
}

function transplantMatchingState(previous: VtlRunState['states'], nextProgram: Program): VtlRunState['states'] {
  const next = new Map<string, VtlValue>();
  for (const s of nextProgram.states) {
    if (s.length !== null) continue; // arrays are handled by transplantMatchingArrays
    const prevValue = previous.get(s.name);
    next.set(s.name, prevValue !== undefined && typeof prevValue === typeof s.value ? prevValue : s.value);
  }
  return next;
}

// Same idea as transplantMatchingState, for array states — preserved only when the new program
// still declares an array of the same name and length (v0.3.1.md §G).
function transplantMatchingArrays(previous: VtlRunState['arrays'], nextProgram: Program): VtlRunState['arrays'] {
  const next = new Map<string, number[]>();
  for (const s of nextProgram.states) {
    if (s.length === null) continue;
    const prevArr = previous.get(s.name);
    next.set(s.name, prevArr && prevArr.length === s.length ? [...prevArr] : new Array(s.length).fill(s.value as number));
  }
  return next;
}

/** Creates a `MazeController` that runs `program` (mode "maze") against `ctx`'s maze geometry. */
export function createVtlMazeController(program: Program, onLog?: VtlLogHandler, onHalt?: VtlHaltHandler): VtlMazeController {
  const constants = Object.fromEntries(MAZE_DIRECTION_CONSTANTS.map((d) => [d, d]));

  let ctx: MazeControllerContext;
  let motion: CellMotionController;
  let knowledge: MazeWallKnowledge;

  let runState = createRunState(program, constants);
  let simTime = 0;
  let currentSensors = { front: 0, left: 0, right: 0 };
  let currentDt = 0;
  let heading: CardinalDir = 1; // East
  let targetDir: CardinalDir = 1;
  let mode: 'turn' | 'forward' = 'turn';
  let currentCell: Cell = { row: 0, col: 0 };
  let targetCell: Cell = { row: 0, col: 0 };
  let visited = new Set<string>();
  let hasTraveled = false;
  let finished = false;
  let halted = false;
  let inTickEvent = false;
  let moveRequestedThisJunction = false;
  const logLabels = new Set<string>();

  function absoluteDir(word: VtlValue, line: number, column: number): CardinalDir {
    return resolveRelativeDir(word, heading, line, column);
  }

  const builtins: Record<string, VtlBuiltinFn> = {
    dt: () => currentDt,
    time: () => simTime,
    abs: (a) => Math.abs(a[0] as number),
    min: (a) => Math.min(a[0] as number, a[1] as number),
    max: (a) => Math.max(a[0] as number, a[1] as number),
    clamp: (a) => Math.min(Math.max(a[0] as number, a[1] as number), a[2] as number),
    sign: (a) => Math.sign(a[0] as number),
    sqrt: (a) => Math.sqrt(a[0] as number),
    sin: (a) => Math.sin(((a[0] as number) * Math.PI) / 180),
    cos: (a) => Math.cos(((a[0] as number) * Math.PI) / 180),
    atan2: (a) => (Math.atan2(a[0] as number, a[1] as number) * 180) / Math.PI,
    log: (a) => {
      const label = String(a[0]);
      if (logLabels.has(label) || logLabels.size < MAX_LOG_LABELS) {
        logLabels.add(label);
        onLog?.(label, a[1]);
      }
      return null;
    },
    range: (a) => {
      const side = a[0] as 'front' | 'left' | 'right';
      return currentSensors[side] ?? 0;
    },
    can_move: (a, c) => !knowledge.hasWall(currentCell, absoluteDir(a[0], c.line, c.column), false),
    move_to: (a, c) => {
      if (inTickEvent) {
        throw new VtlRuntimeHalt('VTL013', '"move_to" cannot be called from "on tick".', c.line, c.column);
      }
      if (moveRequestedThisJunction) {
        throw new VtlRuntimeHalt('VTL013', '"move_to" was already called during this "on junction".', c.line, c.column);
      }
      moveRequestedThisJunction = true;
      targetDir = absoluteDir(a[0], c.line, c.column);
      targetCell = neighborCell(currentCell, targetDir); // captured once, here — see file header.
      throw new VtlEventStop();
    },
    at_goal: () => isInGoal(currentCell, ctx.goal),
    visited: (a, c) => visited.has(key(neighborCell(currentCell, absoluteDir(a[0], c.line, c.column)))),
    cell_row: () => currentCell.row,
    cell_col: () => currentCell.col,
    heading: () => {
      const deg = { 0: 270, 1: 0, 2: 90, 3: 180 }[heading];
      return deg;
    },
    distance_to_goal: (a, c) => {
      const dir = absoluteDir(a[0], c.line, c.column);
      const n = neighborCell(currentCell, dir);
      if (n.row < 0 || n.row >= ctx.rows || n.col < 0 || n.col >= ctx.cols) return UNREACHABLE_SENTINEL;
      // A *confirmed* wall directly between here and the neighbour makes it unreachable this way,
      // full stop — checked with assumeOpen=true so an unconfirmed edge doesn't count as a wall.
      if (knowledge.hasWall(currentCell, dir, true)) return UNREACHABLE_SENTINEL;
      // Otherwise, optimistic (unknown = open) beyond that edge, exactly like floodFill.ts's own
      // "explore" phase — a greedy flood-fill program has to be lured toward undiscovered
      // territory to make progress at all.
      const flood = computeFlood(ctx.rows, ctx.cols, goalCells(ctx.goal), knowledge, true);
      const d = flood[n.row][n.col];
      return Number.isFinite(d) ? d : UNREACHABLE_SENTINEL;
    },
    unexplored_count: () => ctx.rows * ctx.cols - visited.size,
    finish: () => {
      if (isInGoal(currentCell, ctx.goal)) finished = true;
      return null;
    },
    mark_walls: () => {
      const threshold = ctx.cellSize * 0.6;
      knowledge.observeWalls(currentCell, heading, currentSensors.front, currentSensors.left, currentSensors.right, threshold);
      return null;
    },
  };

  let interp = new Interpreter(program, builtins);
  let hasTickEvent = program.events.some((e) => e.event === 'tick');

  function run(eventName: 'start' | 'tick' | 'junction'): void {
    if (halted) return;
    try {
      interp.runEvent(eventName, runState);
    } catch (e) {
      halted = true;
      if (e instanceof VtlRuntimeHalt) {
        onHalt?.(e);
      } else {
        throw e;
      }
    }
  }

  function observeAtArrival(): void {
    const threshold = ctx.cellSize * 0.6;
    knowledge.observeWalls(currentCell, heading, currentSensors.front, currentSensors.left, currentSensors.right, threshold);
  }

  return {
    id: 'vtl',
    reset(newCtx) {
      ctx = newCtx;
      motion = new CellMotionController(ctx.maxWheelSpeed, ctx.wheelBase);
      knowledge = new MazeWallKnowledge(ctx.rows, ctx.cols);
      runState = createRunState(program, constants);
      simTime = 0;
      currentSensors = { front: 0, left: 0, right: 0 };
      heading = 1;
      targetDir = 1;
      // Start in 'forward' mode with targetCell already at start: the first step() call falls
      // straight into the arrival-decision branch, using live sensors — see floodFill.ts / ISSUES.md #5.
      mode = 'forward';
      currentCell = { ...ctx.start };
      targetCell = { ...ctx.start };
      visited = new Set([key(ctx.start)]);
      hasTraveled = false;
      finished = false;
      halted = false;
      inTickEvent = false;
      moveRequestedThisJunction = false;
      logLabels.clear();
      run('start');
    },
    step(sensors, pose, dt, params) {
      currentSensors = sensors;
      currentDt = dt;
      simTime += dt;

      for (const [name, value] of Object.entries(params)) {
        if (runState.params.has(name)) runState.params.set(name, value);
      }

      if (finished) {
        return { vLeft: 0, vRight: 0, debug: { cell: currentCell, phase: 'done', cellsVisited: visited.size } };
      }

      if (hasTickEvent) {
        inTickEvent = true;
        run('tick');
        inTickEvent = false;
        if (finished) {
          return { vLeft: 0, vRight: 0, debug: { cell: currentCell, phase: 'done', cellsVisited: visited.size } };
        }
      }

      if (mode === 'turn' && !motion.isAligned(pose.theta, targetDir)) {
        return { ...motion.turnTowards(pose.theta, targetDir), debug: { cell: currentCell, phase: 'navigating', cellsVisited: visited.size } };
      }
      if (mode === 'turn') {
        heading = targetDir;
        mode = 'forward';
      }

      const target = cellCenter(targetCell, ctx.cellSize);
      const dist = Math.hypot(pose.x - target.x, pose.y - target.y);
      if (dist >= ctx.cellSize * 0.1) {
        const speed = ctx.maxWheelSpeed * 0.9;
        return { ...motion.driveForward(pose.theta, heading, speed), debug: { cell: currentCell, phase: 'navigating', cellsVisited: visited.size } };
      }

      // Arrived at targetCell.
      currentCell = targetCell;
      visited.add(key(currentCell));
      // We just physically drove through this edge, so it's confirmed open — sensors alone would
      // never tell us this (they only cover the facing/left/right sides at arrival, never
      // straight behind). Skip on the very first (synthetic) "arrival" at the start cell.
      if (hasTraveled) knowledge.markWall(currentCell, DIR_BACK[heading], false);
      hasTraveled = true;
      observeAtArrival();

      // The motion layer detects goal arrival itself, exactly like the native wallFollower.ts/
      // floodFill.ts controllers — a VTL program (e.g. the §1.8 wall-follower worked example)
      // never has to call at_goal()/finish() for the run to actually complete. finish() still
      // exists for programs that want to react to being at the goal before this check would fire.
      if (isInGoal(currentCell, ctx.goal)) {
        finished = true;
        return { vLeft: 0, vRight: 0, debug: { cell: currentCell, phase: 'done', cellsVisited: visited.size } };
      }

      moveRequestedThisJunction = false;
      run('junction');

      if (finished) {
        return { vLeft: 0, vRight: 0, debug: { cell: currentCell, phase: 'done', cellsVisited: visited.size } };
      }
      if (moveRequestedThisJunction) {
        mode = 'turn';
        return { ...motion.turnTowards(pose.theta, targetDir), debug: { cell: currentCell, phase: 'navigating', cellsVisited: visited.size } };
      }
      // Neither finish() nor move_to() was called this junction (malformed program, or halted):
      // stay put — the run will eventually time out rather than silently drive somewhere unasked.
      return { vLeft: 0, vRight: 0, debug: { cell: currentCell, phase: 'stalled', cellsVisited: visited.size } };
    },
    isDone() {
      return finished;
    },
    hotSwap(newProgram) {
      program = newProgram;
      runState = {
        states: transplantMatchingState(runState.states, newProgram),
        arrays: transplantMatchingArrays(runState.arrays, newProgram),
        params: createRunState(newProgram, constants).params,
        constants: runState.constants,
      };
      interp = new Interpreter(newProgram, builtins);
      hasTickEvent = newProgram.events.some((e) => e.event === 'tick');
      halted = false;
    },
  };
}
