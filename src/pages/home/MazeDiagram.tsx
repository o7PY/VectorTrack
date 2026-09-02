import { mzIntro } from '../../maps/maze/mzIntro';
import { bfsDistances } from '../../maps/maze/generator';
import { buildWallSegments } from '../../sim/maze/grid';
import type { Cell } from '../../sim/core/types';
import type { MazeCellWalls } from '../../sim/maze/grid';

// A real diagram: mz-intro's actual generated wall layout, with its actual
// shortest path (the same BFS flood fill's planner uses) — not a hand-drawn
// mockup.
const CELL = 40;
const scale = CELL / mzIntro.cellSize;

const DIRS: { dr: number; dc: number; w: keyof MazeCellWalls }[] = [
  { dr: -1, dc: 0, w: 'N' },
  { dr: 0, dc: 1, w: 'E' },
  { dr: 1, dc: 0, w: 'S' },
  { dr: 0, dc: -1, w: 'W' },
];

function computeSolutionPath(): Cell[] {
  const { cells, rows, cols, start, goal } = mzIntro;
  const dist = bfsDistances(cells, rows, cols, goal.row, goal.col);
  const path: Cell[] = [start];
  let cur = start;
  let guard = rows * cols + 2;
  while ((cur.row !== goal.row || cur.col !== goal.col) && guard-- > 0) {
    let best: Cell | null = null;
    let bestDist = Infinity;
    for (const d of DIRS) {
      if (cells[cur.row][cur.col][d.w]) continue;
      const nr = cur.row + d.dr;
      const nc = cur.col + d.dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (dist[nr][nc] < bestDist) {
        bestDist = dist[nr][nc];
        best = { row: nr, col: nc };
      }
    }
    if (!best) break;
    cur = best;
    path.push(cur);
  }
  return path;
}

const segments = buildWallSegments(mzIntro).map((s) => ({
  x1: s.x1 * scale,
  y1: s.y1 * scale,
  x2: s.x2 * scale,
  y2: s.y2 * scale,
}));
const solutionPath = computeSolutionPath();
const pathPoints = solutionPath.map((c) => `${(c.col + 0.5) * CELL},${(c.row + 0.5) * CELL}`).join(' ');

export function MazeDiagram() {
  const w = CELL * mzIntro.cols;
  const h = CELL * mzIntro.rows;
  return (
    <svg viewBox={`-10 -10 ${w + 20} ${h + 20}`} className="h-full w-full" role="img" aria-label={`Diagram of the ${mzIntro.name} maze with its real shortest solution path`}>
      <polyline points={pathPoints} fill="none" stroke="#f472b6" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
      {segments.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#71717a" strokeWidth="5" strokeLinecap="round" />
      ))}
      <circle cx={(mzIntro.start.col + 0.5) * CELL} cy={(mzIntro.start.row + 0.5) * CELL} r="7" fill="#22c55e" />
      <circle cx={(mzIntro.goal.col + 0.5) * CELL} cy={(mzIntro.goal.row + 0.5) * CELL} r="7" fill="#f59e0b" />
    </svg>
  );
}
