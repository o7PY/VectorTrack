import { describe, expect, it } from 'vitest';
import { lineRobots, mazeRobots } from './definitions';
import { defaultLineLayout, defaultMazeLayout } from './layouts';

describe('defaultLineLayout', () => {
  it("id matches the robot's own id (store/persistence.ts's v2->v3 migration assumes this)", () => {
    for (const robot of lineRobots) {
      expect(defaultLineLayout(robot).id).toBe(robot.id);
    }
  });

  it('reproduces the pre-Phase-J (i-mid)*spacing lateral offsets exactly, for every built-in robot', () => {
    for (const robot of lineRobots) {
      const mid = (robot.sensorCount - 1) / 2;
      const expected = Array.from({ length: robot.sensorCount }, (_, i) => (i - mid) * robot.sensorSpacing);
      const actual = defaultLineLayout(robot).sensors.map((s) => s.lateralMm);
      expect(actual).toEqual(expected);
    }
  });

  it('sensors are left-to-right ordered and carry the robot forward offset/sample radius', () => {
    const robot = lineRobots[0];
    const layout = defaultLineLayout(robot);
    expect(layout.sensors.every((s) => s.type === 'reflectance')).toBe(true);
    expect(layout.sensors.every((s) => s.forwardMm === robot.sensorForwardOffset)).toBe(true);
    expect(layout.sensors.every((s) => s.spotRadiusMm === robot.sensorSampleRadius)).toBe(true);
    const lateralMm = layout.sensors.map((s) => s.lateralMm);
    expect(lateralMm).toEqual([...lateralMm].sort((a, b) => a - b));
  });
});

describe('defaultMazeLayout', () => {
  it("id matches the robot's own id", () => {
    for (const robot of mazeRobots) {
      expect(defaultMazeLayout(robot).id).toBe(robot.id);
    }
  });

  it('produces front/left/right rangefinders at the wheel axis, matching rangefinder.ts convention', () => {
    const robot = mazeRobots[0];
    const layout = defaultMazeLayout(robot);
    const byId = Object.fromEntries(layout.sensors.map((s) => [s.id, s]));
    expect(byId.front.headingDeg).toBe(0);
    expect(byId.left.headingDeg).toBe(-90);
    expect(byId.right.headingDeg).toBe(90);
    expect(layout.sensors.every((s) => s.type === 'rangefinder' && s.forwardMm === 0 && s.lateralMm === 0)).toBe(true);
    expect(layout.sensors.every((s) => s.maxRangeMm === robot.sensorRange)).toBe(true);
  });
});
