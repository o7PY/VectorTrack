import type { LineBitmap } from '../../sim/sensors/reflectance';
import type { LineMapDef } from './types';

interface Pt {
  x: number;
  y: number;
}

/**
 * Pure typed-array scanline rasterizer — no `<canvas>`/`document` dependency,
 * so it runs identically on the main thread, in a Web Worker (v0.2.0's
 * headless map validator, which has no DOM), and in plain Node tests. Each
 * closed-loop segment is stamped onto the bitmap by testing every pixel in
 * its half-width-dilated bounding box against point-to-segment distance,
 * rather than rendering through a canvas 2D context.
 */
export function rasterizeLineMap(map: LineMapDef, mmPerPixel = 2): LineBitmap {
  const width = Math.max(1, Math.round(map.widthMm / mmPerPixel));
  const height = Math.max(1, Math.round(map.heightMm / mmPerPixel));
  const data = new Uint8Array(width * height);

  const halfWidth = map.trackWidthMm / 2;
  const halfWidthSq = halfWidth * halfWidth;
  const segs = map.dashed ? dashSegments(map.points, map.dashed.onMm, map.dashed.offMm) : closedLoopSegments(map.points);

  for (const [a, b] of segs) {
    const minX = Math.min(a.x, b.x) - halfWidth;
    const maxX = Math.max(a.x, b.x) + halfWidth;
    const minY = Math.min(a.y, b.y) - halfWidth;
    const maxY = Math.max(a.y, b.y) + halfWidth;
    const px0 = Math.max(0, Math.floor(minX / mmPerPixel));
    const px1 = Math.min(width - 1, Math.ceil(maxX / mmPerPixel));
    const py0 = Math.max(0, Math.floor(minY / mmPerPixel));
    const py1 = Math.min(height - 1, Math.ceil(maxY / mmPerPixel));

    for (let py = py0; py <= py1; py++) {
      const worldY = (py + 0.5) * mmPerPixel;
      const rowOffset = py * width;
      for (let px = px0; px <= px1; px++) {
        const worldX = (px + 0.5) * mmPerPixel;
        if (distanceToSegmentSq(worldX, worldY, a, b) <= halfWidthSq) {
          data[rowOffset + px] = 255;
        }
      }
    }
  }

  return { width, height, mmPerPixel, data };
}

function closedLoopSegments(points: Pt[]): [Pt, Pt][] {
  const segs: [Pt, Pt][] = [];
  for (let i = 0; i < points.length; i++) segs.push([points[i], points[(i + 1) % points.length]]);
  return segs;
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Splits a closed polyline down to only the "on" portions of a dash pattern, walking cumulative arc length across segment boundaries. */
function dashSegments(points: Pt[], onMm: number, offMm: number): [Pt, Pt][] {
  const segs = closedLoopSegments(points);
  const period = onMm + offMm;
  const out: [Pt, Pt][] = [];
  let dist = 0;
  for (const [a, b] of segs) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    let local = 0;
    while (local < len) {
      const posInPeriod = (dist + local) % period;
      if (posInPeriod < onMm) {
        const segEnd = Math.min(local + (onMm - posInPeriod), len);
        out.push([lerp(a, b, local / len), lerp(a, b, segEnd / len)]);
        local = segEnd;
      } else {
        local = Math.min(local + (period - posInPeriod), len);
      }
    }
    dist += len;
  }
  return out;
}

function distanceToSegmentSq(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  const ddx = px - cx;
  const ddy = py - cy;
  return ddx * ddx + ddy * ddy;
}
