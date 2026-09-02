import type { LineMapDef } from './types';
import { lfCircuit } from './lfCircuit';
import { lfGaps } from './lfGaps';
import { lfOval } from './lfOval';
import { lfScurve } from './lfScurve';
import { lfSharp } from './lfSharp';

export const lineMaps: LineMapDef[] = [lfOval, lfScurve, lfSharp, lfGaps, lfCircuit];

export function getLineMap(id: string): LineMapDef {
  const m = lineMaps.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown line map: ${id}`);
  return m;
}

export type { LineMapDef } from './types';
