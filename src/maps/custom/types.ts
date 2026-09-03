/**
 * Data model for user-authored maps (the Map Maker feature, v0.2.0 §8/§9).
 * These are the *stored* shapes — compact, source-only data (paint grids /
 * wall grids as bit-packed base64), never the derived bitmaps or renders.
 * See maps/custom/codec.ts for the bit-packing and maps/custom/toRuntimeMap.ts
 * (not yet written) for turning these into the LineMapDef/MazeMap shapes the
 * sim already consumes.
 */

export interface ValidationTrial {
  robotId: string;
  algorithmId: string;
  params: Record<string, number | string>;
  completed: boolean;
  timeMs: number | null;
  failureReason: 'lost-line' | 'collision' | 'timeout' | null;
}

export interface ValidationSummary {
  ranAt: string; // ISO timestamp
  trials: ValidationTrial[];
  errors: string[]; // hard rule codes (e.g. 'MZ003') that blocked save, if any
  warnings: string[]; // soft rule codes (e.g. 'LF010')
}

export interface CustomMapBase {
  id: string; // bare id, e.g. `custom-<uuid>`; runtime map id is `custom:${id}`
  name: string; // user-supplied, 1-48 chars, need not be unique
  createdAt: string; // ISO
  updatedAt: string; // ISO
  validationRobotId: string;
  lastValidation: ValidationSummary | null;
}

export interface CustomLineMap extends CustomMapBase {
  mode: 'line';
  cols: number;
  rows: number;
  cellSizeMm: number;
  bits: string; // base64 of bit-packed paint grid, row-major, length cols*rows bits
  start: { xMm: number; yMm: number; headingDeg: number };
}

export interface CustomMazeMap extends CustomMapBase {
  mode: 'maze';
  rows: number;
  cols: number;
  cellSizeMm: number;
  wallThicknessMm: number;
  hWalls: string; // base64 bit-packed, (rows+1)*cols bits
  vWalls: string; // base64 bit-packed, rows*(cols+1) bits
  start: { row: number; col: number; headingDeg: number };
  goal: { row: number; col: number; width: 1 | 2; height: 1 | 2 };
}

export type CustomMap = CustomLineMap | CustomMazeMap;

export interface CustomMapStore {
  schemaVersion: 1;
  maps: Record<string, CustomMap>;
}

export const CUSTOM_MAPS_STORAGE_KEY = 'vectortrack.maps.v1';

export const CUSTOM_MAP_SOFT_CAP = 50;
export const CUSTOM_MAP_WARN_CAP = 40;
