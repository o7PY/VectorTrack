import { FixedStepLoop } from '../sim/core/loop';
import type { LineController, LineRobotSpec, MazeController, MazeRobotSpec, Pose2D, RunStatus } from '../sim/core/types';
import type { LineBitmap } from '../sim/sensors/reflectance';
import type { SensorPlacement } from '../sim/sensors/placement';
import { orderSensorsLeftToRight } from '../sim/sensors/placement';
import { createBangBang } from '../sim/algorithms/bangBang';
import { createProportional } from '../sim/algorithms/proportional';
import { createPid } from '../sim/algorithms/pid';
import { createWallFollower } from '../sim/algorithms/wallFollower';
import { createFloodFill } from '../sim/algorithms/floodFill';
import { createVtlLineController } from '../sim/algorithms/vtlAdapter';
import type { VtlLineController } from '../sim/algorithms/vtlAdapter';
import { createVtlMazeController } from '../sim/algorithms/vtlMazeAdapter';
import type { VtlMazeController } from '../sim/algorithms/vtlMazeAdapter';
import type { Program } from '../vtl/types';
import { initLineRunState, tickLine } from '../sim/runners/lineRunner';
import type { LineRunConfig, LineRunState } from '../sim/runners/lineRunner';
import { initMazeRunState, tickMaze } from '../sim/runners/mazeRunner';
import type { MazeRunConfig, MazeRunState } from '../sim/runners/mazeRunner';
import { buildWallSegments } from '../sim/maze/grid';
import { getLineMap } from '../maps/line';
import { rasterizeLineMap } from '../maps/line/rasterize';
import { getMazeMap } from '../maps/maze';
import { getLineRobot, getMazeRobot } from '../robots/definitions';
import { defaultLineLayout } from '../robots/layouts';
import { isCustomRuntimeId, resolveCustomLineMap, resolveCustomMazeMap } from './customMapResolvers';
import { isVtlRuntimeId, isSensorLayoutRuntimeId, resolveCompiledCustomAlgorithm, resolveCustomSensorLayout } from './customAlgorithmResolvers';

// Resolves `layoutId` to left-to-right-ordered reflectance placements. `layoutId === robot.id`
// (the default — also every pre-Phase-J caller) reproduces `robot`'s fixed geometry exactly, so
// existing runs see zero behavioral change. A missing/corrupt custom layout, or one with no
// reflectance sensors, falls back to the default silently — same "corrupt data discarded
// silently" convention as store/customMaps.ts, since SP001 already blocks saving an empty layout
// from the editor in the first place.
export function resolveLineSensorPlacements(robot: LineRobotSpec, layoutId: string): SensorPlacement[] {
  if (layoutId !== robot.id && isSensorLayoutRuntimeId(layoutId)) {
    try {
      const reflectance = resolveCustomSensorLayout(layoutId).sensors.filter((s) => s.type === 'reflectance');
      if (reflectance.length > 0) return orderSensorsLeftToRight(reflectance);
    } catch {
      // fall through to the default layout below
    }
  }
  return defaultLineLayout(robot).sensors;
}

// Maze mode only ever lets a custom layout override the front/left/right roles (Algorithms.md
// §2.4) — `undefined` here means "use the robot's fixed origin-mounted rangefinders," the exact
// pre-Phase-J `sampleMazeSensors` behavior.
export function resolveMazeSensorPlacements(robot: MazeRobotSpec, layoutId: string): SensorPlacement[] | undefined {
  if (layoutId === robot.id || !isSensorLayoutRuntimeId(layoutId)) return undefined;
  try {
    const rangefinders = resolveCustomSensorLayout(layoutId).sensors.filter((s) => s.type === 'rangefinder');
    return rangefinders.length > 0 ? rangefinders : undefined;
  } catch {
    return undefined;
  }
}

export type EngineKind = 'line' | 'maze';

export interface EngineSnapshot {
  pose: Pose2D;
  vLeft: number;
  vRight: number;
  simTime: number;
  status: RunStatus;
  line?: {
    sensors: number[];
    error: number;
    p: number;
    i: number;
    d: number;
  };
  maze?: {
    sensors: { front: number; left: number; right: number };
    cell: { row: number; col: number };
    cellsVisited: number;
    phase: string;
  };
  /** Set once a `vtl:${id}` algorithm's `on tick`/`on junction` throws a VtlRuntimeHalt; cleared on the next build(). */
  vtlError?: string;
}

const loop = new FixedStepLoop();

