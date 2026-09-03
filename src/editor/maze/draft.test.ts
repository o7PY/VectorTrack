import { describe, expect, it } from 'vitest';
import { getHWall, getVWall, setVWall, wallGridToCells } from '../../sim/maze/wallGrid';
import { validateMazePhysical, validateMazeStatic } from '../validation/mazeRules';
import { createDefaultMazeDraft, customMapToMazeDraft, mazeDraftToCustomMap } from './draft';

describe('maze draft <-> CustomMazeMap round trip', () => {
  it('round-trips a default draft byte-for-byte through the storage encoding', () => {
    const draft = createDefaultMazeDraft('custom-1', 8, 10);
    const stored = mazeDraftToCustomMap(draft);
    const restored = customMapToMazeDraft(stored);

    expect(restored.rows).toBe(draft.rows);
    expect(restored.cols).toBe(draft.cols);
    expect(restored.cellSizeMm).toBe(draft.cellSizeMm);
    expect(restored.start).toEqual(draft.start);
    expect(restored.goal).toEqual(draft.goal);
    expect(Array.from(restored.wallGrid.hWalls)).toEqual(Array.from(draft.wallGrid.hWalls));
    expect(Array.from(restored.wallGrid.vWalls)).toEqual(Array.from(draft.wallGrid.vWalls));
  });

  it('round-trips an edited wall grid (not just the all-walls default)', () => {
    const draft = createDefaultMazeDraft('custom-2', 5, 5);
    setVWall(draft.wallGrid, 2, 2, false);
    setVWall(draft.wallGrid, 0, 3, false);

    const restored = customMapToMazeDraft(mazeDraftToCustomMap(draft));
    expect(getVWall(restored.wallGrid, 2, 2)).toBe(false);
    expect(getVWall(restored.wallGrid, 0, 3)).toBe(false);
    expect(getHWall(restored.wallGrid, 0, 0)).toBe(true); // untouched border wall survives
  });

  it('the storage envelope round-trips through JSON (as it would via localStorage)', () => {
    const draft = createDefaultMazeDraft('custom-3', 6, 6);
    const stored = mazeDraftToCustomMap(draft);
    const json = JSON.parse(JSON.stringify(stored));
    const restored = customMapToMazeDraft(json);
    expect(Array.from(restored.wallGrid.hWalls)).toEqual(Array.from(draft.wallGrid.hWalls));
  });

  it('a brand-new default draft has no blocking (error) validation issues, so Save works immediately', () => {
    const draft = createDefaultMazeDraft('custom-fresh', 12, 12);
    const issues = [
      ...validateMazeStatic({
        rows: draft.rows,
        cols: draft.cols,
        cellSizeMm: draft.cellSizeMm,
        wallThicknessMm: draft.wallThicknessMm,
        cells: wallGridToCells(draft.wallGrid),
        start: draft.start,
        goal: draft.goal,
      }),
      ...validateMazePhysical(draft.cellSizeMm, draft.wallThicknessMm, { chassisWidthMm: 70, sensorRangeMm: 150 }),
    ];
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});
