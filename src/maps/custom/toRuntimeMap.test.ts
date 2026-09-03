import { describe, expect, it } from 'vitest';
import { mazeDraftToCustomMap, createDefaultMazeDraft } from '../../editor/maze/draft';
import { createDefaultLineDraft, lineDraftToCustomMap } from '../../editor/line/draft';
import { isCustomRuntimeId, toBareCustomId, toCustomRuntimeId, toRuntimeLineMap, toRuntimeMazeMap } from './toRuntimeMap';

describe('custom map id prefixing', () => {
  it('round-trips bare <-> runtime ids and identifies custom ids', () => {
    const runtimeId = toCustomRuntimeId('abc-123');
    expect(runtimeId).toBe('custom:abc-123');
    expect(isCustomRuntimeId(runtimeId)).toBe(true);
    expect(isCustomRuntimeId('mz-intro')).toBe(false);
    expect(toBareCustomId(runtimeId)).toBe('abc-123');
  });
});

describe('toRuntimeMazeMap', () => {
  it('converts a CustomMazeMap into a MazeMap the sim can run', () => {
    const draft = createDefaultMazeDraft('abc', 6, 6);
    const custom = mazeDraftToCustomMap(draft);
    const runtime = toRuntimeMazeMap(custom);
    expect(runtime.id).toBe('custom:abc');
    expect(runtime.rows).toBe(6);
    expect(runtime.cols).toBe(6);
    expect(runtime.cells.length).toBe(6);
    expect(runtime.start).toEqual({ row: draft.start.row, col: draft.start.col });
    expect(runtime.goal).toEqual(draft.goal);
  });
});

describe('toRuntimeLineMap', () => {
  it('converts a CustomLineMap into a bitmap + startPose the sim can run', () => {
    const draft = createDefaultLineDraft('xyz');
    const custom = lineDraftToCustomMap(draft);
    const runtime = toRuntimeLineMap(custom);
    expect(runtime.bitmap.width).toBe(draft.cols * draft.cellSizeMm);
    expect(runtime.bitmap.height).toBe(draft.rows * draft.cellSizeMm);
    expect(runtime.bitmap.mmPerPixel).toBe(1);
    expect(runtime.startPose.x).toBe(draft.start!.xMm);
    expect(runtime.startPose.y).toBe(draft.start!.yMm);
    expect(runtime.pathLengthMm).toBeGreaterThan(0);
    // The bitmap should have some line pixels (the seeded oval track), not be blank.
    expect(Array.from(runtime.bitmap.data).some((v) => v > 0)).toBe(true);
  });
});
