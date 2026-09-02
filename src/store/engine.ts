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
  const mapDef = getLineMap(mapId);
  const robot = getLineRobot(robotId);
  let bitmap = bitmapCache.get(mapId);
  if (!bitmap) {
    bitmap = rasterizeLineMap(mapDef);
    bitmapCache.set(mapId, bitmap);
  }
  lineConfig = {
    bitmap,
    robot,
    startPose: mapDef.startPose,
    startRadius: mapDef.startRadiusMm,
    pathLengthMm: mapDef.pathLengthMm,
  };
  lineController = makeLineController(algorithmId);
  lineController.reset();
  lineState = initLineRunState(lineConfig, robot.sensorCount);
  loop.resetAccumulator();
  return snapshot();
}

export function buildMaze(mapId: string, robotId: string, algorithmId: string): EngineSnapshot {
  kind = 'maze';
  const mapDef = getMazeMap(mapId);
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
