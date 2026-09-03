import { describe, expect, it } from 'vitest';
import type { MazeCellWalls } from './grid';
import { bfsDistances } from './grid';

function openGrid(rows: number, cols: number): MazeCellWalls[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      N: r === 0,
      S: r === rows - 1,
      W: c === 0,
      E: c === cols - 1,
    })),
  );
}

describe('bfsDistances', () => {
  it('distance to the source itself is zero', () => {
    const cells = openGrid(3, 3);
    const dist = bfsDistances(cells, 3, 3, [{ row: 0, col: 0 }]);
    expect(dist[0][0]).toBe(0);
  });

  it('a fully-open grid has Manhattan-ish shortest distances', () => {
    const cells = openGrid(3, 3);
    const dist = bfsDistances(cells, 3, 3, [{ row: 0, col: 0 }]);
    expect(dist[0][2]).toBe(2);
    expect(dist[2][2]).toBe(4);
  });

  it('a wall blocks the direct path, forcing a longer route', () => {
    const cells = openGrid(2, 2);
    // Wall between (0,0) and (0,1): only route from (0,0) to (0,1) is via (1,0)/(1,1).
    cells[0][0].E = true;
    cells[0][1].W = true;
    const dist = bfsDistances(cells, 2, 2, [{ row: 0, col: 0 }]);
    expect(dist[0][1]).toBe(3); // (0,0)->(1,0)->(1,1)->(0,1)
  });

  it('cells fully walled off from every source are Infinity', () => {
    const cells = openGrid(2, 2);
    cells[0][0].E = true;
    cells[1][0].E = true;
    cells[0][1].W = true;
    cells[1][1].W = true;
    const dist = bfsDistances(cells, 2, 2, [{ row: 0, col: 0 }]);
    expect(dist[0][1]).toBe(Infinity);
    expect(dist[1][1]).toBe(Infinity);
  });

  it('supports multiple sources seeded at distance zero simultaneously', () => {
    const cells = openGrid(1, 5);
    const dist = bfsDistances(cells, 1, 5, [
      { row: 0, col: 0 },
      { row: 0, col: 4 },
    ]);
    expect(dist[0][2]).toBe(2);
    expect(dist[0][0]).toBe(0);
    expect(dist[0][4]).toBe(0);
  });
});
