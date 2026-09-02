import type { MazeMap } from '../../sim/maze/grid';
import { mzClassic } from './mzClassic';
import { mzDense } from './mzDense';
import { mzIntro } from './mzIntro';
import { mzIsland } from './mzIsland';
import { mzSpiral } from './mzSpiral';

export const mazeMaps: MazeMap[] = [mzIntro, mzSpiral, mzIsland, mzClassic, mzDense];

export function getMazeMap(id: string): MazeMap {
  const m = mazeMaps.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown maze map: ${id}`);
  return m;
}
