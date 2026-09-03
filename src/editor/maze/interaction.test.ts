import { describe, expect, it } from 'vitest';
import { createWallGrid, getHWall, getVWall } from '../../sim/maze/wallGrid';
import { applySegmentEdit, hitTestSegment, sameSegment, startDragMode } from './interaction';

const CELL = 180;

describe('hitTestSegment', () => {
  it('hits a horizontal segment near a row boundary, well clear of a column boundary', () => {
    // Row boundary r=1 is at y=180mm; midpoint of column 2 is x=2.5*180=450mm.
    const hit = hitTestSegment(4, 4, CELL, 450, 180);
    expect(hit).toEqual({ kind: 'h', r: 1, c: 2, isBorder: false });
  });

  it('hits a vertical segment near a column boundary, well clear of a row boundary', () => {
    // Column boundary c=2 is at x=360mm; midpoint of row 1 is y=1.5*180=270mm.
    const hit = hitTestSegment(4, 4, CELL, 360, 270);
    expect(hit).toEqual({ kind: 'v', r: 1, c: 2, isBorder: false });
  });

  it('flags the outer border segments as isBorder', () => {
    const top = hitTestSegment(4, 4, CELL, 90, 0);
    expect(top?.isBorder).toBe(true);
    const left = hitTestSegment(4, 4, CELL, 0, 90);
    expect(left?.isBorder).toBe(true);
  });

  it('returns null when the point is far from any segment (cell interior)', () => {
    // Dead center of a cell: fractional row/col = 0.5, both distances 0.5 > 0.4 tolerance.
    const hit = hitTestSegment(4, 4, CELL, 90, 90);
    expect(hit).toBeNull();
  });

  it('picks whichever candidate is perpendicularly closer near a post (corner)', () => {
    // Very close to a horizontal boundary, only marginally close to a vertical one.
    const hit = hitTestSegment(4, 4, CELL, 375, 182);
    expect(hit?.kind).toBe('h');
  });
});

describe('drag toggling', () => {
  it('the first toggle in a drag decides add vs remove, applied consistently to a mixed row', () => {
    const grid = createWallGrid(3, 3, false);
    const hitA = hitTestSegment(3, 3, CELL, 180, 90)!; // interior vertical segment, closed initially
    const mode = startDragMode(grid, hitA);
    expect(mode).toBe('add');

    applySegmentEdit(grid, hitA, mode);
    expect(getVWall(grid, hitA.r, hitA.c)).toBe(true);

    // A second, already-open segment gets the same "add" mode applied, even though its own current state differs.
    const hitB = hitTestSegment(3, 3, CELL, 360, 90)!;
    applySegmentEdit(grid, hitB, mode);
    expect(getVWall(grid, hitB.r, hitB.c)).toBe(true);
  });

  it('starting a drag on an already-present wall removes it for the whole drag', () => {
    const grid = createWallGrid(3, 3, true); // all walls present
    const hit = hitTestSegment(3, 3, CELL, 180, 90)!;
    const mode = startDragMode(grid, hit);
    expect(mode).toBe('remove');
    applySegmentEdit(grid, hit, mode);
    expect(getVWall(grid, hit.r, hit.c)).toBe(false);
  });

  it('border segments are locked and ignore edits', () => {
    const grid = createWallGrid(3, 3, false);
    const hit = hitTestSegment(3, 3, CELL, 0, 90)!; // left border
    expect(hit.isBorder).toBe(true);
    applySegmentEdit(grid, hit, 'add');
    expect(getVWall(grid, hit.r, hit.c)).toBe(false);
  });

  it('horizontal border toggling is also a no-op', () => {
    const grid = createWallGrid(3, 3, false);
    const hit = hitTestSegment(3, 3, CELL, 90, 0)!; // top border
    applySegmentEdit(grid, hit, 'add');
    expect(getHWall(grid, hit.r, hit.c)).toBe(false);
  });
});

describe('sameSegment', () => {
  it('treats two nulls as equal and a null/non-null pair as unequal', () => {
    expect(sameSegment(null, null)).toBe(true);
    expect(sameSegment(null, { kind: 'h', r: 0, c: 0, isBorder: true })).toBe(false);
  });

  it('compares by kind/r/c, ignoring isBorder', () => {
    const a = { kind: 'h' as const, r: 1, c: 2, isBorder: false };
    const b = { kind: 'h' as const, r: 1, c: 2, isBorder: true };
    expect(sameSegment(a, b)).toBe(true);
  });
});
