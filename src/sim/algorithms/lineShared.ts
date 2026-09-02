/**
 * Shared conventions for line-follower controllers.
 *
 * `error` (from computeLineError) is a dimensionless index-weighted average —
 * roughly in [-mid, +mid] for `mid = (sensorCount-1)/2`. Positive error means
 * the line sits toward the sensor array's positive-index side, which is the
 * robot's LEFT (see sampleLineSensors' perpendicular convention). To steer
 * back onto the line the robot must turn left, i.e. increase omega, i.e.
 * vRight > vLeft. So corrections are added to vRight and subtracted from
 * vLeft.
 *
 * ERROR_GAIN_SCALE converts the small dimensionless P/I sum into an mm/s
 * wheel-speed differential so that the SPEC's default gains (Kp ~0.3-0.45)
 * produce a visibly-tunable, not-negligible steering response.
 *
 * The D term gets its own, much smaller D_GAIN_SCALE: its raw units are
 * error-per-second (it carries an implicit 1/dt), which at this sim's 120Hz
 * tick rate is a fundamentally larger-magnitude quantity than P's plain
 * error even after low-pass filtering (see pid.ts) — reusing ERROR_GAIN_SCALE
 * for D let the default Kd swing wheel speeds hard enough to demand a
 * reversed wheel, which reads as the robot "struggling to move".
 */
export const ERROR_GAIN_SCALE = 170;
export const D_GAIN_SCALE = 10;
export const DERIVATIVE_FILTER_TAU = 0.12; // seconds
export const INTEGRAL_LIMIT = 5;

export function computeWheelSpeeds(baseSpeed: number, correction: number): { vLeft: number; vRight: number } {
  return {
    vLeft: baseSpeed - correction,
    vRight: baseSpeed + correction,
  };
}
