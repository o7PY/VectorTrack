import type { LineController } from '../core/types';
import { computeLineError } from '../sensors/reflectance';
import { computeWheelSpeeds, ERROR_GAIN_SCALE } from './lineShared';

/** P-only controller. Parameter: Kp. Baseline for the PID panel (SPEC 5.4.2). */
export function createProportional(): LineController {
  let lastError = 0;

  return {
    id: 'proportional',
    reset() {
      lastError = 0;
    },
    step(sensors, _dt, params, baseSpeed) {
      const error = computeLineError(sensors, lastError);
      lastError = error;

      const kp = params.Kp ?? 0;
      const p = kp * error;
      const correction = p * ERROR_GAIN_SCALE;

      return {
        ...computeWheelSpeeds(baseSpeed, correction),
        debug: { error, p, i: 0, d: 0 },
      };
    },
  };
}
