import type { LineController } from '../core/types';
import { computeLineError } from '../sensors/reflectance';
import { computeWheelSpeeds, DERIVATIVE_FILTER_TAU, D_GAIN_SCALE, ERROR_GAIN_SCALE, INTEGRAL_LIMIT } from './lineShared';

/** Full PID controller. Parameters: Kp, Ki, Kd (baseSpeed lives alongside, not in `params`). SPEC 5.4.3 / 5.5. */
export function createPid(): LineController {
  let lastError = 0;
  let integral = 0;
  let filteredDerivative = 0;

  return {
    id: 'pid',
    reset() {
      lastError = 0;
      integral = 0;
      filteredDerivative = 0;
    },
    step(sensors, dt, params, baseSpeed) {
      const error = computeLineError(sensors, lastError);

      const kp = params.Kp ?? 0;
      const ki = params.Ki ?? 0;
      const kd = params.Kd ?? 0;

      integral += error * dt;
      integral = Math.max(-INTEGRAL_LIMIT, Math.min(INTEGRAL_LIMIT, integral));

      // Raw (error-lastError)/dt spikes badly at a 120Hz tick rate — a single
      // sensor-crossing event can produce a huge instantaneous rate even
      // though the underlying motion is smooth. Low-pass filter it (time
      // constant DERIVATIVE_FILTER_TAU) so Kd damps genuine trends instead
      // of amplifying tick-to-tick noise into a derivative kick.
      const rawDerivative = dt > 0 ? (error - lastError) / dt : 0;
      const alpha = dt / (DERIVATIVE_FILTER_TAU + dt);
      filteredDerivative += alpha * (rawDerivative - filteredDerivative);
      lastError = error;

      const p = kp * error;
      const i = ki * integral;
      const d = kd * filteredDerivative;
      const correction = (p + i) * ERROR_GAIN_SCALE + d * D_GAIN_SCALE;

      return {
        ...computeWheelSpeeds(baseSpeed, correction),
        debug: { error, p, i, d },
      };
    },
  };
}
