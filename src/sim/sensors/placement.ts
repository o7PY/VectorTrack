// Explicit sensor placement model — internal-docs/Algorithms.md §2.1.
// Body-frame (forwardMm/lateralMm, robot-relative) to world-frame (mm) transform.

import type { Pose2D } from '../core/types';

export type SensorType = 'reflectance' | 'rangefinder';

export interface SensorPlacement {
  id: string; // stable, referenced by index in VTL via sensor(i)
  type: SensorType;
  forwardMm: number; // + = toward the front of the robot, from the wheel axis
  lateralMm: number; // + = toward the robot's RIGHT
  headingDeg: number; // rangefinders only; 0 = straight ahead, relative to robot heading
  spotRadiusMm?: number; // reflectance only, default 4
  maxRangeMm?: number; // rangefinder only
}

export const DEFAULT_SPOT_RADIUS_MM = 4;

export interface WorldPoint {
  x: number;
  y: number;
}

// World convention (matches sim/core/kinematics.ts and sim/sensors/rangefinder.ts): theta=0 faces
// +x, and increasing theta is a clockwise turn on screen because y increases downward — so the
// robot's right (theta+90°) is (-sin(theta), cos(theta)). A +90° rotation from heading is the
// robot's right, not its left (Algorithms.md §2.1) — do not flip these signs without re-reading
// INSIGHTS.md first; this exact confusion has bitten the project before (ISSUES.md #3).
export function sensorWorldPosition(pose: Pose2D, placement: SensorPlacement): WorldPoint {
  const cosT = Math.cos(pose.theta);
  const sinT = Math.sin(pose.theta);
  const rightX = -sinT;
  const rightY = cosT;
  return {
    x: pose.x + placement.forwardMm * cosT + placement.lateralMm * rightX,
    y: pose.y + placement.forwardMm * sinT + placement.lateralMm * rightY,
  };
}

// World-space heading (radians) of a rangefinder sensor: the robot's heading plus the sensor's
// own headingDeg, which is 0 = straight ahead, relative to the robot (§2.1).
export function sensorWorldHeading(pose: Pose2D, placement: SensorPlacement): number {
  return pose.theta + (placement.headingDeg * Math.PI) / 180;
}

// Sensors are ordered by lateralMm ascending, so sensor(0) is always the leftmost (§2.1).
export function orderSensorsLeftToRight<T extends SensorPlacement>(sensors: T[]): T[] {
  return [...sensors].sort((a, b) => a.lateralMm - b.lateralMm);
}
