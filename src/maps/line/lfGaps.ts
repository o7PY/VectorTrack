import type { LineMapDef } from './types';
import { polarLoop, polylineLength, startPoseFromLoop } from './types';

const points = polarLoop(1000, 600, 700, 380, () => 1);

export const lfGaps: LineMapDef = {
  id: 'lf-gaps',
  name: 'Broken Line',
  description: 'Dashed segments requiring last-error hold.',
  widthMm: 2000,
  heightMm: 1200,
  points,
  trackWidthMm: 20,
  startPose: startPoseFromLoop(points),
  startRadiusMm: 70,
  pathLengthMm: polylineLength(points),
  dashed: { onMm: 60, offMm: 40 },
};
