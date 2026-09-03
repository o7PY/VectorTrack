/**
 * Conversions between the in-editor maze draft (a real Uint8Array-backed
 * MazeWallGrid, easy to mutate) and the compact CustomMazeMap storage shape
 * (base64 bit-packed strings). Pure, no React — kept separate so the codec
 * round trip is unit-testable without mounting the editor.
 */
import { base64ToBits, bitsToBase64 } from '../../maps/custom/codec';
import type { CustomMazeMap } from '../../maps/custom/types';
import type { MazeGoal } from '../../sim/core/types';
import { createBorderOnlyWallGrid } from '../../sim/maze/wallGrid';
import type { MazeWallGrid } from '../../sim/maze/wallGrid';

export interface MazeDraft {
  id: string;
  name: string;
  rows: number;
  cols: number;
  cellSizeMm: number;
  wallThicknessMm: number;
  wallGrid: MazeWallGrid;
  start: { row: number; col: number; headingDeg: number };
  goal: MazeGoal;
  validationRobotId: string;
  createdAt: string;
}

export function createDefaultMazeDraft(id: string, rows = 12, cols = 12, cellSizeMm = 180): MazeDraft {
  return {
    id,
    name: 'New Maze',
    rows,
    cols,
    cellSizeMm,
    wallThicknessMm: 12,
    // Open interior, closed border — a brand-new maze must validate cleanly
    // (0 blocking issues) the moment it's created, or Save fails before the
    // author has touched anything.
    wallGrid: createBorderOnlyWallGrid(rows, cols),
    start: { row: rows - 1, col: 0, headingDeg: 270 },
    goal: { row: 0, col: cols - 1, width: 1, height: 1 },
    validationRobotId: 'mz-sprint',
    createdAt: new Date().toISOString(),
  };
}

export function mazeDraftToCustomMap(draft: MazeDraft): CustomMazeMap {
  return {
    id: draft.id,
    name: draft.name,
    mode: 'maze',
    createdAt: draft.createdAt,
    updatedAt: new Date().toISOString(),
    validationRobotId: draft.validationRobotId,
    lastValidation: null,
    rows: draft.rows,
    cols: draft.cols,
    cellSizeMm: draft.cellSizeMm,
    wallThicknessMm: draft.wallThicknessMm,
    hWalls: bitsToBase64(draft.wallGrid.hWalls),
    vWalls: bitsToBase64(draft.wallGrid.vWalls),
    start: draft.start,
    goal: draft.goal,
  };
}

export function customMapToMazeDraft(map: CustomMazeMap): MazeDraft {
  const hLength = (map.rows + 1) * map.cols;
  const vLength = map.rows * (map.cols + 1);
  return {
    id: map.id,
    name: map.name,
    rows: map.rows,
    cols: map.cols,
    cellSizeMm: map.cellSizeMm,
    wallThicknessMm: map.wallThicknessMm,
    wallGrid: {
      rows: map.rows,
      cols: map.cols,
      hWalls: base64ToBits(map.hWalls, hLength),
      vWalls: base64ToBits(map.vWalls, vLength),
    },
    start: map.start,
    goal: map.goal,
    validationRobotId: map.validationRobotId,
    createdAt: map.createdAt,
  };
}
