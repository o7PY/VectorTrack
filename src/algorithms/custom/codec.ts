/**
 * Import/export envelope for custom algorithms (Algorithms.md §4). Unlike maps/custom/codec.ts,
 * there is no bit-packing here — the VTL source is already compact plain text — but importing is
 * stricter: every algorithm's source is compiled before it's accepted, since an algorithm file
 * that doesn't compile was never a valid export in the first place.
 */
import { compile } from '../../vtl/compile';
import type { CustomAlgorithm, CustomSensorLayout } from './types';

export const ALGORITHM_EXPORT_FORMAT = 'vectortrack-algorithm';
export const ALGORITHM_EXPORT_FORMAT_VERSION = 1;

export interface AlgorithmExportEnvelopeSingle {
  format: typeof ALGORITHM_EXPORT_FORMAT;
  formatVersion: typeof ALGORITHM_EXPORT_FORMAT_VERSION;
  algorithm: CustomAlgorithm;
  sensorLayout?: CustomSensorLayout;
}

export interface AlgorithmExportEnvelopeAll {
  format: typeof ALGORITHM_EXPORT_FORMAT;
  formatVersion: typeof ALGORITHM_EXPORT_FORMAT_VERSION;
  algorithms: CustomAlgorithm[];
  sensorLayouts?: CustomSensorLayout[];
}

export function exportAlgorithm(algorithm: CustomAlgorithm, sensorLayout?: CustomSensorLayout): AlgorithmExportEnvelopeSingle {
  return {
    format: ALGORITHM_EXPORT_FORMAT,
    formatVersion: ALGORITHM_EXPORT_FORMAT_VERSION,
    algorithm,
    ...(sensorLayout ? { sensorLayout } : {}),
  };
}

export function exportAllAlgorithms(algorithms: CustomAlgorithm[], sensorLayouts?: CustomSensorLayout[]): AlgorithmExportEnvelopeAll {
  return {
    format: ALGORITHM_EXPORT_FORMAT,
    formatVersion: ALGORITHM_EXPORT_FORMAT_VERSION,
    algorithms,
    ...(sensorLayouts && sensorLayouts.length > 0 ? { sensorLayouts } : {}),
  };
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'algorithm';
}

/** Structural checks only (types/shape) — compiling (below) is what actually validates the source. */
function isPlausibleCustomAlgorithm(value: unknown): value is CustomAlgorithm {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    (v.mode === 'line' || v.mode === 'maze') &&
    typeof v.source === 'string' &&
    typeof v.createdAt === 'string' &&
    typeof v.updatedAt === 'string'
  );
}

function isPlausibleCustomSensorLayout(value: unknown): value is CustomSensorLayout {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    (v.mode === 'line' || v.mode === 'maze') &&
    typeof v.basedOnRobotId === 'string' &&
    Array.isArray(v.sensors) &&
    typeof v.createdAt === 'string' &&
    typeof v.updatedAt === 'string'
  );
}

export class AlgorithmImportError extends Error {}

export interface ParsedAlgorithmImport {
  algorithms: CustomAlgorithm[];
  sensorLayouts: CustomSensorLayout[];
}

/**
 * Parses an import envelope (single algorithm or a batch) and compiles every algorithm's source
 * before accepting it, or throws AlgorithmImportError. Embedded sensor layouts are only
 * structurally checked — they carry no executable content to compile.
 */
export function parseImportedAlgorithms(json: unknown): ParsedAlgorithmImport {
  if (typeof json !== 'object' || json === null) {
    throw new AlgorithmImportError('Not a valid algorithm file.');
  }
  const envelope = json as Record<string, unknown>;
  if (envelope.format !== ALGORITHM_EXPORT_FORMAT) {
    throw new AlgorithmImportError('Not a VectorTrack algorithm file.');
  }
  if (envelope.formatVersion !== ALGORITHM_EXPORT_FORMAT_VERSION) {
    throw new AlgorithmImportError(`Unsupported algorithm file version: ${String(envelope.formatVersion)}`);
  }

  let algorithms: CustomAlgorithm[];
  if (Array.isArray(envelope.algorithms)) {
    algorithms = envelope.algorithms.filter(isPlausibleCustomAlgorithm);
    if (algorithms.length === 0) throw new AlgorithmImportError('No valid algorithms found in file.');
  } else if (isPlausibleCustomAlgorithm(envelope.algorithm)) {
    algorithms = [envelope.algorithm];
  } else {
    throw new AlgorithmImportError('Algorithm file is missing algorithm data.');
  }

  for (const algo of algorithms) {
    const result = compile(algo.source, algo.mode);
    if (!result.ok) {
      throw new AlgorithmImportError(`"${algo.name}" does not compile: ${result.errors.map((e) => e.message).join('; ')}`);
    }
  }

  let sensorLayouts: CustomSensorLayout[] = [];
  if (Array.isArray(envelope.sensorLayouts)) {
    sensorLayouts = envelope.sensorLayouts.filter(isPlausibleCustomSensorLayout);
  } else if (isPlausibleCustomSensorLayout(envelope.sensorLayout)) {
    sensorLayouts = [envelope.sensorLayout];
  }

  return { algorithms, sensorLayouts };
}
