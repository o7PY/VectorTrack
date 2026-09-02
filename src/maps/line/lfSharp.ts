import type { LineMapDef } from './types';
import { polylineLength, startPoseFromLoop } from './types';

// A rectilinear "staircase" loop: six vertices, six genuinely sharp
// (zero-radius) 90-degree corners — no fillet. A hard corner overshoots a
// forward-looking sensor array's lookahead regardless of tuning, so this map
// is deliberately hard; it's the one this simulator's "bang-bang struggles
// here" claim is actually about, and it may need gains tuned above default
// to clear (see SPEC's "known simplifications").
const points = [
  { x: 300, y: 900 },
  { x: 300, y: 300 },
  { x: 1000, y: 300 },
  { x: 1000, y: 600 },
  { x: 1700, y: 600 },
  { x: 1700, y: 900 },
];

export const lfSharp: LineMapDef = {
  id: 'lf-sharp',
  name: 'Right Angles',
  description: 'Series of 90° corners; bang-bang struggles here.',
  widthMm: 2000,
  heightMm: 1200,
  points,
  trackWidthMm: 20,
  startPose: startPoseFromLoop(points),
  startRadiusMm: 70,
  pathLengthMm: polylineLength(points),
};
