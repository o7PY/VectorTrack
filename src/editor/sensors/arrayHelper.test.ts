import { describe, expect, it } from 'vitest';
import { generateSensorArray, generateStaggeredSensorArray, SENSOR_ARRAY_PRESETS } from './arrayHelper';

describe('generateSensorArray', () => {
  it('spaces N sensors evenly across the span, left-to-right, centered on the robot', () => {
    const sensors = generateSensorArray(5, 40, 60);
    expect(sensors.map((s) => s.lateralMm)).toEqual([-20, -10, 0, 10, 20]);
    expect(sensors.every((s) => s.forwardMm === 60 && s.type === 'reflectance')).toBe(true);
  });

  it('a single sensor sits on the centerline', () => {
    const sensors = generateSensorArray(1, 40, 60);
    expect(sensors).toHaveLength(1);
    expect(sensors[0].lateralMm).toBe(0);
  });

  it('defaults spotRadiusMm to DEFAULT_SPOT_RADIUS_MM when unspecified', () => {
    const sensors = generateSensorArray(3, 20, 50);
    expect(sensors.every((s) => s.spotRadiusMm === 4)).toBe(true);
  });

  it('accepts an explicit spotRadiusMm', () => {
    const sensors = generateSensorArray(3, 20, 50, 7);
    expect(sensors.every((s) => s.spotRadiusMm === 7)).toBe(true);
  });
});

describe('generateStaggeredSensorArray', () => {
  it('alternates forward offset by staggerMm/2 between adjacent sensors, keeping lateral spacing', () => {
    const sensors = generateStaggeredSensorArray(4, 30, 50, 10);
    expect(sensors.map((s) => s.lateralMm)).toEqual([-15, -5, 5, 15]);
    expect(sensors.map((s) => s.forwardMm)).toEqual([45, 55, 45, 55]);
  });
});

describe('SENSOR_ARRAY_PRESETS', () => {
  it('exposes the 3/5/8-sensor and staggered two-row presets, all in line mode', () => {
    const ids = SENSOR_ARRAY_PRESETS.map((p) => p.id);
    expect(ids).toEqual(['preset-3', 'preset-5', 'preset-8', 'preset-staggered']);
    expect(SENSOR_ARRAY_PRESETS.every((p) => p.mode === 'line')).toBe(true);
    expect(SENSOR_ARRAY_PRESETS.find((p) => p.id === 'preset-3')?.sensors).toHaveLength(3);
    expect(SENSOR_ARRAY_PRESETS.find((p) => p.id === 'preset-5')?.sensors).toHaveLength(5);
    expect(SENSOR_ARRAY_PRESETS.find((p) => p.id === 'preset-8')?.sensors).toHaveLength(8);
  });
});
