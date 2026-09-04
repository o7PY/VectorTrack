// @vitest-environment jsdom
//
// Exercises `hotSwapVtlAlgorithm` directly against engine.ts, independent of useStore.ts and the
// (not-yet-built) code panel — Algorithms.md §3.2's "compiling source edit -> hot-swap next tick."
// Custom maps skip canvas rasterization (see useStore.vtl.test.ts's file-header comment), so they're
// safe to build against in jsdom.
import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultLineDraft, lineDraftToCustomMap } from '../editor/line/draft';
import { createDefaultMazeDraft, mazeDraftToCustomMap } from '../editor/maze/draft';
import { toCustomRuntimeId } from '../maps/custom/toRuntimeMap';
import { loadCustomMapStore, saveCustomMapStore, upsertCustomMap } from './customMaps';
import { loadCustomAlgorithmStore, saveCustomAlgorithmStore, upsertCustomAlgorithm } from './customAlgorithms';
import { toVtlRuntimeId } from './customAlgorithmResolvers';
import { buildLine, buildMaze, hotSwapVtlAlgorithm, stepEngineOnce } from './engine';
import { compile } from '../vtl/compile';
import type { CustomAlgorithm } from '../algorithms/custom/types';

function saveAlgorithm(id: string, source: string, mode: 'line' | 'maze' = 'line'): void {
  const algorithm: CustomAlgorithm = { id, name: `Custom ${id}`, mode, source, createdAt: '2024-01-01', updatedAt: '2024-01-01', lastCompile: null };
  saveCustomAlgorithmStore(upsertCustomAlgorithm(loadCustomAlgorithmStore(), algorithm));
}

function compileOrThrow(source: string, mode: 'line' | 'maze') {
  const result = compile(source, mode);
  if (!result.ok) throw new Error(`compile failed: ${result.errors.map((e) => e.message).join('; ')}`);
  return result.program;
}

describe('engine.ts hotSwapVtlAlgorithm', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is a no-op for a built-in algorithm', () => {
    const draft = createDefaultLineDraft('oval-builtin');
    saveCustomMapStore(upsertCustomMap(loadCustomMapStore(), lineDraftToCustomMap(draft)));
    buildLine(toCustomRuntimeId('oval-builtin'), 'lf-scout', 'pid');

    const swapped = hotSwapVtlAlgorithm(compileOrThrow('on tick:\n  drive(1, 1)\n', 'line'));
    expect(swapped).toBe(false);
  });

  it('is a no-op when the currently-active vtl algorithm never compiled (broken stub controller)', () => {
    const draft = createDefaultLineDraft('oval-broken');
    saveCustomMapStore(upsertCustomMap(loadCustomMapStore(), lineDraftToCustomMap(draft)));
    saveAlgorithm('broken1', 'on tick:\n  this is not valid vtl\n');
    buildLine(toCustomRuntimeId('oval-broken'), 'lf-scout', toVtlRuntimeId('broken1'));

    const swapped = hotSwapVtlAlgorithm(compileOrThrow('on tick:\n  drive(1, 1)\n', 'line'));
    expect(swapped).toBe(false);
  });

  it('swaps a running line controller in place and its new drive() output takes effect immediately', () => {
    const draft = createDefaultLineDraft('oval-swap');
    saveCustomMapStore(upsertCustomMap(loadCustomMapStore(), lineDraftToCustomMap(draft)));
    saveAlgorithm('sw1', 'on tick:\n  drive(100, 100)\n');
    buildLine(toCustomRuntimeId('oval-swap'), 'lf-scout', toVtlRuntimeId('sw1'));

    let s = stepEngineOnce({}, 0);
    expect(s.vLeft).toBeCloseTo(100, 0);

    const swapped = hotSwapVtlAlgorithm(compileOrThrow('on tick:\n  drive(222, 222)\n', 'line'));
    expect(swapped).toBe(true);

    s = stepEngineOnce({}, 0);
    expect(s.vLeft).toBeCloseTo(222, 0);
    expect(s.vtlError).toBeUndefined();
  });

  it('swaps a running maze controller in place and clears a prior vtlError', () => {
    const draft = createDefaultMazeDraft('maze-swap', 6, 6);
    saveCustomMapStore(upsertCustomMap(loadCustomMapStore(), mazeDraftToCustomMap(draft)));
    saveAlgorithm('mz-sw1', 'on tick:\n  move_to(forward)\n', 'maze'); // VTL013: halts immediately.
    buildMaze(toCustomRuntimeId('maze-swap'), 'mz-probe', toVtlRuntimeId('mz-sw1'));

    let s = stepEngineOnce({}, 0);
    expect(s.vtlError).toMatch(/VTL013/);

    const swapped = hotSwapVtlAlgorithm(compileOrThrow('on junction:\n  move_to(forward)\n', 'maze'));
    expect(swapped).toBe(true);

    s = stepEngineOnce({}, 0);
    expect(s.vtlError).toBeUndefined();
  });
});
