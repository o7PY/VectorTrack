import { describe, expect, it } from 'vitest';
import type { MazeCellWalls } from '../../sim/maze/grid';
import type { MazeValidationInput } from './mazeRules';
import { validateMazePhysical, validateMazeStatic } from './mazeRules';

function wallsAllClosed(): MazeCellWalls {
  return { N: true, E: true, S: true, W: true };
}

/** A rows x cols grid that is a perfect (single-route) spanning-tree maze: every cell connects only to the cell after it in row-major order. */
function perfectMazeGrid(rows: number, cols: number): MazeCellWalls[][] {
  const cells: MazeCellWalls[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => wallsAllClosed()),
  );
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols) {
        cells[r][c].E = false;
        cells[r][c + 1].W = false;
      } else if (r + 1 < rows) {
        cells[r][c].S = false;
        cells[r + 1][c].N = false;
      }
    }
  }
  return cells;
}

function fullyOpenGrid(rows: number, cols: number): MazeCellWalls[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      N: r === 0,
      S: r === rows - 1,
      W: c === 0,
      E: c === cols - 1,
    })),
  );
}

function baseInput(cells: MazeCellWalls[][], rows: number, cols: number): MazeValidationInput {
  return {
    rows,
    cols,
    cellSizeMm: 180,
    wallThicknessMm: 12,
    cells,
    start: { row: 0, col: 0 },
    goal: { row: rows - 1, col: cols - 1, width: 1, height: 1 },
  };
}

describe('validateMazeStatic', () => {
  it('a valid, fully-solvable perfect maze reports only the MZ005 info note', () => {
    const cells = perfectMazeGrid(4, 4);
    const issues = validateMazeStatic(baseInput(cells, 4, 4));
    const codes = issues.map((i) => i.code);
    expect(codes).toEqual(['MZ005']);
  });

  it('MZ001: start inside the goal region', () => {
    const cells = perfectMazeGrid(4, 4);
    const input = baseInput(cells, 4, 4);
    input.goal = { row: 0, col: 0, width: 1, height: 1 };
    const issues = validateMazeStatic(input);
    expect(issues.some((i) => i.code === 'MZ001')).toBe(true);
  });

  it('MZ002: goal is unreachable from start', () => {
    const cells = perfectMazeGrid(3, 3);
    // Goal (2,2) is a corner with only two possible neighbors, (1,2) and
    // (2,1) — sealing both of those edges (from the neighbor's side, which
    // is what bfsDistances actually checks) isolates it completely.
    cells[1][2].S = true;
    cells[2][1].E = true;
    const input = baseInput(cells, 3, 3);
    const issues = validateMazeStatic(input);
    expect(issues.some((i) => i.code === 'MZ002')).toBe(true);
  });

  it('MZ003: start cell fully enclosed by four walls', () => {
    const cells = perfectMazeGrid(3, 3);
    cells[0][0] = wallsAllClosed();
    const issues = validateMazeStatic(baseInput(cells, 3, 3));
    expect(issues.some((i) => i.code === 'MZ003')).toBe(true);
  });

  it('MZ004: a region of 4+ cells is unreachable from start', () => {
    const cells = fullyOpenGrid(4, 4);
    // Wall off the bottom-right 2x2 block entirely from the rest of the grid.
    cells[2][2].N = true;
    cells[1][2].S = true;
    cells[2][3].N = true;
    cells[1][3].S = true;
    cells[2][2].W = true;
    cells[2][1].E = true;
    cells[3][2].W = true;
    cells[3][1].E = true;
    const input = baseInput(cells, 4, 4);
    input.goal = { row: 0, col: 3, width: 1, height: 1 };
    const issues = validateMazeStatic(input);
    const mz004 = issues.find((i) => i.code === 'MZ004');
    expect(mz004).toBeDefined();
    expect(mz004?.cells?.length).toBe(4);
  });

  it('MZ005: an info note fires when the maze has no loops (a perfect maze)', () => {
    const cells = perfectMazeGrid(4, 4);
    const issues = validateMazeStatic(baseInput(cells, 4, 4));
    expect(issues.some((i) => i.code === 'MZ005')).toBe(true);
  });

  it('MZ005 does not fire when the maze has a loop', () => {
    const cells = fullyOpenGrid(3, 3);
    const issues = validateMazeStatic(baseInput(cells, 3, 3));
    expect(issues.some((i) => i.code === 'MZ005')).toBe(false);
  });

  // Only MZ001/MZ002 (and MZP01, in validateMazePhysical below) block Save —
  // everything else is real signal but shouldn't stop an otherwise-runnable
  // map from being saved. See MapMaker.md "only the crucial rules block save".
  it('MZ001 and MZ002 are the only blocking (error) static rules', () => {
    const cells = perfectMazeGrid(4, 4);
    const trivialGoalInput = baseInput(cells, 4, 4);
    trivialGoalInput.goal = { row: 0, col: 0, width: 1, height: 1 };
    expect(validateMazeStatic(trivialGoalInput).find((i) => i.code === 'MZ001')?.severity).toBe('error');

    const unreachableCells = perfectMazeGrid(3, 3);
    unreachableCells[1][2].S = true;
    unreachableCells[2][1].E = true;
    expect(validateMazeStatic(baseInput(unreachableCells, 3, 3)).find((i) => i.code === 'MZ002')?.severity).toBe('error');
  });

  it('MZ003 is downgraded to a warning — it never blocks Save on its own', () => {
    const enclosedCells = perfectMazeGrid(3, 3);
    enclosedCells[0][0] = wallsAllClosed();
    expect(validateMazeStatic(baseInput(enclosedCells, 3, 3)).find((i) => i.code === 'MZ003')?.severity).toBe('warning');
  });
});

