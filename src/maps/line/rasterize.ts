import type { LineBitmap } from '../../sim/sensors/reflectance';
import type { LineMapDef } from './types';

/**
 * Rasterizes a line map's centerline into a grayscale bitmap (0=white/floor,
 * 255=black/line) via an offscreen canvas. Browser-only — never imported by
 * sim core.
 */
export function rasterizeLineMap(map: LineMapDef, mmPerPixel = 2): LineBitmap {
  const width = Math.max(1, Math.round(map.widthMm / mmPerPixel));
  const height = Math.max(1, Math.round(map.heightMm / mmPerPixel));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.scale(1 / mmPerPixel, 1 / mmPerPixel);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = map.trackWidthMm;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  if (map.dashed) ctx.setLineDash([map.dashed.onMm, map.dashed.offMm]);

  ctx.beginPath();
  const pts = map.points;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  const image = ctx.getImageData(0, 0, width, height);
  const data = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    data[i] = 255 - image.data[i * 4]; // black stroke (r=0) -> 255, white floor (r=255) -> 0
  }

  return { width, height, mmPerPixel, data };
}
