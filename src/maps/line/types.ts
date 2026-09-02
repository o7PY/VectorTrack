import type { Pose2D } from '../../sim/core/types';

export interface LineMapDef {
  id: string;
  name: string;
  description: string;
  widthMm: number;
  heightMm: number;
  points: { x: number; y: number }[]; // closed centerline loop, mm
  trackWidthMm: number;
  startPose: Pose2D;
  startRadiusMm: number;
  pathLengthMm: number;
  dashed?: { onMm: number; offMm: number };
}

export function polylineLength(points: { x: number; y: number }[]): number {
  let len = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

/** Builds a closed loop from a polar radius function sampled over [0, 2*PI). */
export function polarLoop(
  cx: number,
  cy: number,
  scaleX: number,
  scaleY: number,
  radiusFn: (theta: number) => number,
  steps = 240,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const r = radiusFn(theta);
    points.push({ x: cx + scaleX * r * Math.cos(theta), y: cy + scaleY * r * Math.sin(theta) });
  }
  return points;
}

/**
 * Splices a hard-edged rectangular "notch" into a closed polyline between
 * two existing point indices, replacing the arc between them with three
 * genuinely perpendicular (zero-radius) corners: along the P0→P1 chord,
 * perpendicular to it by `depthMm`, back along the chord, then perpendicular
 * again to rejoin at P1. Used to inject real 90° corners into an otherwise
 * smooth polar-loop track (e.g. lf-circuit), the same way lf-sharp's
 * vertices are genuinely sharp — no fillet, by design (see lf-sharp).
 */
export function insertRightAngleNotch(
  points: { x: number; y: number }[],
  startIndex: number,
  endIndex: number,
  depthMm: number,
): { x: number; y: number }[] {
  const p0 = points[startIndex];
  const p1 = points[endIndex];
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const vx = -uy;
  const vy = ux;

  const d1 = len * 0.35;
  const d2 = len - d1;
  const a = { x: p0.x + ux * d1, y: p0.y + uy * d1 };
  const b = { x: a.x + vx * depthMm, y: a.y + vy * depthMm };
  const c = { x: b.x + ux * d2, y: b.y + uy * d2 };

  return [...points.slice(0, startIndex + 1), a, b, c, ...points.slice(endIndex)];
}

export function startPoseFromLoop(points: { x: number; y: number }[]): Pose2D {
  const a = points[0];
  const b = points[1];
  return { x: a.x, y: a.y, theta: Math.atan2(b.y - a.y, b.x - a.x) };
}
