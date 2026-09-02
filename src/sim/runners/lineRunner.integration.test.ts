import { describe, expect, it } from 'vitest';
import { lineMaps } from '../../maps/line';
import { lineRobots, pidDefaults } from '../../robots/definitions';
import { createPid } from '../algorithms/pid';
import { initLineRunState, tickLine } from './lineRunner';
import type { LineRunConfig } from './lineRunner';

// A synthetic bitmap sampler standing in for rasterizeLineMap (which needs a
// real <canvas> 2D context, unavailable under plain node/jsdom): distance
// from world (x,y) to the nearest track polyline segment, thresholded to a
// binary black/white read the same width as the real track.
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
    // Approximate the disc-average sensor read with a smooth falloff around the track edge.
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

  // A LineBitmap-shaped stand-in whose "pixels" are computed on demand isn't
  // possible (sampleReflectance reads a Uint8Array directly), so instead we
  // pre-rasterize onto a coarse grid using the synthetic sampler.
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
    startPose: mapDef.startPose,
    startRadius: mapDef.startRadiusMm,
    pathLengthMm: mapDef.pathLengthMm,
  };
  return { config, sensorCount: robot.sensorCount };
}

function runToCompletion(config: LineRunConfig, sensorCount: number, params: Record<string, number>, baseSpeed: number, maxTicks: number) {
  const controller = createPid();
  controller.reset();
  let state = initLineRunState(config, sensorCount);
  const dt = 1 / 120;
  let maxAbsWheelSpeed = 0;
  let negativeWheelTicks = 0;
  for (let i = 0; i < maxTicks; i++) {
    state = tickLine(state, config, controller, params, baseSpeed, dt);
    maxAbsWheelSpeed = Math.max(maxAbsWheelSpeed, Math.abs(state.vLeft), Math.abs(state.vRight));
    if (state.vLeft < 0 || state.vRight < 0) negativeWheelTicks++;
    if (state.status.outcome !== 'running') break;
  }
  return { state, maxAbsWheelSpeed, negativeWheelTicks };
}

describe('PID with per-robot default gains completes a lap without excessive correction', () => {
  // lf-sharp and lf-circuit have genuinely sharp (zero-radius) 90° corners
  // by design (the user asked for hard corners, not a smoothing fillet) — a
  // forward-looking sensor array overshoots a true zero-radius corner
  // regardless of tuning, and no gain setting removes that. These two maps
  // are deliberately hard enough that the *default* gains (tuned to be
  // stable-but-improvable on the easier maps, per SPEC 5.5) aren't expected
  // to clear them — see the "clearable via tuning" describe block below for
  // proof the acceptance criterion (completable by *some* gain setting)
  // still holds.
  const hardCornerMaps = new Set(['lf-sharp', 'lf-circuit']);

  for (const robotId of ['lf-scout', 'lf-ranger']) {
    for (const mapId of lineMaps.map((m) => m.id).filter((id) => !hardCornerMaps.has(id))) {
      it(`${robotId} on ${mapId}`, () => {
        const { config, sensorCount } = makeConfig(mapId, robotId);
        const defaults = pidDefaults[robotId];
        const { Kp, Ki, Kd } = defaults;
        const result = runToCompletion(config, sensorCount, { Kp, Ki, Kd }, defaults.baseSpeed, 120 * 90);

        expect(result.state.status.outcome).toBe('success');
        // Net forward progress shouldn't collapse into a reverse/pivot fight:
        // wheel speeds should very rarely need to go negative on these tracks.
        expect(result.negativeWheelTicks).toBeLessThan(120); // < 1s total across the whole lap
      });
    }
  }
});

describe('lf-sharp and lf-circuit (hard right-angle corners) are clearable by tuning within the slider range', () => {
  it('lf-sharp: scout with a modestly higher Kp than default (0.6 vs 0.45)', () => {
    const { config, sensorCount } = makeConfig('lf-sharp', 'lf-scout');
    const result = runToCompletion(config, sensorCount, { Kp: 0.6, Ki: 0, Kd: 0.12 }, 250, 120 * 60);
    expect(result.state.status.outcome).toBe('success');
  });

  it('lf-circuit: scout with a modestly higher Kp than default (0.6 vs 0.45)', () => {
    const { config, sensorCount } = makeConfig('lf-circuit', 'lf-scout');
    const result = runToCompletion(config, sensorCount, { Kp: 0.6, Ki: 0, Kd: 0.12 }, 250, 120 * 90);
    expect(result.state.status.outcome).toBe('success');
  });
});
