/**
 * Data model for user-authored VTL algorithms and sensor layouts —
 * internal-docs/Algorithms.md §4. Store the VTL source text, never a
 * compiled form — same rule as "store the paint grid, never the bitmap"
 * (maps/custom/types.ts): the AST is re-derivable in microseconds.
 */
import type { SensorPlacement } from '../../sim/sensors/placement';

export interface CustomAlgorithm {
  id: string; // bare id; runtime id is `vtl:${id}`
  name: string; // user-supplied, 1-48 chars, need not be unique
  mode: 'line' | 'maze';
  source: string; // the VTL text — the source of truth, never a compiled form
  createdAt: string; // ISO
  updatedAt: string; // ISO
  lastCompile: { ok: boolean; codes: string[] } | null;
}

export interface CustomSensorLayout {
  id: string; // bare id; runtime id is `layout:${id}`
  name: string;
  mode: 'line' | 'maze';
  basedOnRobotId: string; // chassis geometry comes from this robot
  sensors: SensorPlacement[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomAlgorithmStore {
  schemaVersion: 1;
  algorithms: Record<string, CustomAlgorithm>;
  sensorLayouts: Record<string, CustomSensorLayout>;
}

export const CUSTOM_ALGORITHMS_STORAGE_KEY = 'vectortrack.algorithms.v1';

export const CUSTOM_ALGORITHM_SOFT_CAP = 50;
export const CUSTOM_ALGORITHM_WARN_CAP = 40;

export const CUSTOM_SENSOR_LAYOUT_SOFT_CAP = 50;
export const CUSTOM_SENSOR_LAYOUT_WARN_CAP = 40;

// Draft autosave for the in-simulator code panel (§3.2/§4, wired up in Phase I): a separate
// per-algorithm localStorage key so an in-progress edit never touches CustomAlgorithmStore until
// the user explicitly saves.
export const ALGORITHM_DRAFT_KEY_PREFIX = 'vectortrack.draft.algo.';
export const ALGORITHM_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
