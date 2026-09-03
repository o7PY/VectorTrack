import { describe, expect, it } from 'vitest';
import { generatePerfectMaze, addRandomLoops } from '../../maps/maze/generator';
import { cellsToWallGrid, createWallGrid, getHWall, getVWall, setVWall, wallGridToCells } from './wallGrid';

describe('wallGrid', () => {
  it('round-trips a perfect maze through cells -> wallGrid -> cells', () => {
    const rows = 8;
    const cols = 8;
    const cells = generatePerfectMaze(rows, cols, 4242);
    const grid = cellsToWallGrid(cells, rows, cols);
    const back = wallGridToCells(grid);
    expect(back).toEqual(cells);
  });

  it('round-trips a maze with loops', () => {
    const rows = 16;
    const cols = 16;
    const cells = generatePerfectMaze(rows, cols, 57);
    addRandomLoops(cells, rows, cols, 27, 25);
    const grid = cellsToWallGrid(cells, rows, cols);
    const back = wallGridToCells(grid);
    expect(back).toEqual(cells);
  });

  it('stores a shared wall exactly once — toggling it affects both neighboring cells', () => {
    const grid = createWallGrid(4, 4, true);
    expect(getVWall(grid, 1, 2)).toBe(true);
    setVWall(grid, 1, 2, false);
    const cells = wallGridToCells(grid);
    expect(cells[1][1].E).toBe(false); // cell (1,1)'s east wall
    expect(cells[1][2].W).toBe(false); // cell (1,2)'s west wall — same physical wall
  });

  it('border walls occupy the outermost hWall/vWall rows and columns', () => {
    const grid = createWallGrid(3, 3, true);
    expect(getHWall(grid, 0, 0)).toBe(true); // top border
    expect(getHWall(grid, 3, 0)).toBe(true); // bottom border
    expect(getVWall(grid, 0, 0)).toBe(true); // left border
    expect(getVWall(grid, 0, 3)).toBe(true); // right border
  });

  it('an all-open grid produces cells with no walls at all', () => {
    const grid = createWallGrid(5, 5, false);
    const cells = wallGridToCells(grid);
    for (const row of cells) {
      for (const cell of row) {
        expect(cell).toEqual({ N: false, E: false, S: false, W: false });
      }
    }
  });
});
