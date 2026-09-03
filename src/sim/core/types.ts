// Pure data types for the simulation core. No DOM, no React, no Three.js.

export interface Pose2D {
  x: number; // mm, world space
  y: number; // mm, world space
  theta: number; // radians, 0 = +x axis, CCW positive
}

export interface RobotState extends Pose2D {
  vLeft: number; // mm/s, current left wheel speed
  vRight: number; // mm/s, current right wheel speed
  simTime: number; // seconds elapsed in this run
}

export interface RobotSpec {
  id: string;
  name: string;
  wheelBase: number; // mm, distance between wheel contact points
  maxWheelSpeed: number; // mm/s
  color: string; // hex, for rendering
  notes: string; // short blurb shown in the robot selection menu (SPEC 5.3)
  // Validator-only geometry (v0.2.0 map maker's physical passability checks,
  // MZP0x/LF0xx). Never read by the sim/kinematics/algorithms themselves —
  // adding these must not change any v0.1.0 simulation behavior.
  chassisWidthMm: number;
}

export interface LineRobotSpec extends RobotSpec {
  kind: 'line';
  sensorCount: number;
  sensorSpacing: number; // mm between adjacent sensors
  sensorForwardOffset: number; // mm ahead of the wheel axis
  sensorSampleRadius: number; // mm, disc radius sampled per sensor
  sensorArraySpanMm: number; // validator-only: physical width the sensor array covers
}

export interface MazeRobotSpec extends RobotSpec {
  kind: 'maze';
  sensorRange: number; // mm, max raycast distance
}

export type RunOutcome = 'idle' | 'running' | 'success' | 'failed';

export interface RunStatus {
  outcome: RunOutcome;
  reason?: string;
  elapsedMs: number;
}

export interface WheelCommand {
  vLeft: number;
  vRight: number;
}

// ---- Line follower ----

export interface LineSensorReading {
  values: number[]; // one per sensor, 0 (white) .. 1 (black)
}

export interface LineControllerDebug {
  error: number;
  p: number;
  i: number;
  d: number;
}

export interface LineControllerOutput extends WheelCommand {
  debug: LineControllerDebug;
}

export interface LineController {
  id: string;
  reset(): void;
  step(sensors: number[], dt: number, params: Record<string, number>, baseSpeed: number, maxWheelSpeed: number, wheelBase: number): LineControllerOutput;
}

// ---- Maze solver ----

export type CardinalDir = 0 | 1 | 2 | 3; // N, E, S, W

export interface Cell {
  row: number;
  col: number;
}

// A goal is a rectangular region of cells, not necessarily a single cell —
// (row,col) is its top-left cell. width/height are 1 or 2 (v0.2.0 map maker:
// custom mazes let the author place a 1x1 or 2x2 goal).
export interface MazeGoal {
  row: number;
  col: number;
  width: 1 | 2;
  height: 1 | 2;
}

export interface MazeSensorReading {
  front: number; // mm
  left: number; // mm
  right: number; // mm
}

export interface MazeControllerDebug {
  cell: Cell;
  phase: string;
  cellsVisited: number;
}

export interface MazeControllerOutput extends WheelCommand {
  debug: MazeControllerDebug;
}

export interface MazeControllerContext {
  rows: number;
  cols: number;
  cellSize: number;
  start: Cell;
  goal: MazeGoal;
  maxWheelSpeed: number;
  wheelBase: number;
  sensorRange: number;
}

export interface MazeController {
  id: string;
  reset(ctx: MazeControllerContext): void;
  step(
    sensors: MazeSensorReading,
    pose: Pose2D,
    dt: number,
    params: Record<string, string | number>,
  ): MazeControllerOutput;
  isDone(): boolean;
}
