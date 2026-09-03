import { FixedStepLoop } from '../sim/core/loop';
import type { LineController, MazeController, Pose2D, RunStatus } from '../sim/core/types';
import type { LineBitmap } from '../sim/sensors/reflectance';
import { createBangBang } from '../sim/algorithms/bangBang';
import { createProportional } from '../sim/algorithms/proportional';
import { createPid } from '../sim/algorithms/pid';
import { createWallFollower } from '../sim/algorithms/wallFollower';
import { createFloodFill } from '../sim/algorithms/floodFill';
import { initLineRunState, tickLine } from '../sim/runners/lineRunner';
import type { LineRunConfig, LineRunState } from '../sim/runners/lineRunner';
import { initMazeRunState, tickMaze } from '../sim/runners/mazeRunner';
import type { MazeRunConfig, MazeRunState } from '../sim/runners/mazeRunner';
import { buildWallSegments } from '../sim/maze/grid';
import { getLineMap } from '../maps/line';
import { rasterizeLineMap } from '../maps/line/rasterize';
import { getMazeMap } from '../maps/maze';
import { getLineRobot, getMazeRobot } from '../robots/definitions';
import { isCustomRuntimeId, resolveCustomLineMap, resolveCustomMazeMap } from './customMapResolvers';

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

function makeLineController(algorithmId: string): LineController {
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

export function buildLine(mapId: string, robotId: string, algorithmId: string): EngineSnapshot {
  kind = 'line';
  const robot = getLineRobot(robotId);
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
  lineConfig = { bitmap, robot, startPose, startRadius, pathLengthMm };
  lineController = makeLineController(algorithmId);
  lineController.reset();
  lineState = initLineRunState(lineConfig, robot.sensorCount);
  loop.resetAccumulator();
  return snapshot();
}

export function buildMaze(mapId: string, robotId: string, algorithmId: string): EngineSnapshot {
  kind = 'maze';
  const mapDef = isCustomRuntimeId(mapId) ? resolveCustomMazeMap(mapId) : getMazeMap(mapId);
  const robot = getMazeRobot(robotId);
  mazeConfig = {
    map: mapDef,
    segments: buildWallSegments(mapDef),
    robot,
    timeLimitS: 120,
    collisionRadius: Math.max(30, robot.wheelBase * 0.5),
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
