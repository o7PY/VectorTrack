import type { Pose2D, WheelCommand } from './types';

/**
 * One differential-drive integration step (SPEC 3.3).
 * No slip, no acceleration ramp, no rigid-body physics: pure kinematic integration.
 */
export function stepKinematics(
  pose: Pose2D,
  cmd: WheelCommand,
  wheelBase: number,
  maxWheelSpeed: number,
  dt: number,
): Pose2D {
  const vLeft = clamp(cmd.vLeft, -maxWheelSpeed, maxWheelSpeed);
  const vRight = clamp(cmd.vRight, -maxWheelSpeed, maxWheelSpeed);

  const v = (vLeft + vRight) / 2;
  const omega = (vRight - vLeft) / wheelBase;

  return {
    x: pose.x + v * Math.cos(pose.theta) * dt,
    y: pose.y + v * Math.sin(pose.theta) * dt,
    theta: normalizeAngle(pose.theta + omega * dt),
  };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function normalizeAngle(theta: number): number {
  let a = theta % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Shortest signed angular difference target - current, in (-PI, PI]. */
export function angleDiff(current: number, target: number): number {
  return normalizeAngle(target - current);
}
