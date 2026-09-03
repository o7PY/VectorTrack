/**
 * Single place that turns a `custom:${id}` map id into runnable/renderable
 * data. Used by the sim engine *and* every renderer (Canvas2D, Scene3D,
 * Maze3D, LineTrack3D) so there is exactly one code path that knows how to
 * read a custom map out of localStorage — a renderer calling `getLineMap`/
 * `getMazeMap` directly on a custom id (bypassing this) is the bug class
 * that caused custom maps to blank-screen the simulator.
 */
import type { MazeMap } from '../sim/maze/grid';
import type { RuntimeLineSource } from '../maps/custom/toRuntimeMap';
import { isCustomRuntimeId, toBareCustomId, toRuntimeLineMap, toRuntimeMazeMap } from '../maps/custom/toRuntimeMap';
import { getCustomMap, loadCustomMapStore } from './customMaps';

export { isCustomRuntimeId };

export function resolveCustomMazeMap(mapId: string): MazeMap {
  const bareId = toBareCustomId(mapId);
  const custom = getCustomMap(loadCustomMapStore(), bareId);
  if (!custom || custom.mode !== 'maze') throw new Error(`Unknown custom maze map: ${mapId}`);
  return toRuntimeMazeMap(custom);
}

export function resolveCustomLineMap(mapId: string): RuntimeLineSource {
  const bareId = toBareCustomId(mapId);
  const custom = getCustomMap(loadCustomMapStore(), bareId);
  if (!custom || custom.mode !== 'line') throw new Error(`Unknown custom line map: ${mapId}`);
  return toRuntimeLineMap(custom);
}
