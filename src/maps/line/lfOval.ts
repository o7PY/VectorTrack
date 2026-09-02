import type { LineMapDef } from './types';
import { polarLoop, polylineLength, startPoseFromLoop } from './types';

const points = polarLoop(1000, 600, 700, 380, () => 1);

export const lfOval: LineMapDef = {
  id: 'lf-oval',
  name: 'Warm-Up Oval',
  description: 'Simple closed loop, gentle curves. Tutorial map.',
  widthMm: 2000,
  heightMm: 1200,
  points,
  trackWidthMm: 20,
  startPose: startPoseFromLoop(points),
  startRadiusMm: 70,
  pathLengthMm: polylineLength(points),
};
