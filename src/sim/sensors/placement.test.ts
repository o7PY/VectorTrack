import { describe, expect, it } from 'vitest';
import {
  orderSensorsLeftToRight,
  sensorWorldHeading,
  sensorWorldPosition,
  type SensorPlacement,
} from './placement';
import type { Pose2D } from '../core/types';

// Deliberately asymmetric: forwardMm !== lateralMm and both nonzero, so a sign flip on either
// axis produces a visibly wrong world position instead of silently matching by symmetry
// (Algorithms.md §2.1: "a symmetric one passes with the sign backwards").
const SENSOR: SensorPlacement = {
  id: 's0',
  type: 'reflectance',
  forwardMm: 100,
  lateralMm: 30,
  headingDeg: 0,
};

function pose(x: number, y: number, thetaDeg: number): Pose2D {
  return { x, y, theta: (thetaDeg * Math.PI) / 180 };
}

describe('sensorWorldPosition — handedness (Algorithms.md §2.1)', () => {
  it('at heading 0° (facing +x/east), lateral+ (right) points toward +y (south)', () => {
    const p = sensorWorldPosition(pose(0, 0, 0), SENSOR);
    expect(p.x).toBeCloseTo(100, 6);
    expect(p.y).toBeCloseTo(30, 6);
  });

  it('at heading 90° (facing south), lateral+ (right) points toward -x (west)', () => {
    const p = sensorWorldPosition(pose(0, 0, 90), SENSOR);
    expect(p.x).toBeCloseTo(-30, 6);
    expect(p.y).toBeCloseTo(100, 6);
  });

  it('at heading 180° (facing -x/west), lateral+ (right) points toward -y (north)', () => {
    const p = sensorWorldPosition(pose(0, 0, 180), SENSOR);
    expect(p.x).toBeCloseTo(-100, 6);
    expect(p.y).toBeCloseTo(-30, 6);
  });

  it('at heading 270° (facing north), lateral+ (right) points toward +x (east)', () => {
    const p = sensorWorldPosition(pose(0, 0, 270), SENSOR);
    expect(p.x).toBeCloseTo(30, 6);
    expect(p.y).toBeCloseTo(-100, 6);
  });

  it('offsets are applied relative to the robot origin, not just rotated in place', () => {
    const p = sensorWorldPosition(pose(500, -200, 0), SENSOR);
    expect(p.x).toBeCloseTo(600, 6);
    expect(p.y).toBeCloseTo(-170, 6);
  });
});

describe('sensorWorldHeading', () => {
  it('adds the sensor headingDeg to the robot heading', () => {
    const angled: SensorPlacement = { ...SENSOR, type: 'rangefinder', headingDeg: 45 };
    const h = sensorWorldHeading(pose(0, 0, 90), angled);
    expect(h).toBeCloseTo((135 * Math.PI) / 180, 6);
  });
});

describe('orderSensorsLeftToRight', () => {
  it('sorts by lateralMm ascending so sensor(0) is leftmost', () => {
    const sensors: SensorPlacement[] = [
      { id: 'right', type: 'reflectance', forwardMm: 50, lateralMm: 40, headingDeg: 0 },
      { id: 'left', type: 'reflectance', forwardMm: 50, lateralMm: -40, headingDeg: 0 },
      { id: 'center', type: 'reflectance', forwardMm: 50, lateralMm: 0, headingDeg: 0 },
    ];
    const ordered = orderSensorsLeftToRight(sensors);
    expect(ordered.map((s) => s.id)).toEqual(['left', 'center', 'right']);
  });
});
