import { describe, expect, it } from 'vitest';
import { computeLineError, sampleLineSensors, sampleReflectance } from './reflectance';
import type { LineBitmap } from './reflectance';

function makeBitmap(width: number, height: number, fill: (x: number, y: number) => number): LineBitmap {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data[y * width + x] = fill(x, y);
    }
  }
  return { width, height, mmPerPixel: 1, data };
}

describe('sampleReflectance', () => {
  it('reads 1.0 over a fully black region', () => {
    const bmp = makeBitmap(20, 20, () => 255);
    expect(sampleReflectance(bmp, 10, 10, 3)).toBeCloseTo(1, 6);
  });

  it('reads 0.0 over a fully white region', () => {
    const bmp = makeBitmap(20, 20, () => 0);
    expect(sampleReflectance(bmp, 10, 10, 3)).toBeCloseTo(0, 6);
  });

  it('returns 0 when sampling entirely off the bitmap', () => {
    const bmp = makeBitmap(20, 20, () => 255);
    expect(sampleReflectance(bmp, -100, -100, 3)).toBe(0);
  });

  it('averages a half-black half-white edge to something between 0 and 1', () => {
    const bmp = makeBitmap(40, 40, (x) => (x < 20 ? 0 : 255));
    const v = sampleReflectance(bmp, 20, 20, 10);
    expect(v).toBeGreaterThan(0.2);
    expect(v).toBeLessThan(0.8);
  });
});

describe('computeLineError', () => {
  it('is zero when the line is centered (symmetric readings)', () => {
    expect(computeLineError([0, 0, 1, 0, 0], 0)).toBeCloseTo(0, 6);
  });

  it('is positive when weight is on the higher-index (left) sensors', () => {
    expect(computeLineError([0, 0, 0, 0, 1], 0)).toBeCloseTo(2, 6);
  });

  it('is negative when weight is on the lower-index (right) sensors', () => {
    expect(computeLineError([1, 0, 0, 0, 0], 0)).toBeCloseTo(-2, 6);
  });

  it('holds the last error when all sensors read white', () => {
    expect(computeLineError([0, 0, 0, 0, 0], 1.5)).toBe(1.5);
  });

  it('works for a 3-sensor array', () => {
    expect(computeLineError([1, 0, 0], 0)).toBeCloseTo(-1, 6);
    expect(computeLineError([0, 0, 1], 0)).toBeCloseTo(1, 6);
  });
});

describe('sampleLineSensors', () => {
  it('samples N sensors spread across a black stripe centered on the robot', () => {
    const bmp = makeBitmap(200, 200, (x) => (x >= 90 && x <= 110 ? 255 : 0));
    const pose = { x: 100, y: 100, theta: 0 };
    const readings = sampleLineSensors(bmp, pose, {
      sensorCount: 5,
      sensorSpacing: 5,
      sensorForwardOffset: 0,
      sensorSampleRadius: 2,
    });
    expect(readings).toHaveLength(5);
    // middle sensor sits on the stripe, outer ones should read darker than a far-off sensor
    expect(readings[2]).toBeGreaterThan(0.5);
  });
});
