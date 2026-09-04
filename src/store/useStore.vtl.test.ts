// @vitest-environment jsdom
//
// Custom maps skip canvas rasterization entirely (toRuntimeMap.ts derives the bitmap straight from
// the stored paint grid), so — unlike the built-in line maps `useStore.smoke.test.ts` avoids — a
// custom line map is safe to run a full line-mode engine build against in jsdom.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultLineDraft, lineDraftToCustomMap } from '../editor/line/draft';
import { createDefaultMazeDraft, mazeDraftToCustomMap } from '../editor/maze/draft';
import { toCustomRuntimeId } from '../maps/custom/toRuntimeMap';
import { loadCustomMapStore, saveCustomMapStore, upsertCustomMap } from './customMaps';
import { getCustomAlgorithm, loadCustomAlgorithmStore, saveCustomAlgorithmStore, upsertCustomAlgorithm } from './customAlgorithms';
import { toVtlRuntimeId } from './customAlgorithmResolvers';
import type { CustomAlgorithm } from '../algorithms/custom/types';

function seedLineSession(mapId: string): void {
  localStorage.setItem(
    'vectortrack.v3',
    JSON.stringify({
      schemaVersion: 3,
      lastSession: { mode: 'line', mapId, robotId: 'lf-scout', algorithmId: 'pid' },
      tunedParams: {},
      bestRuns: {},
      completedMaps: [],
      settings: { viewMode: '2d', cameraPreset: 'iso', speedMultiplier: 1, showSensorOverlay: true },
    }),
  );
}

function saveAlgorithm(id: string, source: string, mode: 'line' | 'maze' = 'line'): void {
  const algorithm: CustomAlgorithm = { id, name: `Custom ${id}`, mode, source, createdAt: '2024-01-01', updatedAt: '2024-01-01', lastCompile: null };
  saveCustomAlgorithmStore(upsertCustomAlgorithm(loadCustomAlgorithmStore(), algorithm));
}

describe('running vtl: algorithms through useStore + engine', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('runs a saved line-mode vtl algorithm end to end, including a param literally named baseSpeed', async () => {
    const draft = createDefaultLineDraft('oval-1');
    saveCustomMapStore(upsertCustomMap(loadCustomMapStore(), lineDraftToCustomMap(draft)));
    const mapId = toCustomRuntimeId('oval-1');
    seedLineSession(mapId);

    // If `baseSpeed` were still stripped out of `params` before reaching a VTL controller (the
    // useStore.ts bug this test guards against), this program would always drive 0,0.
    saveAlgorithm(
      'bs1',
      `param baseSpeed = 300 range 50..800

on tick:
  drive(baseSpeed, baseSpeed)
`,
    );

    const { useStore } = await import('./useStore');
    useStore.getState().selectAlgorithm(toVtlRuntimeId('bs1'));
    expect(useStore.getState().params.baseSpeed).toBe(300);

    useStore.getState().play();
    for (let i = 0; i < 30; i++) useStore.getState().tick(1 / 60);

    const s = useStore.getState();
    expect(s.vtlError).toBeNull();
    expect(s.vLeft).toBeCloseTo(300, 0);
    expect(s.vRight).toBeCloseTo(300, 0);
    expect(Number.isFinite(s.pose.x)).toBe(true);
  });

  it('runs a saved maze-mode vtl algorithm end to end', async () => {
    const draft = createDefaultMazeDraft('maze-vtl-1', 6, 6);
    saveCustomMapStore(upsertCustomMap(loadCustomMapStore(), mazeDraftToCustomMap(draft)));
    const mapId = toCustomRuntimeId('maze-vtl-1');
    localStorage.setItem(
      'vectortrack.v3',
      JSON.stringify({
        schemaVersion: 3,
        lastSession: { mode: 'maze', mapId, robotId: 'mz-probe', algorithmId: 'wallFollower' },
        tunedParams: {},
        bestRuns: {},
        completedMaps: [],
        settings: { viewMode: '2d', cameraPreset: 'iso', speedMultiplier: 1, showSensorOverlay: true },
      }),
    );
    saveAlgorithm(
      'mz1',
      `on junction:
  if can_move(left):
    move_to(left)
  elif can_move(forward):
    move_to(forward)
  elif can_move(right):
    move_to(right)
  else:
    move_to(back)
`,
      'maze',
    );

    const { useStore } = await import('./useStore');
    useStore.getState().selectAlgorithm(toVtlRuntimeId('mz1'));
    useStore.getState().play();
    for (let i = 0; i < 60; i++) useStore.getState().tick(1 / 60);

    const s = useStore.getState();
    expect(s.vtlError).toBeNull();
    expect(s.mazeTelemetry).not.toBeNull();
    expect(Number.isFinite(s.pose.x)).toBe(true);
  });

  it('degrades to an inert, non-throwing controller with vtlError set when the saved source no longer compiles', async () => {
    const draft = createDefaultLineDraft('oval-2');
    saveCustomMapStore(upsertCustomMap(loadCustomMapStore(), lineDraftToCustomMap(draft)));
    const mapId = toCustomRuntimeId('oval-2');
    seedLineSession(mapId);
    saveAlgorithm('broken1', 'on tick:\n  this is not valid vtl\n');

    const { useStore } = await import('./useStore');
    expect(() => useStore.getState().selectAlgorithm(toVtlRuntimeId('broken1'))).not.toThrow();

    const s = useStore.getState();
    expect(s.vtlError).toMatch(/does not compile/);
    expect(s.vLeft).toBe(0);
    expect(s.vRight).toBe(0);
  });
});

