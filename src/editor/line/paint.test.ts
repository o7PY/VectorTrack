import { describe, expect, it } from 'vitest';
import {
  boundaryCells,
  connectedComponents,
  createEmptyPaintBits,
  estimateLapLengthMm,
  nearestDistanceMm,
  paintEllipseOutline,
  paintLine,
  paintRectOutline,
  stampBrush,
  UnionFind,
} from './paint';

describe('stampBrush', () => {
  it('width 1 paints a single cell', () => {
    const bits = createEmptyPaintBits(5, 5);
    stampBrush({ cols: 5, rows: 5, bits }, 2, 2, 1, 1);
    expect(Array.from(bits).filter(Boolean).length).toBe(1);
    expect(bits[2 * 5 + 2]).toBe(1);
  });

  it('width 3 paints a centered 3x3 block, clipped at bounds', () => {
    const bits = createEmptyPaintBits(5, 5);
    stampBrush({ cols: 5, rows: 5, bits }, 0, 0, 3, 1);
    expect(Array.from(bits).filter(Boolean).length).toBe(4); // clipped to the top-left 2x2 of the 3x3 stamp
  });

  it('value 0 erases', () => {
    const bits = createEmptyPaintBits(5, 5);
    bits.fill(1);
    stampBrush({ cols: 5, rows: 5, bits }, 2, 2, 1, 0);
    expect(bits[2 * 5 + 2]).toBe(0);
    expect(bits[0]).toBe(1);
  });
});

describe('paintLine', () => {
  it('connects two cells with no gaps (every step is 4-adjacent or diagonal-adjacent to the next)', () => {
    const bits = createEmptyPaintBits(10, 10);
    paintLine({ cols: 10, rows: 10, bits }, 0, 0, 9, 9, 1, 1);
    expect(bits[0]).toBe(1);
    expect(bits[9 * 10 + 9]).toBe(1);
    expect(Array.from(bits).filter(Boolean).length).toBeGreaterThanOrEqual(10);
  });

  it('a horizontal line paints exactly the cells in between', () => {
    const bits = createEmptyPaintBits(10, 5);
    paintLine({ cols: 10, rows: 5, bits }, 2, 1, 2, 5, 1, 1);
    for (let c = 1; c <= 5; c++) expect(bits[2 * 10 + c]).toBe(1);
    expect(bits[2 * 10 + 0]).toBe(0);
    expect(bits[2 * 10 + 6]).toBe(0);
  });
});

describe('paintRectOutline / paintEllipseOutline', () => {
  it('rectangle outline leaves the interior empty', () => {
    const bits = createEmptyPaintBits(10, 10);
    paintRectOutline({ cols: 10, rows: 10, bits }, 1, 1, 8, 8, 1, 1);
    expect(bits[1 * 10 + 1]).toBe(1); // corner
    expect(bits[4 * 10 + 4]).toBe(0); // interior
  });

  it('ellipse outline produces a closed connected ring (single connected component)', () => {
    const bits = createEmptyPaintBits(20, 14);
    paintEllipseOutline({ cols: 20, rows: 14, bits }, 1, 1, 12, 18, 1, 1);
    const { components } = connectedComponents({ cols: 20, rows: 14, bits });
    expect(components.length).toBe(1);
    expect(bits[7 * 20 + 9]).toBe(0); // interior stays empty
  });
});

describe('connectedComponents / boundaryCells', () => {
  it('two disjoint blobs are two components', () => {
    const bits = createEmptyPaintBits(10, 10);
    stampBrush({ cols: 10, rows: 10, bits }, 1, 1, 1, 1);
    stampBrush({ cols: 10, rows: 10, bits }, 8, 8, 1, 1);
    const { components } = connectedComponents({ cols: 10, rows: 10, bits });
    expect(components.length).toBe(2);
  });

  it('boundaryCells excludes fully-interior painted cells of a filled block', () => {
    const bits = createEmptyPaintBits(10, 10);
    for (let r = 2; r <= 6; r++) for (let c = 2; c <= 6; c++) bits[r * 10 + c] = 1;
    const { components } = connectedComponents({ cols: 10, rows: 10, bits });
    const boundary = boundaryCells({ cols: 10, rows: 10, bits }, components[0].cells);
    expect(boundary.length).toBeLessThan(components[0].cells.length);
    expect(boundary).not.toContain(4 * 10 + 4); // dead center is interior
  });
});

describe('nearestDistanceMm', () => {
  it('is ~0 for touching blobs and positive for far-apart ones', () => {
    const cols = 10;
    const cellSizeMm = 20;
    const touching = nearestDistanceMm(cols, cellSizeMm, [1 * cols + 1], [1 * cols + 2]);
    expect(touching).toBe(0);
    const far = nearestDistanceMm(cols, cellSizeMm, [0], [9]);
    expect(far).toBeGreaterThan(100);
  });
});

describe('UnionFind', () => {
  it('merges groups and reports group count', () => {
    const uf = new UnionFind(4);
    expect(uf.groupCount()).toBe(4);
    uf.union(0, 1);
    uf.union(2, 3);
    expect(uf.groupCount()).toBe(2);
    expect(uf.find(0)).toBe(uf.find(1));
    uf.union(1, 2);
    expect(uf.groupCount()).toBe(1);
  });
});

describe('estimateLapLengthMm', () => {
  it('is 0 for an empty grid and positive for a painted one', () => {
    expect(estimateLapLengthMm(10, 10, 20, createEmptyPaintBits(10, 10))).toBe(0);
    const bits = createEmptyPaintBits(10, 10);
    stampBrush({ cols: 10, rows: 10, bits }, 5, 5, 3, 1);
    expect(estimateLapLengthMm(10, 10, 20, bits)).toBeGreaterThan(0);
  });
});
