import { CodeBlock, SectionHeading, Shot, SubSection, Table } from './DocsShared';

export function LineFollowerDocs() {
  return (
    <>
      <SectionHeading id="line-follower" eyebrow="Mode" title="Line Follower" />

      <SubSection id="line-algorithm" title="Algorithm">
        <p>
          A reflectance sensor array (odd count, symmetric about the robot's centerline) samples a grayscale line
          bitmap ahead of the robot. Each reading is 0 (white floor) to 1 (black line); a weighted average of
          sensor index against reading gives a single signed <code>error</code> — negative if the line is to the
          robot's right, positive if to its left. When every sensor reads white (line lost), the last known error
          is held rather than snapping to zero.
        </p>
        <CodeBlock
          title="src/sim/sensors/reflectance.ts"
          code={`export function computeLineError(readings: number[], lastError: number): number {
  const mid = (readings.length - 1) / 2;
  let num = 0;
  let den = 0;
  for (let i = 0; i < readings.length; i++) {
    const w = i - mid;
    num += w * readings[i];
    den += readings[i];
  }
  if (den < 1e-6) return lastError;
  return num / den;
}`}
        />
        <p>Three controllers of increasing sophistication consume that error, each with the parameters a real implementation would expose:</p>
        <p>
          <strong className="text-neutral-100">Bang-Bang</strong> — no tunable parameters. Turns hard toward
          whichever side sees the line, with a small deadband to avoid chattering at zero error:
        </p>
        <CodeBlock
          title="src/sim/algorithms/bangBang.ts"
          code={`const turn = maxWheelSpeed * 0.6;
const straight = maxWheelSpeed * 0.4;
const deadband = 0.05;

if (error > deadband)      { vLeft = -turn * 0.3; vRight = turn; }       // line left → turn left
else if (error < -deadband){ vLeft = turn;        vRight = -turn * 0.3; } // line right → turn right
else                        { vLeft = straight;    vRight = straight; }`}
        />
        <p>
          <strong className="text-neutral-100">Proportional</strong> — one gain, <code>Kp</code>. The correction
          scales linearly with error and is added to one wheel, subtracted from the other:
        </p>
        <CodeBlock
          title="src/sim/algorithms/proportional.ts"
          code={`const p = kp * error;
const correction = p * ERROR_GAIN_SCALE;
return computeWheelSpeeds(baseSpeed, correction); // { vLeft: base - c, vRight: base + c }`}
        />
        <p>
          <strong className="text-neutral-100">PID</strong> — full <code>Kp</code>/<code>Ki</code>/<code>Kd</code>{' '}
          with clamped integral windup and a low-pass-filtered derivative (a raw <code>Δerror/Δt</code> spikes
          badly at this sim's 120 Hz tick rate — filtering it is what makes a nonzero <code>Kd</code> usable
          instead of an instant overreaction to sensor noise):
        </p>
        <CodeBlock
          title="src/sim/algorithms/pid.ts"
          code={`integral = clamp(integral + error * dt, -INTEGRAL_LIMIT, INTEGRAL_LIMIT);

const rawDerivative = dt > 0 ? (error - lastError) / dt : 0;
const alpha = dt / (DERIVATIVE_FILTER_TAU + dt);
filteredDerivative += alpha * (rawDerivative - filteredDerivative);

const p = kp * error, i = ki * integral, d = kd * filteredDerivative;
const correction = (p + i) * ERROR_GAIN_SCALE + d * D_GAIN_SCALE;`}
        />
        <p>
          <code>ERROR_GAIN_SCALE</code> (170), <code>D_GAIN_SCALE</code> (10), and{' '}
          <code>DERIVATIVE_FILTER_TAU</code> (0.12s) aren't spec values — they're calibration constants that
          convert the sensor error's small dimensionless range into an mm/s wheel-speed differential the physics
          step can actually use.
        </p>
        <Table
          headers={['Robot', 'Kp', 'Ki', 'Kd', 'Base speed']}
          rows={[
            ['Scout', '0.45', '0', '0.12', '250 mm/s'],
            ['Ranger', '0.3', '0', '0.2', '500 mm/s'],
          ]}
        />
        <Shot src="/vectortrack/screenshots/docs/line-algorithm.jpg" alt="PID parameter panel" caption="Algorithm + Parameters panel, PID selected — every gain is live-tunable mid-run." />
      </SubSection>

      <SubSection id="line-robot" title="Robot">
        <p>
          Two chassis, same differential-drive kinematics (no slip, no acceleration ramp — pure integration of
          left/right wheel speed into pose). They differ in sensor resolution and top speed, which changes how
          forgiving each one is to tune:
        </p>
        <Table
          headers={['Robot', 'Sensors', 'Spacing', 'Forward offset', 'Wheelbase', 'Max speed', 'Character']}
          rows={[
            ['Scout', '3', '25 mm', '60 mm', '90 mm', '400 mm/s', 'Coarse resolution, forgiving. Beginner.'],
            ['Ranger', '5', '12 mm', '55 mm', '70 mm', '800 mm/s', 'Fine resolution, twitchy, needs tuned gains.'],
          ]}
        />
        <Shot src="/vectortrack/screenshots/docs/line-robot.jpg" alt="Robot selection panel" caption="Robot panel — spec readout updates live as you switch chassis." />
      </SubSection>

      <SubSection id="line-map" title="Map">
        <p>Five closed-loop tracks, each stressing a different part of the control loop:</p>
        <Table
          headers={['Map', 'Description']}
          rows={[
            ['Warm-Up Oval', 'Simple closed loop, gentle curves. Tutorial map.'],
            ['S-Curves', 'Alternating tight/wide bends, tests overshoot.'],
            ['Right Angles', 'Genuine zero-radius 90° corners — bang-bang struggles, default PID gains need a Kp bump.'],
            ['Broken Line', 'Dashed segments requiring last-error hold.'],
            ['Grand Circuit', 'Long mixed-difficulty lap with two spliced-in hard right-angle corners — the "final exam".'],
          ]}
        />
        <p>
          Tracks are generated as closed polylines (smooth harmonic curves via a polar loop function, or explicit
          rectilinear vertices) and rasterized to a grayscale bitmap in the browser for the sensor model to sample.
          "Right Angles" and "Grand Circuit" get genuinely sharp, zero-radius corners spliced in via a small
          rectangular-notch helper — no fillet anywhere, so a forward-looking sensor really can lose the line
          for an instant unless the gains are tuned for it.
        </p>
        <div className="flex flex-wrap gap-4">
          <Shot src="/vectortrack/screenshots/docs/line-map-list.jpg" alt="Line map list" caption="The five line tracks, with mini thumbnails and completion checkmarks." />
          <Shot src="/vectortrack/screenshots/docs/line-track-2d.jpg" alt="2D line track view" caption="Warm-Up Oval in the 2D debug view — trajectory trail visible behind the robot." />
        </div>
      </SubSection>

      <SubSection id="line-utility" title="Utility">
        <p>
          <strong className="text-neutral-100">Toolbar</strong> — play/pause, single-step, reset; a 0.25×–4×
          speed multiplier that scales how many fixed 120 Hz ticks run per animation frame; a 2D/3D view toggle
          that never resets the run (both views read the same simulation state); and, in 3D, a camera preset
          picker (Isometric, Top-Down, or Chase — the chase camera re-aims from the robot's live heading every
          frame rather than translating a fixed offset, so it doesn't drift out of alignment mid-turn).
        </p>
        <Shot src="/vectortrack/screenshots/docs/line-toolbar.jpg" alt="Playback toolbar" caption="Playback bar: transport controls, speed, view mode, camera preset." />
        <p>
          <strong className="text-neutral-100">Telemetry</strong> — sim time, wheel speeds, a grayscale swatch per
          sensor reading, the current error, and the live P/I/D contribution breakdown, plus a scrolling
          error-vs-time sparkline for spotting oscillation as you tune.
        </p>
        <Shot src="/vectortrack/screenshots/docs/line-telemetry.jpg" alt="Telemetry panel" caption="Telemetry strip: sensors, error, P/I/D terms, and the error sparkline." />
        <p>
          <strong className="text-neutral-100">Settings</strong> (gear icon) — a sensor-overlay toggle for the 2D
          view, and a reset-all-progress action (behind a confirm step) that erases tuned gains, best times, and
          map-completion state.
        </p>
      </SubSection>
    </>
  );
}
