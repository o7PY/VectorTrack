import { describe, expect, it } from 'vitest';
import { lineMaps } from '../../maps/line';
import { lineRobots } from '../../robots/definitions';
import { defaultLineLayout } from '../../robots/layouts';
import { compile } from '../../vtl/compile';
import { initLineRunState, tickLine } from '../runners/lineRunner';
import type { LineRunConfig } from '../runners/lineRunner';
import { createVtlLineController } from './vtlAdapter';

// Same synthetic-bitmap approach as lineRunner.integration.test.ts (rasterizeLineMap needs a real
// <canvas> 2D context, unavailable under plain node/jsdom).
function makeSyntheticBitmapSampler(points: { x: number; y: number }[], trackWidthMm: number) {
  function distanceToPolyline(x: number, y: number): number {
    let best = Infinity;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      let t = lenSq === 0 ? 0 : ((x - a.x) * dx + (y - a.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + t * dx;
      const cy = a.y + t * dy;
      best = Math.min(best, Math.hypot(x - cx, y - cy));
    }
    return best;
  }
  return function sample(x: number, y: number, radius: number): number {
    const d = distanceToPolyline(x, y) - trackWidthMm / 2;
    if (d <= -radius) return 1;
    if (d >= radius) return 0;
    return Math.max(0, Math.min(1, 0.5 - d / (2 * radius)));
  };
}

function makeConfig(mapId: string, robotId: string): { config: LineRunConfig; sensorCount: number } {
  const mapDef = lineMaps.find((m) => m.id === mapId)!;
  const robot = lineRobots.find((r) => r.id === robotId)!;
  const sample = makeSyntheticBitmapSampler(mapDef.points, mapDef.trackWidthMm);

  const mmPerPixel = 2;
  const width = Math.round(mapDef.widthMm / mmPerPixel);
  const height = Math.round(mapDef.heightMm / mmPerPixel);
  const data = new Uint8Array(width * height);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const wx = px * mmPerPixel;
      const wy = py * mmPerPixel;
      data[py * width + px] = Math.round(sample(wx, wy, mapDef.trackWidthMm * 0.5) * 255);
    }
  }

  const config: LineRunConfig = {
    bitmap: { width, height, mmPerPixel, data },
    robot,
    sensorPlacements: defaultLineLayout(robot).sensors,
    startPose: mapDef.startPose,
    startRadius: mapDef.startRadiusMm,
    pathLengthMm: mapDef.pathLengthMm,
  };
  return { config, sensorCount: robot.sensorCount };
}

// The §1.8 PID worked example, verbatim from Algorithms.md (340/20 constants re-fit in Phase C —
// see ISSUES.md #33).
const PID_PROGRAM = `
param Kp = 0.45 range 0..2
param Ki = 0.00 range 0..0.5
param Kd = 0.12 range 0..1
param base = 250 range 50..800

state integral = 0
state lastError = 0
state lastD = 0

on tick:
  let e = line_error()
  set integral = clamp(integral + e * dt(), -1, 1)
  let raw = (e - lastError) / dt()
  let d = lastD + (raw - lastD) * (dt() / (0.12 + dt()))
  set lastD = d
  set lastError = e
  let corr = Kp * e * 340 + Ki * integral * 340 + Kd * d * 20
  drive(base - corr, base + corr)
`;

describe('createVtlLineController — VTL PID (§1.8) headless on lf-oval', () => {
  it('completes a lap with the program-declared default params', () => {
    const result = compile(PID_PROGRAM, 'line');
    if (!result.ok) throw new Error(`compile failed: ${result.errors.map((e) => e.message).join('; ')}`);

    const { config, sensorCount } = makeConfig('lf-oval', 'lf-scout');
    const controller = createVtlLineController(result.program, config.sensorPlacements);
    controller.reset();

    let state = initLineRunState(config, sensorCount);
    const dt = 1 / 120;
    for (let i = 0; i < 120 * 90 && state.status.outcome !== 'success' && state.status.outcome !== 'failed'; i++) {
      // params={} — the VTL program's own `param` defaults (seeded by createRunState) drive it.
      state = tickLine(state, config, controller, {}, 0, dt);
    }
    expect(state.status.outcome).toBe('success');
  });
});

