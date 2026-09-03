/**
 * Turns a stored CustomMap into the same runtime shapes the built-in maps
 * use, so the simulator (store/engine.ts) doesn't need to know "custom" is
 * a different thing beyond the `custom:${id}` id prefix that routes it here.
 */
import type { Pose2D } from '../../sim/core/types';
import type { MazeMap } from '../../sim/maze/grid';
import type { LineBitmap } from '../../sim/sensors/reflectance';
import { base64ToBits } from './codec';
import type { CustomLineMap, CustomMazeMap } from './types';
import { wallGridToCells } from '../../sim/maze/wallGrid';
import { estimateLapLengthMm } from '../../editor/line/paint';
import { smoothLinePaintGrid } from '../line/smoothing';

export const CUSTOM_MAP_ID_PREFIX = 'custom:';

export function toCustomRuntimeId(bareId: string): string {
  return `${CUSTOM_MAP_ID_PREFIX}${bareId}`;
}

export function isCustomRuntimeId(mapId: string): boolean {
  return mapId.startsWith(CUSTOM_MAP_ID_PREFIX);
}

export function toBareCustomId(mapId: string): string {
  return mapId.slice(CUSTOM_MAP_ID_PREFIX.length);
}

export function toRuntimeMazeMap(map: CustomMazeMap): MazeMap {
  const hLength = (map.rows + 1) * map.cols;
  const vLength = map.rows * (map.cols + 1);
  const wallGrid = {
    rows: map.rows,
    cols: map.cols,
    hWalls: base64ToBits(map.hWalls, hLength),
    vWalls: base64ToBits(map.vWalls, vLength),
  };
  return {
    id: toCustomRuntimeId(map.id),
    name: map.name,
    description: 'Custom maze',
    rows: map.rows,
    cols: map.cols,
    cellSize: map.cellSizeMm,
    wallThickness: map.wallThicknessMm,
    cells: wallGridToCells(wallGrid),
    start: { row: map.start.row, col: map.start.col },
    goal: map.goal,
  };
}

export interface RuntimeLineSource {
  name: string;
  bitmap: LineBitmap;
  startPose: Pose2D;
  startRadiusMm: number;
  pathLengthMm: number;
}

export function toRuntimeLineMap(map: CustomLineMap): RuntimeLineSource {
  const bits = base64ToBits(map.bits, map.cols * map.rows);
  const bitmap1mm = smoothLinePaintGrid({ cols: map.cols, rows: map.rows, cellSizeMm: map.cellSizeMm, bits });
  const data = new Uint8Array(bitmap1mm.data.length);
  for (let i = 0; i < data.length; i++) data[i] = bitmap1mm.data[i] ? 255 : 0;
  return {
    name: map.name,
    bitmap: { width: bitmap1mm.width, height: bitmap1mm.height, mmPerPixel: 1, data },
    startPose: {
      x: map.start.xMm,
      y: map.start.yMm,
      theta: (map.start.headingDeg * Math.PI) / 180,
    },
    // A fixed radius (rather than a per-track derived one) — good enough to
    // detect "left the start area" for lap counting; see engine.ts.
    startRadiusMm: Math.max(60, map.cellSizeMm * 3),
    // Approximate: real centerline length needs a skeleton, which this
    // project doesn't build (see SPEC "Known simplifications"). Bounding-box
    // perimeter is a cheap, order-of-magnitude-correct proxy, used only to
    // gate "has the robot gone far enough to plausibly have lapped".
    pathLengthMm: Math.max(200, estimateLapLengthMm(map.cols, map.rows, map.cellSizeMm, bits)),
  };
}
