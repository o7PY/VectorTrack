/**
 * Shared conventions for line-follower controllers.
 *
 * `error` (from computeLineError) is a dimensionless normalized position in
 * [-1, +1] (Algorithms.md Amendment A1), regardless of sensor count. Positive
 * error means the line sits toward the sensor array's positive-index side,
 * which is the robot's RIGHT (sensor index increases toward +lateralMm, and
 * sampleLineSensors' perpendicular vector is the same rightX=-sin(theta),
 * rightY=cos(theta) formula as sim/sensors/placement.ts and
 * sim/sensors/rangefinder.ts — confirmed empirically too: see ISSUES.md #34).
 * To steer back onto the line the robot must turn right, i.e. increase
 * omega, i.e. vRight > vLeft. So corrections are added to vRight and
 * subtracted from vLeft.
 *
 * ERROR_GAIN_SCALE converts the small dimensionless P/I sum into an mm/s
 * wheel-speed differential so that the SPEC's default gains (Kp ~0.3-0.45)
 * produce a visibly-tunable, not-negligible steering response. It was
 * doubled (170 -> 340) when the error model switched from an unnormalized
 * index-weighted average (range [-mid, mid]) to this normalized [-1, 1]
 * form: `lf-scout` (3 sensors, mid=1) is unaffected by normalization since
 * its old range was already [-1, 1], but `lf-ranger` (5 sensors, mid=2) had
 * its error magnitude halved by normalization, so doubling the shared scale
 * restores lf-ranger's original correction magnitude — at the cost of
 * making lf-scout's twice as aggressive as before. Empirically lf-scout has
 * the headroom to absorb that (still clears every non-hard-corner map, see
 * lineRunner.integration.test.ts) while lf-ranger did not have headroom to
 * absorb staying at half correction, so this is the resolved direction of
 * the tradeoff (ISSUES.md) — a single global constant can't satisfy both
 * robots' pre-Amendment-A1 trajectories exactly.
 *
 * The D term gets its own, much smaller D_GAIN_SCALE (also doubled alongside
 * ERROR_GAIN_SCALE, for the same reason): its raw units are error-per-second
 * (it carries an implicit 1/dt), which at this sim's 120Hz tick rate is a
 * fundamentally larger-magnitude quantity than P's plain error even after
 * low-pass filtering (see pid.ts) — reusing ERROR_GAIN_SCALE for D let the
 * default Kd swing wheel speeds hard enough to demand a reversed wheel,
 * which reads as the robot "struggling to move".
 */
export const ERROR_GAIN_SCALE = 340;
export const D_GAIN_SCALE = 20;
export const DERIVATIVE_FILTER_TAU = 0.12; // seconds
export const INTEGRAL_LIMIT = 5;

export function computeWheelSpeeds(baseSpeed: number, correction: number): { vLeft: number; vRight: number } {
  return {
    vLeft: baseSpeed - correction,
    vRight: baseSpeed + correction,
  };
}
