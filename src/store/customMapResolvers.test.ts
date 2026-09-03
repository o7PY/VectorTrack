// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultLineDraft, lineDraftToCustomMap } from '../editor/line/draft';
import { createDefaultMazeDraft, mazeDraftToCustomMap } from '../editor/maze/draft';
import { toCustomRuntimeId } from '../maps/custom/toRuntimeMap';
import { getCustomMap, loadCustomMapStore, saveCustomMapStore, upsertCustomMap } from './customMaps';
import { resolveCustomLineMap, resolveCustomMazeMap } from './customMapResolvers';

/**
 * These exercise the exact functions the renderers (Canvas2D, Scene3D,
 * Maze3D, LineTrack3D) and the sim engine call to turn a `custom:${id}` map
 * id into runnable data — the path that used to be bypassed (each renderer
 * called `getLineMap`/`getMazeMap` directly), which blanked the screen for
 * any custom map. Nothing outside this module should read a custom map any
 * other way.
 */
describe('resolveCustomMazeMap / resolveCustomLineMap', () => {
  beforeEach(() => localStorage.clear());

  it('resolves a saved custom maze map into a runnable MazeMap', () => {
    const draft = createDefaultMazeDraft('maze-1', 6, 6);
    saveCustomMapStore(upsertCustomMap(loadCustomMapStore(), mazeDraftToCustomMap(draft)));

    const resolved = resolveCustomMazeMap(toCustomRuntimeId('maze-1'));
    expect(resolved.rows).toBe(6);
    expect(resolved.cols).toBe(6);
    expect(resolved.cells.length).toBe(6);
  });

  it('resolves a saved custom line map into a runnable bitmap', () => {
    const draft = createDefaultLineDraft('line-1');
    saveCustomMapStore(upsertCustomMap(loadCustomMapStore(), lineDraftToCustomMap(draft)));

    const resolved = resolveCustomLineMap(toCustomRuntimeId('line-1'));
    expect(resolved.bitmap.width).toBeGreaterThan(0);
    expect(resolved.bitmap.height).toBeGreaterThan(0);
    expect(Array.from(resolved.bitmap.data).some((v) => v > 0)).toBe(true);
  });

  it('throws a clear error for an id that was never saved', () => {
    expect(() => resolveCustomMazeMap(toCustomRuntimeId('nope'))).toThrow(/Unknown custom maze map/);
    expect(() => resolveCustomLineMap(toCustomRuntimeId('nope'))).toThrow(/Unknown custom line map/);
  });

  it('throws rather than silently misreading a maze map resolved as line (or vice versa)', () => {
    const draft = createDefaultMazeDraft('mode-mismatch', 6, 6);
    saveCustomMapStore(upsertCustomMap(loadCustomMapStore(), mazeDraftToCustomMap(draft)));
    expect(() => resolveCustomLineMap(toCustomRuntimeId('mode-mismatch'))).toThrow();
    expect(getCustomMap(loadCustomMapStore(), 'mode-mismatch')?.mode).toBe('maze');
  });
});
