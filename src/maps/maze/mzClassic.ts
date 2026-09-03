import type { MazeMap } from '../../sim/maze/grid';
import { addRandomLoops, generatePerfectMaze } from './generator';

const ROWS = 16;
const COLS = 16;

// A plain perfect maze is a spanning tree — exactly one path between any two
// cells, no real decision-making once you know the way. 25 extra randomly-
// opened walls turn it into a real labyrinth with loops, branches, and
// multiple valid routes to the goal, so wall-following has actual junctions
// to negotiate. The goal is a real 2x2 region (v0.2.0 gives every maze a
// MazeGoal region, not just a single cell) placed at the far bottom-right
// corner rather than dead center, so reaching it stays a genuine
// corner-to-corner traversal — see ISSUES.md #23/#24. Reverting to a literal
// center goal (as an earlier draft of the v0.2.0 spec assumed) would have
// silently undone that deliberate difficulty change.
const cells = generatePerfectMaze(ROWS, COLS, 57);
addRandomLoops(cells, ROWS, COLS, 27, 25);

export const mzClassic: MazeMap = {
  id: 'mz-classic',
  name: 'Classic 16',
  description: 'Micromouse-style, 2x2 goal region at the far corner, with looping shortcuts.',
  rows: ROWS,
  cols: COLS,
  cellSize: 180,
  wallThickness: 12,
  cells,
  start: { row: 0, col: 0 },
  goal: { row: ROWS - 2, col: COLS - 2, width: 2, height: 2 },
};
