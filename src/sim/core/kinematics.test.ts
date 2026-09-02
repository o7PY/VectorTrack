import { describe, expect, it } from 'vitest';
import { angleDiff, normalizeAngle, stepKinematics } from './kinematics';

describe('stepKinematics', () => {
  it('drives straight when both wheels match', () => {
    const pose = { x: 0, y: 0, theta: 0 };
    const next = stepKinematics(pose, { vLeft: 100, vRight: 100 }, 90, 400, 1);
    expect(next.x).toBeCloseTo(100, 6);
    expect(next.y).toBeCloseTo(0, 6);
    expect(next.theta).toBeCloseTo(0, 6);
  });

  it('rotates in place when wheel speeds are opposite', () => {
    const pose = { x: 0, y: 0, theta: 0 };
    const wheelBase = 90;
    const v = 100;
    const next = stepKinematics(pose, { vLeft: -v, vRight: v }, wheelBase, 400, 1);
    expect(next.x).toBeCloseTo(0, 6);
    expect(next.y).toBeCloseTo(0, 6);
    // omega = (vR - vL) / wheelBase = 2v/wheelBase
    expect(next.theta).toBeCloseTo((2 * v) / wheelBase, 6);
  });

  it('clamps wheel speeds to maxWheelSpeed', () => {
    const pose = { x: 0, y: 0, theta: 0 };
    const next = stepKinematics(pose, { vLeft: 1000, vRight: 1000 }, 90, 400, 1);
    expect(next.x).toBeCloseTo(400, 6);
  });

  it('integrates a quarter turn along an arc', () => {
    const pose = { x: 0, y: 0, theta: 0 };
    const wheelBase = 100;
    const dt = 0.01;
    let p = pose;
    for (let i = 0; i < 100; i++) {
      // omega = (vR-vL)/wheelBase = (150-50)/100 = 1 rad/s; after 1s theta ~ 1 rad
      p = stepKinematics(p, { vLeft: 50, vRight: 150 }, wheelBase, 400, dt);
    }
    expect(p.theta).toBeCloseTo(1, 2);
  });
});

describe('normalizeAngle', () => {
  it('wraps into (-PI, PI]', () => {
    expect(normalizeAngle(2.5 * Math.PI)).toBeCloseTo(0.5 * Math.PI, 6);
    expect(normalizeAngle(-2.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI, 6);
    expect(normalizeAngle(0.5)).toBeCloseTo(0.5, 6);
  });
});

describe('angleDiff', () => {
  it('returns the shortest signed difference', () => {
    expect(angleDiff(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 6);
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 6);
  });
});
