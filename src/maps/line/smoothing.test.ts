import { describe, expect, it } from 'vitest';
import type { LinePaintGrid } from './smoothing';
import { gaussianBlur, smoothLinePaintGrid, thresholdBinary, upsampleNearestNeighbor } from './smoothing';

function makeGrid(cols: number, rows: number, cellSizeMm: number, on: [number, number][]): LinePaintGrid {
  const bits = new Uint8Array(cols * rows);
  for (const [r, c] of on) bits[r * cols + c] = 1;
  return { cols, rows, cellSizeMm, bits };
}

describe('upsampleNearestNeighbor', () => {
  it('replicates each cell into a cellSizeMm x cellSizeMm block of 1mm pixels', () => {
    const grid = makeGrid(3, 3, 20, [[1, 1]]);
    const bmp = upsampleNearestNeighbor(grid);
    expect(bmp.width).toBe(60);
    expect(bmp.height).toBe(60);
    // center cell (1,1) spans x,y in [20,40)
    expect(bmp.data[25 * 60 + 25]).toBe(1);
    // top-left cell (0,0) is off
    expect(bmp.data[5 * 60 + 5]).toBe(0);
  });
});

describe('gaussianBlur + thresholdBinary', () => {
  it('a lone painted cell survives blur+threshold as a smaller-but-present blob at its center', () => {
    const grid = makeGrid(5, 5, 20, [[2, 2]]);
    const bmp = upsampleNearestNeighbor(grid);
    const blurred = gaussianBlur(bmp, 6);
    const result = thresholdBinary(blurred, bmp.width, bmp.height, 0.5);
    // center of cell (2,2): x,y in [40,60), midpoint (50,50)
    expect(result.data[50 * bmp.width + 50]).toBe(1);
    // far corner, cell (0,0) midpoint (10,10), should not have bled all the way there
    expect(result.data[10 * bmp.width + 10]).toBe(0);
  });

  it('smooths a blocky staircase edge — the blurred bitmap has intermediate intensities at the boundary', () => {
    const cols = 4;
    const rows = 4;
    // A blocky diagonal "staircase" line.
    const grid = makeGrid(cols, rows, 20, [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    const bmp = upsampleNearestNeighbor(grid);
    const blurred = gaussianBlur(bmp, 6);
    // Somewhere along the boundary between an "on" and "off" cell the intensity should be
    // strictly between 0 and 1 — a pure copy (no blur) would only ever have exact 0/1 values.
    const hasIntermediate = Array.from(blurred).some((v) => v > 0.01 && v < 0.99);
    expect(hasIntermediate).toBe(true);
  });
});

describe('smoothLinePaintGrid', () => {
  it('runs the full pipeline and returns a binary bitmap the size of the upsampled grid', () => {
    const grid = makeGrid(10, 10, 20, [
      [5, 4],
      [5, 5],
      [5, 6],
    ]);
    const result = smoothLinePaintGrid(grid);
    expect(result.width).toBe(200);
    expect(result.height).toBe(200);
    for (const v of result.data) expect(v === 0 || v === 1).toBe(true);
  });
});