let kind: EngineKind = 'line';
let lineController: LineController | null = null;
let mazeController: MazeController | null = null;
let lineConfig: LineRunConfig | null = null;
let mazeConfig: MazeRunConfig | null = null;
let lineState: LineRunState | null = null;
let mazeState: MazeRunState | null = null;
let bitmapCache: Map<string, LineBitmap> = new Map();
let vtlError: string | null = null;
let currentAlgorithmId: string | null = null;

function onVtlHalt(halt: { code: string; message: string; line: number }): void {
  vtlError = `${halt.code} (line ${halt.line}): ${halt.message}`;
}

// A saved custom algorithm's source is expected to compile (customAlgorithmResolvers.ts's
// doc-comment), but the *editor* may later save a broken draft, or storage may have been edited by
// hand — so a resolve/compile failure at build time must degrade to an inert controller with a
// visible error rather than throwing through rebuild() and crashing the store (Algorithms.md §6:
// "a compile failure ... shows the error and refuses to start").
function brokenLineController(message: string): LineController {
  vtlError = message;
  return { id: 'vtl-broken', reset() {}, step: () => ({ vLeft: 0, vRight: 0, debug: { error: 0, p: 0, i: 0, d: 0 } }) };
}

function brokenMazeController(message: string): MazeController {
  vtlError = message;
  return {
    id: 'vtl-broken',
    reset() {},
    step: () => ({ vLeft: 0, vRight: 0, debug: { cell: { row: 0, col: 0 }, phase: 'halted', cellsVisited: 0 } }),
    isDone: () => false,
  };
}

function makeLineController(algorithmId: string, sensorPlacements: SensorPlacement[]): LineController {
  if (isVtlRuntimeId(algorithmId)) {
    try {
      const { program } = resolveCompiledCustomAlgorithm(algorithmId, 'line');
      return createVtlLineController(program, sensorPlacements, undefined, onVtlHalt);
    } catch (err) {
      return brokenLineController(err instanceof Error ? err.message : String(err));
    }
  }
  switch (algorithmId) {
    case 'bangBang':
      return createBangBang();
    case 'proportional':
      return createProportional();
    case 'pid':
    default:
      return createPid();
  }
}

function makeMazeController(algorithmId: string): MazeController {
  if (isVtlRuntimeId(algorithmId)) {
    try {
      const { program } = resolveCompiledCustomAlgorithm(algorithmId, 'maze');
      return createVtlMazeController(program, undefined, onVtlHalt);
    } catch (err) {
      return brokenMazeController(err instanceof Error ? err.message : String(err));
    }
  }
  switch (algorithmId) {
    case 'floodFill':
      return createFloodFill();
    case 'wallFollower':
    default:
      return createWallFollower();
  }
}

export function getLoop(): FixedStepLoop {
  return loop;
}

export function buildLine(mapId: string, robotId: string, algorithmId: string, layoutId: string = robotId): EngineSnapshot {
  kind = 'line';
  vtlError = null;
  const robot = getLineRobot(robotId);
  const sensorPlacements = resolveLineSensorPlacements(robot, layoutId);
  let bitmap: LineBitmap | undefined;
  let startPose: Pose2D;
  let startRadius: number;
  let pathLengthMm: number;
  if (isCustomRuntimeId(mapId)) {
    // Never cached: unlike built-ins, a custom map can be re-saved under the
    // same id after an edit, so a stale cached bitmap would silently hide
    // the change until a full page reload.
    const source = resolveCustomLineMap(mapId);
    bitmap = source.bitmap;
    startPose = source.startPose;
    startRadius = source.startRadiusMm;
    pathLengthMm = source.pathLengthMm;
  } else {
    bitmap = bitmapCache.get(mapId);
    const mapDef = getLineMap(mapId);
    if (!bitmap) {
      bitmap = rasterizeLineMap(mapDef);
      bitmapCache.set(mapId, bitmap);
    }
    startPose = mapDef.startPose;
    startRadius = mapDef.startRadiusMm;
    pathLengthMm = mapDef.pathLengthMm;
  }
  currentAlgorithmId = algorithmId;
  lineConfig = { bitmap, robot, sensorPlacements, startPose, startRadius, pathLengthMm };
  lineController = makeLineController(algorithmId, sensorPlacements);
  lineController.reset();
  lineState = initLineRunState(lineConfig, sensorPlacements.length);
  loop.resetAccumulator();
  return snapshot();
}

