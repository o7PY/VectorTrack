import { describe, expect, it } from 'vitest';
import type { LineMapDef } from './types';
import { rasterizeLineMap } from './rasterize';

function square(size: number, trackWidthMm: number, dashed?: { onMm: number; offMm: number }): LineMapDef {
  const margin = 20;
  const points = [
    { x: margin, y: margin },
    { x: margin + size, y: margin },
    { x: margin + size, y: margin + size },
    { x: margin, y: margin + size },
  ];
  return {
    id: 'test-square',
    name: 'Test Square',
    description: 'test fixture',
    widthMm: size + margin * 2,
    heightMm: size + margin * 2,
    points,
    trackWidthMm,
    startPose: { x: margin, y: margin, theta: 0 },
    startRadiusMm: 30,
    pathLengthMm: size * 4,
    dashed,
  };
}

describe('rasterizeLineMap', () => {
  it('produces a bitmap sized from widthMm/heightMm and mmPerPixel', () => {
    const map = square(100, 10);
    const bmp = rasterizeLineMap(map, 2);
    expect(bmp.width).toBe(Math.round(map.widthMm / 2));
    expect(bmp.height).toBe(Math.round(map.heightMm / 2));
    expect(bmp.data.length).toBe(bmp.width * bmp.height);
  });

  it('marks a pixel on the track path black and one deep in the interior white', () => {
    const map = square(100, 10);
    const mmPerPixel = 1;
    const bmp = rasterizeLineMap(map, mmPerPixel);

    // Top edge of the square runs along y=20, x in [20,120] — its midpoint should be on-track.
    const onTrackX = 70;
    const onTrackY = 20;
    const onIdx = Math.round(onTrackY / mmPerPixel) * bmp.width + Math.round(onTrackX / mmPerPixel);
    expect(bmp.data[onIdx]).toBe(255);

    // Center of the square is far from every edge (size=100, track half-width=5).
    const centerX = 70;
    const centerY = 70;
    const centerIdx = Math.round(centerY / mmPerPixel) * bmp.width + Math.round(centerX / mmPerPixel);
    expect(bmp.data[centerIdx]).toBe(0);
  });

  it('a wider track marks more pixels black than a narrower one on the same loop', () => {
    const thin = rasterizeLineMap(square(100, 6), 1);
    const thick = rasterizeLineMap(square(100, 16), 1);
    const count = (bmp: Uint8Array) => bmp.reduce((n, v) => n + (v === 255 ? 1 : 0), 0);
    expect(count(thick.data)).toBeGreaterThan(count(thin.data));
  });

  it('dashed tracks leave gaps — fewer black pixels than a solid track of the same loop', () => {
    const solid = rasterizeLineMap(square(120, 10), 1);
    const dashed = rasterizeLineMap(square(120, 10, { onMm: 15, offMm: 10 }), 1);
    const count = (bmp: Uint8Array) => bmp.reduce((n, v) => n + (v === 255 ? 1 : 0), 0);
    expect(count(dashed.data)).toBeLessThan(count(solid.data));
  });
});
