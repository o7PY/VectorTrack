import { stepKinematics } from '../core/kinematics';
import type { MazeController, MazeControllerDebug, MazeRobotSpec, Pose2D, RunStatus } from '../core/types';
import { distanceToNearestWall, sampleMazeSensors } from '../sensors/rangefinder';
import type { WallSegment } from '../sensors/rangefinder';
import type { MazeMap } from '../maze/grid';
import { cellCenter } from '../algorithms/mazeMotion';

export interface MazeRunConfig {
  map: MazeMap;
  segments: WallSegment[];
  robot: MazeRobotSpec;
  timeLimitS: number;
  collisionRadius: number; // mm, distance-to-wall below which counts as a collision
}

export interface MazeRunState {
  pose: Pose2D;
  vLeft: number;
  vRight: number;
  simTime: number;
  status: RunStatus;
  lastSensors: { front: number; left: number; right: number };
  lastDebug: MazeControllerDebug;
}

export function initMazeRunState(config: MazeRunConfig): MazeRunState {
  const start = cellCenter(config.map.start, config.map.cellSize);
  return {
    pose: { x: start.x, y: start.y, theta: 0 },
    vLeft: 0,
    vRight: 0,
    simTime: 0,
    status: { outcome: 'idle', elapsedMs: 0 },
    lastSensors: { front: 0, left: 0, right: 0 },
    lastDebug: { cell: config.map.start, phase: 'idle', cellsVisited: 0 },
  };
}

export function tickMaze(
  state: MazeRunState,
  config: MazeRunConfig,
  controller: MazeController,
  params: Record<string, string | number>,
  dt: number,
): MazeRunState {
  if (state.status.outcome === 'success' || state.status.outcome === 'failed') return state;

  const sensors = sampleMazeSensors(state.pose.x, state.pose.y, state.pose.theta, config.robot.sensorRange, config.segments);
  const out = controller.step(sensors, state.pose, dt, params);
  const newPose = stepKinematics(state.pose, out, config.robot.wheelBase, config.robot.maxWheelSpeed, dt);
  const simTime = state.simTime + dt;

  let status: RunStatus = state.status;
  const wallDist = distanceToNearestWall(newPose.x, newPose.y, config.segments);
  if (wallDist < config.collisionRadius) {
    status = { outcome: 'failed', reason: 'Collided with a wall', elapsedMs: simTime * 1000 };
  } else if (simTime >= config.timeLimitS) {
    status = { outcome: 'failed', reason: 'Time limit exceeded', elapsedMs: simTime * 1000 };
  } else if (controller.isDone()) {
    status = { outcome: 'success', elapsedMs: simTime * 1000 };
  }
  if (status.outcome === 'idle') status = { outcome: 'running', elapsedMs: simTime * 1000 };

  return {
    pose: newPose,
    vLeft: out.vLeft,
    vRight: out.vRight,
    simTime,
    status,
    lastSensors: sensors,
    lastDebug: out.debug,
  };
}
