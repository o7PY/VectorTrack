import { stepKinematics } from '../core/kinematics';
import type { LineController, LineControllerDebug, LineRobotSpec, Pose2D, RunStatus } from '../core/types';
import type { LineBitmap } from '../sensors/reflectance';
import { sampleLineSensors } from '../sensors/reflectance';

export interface LineRunConfig {
  bitmap: LineBitmap;
  robot: LineRobotSpec;
  startPose: Pose2D;
  startRadius: number; // mm, capture radius around start marker for lap completion
  pathLengthMm: number; // approximate total loop length, for "has done a full lap" gating
}

export interface LineRunState {
  pose: Pose2D;
  vLeft: number;
  vRight: number;
  simTime: number;
  distanceTraveled: number;
  whiteTimer: number;
  status: RunStatus;
  lastSensors: number[];
  lastDebug: LineControllerDebug;
}

const LOST_LINE_TIMEOUT_S = 1.5;
const WHITE_THRESHOLD = 0.08;
const LAP_PROGRESS_FRACTION = 0.85;

export function initLineRunState(config: LineRunConfig, sensorCount: number): LineRunState {
  return {
    pose: { ...config.startPose },
    vLeft: 0,
    vRight: 0,
    simTime: 0,
    distanceTraveled: 0,
    whiteTimer: 0,
    status: { outcome: 'idle', elapsedMs: 0 },
    lastSensors: new Array(sensorCount).fill(0),
    lastDebug: { error: 0, p: 0, i: 0, d: 0 },
  };
}

export function tickLine(
  state: LineRunState,
  config: LineRunConfig,
  controller: LineController,
  params: Record<string, number>,
  baseSpeed: number,
  dt: number,
): LineRunState {
  if (state.status.outcome === 'success' || state.status.outcome === 'failed') return state;

  const sensors = sampleLineSensors(config.bitmap, state.pose, {
    sensorCount: config.robot.sensorCount,
    sensorSpacing: config.robot.sensorSpacing,
    sensorForwardOffset: config.robot.sensorForwardOffset,
    sensorSampleRadius: config.robot.sensorSampleRadius,
  });

  const out = controller.step(sensors, dt, params, baseSpeed, config.robot.maxWheelSpeed, config.robot.wheelBase);
  const newPose = stepKinematics(state.pose, out, config.robot.wheelBase, config.robot.maxWheelSpeed, dt);
  const stepDist = Math.hypot(newPose.x - state.pose.x, newPose.y - state.pose.y);
  const distanceTraveled = state.distanceTraveled + stepDist;
  const simTime = state.simTime + dt;

  const maxSensor = Math.max(...sensors);
  const whiteTimer = maxSensor < WHITE_THRESHOLD ? state.whiteTimer + dt : 0;

  let status: RunStatus = state.status;
  if (whiteTimer > LOST_LINE_TIMEOUT_S) {
    status = { outcome: 'failed', reason: 'Lost the line', elapsedMs: simTime * 1000 };
  } else if (distanceTraveled >= config.pathLengthMm * LAP_PROGRESS_FRACTION) {
    const distToStart = Math.hypot(newPose.x - config.startPose.x, newPose.y - config.startPose.y);
    if (distToStart <= config.startRadius) {
      status = { outcome: 'success', elapsedMs: simTime * 1000 };
    }
  }
  if (status.outcome === 'idle') status = { outcome: 'running', elapsedMs: simTime * 1000 };

  return {
    pose: newPose,
    vLeft: out.vLeft,
    vRight: out.vRight,
    simTime,
    distanceTraveled,
    whiteTimer,
    status,
    lastSensors: sensors,
    lastDebug: out.debug,
  };
}
