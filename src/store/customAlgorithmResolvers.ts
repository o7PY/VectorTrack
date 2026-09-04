/**
 * Single place that turns a `vtl:${id}` algorithm id or a `layout:${id}` sensor-layout id into
 * runnable data — internal-docs/Algorithms.md §4.1. Every consumer (the engine, the param panel,
 * the telemetry panel, best-run keys, the export path) must go through this module rather than
 * reading the custom algorithm store directly, per INSIGHTS.md's "Centralize per-id-shape
 * resolution" note: doing this per-call-site for `custom:${id}` map ids produced a blank-screen
 * bug once already — do not repeat that here.
 */
import { compile } from '../vtl/compile';
import type { Program, VtlMode } from '../vtl/types';
import type { CustomAlgorithm, CustomSensorLayout } from '../algorithms/custom/types';
import { getCustomAlgorithm, getCustomSensorLayout, loadCustomAlgorithmStore } from './customAlgorithms';

export const VTL_ALGORITHM_ID_PREFIX = 'vtl:';
export const SENSOR_LAYOUT_ID_PREFIX = 'layout:';

export function toVtlRuntimeId(bareId: string): string {
  return `${VTL_ALGORITHM_ID_PREFIX}${bareId}`;
}

export function isVtlRuntimeId(algorithmId: string): boolean {
  return algorithmId.startsWith(VTL_ALGORITHM_ID_PREFIX);
}

export function toBareVtlId(algorithmId: string): string {
  return algorithmId.slice(VTL_ALGORITHM_ID_PREFIX.length);
}

export function toSensorLayoutRuntimeId(bareId: string): string {
  return `${SENSOR_LAYOUT_ID_PREFIX}${bareId}`;
}

export function isSensorLayoutRuntimeId(layoutId: string): boolean {
  return layoutId.startsWith(SENSOR_LAYOUT_ID_PREFIX);
}

export function toBareSensorLayoutId(layoutId: string): string {
  return layoutId.slice(SENSOR_LAYOUT_ID_PREFIX.length);
}

export function resolveCustomAlgorithm(algorithmId: string): CustomAlgorithm {
  const bareId = toBareVtlId(algorithmId);
  const custom = getCustomAlgorithm(loadCustomAlgorithmStore(), bareId);
  if (!custom) throw new Error(`Unknown custom algorithm: ${algorithmId}`);
  return custom;
}

export interface ResolvedVtlAlgorithm {
  algorithm: CustomAlgorithm;
  program: Program;
}

/**
 * Resolves and compiles a custom algorithm's current source. Throws a clear error rather than
 * silently running the wrong mode or a program that no longer compiles — a *saved* algorithm is
 * expected to always compile (§3.2's "last-good program keeps running" rule belongs to the live
 * in-progress editing session, not to what actually gets persisted), so a compile failure here
 * means the stored source is stale or corrupt, not a normal condition to swallow.
 */
export function resolveCompiledCustomAlgorithm(algorithmId: string, expectedMode?: VtlMode): ResolvedVtlAlgorithm {
  const algorithm = resolveCustomAlgorithm(algorithmId);
  if (expectedMode && algorithm.mode !== expectedMode) {
    throw new Error(`Custom algorithm ${algorithmId} is "${algorithm.mode}" mode, expected "${expectedMode}".`);
  }
  const result = compile(algorithm.source, algorithm.mode);
  if (!result.ok) {
    throw new Error(`Custom algorithm ${algorithmId} does not compile: ${result.errors.map((e) => e.message).join('; ')}`);
  }
  return { algorithm, program: result.program };
}

export function resolveCustomSensorLayout(layoutId: string): CustomSensorLayout {
  const bareId = toBareSensorLayoutId(layoutId);
  const custom = getCustomSensorLayout(loadCustomAlgorithmStore(), bareId);
  if (!custom) throw new Error(`Unknown custom sensor layout: ${layoutId}`);
  return custom;
}
