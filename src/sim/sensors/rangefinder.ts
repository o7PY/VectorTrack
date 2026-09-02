import type { MazeSensorReading } from '../core/types';

export interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Ray (origin, unit direction implied by angle) vs one segment. Returns hit distance `t`, or null. */
function raySegmentIntersection(ox: number, oy: number, dx: number, dy: number, seg: WallSegment): number | null {
  const sx = seg.x2 - seg.x1;
  const sy = seg.y2 - seg.y1;
  const denom = dx * sy - dy * sx; // cross(D, S)
  if (Math.abs(denom) < 1e-9) return null; // parallel

  const ax = seg.x1 - ox;
  const ay = seg.y1 - oy; // A - O
  const t = (ax * sy - ay * sx) / denom; // cross(A-O, S) / cross(D, S)
  const u = (ax * dy - ay * dx) / denom; // cross(A-O, D) / cross(D, S)

  if (t >= 0 && u >= 0 && u <= 1) return t;
  return null;
}

/** Casts a ray from (originX, originY) at `angle` (radians) against all segments, capped at maxRange. */
export function raycast(
  originX: number,
  originY: number,
  angle: number,
  maxRange: number,
  segments: WallSegment[],
): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = maxRange;
  for (let i = 0; i < segments.length; i++) {
    const t = raySegmentIntersection(originX, originY, dx, dy, segments[i]);
    if (t !== null && t < best) best = t;
  }
  return best;
}

/** Shortest distance from a point to any wall segment — used for collision checks. */
export function distanceToNearestWall(x: number, y: number, segments: WallSegment[]): number {
  let best = Infinity;
  for (let i = 0; i < segments.length; i++) {
    const d = distanceToSegment(x, y, segments[i]);
    if (d < best) best = d;
  }
  return best;
}

/** Front/left/right rangefinder array, mounted at the robot origin (SPEC 4.2). */
export function sampleMazeSensors(
  x: number,
  y: number,
  theta: number,
  sensorRange: number,
  segments: WallSegment[],
): MazeSensorReading {
  // World convention: +y is South, so a +theta rotation is a clockwise
  // (compass-right) turn. Compass-left is therefore theta-90°, right is theta+90°.
  return {
    front: raycast(x, y, theta, sensorRange, segments),
    left: raycast(x, y, theta - Math.PI / 2, sensorRange, segments),
    right: raycast(x, y, theta + Math.PI / 2, sensorRange, segments),
  };
}

function distanceToSegment(px: number, py: number, seg: WallSegment): number {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - seg.x1) * dx + (py - seg.y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = seg.x1 + t * dx;
  const cy = seg.y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}
