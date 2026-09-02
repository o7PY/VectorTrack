import type { LineMapDef } from './types';
import { insertRightAngleNotch, polarLoop, polylineLength, startPoseFromLoop } from './types';

// Mixed-difficulty loop: broad sweeps, a tighter secondary lobe, a fast
// wiggle, and two genuinely sharp (zero-radius) right-angle chicanes —
// the "final exam" mixes every kind of turn this simulator has.
const smoothed = polarLoop(
  1150,
  700,
  900,
  520,
  (theta) => 1 + 0.14 * Math.sin(2 * theta) + 0.08 * Math.sin(5 * theta + 1) + 0.04 * Math.sin(9 * theta + 2),
  320,
);
// Splice the later-index notch first so the earlier indices stay valid for
// the second call (each splice shifts every index after it).
const withOneNotch = insertRightAngleNotch(smoothed, 210, 226, 130);
const points = insertRightAngleNotch(withOneNotch, 40, 56, 130);

export const lfCircuit: LineMapDef = {
  id: 'lf-circuit',
  name: 'Grand Circuit',
  description: 'Long mixed-difficulty lap, the "final exam".',
  widthMm: 2400,
  heightMm: 1500,
  points,
  trackWidthMm: 20,
  startPose: startPoseFromLoop(points),
  startRadiusMm: 70,
  pathLengthMm: polylineLength(points),
};
