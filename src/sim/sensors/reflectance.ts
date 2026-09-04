import type { Pose2D } from '../core/types';
import type { SensorPlacement } from './placement';
import { DEFAULT_SPOT_RADIUS_MM, sensorWorldPosition } from './placement';

// Below this reflectance, a sensor is considered "seeing white" (lineRunner's lost-line timeout,
// VTL's `line_lost()` builtin — internal-docs/Algorithms.md §1.7).
export const WHITE_THRESHOLD = 0.08;

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

/** Converts a regular-array layout to explicit placements, ordered left-to-right (Phase J). */
function placementsFromLayout(layout: LineSensorLayout): SensorPlacement[] {
  const { sensorCount, sensorSpacing, sensorForwardOffset, sensorSampleRadius } = layout;
  const mid = (sensorCount - 1) / 2;
  const placements: SensorPlacement[] = new Array(sensorCount);
  for (let i = 0; i < sensorCount; i++) {
    placements[i] = {
      id: `s${i}`,
      type: 'reflectance',
      forwardMm: sensorForwardOffset,
      lateralMm: (i - mid) * sensorSpacing,
      headingDeg: 0,
      spotRadiusMm: sensorSampleRadius,
    };
  }
  return placements;
}

/** Samples a full array of explicitly-placed reflectance sensors, in the given (left-to-right) order. */
export function sampleLineSensorsFromPlacements(bitmap: LineBitmap, pose: Pose2D, placements: SensorPlacement[]): number[] {
  return placements.map((p) => {
    const { x, y } = sensorWorldPosition(pose, p);
    return sampleReflectance(bitmap, x, y, p.spotRadiusMm ?? DEFAULT_SPOT_RADIUS_MM);
  });
}

/** Samples the full sensor array laid out perpendicular to heading, ahead of the robot. */
export function sampleLineSensors(bitmap: LineBitmap, pose: Pose2D, layout: LineSensorLayout): number[] {
  return sampleLineSensorsFromPlacements(bitmap, pose, placementsFromLayout(layout));
}

/**
 * Weighted-average line position error, normalized to [-1, 1] (Algorithms.md Amendment A1).
 * Sensors sit at physical lateral offsets `lateralMm[i]` (mm, + = robot's right — Algorithms.md
 * §2.1); the formula is errorMm = Σ(lateralMmᵢ·sᵢ)/Σ(sᵢ), error = errorMm/halfSpanMm with
 * halfSpanMm = (max(lateralMm)-min(lateralMm))/2. For a uniform array this reduces to the same
 * index-weighted ratio the pre-Phase-J formula used (sensorSpacing cancels out) — this is the
 * "revisit once non-uniform sensor placement ships" this comment used to point at.
 * Holds `lastError` when all sensors read (near) white.
 */
export function computeLineError(readings: number[], lastError: number, lateralMm: number[]): number {
  if (readings.length < 2) return lastError; // single sensor: no lateral error is defined
  let num = 0;
  let den = 0;
  for (let i = 0; i < readings.length; i++) {
    num += lateralMm[i] * readings[i];
    den += readings[i];
  }
  if (den < 1e-6) return lastError;
  const halfSpanMm = (Math.max(...lateralMm) - Math.min(...lateralMm)) / 2;
  if (halfSpanMm < 1e-9) return lastError;
  return num / den / halfSpanMm;
}
