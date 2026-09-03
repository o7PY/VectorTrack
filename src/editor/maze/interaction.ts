/**
 * Pure hit-testing and edit logic for the post-and-wall lattice editor
 * (v0.2.0 §14.4.2). Kept independent of React/canvas so the geometry and the
 * "first toggle in a drag sets add-vs-remove for the whole drag" rule are
 * unit-testable without a DOM.
 */
import { getHWall, getVWall, setHWall, setVWall } from '../../sim/maze/wallGrid';
import type { MazeWallGrid } from '../../sim/maze/wallGrid';

export interface SegmentHit {
  kind: 'h' | 'v';
  r: number;
  c: number;
  isBorder: boolean;
}

/** ~40% of a cell, perpendicular to the segment (v0.2.0 §14.4.2). */
const HIT_TOLERANCE_FRACTION = 0.4;

/** Finds the nearest wall segment to a point in mm, or null if nothing is within the click tolerance. */
export function hitTestSegment(rows: number, cols: number, cellSizeMm: number, xMm: number, yMm: number): SegmentHit | null {
  const fc = xMm / cellSizeMm;
  const fr = yMm / cellSizeMm;
  const tolerance = HIT_TOLERANCE_FRACTION;

  const rH = Math.round(fr);
  const cH = Math.min(cols - 1, Math.max(0, Math.floor(fc)));
  const hDist = Math.abs(fr - rH);
  const hCandidate: SegmentHit | null =
    rH >= 0 && rH <= rows && hDist <= tolerance ? { kind: 'h', r: rH, c: cH, isBorder: rH === 0 || rH === rows } : null;

  const cV = Math.round(fc);
  const rV = Math.min(rows - 1, Math.max(0, Math.floor(fr)));
  const vDist = Math.abs(fc - cV);
  const vCandidate: SegmentHit | null =
    cV >= 0 && cV <= cols && vDist <= tolerance ? { kind: 'v', r: rV, c: cV, isBorder: cV === 0 || cV === cols } : null;

  if (!hCandidate && !vCandidate) return null;
  if (hCandidate && !vCandidate) return hCandidate;
  if (!hCandidate && vCandidate) return vCandidate;
  return hDist <= vDist ? hCandidate : vCandidate;
}

export function getSegmentWall(grid: MazeWallGrid, hit: SegmentHit): boolean {
  return hit.kind === 'h' ? getHWall(grid, hit.r, hit.c) : getVWall(grid, hit.r, hit.c);
}

export type DragMode = 'add' | 'remove';

/** The first toggle in a drag decides add-vs-remove for the rest of the drag (v0.2.0 §14.4.2), so a drag across a mixed row doesn't flicker. */
export function startDragMode(grid: MazeWallGrid, hit: SegmentHit): DragMode {
  return getSegmentWall(grid, hit) ? 'remove' : 'add';
}

/** Mutates grid in place. Border segments are locked and ignore edits (v0.2.0 §14.4.2). */
export function applySegmentEdit(grid: MazeWallGrid, hit: SegmentHit, mode: DragMode): void {
  if (hit.isBorder) return;
  const present = mode === 'add';
  if (hit.kind === 'h') setHWall(grid, hit.r, hit.c, present);
  else setVWall(grid, hit.r, hit.c, present);
}

export function sameSegment(a: SegmentHit | null, b: SegmentHit | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.r === b.r && a.c === b.c;
}