describe('validateMazePhysical', () => {
  it('passes cleanly at the default 180mm cell / 12mm wall for both stock robots', () => {
    expect(validateMazePhysical(180, 12, { chassisWidthMm: 90, sensorRangeMm: 400 })).toEqual([]);
    expect(validateMazePhysical(180, 12, { chassisWidthMm: 70, sensorRangeMm: 400 })).toEqual([]);
  });

  it('MZP01: robot cannot physically enter the corridor', () => {
    const issues = validateMazePhysical(100, 12, { chassisWidthMm: 200, sensorRangeMm: 400 });
    expect(issues.some((i) => i.code === 'MZP01')).toBe(true);
  });

  it('MZP02: corridor passable but no room to turn around in a dead end', () => {
    // corridorWidth = 100, chassisWidth = 85 -> turnClearance = 15 (< 20)
    const issues = validateMazePhysical(112, 12, { chassisWidthMm: 85, sensorRangeMm: 400 });
    expect(issues.some((i) => i.code === 'MZP02')).toBe(true);
  });

  it('MZP03: tight but workable turn clearance', () => {
    // corridorWidth = 168, chassisWidth = 120 -> turnClearance = 48 (20-60 range)
    const issues = validateMazePhysical(180, 12, { chassisWidthMm: 120, sensorRangeMm: 400 });
    expect(issues.some((i) => i.code === 'MZP03')).toBe(true);
  });

  it('MZP04: sensor range shorter than cell size', () => {
    const issues = validateMazePhysical(180, 12, { chassisWidthMm: 70, sensorRangeMm: 150 });
    expect(issues.some((i) => i.code === 'MZP04')).toBe(true);
  });

  it('only MZP01 blocks Save — MZP02/MZP04 are warnings', () => {
    expect(validateMazePhysical(100, 12, { chassisWidthMm: 200, sensorRangeMm: 400 })[0].severity).toBe('error');
    expect(validateMazePhysical(112, 12, { chassisWidthMm: 85, sensorRangeMm: 400 }).find((i) => i.code === 'MZP02')?.severity).toBe('warning');
    expect(validateMazePhysical(180, 12, { chassisWidthMm: 70, sensorRangeMm: 150 }).find((i) => i.code === 'MZP04')?.severity).toBe('warning');
  });
});
