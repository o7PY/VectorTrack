import type { MazeMap } from '../../sim/maze/grid';
import { generatePerfectMaze } from './generator';

const ROWS = 16;
const COLS = 16;

export const mzDense: MazeMap = {
  id: 'mz-dense',
  name: 'Dense Grid',
  description: 'Many junctions and dead ends.',
  rows: ROWS,
  cols: COLS,
  cellSize: 180,
  wallThickness: 12,
  cells: generatePerfectMaze(ROWS, COLS, 98),
  start: { row: 0, col: 0 },
  goal: { row: ROWS - 1, col: COLS - 1, width: 1, height: 1 },
};
