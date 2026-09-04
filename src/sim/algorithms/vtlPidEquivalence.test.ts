// PLAN.md Phase F — VTL PID must reproduce native pid.ts's trajectory on lf-oval within tolerance.
// Both controllers implement the exact same formulas (error model, derivative filter, gain scales
// — see lineShared.ts and the §1.8 PID_PROGRAM fixture), so with Ki=0 (the shared default, which
// makes the two implementations' differing integral-clamp bounds irrelevant) their poses should
// track each other almost exactly, tick for tick.

import { describe, expect, it } from 'vitest';
import { lineMaps } from '../../maps/line';
import { lineRobots } from '../../robots/definitions';
import { defaultLineLayout } from '../../robots/layouts';
import { compile } from '../../vtl/compile';
import { createPid } from './pid';
import { createVtlLineController } from './vtlAdapter';
import { initLineRunState, tickLine } from '../runners/lineRunner';
import type { LineRunConfig } from '../runners/lineRunner';

// Same synthetic-bitmap approach as vtlAdapter.test.ts / lineRunner.integration.test.ts
// (rasterizeLineMap needs a real <canvas> 2D context, unavailable under plain node/jsdom).
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
// see ISSUES.md #33) — must stay byte-for-byte identical to vtlAdapter.test.ts's copy.
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

describe('VTL PID vs. native pid.ts — equivalence on lf-oval', () => {
  it('tracks the native controller within a tight pose tolerance, tick for tick', () => {
    const compiled = compile(PID_PROGRAM, 'line');
    if (!compiled.ok) throw new Error(`compile failed: ${compiled.errors.map((e) => e.message).join('; ')}`);

    const { config, sensorCount } = makeConfig('lf-oval', 'lf-scout');
    const params = { Kp: 0.45, Ki: 0, Kd: 0.12 };
    const baseSpeed = 250;
    const dt = 1 / 120;

    const vtlController = createVtlLineController(compiled.program, config.sensorPlacements);
    vtlController.reset();
    let vtlState = initLineRunState(config, sensorCount);

    const nativeController = createPid();
    nativeController.reset();
    let nativeState = initLineRunState(config, sensorCount);

    const maxTicks = 120 * 90;
    let ticks = 0;
    for (; ticks < maxTicks; ticks++) {
      const vtlDone = vtlState.status.outcome === 'success' || vtlState.status.outcome === 'failed';
      const nativeDone = nativeState.status.outcome === 'success' || nativeState.status.outcome === 'failed';
      if (vtlDone && nativeDone) break;

      if (!vtlDone) vtlState = tickLine(vtlState, config, vtlController, {}, baseSpeed, dt);
      if (!nativeDone) nativeState = tickLine(nativeState, config, nativeController, params, baseSpeed, dt);

      // Both controllers apply the exact same formulas (see file header), so poses should stay
      // essentially identical throughout the run, not just at completion.
      const dist = Math.hypot(vtlState.pose.x - nativeState.pose.x, vtlState.pose.y - nativeState.pose.y);
      expect(dist).toBeLessThan(5); // mm
      expect(Math.abs(vtlState.pose.theta - nativeState.pose.theta)).toBeLessThan(0.05); // radians
    }

    expect(nativeState.status.outcome).toBe('success');
    expect(vtlState.status.outcome).toBe('success');
  });
});
