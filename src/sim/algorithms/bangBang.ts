import type { LineController } from '../core/types';
import { computeLineError } from '../sensors/reflectance';

/** No parameters. Full turn toward whichever side sees the line (SPEC 5.4.1). */
export function createBangBang(): LineController {
  let lastError = 0;

  return {
    id: 'bangBang',
    reset() {
      lastError = 0;
    },
    step(sensors, _dt, _params, _baseSpeed, maxWheelSpeed) {
      const error = computeLineError(sensors, lastError);
      lastError = error;

      const turn = maxWheelSpeed * 0.6;
      const straight = maxWheelSpeed * 0.4;
      const deadband = 0.05;

      let vLeft: number;
      let vRight: number;
      if (error > deadband) {
        // line to the left: turn left
        vLeft = -turn * 0.3;
        vRight = turn;
      } else if (error < -deadband) {
        // line to the right: turn right
        vLeft = turn;
        vRight = -turn * 0.3;
      } else {
        vLeft = straight;
        vRight = straight;
      }

      return { vLeft, vRight, debug: { error, p: 0, i: 0, d: 0 } };
    },
  };
}