describe('useStore.updateAlgorithmSource — Algorithms.md §3.2 live editing semantics', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('is a no-op returning ok:false with no errors when the current algorithm is a built-in', async () => {
    const draft = createDefaultLineDraft('oval-src-builtin');
    saveCustomMapStore(upsertCustomMap(loadCustomMapStore(), lineDraftToCustomMap(draft)));
    seedLineSession(toCustomRuntimeId('oval-src-builtin'));

    const { useStore } = await import('./useStore');
    const result = useStore.getState().updateAlgorithmSource('on tick:\n  drive(1, 1)\n');
    expect(result.ok).toBe(false);
  });

  it('a compiling edit hot-swaps the running controller immediately and persists the new source', async () => {
    const draft = createDefaultLineDraft('oval-src-ok');
    saveCustomMapStore(upsertCustomMap(loadCustomMapStore(), lineDraftToCustomMap(draft)));
    const mapId = toCustomRuntimeId('oval-src-ok');
    seedLineSession(mapId);
    saveAlgorithm('src1', 'on tick:\n  drive(100, 100)\n');

    const { useStore } = await import('./useStore');
    useStore.getState().selectAlgorithm(toVtlRuntimeId('src1'));
    useStore.getState().play();
    useStore.getState().step();
    expect(useStore.getState().vLeft).toBeCloseTo(100, 0);

    const result = useStore.getState().updateAlgorithmSource('on tick:\n  drive(222, 222)\n');
    expect(result.ok).toBe(true);

    useStore.getState().step();
    expect(useStore.getState().vLeft).toBeCloseTo(222, 0);

    const persisted = getCustomAlgorithm(loadCustomAlgorithmStore(), 'src1');
    expect(persisted?.source).toBe('on tick:\n  drive(222, 222)\n');
    expect(persisted?.lastCompile).toEqual({ ok: true, codes: [] });
  });

  it('a non-compiling edit leaves the persisted source and the running controller untouched, and reports errors', async () => {
    const draft = createDefaultLineDraft('oval-src-bad');
    saveCustomMapStore(upsertCustomMap(loadCustomMapStore(), lineDraftToCustomMap(draft)));
    const mapId = toCustomRuntimeId('oval-src-bad');
    seedLineSession(mapId);
    saveAlgorithm('src2', 'on tick:\n  drive(100, 100)\n');

    const { useStore } = await import('./useStore');
    useStore.getState().selectAlgorithm(toVtlRuntimeId('src2'));
    useStore.getState().play();
    useStore.getState().step();

    const result = useStore.getState().updateAlgorithmSource('on tick:\n  this is not valid vtl\n');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);

    useStore.getState().step();
    expect(useStore.getState().vLeft).toBeCloseTo(100, 0); // still the last-good program.
    expect(useStore.getState().vtlError).toBeNull();

    const persisted = getCustomAlgorithm(loadCustomAlgorithmStore(), 'src2');
    expect(persisted?.source).toBe('on tick:\n  drive(100, 100)\n'); // untouched.
  });

  it('rebuilds the param panel on a param-declaration change, keeping values whose name and range still match', async () => {
    const draft = createDefaultLineDraft('oval-src-params');
    saveCustomMapStore(upsertCustomMap(loadCustomMapStore(), lineDraftToCustomMap(draft)));
    const mapId = toCustomRuntimeId('oval-src-params');
    seedLineSession(mapId);
    saveAlgorithm(
      'src3',
      'param kept = 5 range 0..10\nparam dropped = 1 range 0..10\non tick:\n  drive(kept, kept)\n',
    );

    const { useStore } = await import('./useStore');
    useStore.getState().selectAlgorithm(toVtlRuntimeId('src3'));
    useStore.getState().setParam('kept', 7);
    useStore.getState().setParam('dropped', 3);
    expect(useStore.getState().params.kept).toBe(7);

    // "kept"'s range is unchanged (survives with its tuned value); "dropped" is gone; "fresh" is new.
    const result = useStore.getState().updateAlgorithmSource(
      'param kept = 5 range 0..10\nparam fresh = 9 range 0..20\non tick:\n  drive(kept, fresh)\n',
    );
    expect(result.ok).toBe(true);

    const params = useStore.getState().params;
    expect(params.kept).toBe(7); // preserved.
    expect(params.dropped).toBeUndefined(); // dropped.
    expect(params.fresh).toBe(9); // new, at its declared default.
  });
});
