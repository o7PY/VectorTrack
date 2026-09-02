import type { Pose2D } from '../core/types';

/** Grayscale line-track bitmap. 0 = white/floor .. 255 = black/line. */
export interface LineBitmap {
  width: number; // px
  height: number; // px
  mmPerPixel: number;
  data: Uint8Array;
}

export interface LineSensorLayout {
  sensorCount: number;
  sensorSpacing: number; // mm between adjacent sensors
  sensorForwardOffset: number; // mm ahead of pose origin, along heading
  sensorSampleRadius: number; // mm
}

/** Average bitmap intensity under a disc of given radius, in world mm coords. Returns 0..1. */
export function sampleReflectance(bitmap: LineBitmap, worldX: number, worldY: number, radiusMm: number): number {
  const px = worldX / bitmap.mmPerPixel;
  const py = worldY / bitmap.mmPerPixel;
  const r = Math.max(1, radiusMm / bitmap.mmPerPixel);

  const minX = Math.max(0, Math.floor(px - r));
  const maxX = Math.min(bitmap.width - 1, Math.ceil(px + r));
  const minY = Math.max(0, Math.floor(py - r));
  const maxY = Math.min(bitmap.height - 1, Math.ceil(py + r));

  let sum = 0;
  let count = 0;
  const r2 = r * r;
  for (let y = minY; y <= maxY; y++) {
    const dy = y - py;
    for (let x = minX; x <= maxX; x++) {
      const dx = x - px;
      if (dx * dx + dy * dy <= r2) {
        sum += bitmap.data[y * bitmap.width + x];
        count++;
      }
    }
  }
  if (count === 0) return 0; // off the bitmap entirely: treat as floor (white)
  return sum / count / 255;
}

/** Samples the full sensor array laid out perpendicular to heading, ahead of the robot. */
export function sampleLineSensors(bitmap: LineBitmap, pose: Pose2D, layout: LineSensorLayout): number[] {
  const { sensorCount, sensorSpacing, sensorForwardOffset, sensorSampleRadius } = layout;
  const fx = Math.cos(pose.theta);
  const fy = Math.sin(pose.theta);
  const px = -fy; // perpendicular (left-hand side)
  const py = fx;

  const originX = pose.x + fx * sensorForwardOffset;
  const originY = pose.y + fy * sensorForwardOffset;
  const mid = (sensorCount - 1) / 2;

  const readings: number[] = new Array(sensorCount);
  for (let i = 0; i < sensorCount; i++) {
    const offset = (i - mid) * sensorSpacing;
    const sx = originX + px * offset;
    const sy = originY + py * offset;
    readings[i] = sampleReflectance(bitmap, sx, sy, sensorSampleRadius);
  }
  return readings;
}

/**
 * Weighted-average line position error (SPEC 4.1). Sensors indexed 0..N-1 get
 * symmetric weights centered at 0 (e.g. [-2,-1,0,1,2] for 5 sensors).
 * Holds `lastError` when all sensors read (near) white.
 */
export function computeLineError(readings: number[], lastError: number): number {
  const mid = (readings.length - 1) / 2;
  let num = 0;
  let den = 0;
  for (let i = 0; i < readings.length; i++) {
    const w = i - mid;
    num += w * readings[i];
    den += readings[i];
  }
  if (den < 1e-6) return lastError;
  return num / den;
}