describe('createVtlLineController — builtins', () => {
  const robot = lineRobots.find((r) => r.id === 'lf-scout')!; // 3 sensors, 25mm spacing, mid=1
  const placements = defaultLineLayout(robot).sensors;
  const lateralMm = placements.map((p) => p.lateralMm);

  function stepOnce(source: string, sensors: number[], onLog?: (label: string, value: unknown) => void, onHalt?: (code: string) => void) {
    const result = compile(source, 'line');
    if (!result.ok) throw new Error(`compile failed: ${result.errors.map((e) => e.message).join('; ')}`);
    const controller = createVtlLineController(result.program, placements, onLog, onHalt && ((h) => onHalt(h.code)));
    controller.reset();
    return controller.step(sensors, 1 / 120, {}, 250, robot.maxWheelSpeed, robot.wheelBase, lateralMm);
  }

  it('sensor(i) rejects an out-of-range index with VTL012', () => {
    let haltCode: string | undefined;
    stepOnce('on tick:\n  let s = sensor(99)\n  drive(0, 0)\n', [0, 0, 1], undefined, (c) => (haltCode = c));
    expect(haltCode).toBe('VTL012');
  });

  it('sensor_x(i) reports lateral offsets in mm, positive = right, sensor(0) leftmost', () => {
    const logged: Record<string, unknown> = {};
    stepOnce(
      'on tick:\n  log("x0", sensor_x(0))\n  log("x1", sensor_x(1))\n  log("x2", sensor_x(2))\n  drive(0, 0)\n',
      [0, 0, 1],
      (label, value) => {
        logged[label] = value;
      },
    );
    expect(logged.x0).toBe(-25);
    expect(logged.x1).toBe(0);
    expect(logged.x2).toBe(25);
  });

  it('sensor_y(i) reports forward offsets in mm', () => {
    const logged: Record<string, unknown> = {};
    stepOnce(
      'on tick:\n  log("y0", sensor_y(0))\n  log("y1", sensor_y(1))\n  log("y2", sensor_y(2))\n  drive(0, 0)\n',
      [0, 0, 1],
      (label, value) => {
        logged[label] = value;
      },
    );
    expect(logged.y0).toBe(60);
    expect(logged.y1).toBe(60);
    expect(logged.y2).toBe(60);
  });

  it('line_lost() is true when every sensor reads below the white threshold, false otherwise', () => {
    const logged: unknown[] = [];
    const program = 'on tick:\n  log("lost", line_lost())\n  drive(0, 0)\n';
    stepOnce(program, [0, 0, 0], (_l, v) => logged.push(v));
    expect(logged[0]).toBe(true);
    logged.length = 0;
    stepOnce(program, [0, 0, 1], (_l, v) => logged.push(v));
    expect(logged[0]).toBe(false);
  });

  it('line_error() and line_error_mm() agree via halfSpanMm (mid=1, spacing=25mm)', () => {
    const logged: Record<string, unknown> = {};
    stepOnce(
      'on tick:\n  log("e", line_error())\n  log("mm", line_error_mm())\n  drive(0, 0)\n',
      [0, 0, 1],
      (label, value) => {
        logged[label] = value;
      },
    );
    expect(logged.e).toBeCloseTo(1, 6);
    expect(logged.mm).toBeCloseTo(25, 6); // halfSpanMm = mid(1) * spacing(25)
  });
});

