import type { MazeMap } from '../../sim/maze/grid';
import { addRandomLoops, generatePerfectMaze } from './generator';

const ROWS = 16;
const COLS = 16;

// A plain perfect maze is a spanning tree — exactly one path between any two
// cells, no real decision-making once you know the way. 25 extra randomly-
// opened walls turn it into a real labyrinth with loops, branches, and
// multiple valid routes to the goal, so wall-following has actual junctions
// to negotiate. The goal sits at the far bottom-right corner (diagonally
// opposite start) rather than dead center, so reaching it is a genuine
// corner-to-corner traversal, not a short hop to the middle — see
// ISSUES.md #23/#24.
const cells = generatePerfectMaze(ROWS, COLS, 57);
addRandomLoops(cells, ROWS, COLS, 27, 25);

export const mzClassic: MazeMap = {
  id: 'mz-classic',
  name: 'Classic 16',
  description: 'Micromouse-style, goal at the far corner, with looping shortcuts.',
  rows: ROWS,
  cols: COLS,
  cellSize: 180,
  wallThickness: 12,
  cells,
  start: { row: 0, col: 0 },
  goal: { row: ROWS - 1, col: COLS - 1 },
};
