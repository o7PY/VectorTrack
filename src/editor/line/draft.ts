/**
 * Conversions between the in-editor line draft (a real Uint8Array paint
 * grid, easy to mutate) and the compact CustomLineMap storage shape
 * (base64 bit-packed string) — mirrors editor/maze/draft.ts.
 */
import { base64ToBits, bitsToBase64 } from '../../maps/custom/codec';
import type { CustomLineMap } from '../../maps/custom/types';
import { paintEllipseOutline } from './paint';

export interface LineDraft {
  id: string;
  name: string;
  cols: number;
  rows: number;
  cellSizeMm: number;
  bits: Uint8Array;
  start: { xMm: number; yMm: number; headingDeg: number } | null;
  validationRobotId: string;
  createdAt: string;
}

const DEFAULT_TRACK_WIDTH_CELLS = 3;

/**
 * Seeds a fresh draft with an already-valid oval loop (rather than a blank
 * canvas) for the same reason the maze editor's default is a fully-open
 * interior, not fully-walled: a brand-new map should pass LF001/LF002/LF003
 * immediately, before the author has touched anything.
 */
export function createDefaultLineDraft(id: string, cols = 28, rows = 18, cellSizeMm = 20): LineDraft {
  const bits = new Uint8Array(cols * rows);
  const grid = { cols, rows, bits };
  const marginCells = 3;
  const r0 = marginCells;
  const c0 = marginCells;
  const r1 = rows - 1 - marginCells;
  const c1 = cols - 1 - marginCells;
  paintEllipseOutline(grid, r0, c0, r1, c1, DEFAULT_TRACK_WIDTH_CELLS, 1);

  const startCol = Math.round((c0 + c1) / 2);
  const startRow = r1;
  return {
    id,
    name: 'New Line Track',
    cols,
    rows,
    cellSizeMm,
    bits,
    start: { xMm: (startCol + 0.5) * cellSizeMm, yMm: (startRow + 0.5) * cellSizeMm, headingDeg: 0 },
    validationRobotId: 'lf-scout',
    createdAt: new Date().toISOString(),
  };
}

export function lineDraftToCustomMap(draft: LineDraft): CustomLineMap {
  return {
    id: draft.id,
    name: draft.name,
    mode: 'line',
    createdAt: draft.createdAt,
    updatedAt: new Date().toISOString(),
    validationRobotId: draft.validationRobotId,
    lastValidation: null,
    cols: draft.cols,
    rows: draft.rows,
    cellSizeMm: draft.cellSizeMm,
    bits: bitsToBase64(draft.bits),
    start: draft.start ?? { xMm: 0, yMm: 0, headingDeg: 0 },
  };
}

export function customMapToLineDraft(map: CustomLineMap): LineDraft {
  return {
    id: map.id,
    name: map.name,
    cols: map.cols,
    rows: map.rows,
    cellSizeMm: map.cellSizeMm,
    bits: base64ToBits(map.bits, map.cols * map.rows),
    start: map.start,
    validationRobotId: map.validationRobotId,
    createdAt: map.createdAt,
  };
}
