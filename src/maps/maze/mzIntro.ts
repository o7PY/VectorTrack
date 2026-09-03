import type { MazeMap } from '../../sim/maze/grid';
import { generatePerfectMaze } from './generator';

const ROWS = 8;
const COLS = 8;

export const mzIntro: MazeMap = {
  id: 'mz-intro',
  name: 'First Steps',
  description: 'Sparse walls, wall-follower solves easily.',
  rows: ROWS,
  cols: COLS,
  cellSize: 180,
  wallThickness: 12,
  cells: generatePerfectMaze(ROWS, COLS, 4242),
  start: { row: 0, col: 0 },
  goal: { row: ROWS - 1, col: COLS - 1, width: 1, height: 1 },
};