describe('createVtlLineController — hotSwap (Algorithms.md §3.2 live editing semantics)', () => {
  const robot = lineRobots.find((r) => r.id === 'lf-scout')!;
  const placements = defaultLineLayout(robot).sensors;
  const lateralMm = placements.map((p) => p.lateralMm);

  function compileOrThrow(source: string) {
    const result = compile(source, 'line');
    if (!result.ok) throw new Error(`compile failed: ${result.errors.map((e) => e.message).join('; ')}`);
    return result.program;
  }

  it('preserves a state value across hotSwap when the name and value type still match', () => {
    const logged: Record<string, unknown> = {};
    const v1 = compileOrThrow('state counter = 0\non tick:\n  set counter = counter + 1\n  drive(0, 0)\n');
    const controller = createVtlLineController(v1, placements, (label, value) => (logged[label] = value));
    controller.reset();
    controller.step([0, 0, 0], 1 / 120, {}, 0, robot.maxWheelSpeed, robot.wheelBase, lateralMm);
    controller.step([0, 0, 0], 1 / 120, {}, 0, robot.maxWheelSpeed, robot.wheelBase, lateralMm);
    // counter is now 2 inside the running program.

    const v2 = compileOrThrow('state counter = 0\non tick:\n  set counter = counter + 10\n  log("counter", counter)\n  drive(0, 0)\n');
    controller.hotSwap(v2);
    controller.step([0, 0, 0], 1 / 120, {}, 0, robot.maxWheelSpeed, robot.wheelBase, lateralMm);
    // If state weren't preserved, this would read 10 (0 + 10) instead of 12 (2 + 10).
    expect(logged.counter).toBe(12);
  });

  it('drops a state that no longer exists in the new program and initializes a brand-new one to its declared default', () => {
    const v1 = compileOrThrow('state old = 42\non tick:\n  drive(0, 0)\n');
    const controller = createVtlLineController(v1, placements);
    controller.reset();

    const v2 = compileOrThrow('state fresh = 7\non tick:\n  log("fresh", fresh)\n  drive(0, 0)\n');
    controller.hotSwap(v2);

    const logged: Record<string, unknown> = {};
    controller.step([0, 0, 0], 1 / 120, {}, 0, robot.maxWheelSpeed, robot.wheelBase, lateralMm);
    const withLog = createVtlLineController(v2, placements, (label, value) => (logged[label] = value));
    withLog.reset();
    withLog.step([0, 0, 0], 1 / 120, {}, 0, robot.maxWheelSpeed, robot.wheelBase, lateralMm);
    expect(logged.fresh).toBe(7);
  });

  it('re-defaults a state whose value type changed (number -> string) rather than keeping the mismatched value', () => {
    const v1 = compileOrThrow('state mode = 5\non tick:\n  drive(0, 0)\n');
    const controller = createVtlLineController(v1, placements);
    controller.reset();

    const v2 = compileOrThrow('state mode = "idle"\non tick:\n  log("mode", mode)\n  drive(0, 0)\n');
    controller.hotSwap(v2);

    const logged: Record<string, unknown> = {};
    const withLog = createVtlLineController(v2, placements, (label, value) => (logged[label] = value));
    withLog.reset();
    withLog.step([0, 0, 0], 1 / 120, {}, 0, robot.maxWheelSpeed, robot.wheelBase, lateralMm);
    expect(logged.mode).toBe('idle');
  });

  it('un-halts on hotSwap so a fixed program can run again after a runtime halt', () => {
    const v1 = compileOrThrow('on tick:\n  let s = sensor(99)\n  drive(0, 0)\n'); // VTL012 out-of-range halt
    let haltCode: string | undefined;
    const controller = createVtlLineController(v1, placements, undefined, (h) => (haltCode = h.code));
    controller.reset();
    controller.step([0, 0, 0], 1 / 120, {}, 0, robot.maxWheelSpeed, robot.wheelBase, lateralMm);
    expect(haltCode).toBe('VTL012');

    const v2 = compileOrThrow('on tick:\n  drive(123, 123)\n');
    controller.hotSwap(v2);
    const out = controller.step([0, 0, 0], 1 / 120, {}, 0, robot.maxWheelSpeed, robot.wheelBase, lateralMm);
    expect(out.vLeft).toBe(123);
    expect(out.vRight).toBe(123);
  });

  it('preserves array contents across hotSwap when the name and length still match (v0.3.1.md §K.13)', () => {
    const v1 = compileOrThrow('state buf[3] = 0\non tick:\n  set buf[0] = 5\n  set buf[1] = 6\n  set buf[2] = 7\n  drive(0, 0)\n');
    const controller = createVtlLineController(v1, placements);
    controller.reset();
    controller.step([0, 0, 0], 1 / 120, {}, 0, robot.maxWheelSpeed, robot.wheelBase, lateralMm);
    // buf is now [5, 6, 7] inside the running program.

    const v2 = compileOrThrow('state buf[3] = 0\non tick:\n  drive(buf[0], buf[2])\n');
    controller.hotSwap(v2);
    const out = controller.step([0, 0, 0], 1 / 120, {}, 0, robot.maxWheelSpeed, robot.wheelBase, lateralMm);
    // If the array weren't preserved across the hotSwap, these would be 0, 0.
    expect(out.vLeft).toBe(5);
    expect(out.vRight).toBe(7);
  });

  it('resets array contents to the declared fill value across hotSwap when the length changes (v0.3.1.md §K.13)', () => {
    const v1 = compileOrThrow('state buf[3] = 0\non tick:\n  set buf[0] = 9\n  set buf[1] = 9\n  set buf[2] = 9\n  drive(0, 0)\n');
    const controller = createVtlLineController(v1, placements);
    controller.reset();
    controller.step([0, 0, 0], 1 / 120, {}, 0, robot.maxWheelSpeed, robot.wheelBase, lateralMm);
    // buf is now [9, 9, 9] inside the running program.

    const v2 = compileOrThrow('state buf[4] = 3\non tick:\n  drive(buf[0], buf[3])\n');
    controller.hotSwap(v2);
    const out = controller.step([0, 0, 0], 1 / 120, {}, 0, robot.maxWheelSpeed, robot.wheelBase, lateralMm);
    // A length change (3 -> 4) resets to the new declared fill value (3), not a truncated/padded [9,...].
    expect(out.vLeft).toBe(3);
    expect(out.vRight).toBe(3);
  });
});
