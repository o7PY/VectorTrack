import type { LineMapDef } from './types';
import { polarLoop, polylineLength, startPoseFromLoop } from './types';

const points = polarLoop(1000, 600, 700, 380, (theta) => 1 + 0.28 * Math.sin(4 * theta));

export const lfScurve: LineMapDef = {
  id: 'lf-scurve',
  name: 'S-Curves',
  description: 'Alternating tight/wide bends, tests overshoot.',
  widthMm: 2000,
  heightMm: 1200,
  points,
  trackWidthMm: 20,
  startPose: startPoseFromLoop(points),
  startRadiusMm: 70,
  pathLengthMm: polylineLength(points),
};