export function buildMaze(mapId: string, robotId: string, algorithmId: string, layoutId: string = robotId): EngineSnapshot {
  kind = 'maze';
  vtlError = null;
  currentAlgorithmId = algorithmId;
  const mapDef = isCustomRuntimeId(mapId) ? resolveCustomMazeMap(mapId) : getMazeMap(mapId);
  const robot = getMazeRobot(robotId);
  mazeConfig = {
    map: mapDef,
    segments: buildWallSegments(mapDef),
    robot,
    timeLimitS: 120,
    collisionRadius: Math.max(30, robot.wheelBase * 0.5),
    sensorPlacements: resolveMazeSensorPlacements(robot, layoutId),
  };
  mazeController = makeMazeController(algorithmId);
  mazeController.reset({
    rows: mapDef.rows,
    cols: mapDef.cols,
    cellSize: mapDef.cellSize,
    start: mapDef.start,
    goal: mapDef.goal,
    maxWheelSpeed: robot.maxWheelSpeed,
    wheelBase: robot.wheelBase,
    sensorRange: robot.sensorRange,
  });
  mazeState = initMazeRunState(mazeConfig);
  loop.resetAccumulator();
  return snapshot();
}

export function currentKind(): EngineKind {
  return kind;
}

function snapshot(): EngineSnapshot {
  if (kind === 'line' && lineState) {
    return {
      pose: lineState.pose,
      vLeft: lineState.vLeft,
      vRight: lineState.vRight,
      simTime: lineState.simTime,
      status: lineState.status,
      line: {
        sensors: lineState.lastSensors,
        error: lineState.lastDebug.error,
        p: lineState.lastDebug.p,
        i: lineState.lastDebug.i,
        d: lineState.lastDebug.d,
      },
      vtlError: vtlError ?? undefined,
    };
  }
  if (kind === 'maze' && mazeState) {
    return {
      pose: mazeState.pose,
      vLeft: mazeState.vLeft,
      vRight: mazeState.vRight,
      simTime: mazeState.simTime,
      status: mazeState.status,
      maze: {
        sensors: mazeState.lastSensors,
        cell: mazeState.lastDebug.cell,
        cellsVisited: mazeState.lastDebug.cellsVisited,
        phase: mazeState.lastDebug.phase,
      },
      vtlError: vtlError ?? undefined,
    };
  }
  return {
    pose: { x: 0, y: 0, theta: 0 },
    vLeft: 0,
    vRight: 0,
    simTime: 0,
    status: { outcome: 'idle', elapsedMs: 0 },
  };
}

function tickOnce(params: Record<string, number | string>, baseSpeed: number, dt: number): void {
  if (kind === 'line' && lineConfig && lineController && lineState) {
    lineState = tickLine(lineState, lineConfig, lineController, params as Record<string, number>, baseSpeed, dt);
  } else if (kind === 'maze' && mazeConfig && mazeController && mazeState) {
    mazeState = tickMaze(mazeState, mazeConfig, mazeController, params, dt);
  }
}

/** Advances by one render frame's worth of real time. Returns the latest snapshot. */
export function advanceEngine(realDtSeconds: number, params: Record<string, number | string>, baseSpeed: number): EngineSnapshot {
  loop.advance(realDtSeconds, (dt) => tickOnce(params, baseSpeed, dt));
  return snapshot();
}

export function stepEngineOnce(params: Record<string, number | string>, baseSpeed: number): EngineSnapshot {
  loop.step((dt) => tickOnce(params, baseSpeed, dt));
  return snapshot();
}

export function getSnapshot(): EngineSnapshot {
  return snapshot();
}

/**
 * Swaps a freshly-recompiled `Program` into the currently-running `vtl:${id}` controller in place —
 * Algorithms.md §3.2's "compiling source edit -> hot-swap next tick, preserving state whose
 * names/types still match." Returns `false` (does nothing) when there's no active vtl controller to
 * swap into, e.g. a built-in algorithm is selected, or the current controller is the inert
 * "broken" stub from a prior compile failure — callers should fall back to a full build in that case.
 */
export function hotSwapVtlAlgorithm(newProgram: Program): boolean {
  if (!currentAlgorithmId || !isVtlRuntimeId(currentAlgorithmId)) return false;
  if (kind === 'line' && lineController && 'hotSwap' in lineController) {
    (lineController as VtlLineController).hotSwap(newProgram);
    vtlError = null;
    return true;
  }
  if (kind === 'maze' && mazeController && 'hotSwap' in mazeController) {
    (mazeController as VtlMazeController).hotSwap(newProgram);
    vtlError = null;
    return true;
  }
  return false;
}
