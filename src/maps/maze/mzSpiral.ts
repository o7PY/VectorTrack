import type { MazeMap } from '../../sim/maze/grid';
import { generateSpiralMaze } from './generator';

const ROWS = 10;
const COLS = 10;
const { cells, start, goal } = generateSpiralMaze(ROWS, COLS);

export const mzSpiral: MazeMap = {
  id: 'mz-spiral',
  name: 'Spiral',
  description: 'Single long spiral path to center.',
  rows: ROWS,
  cols: COLS,
  cellSize: 180,
  wallThickness: 12,
  cells,
  start,
  goal,
};
