/**
 * Bit-packing for the compact grid storage (§8) and the import/export
 * envelope (§8 "Import / export"). Pure functions, no DOM — usable from the
 * main thread, the editor, and (for bit-packing) the validation worker.
 */
import type { CustomMap } from './types';

export function bitsToBase64(bits: Uint8Array): string {
  const packed = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) packed[i >> 3] |= 1 << (i & 7);
  }
  let binary = '';
  for (let i = 0; i < packed.length; i++) binary += String.fromCharCode(packed[i]);
  return btoa(binary);
}

export function base64ToBits(base64: string, length: number): Uint8Array {
  const binary = atob(base64);
  const bits = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bits[i] = (binary.charCodeAt(i >> 3) >> (i & 7)) & 1;
  }
  return bits;
}

export const MAP_EXPORT_FORMAT = 'vectortrack-map';
export const MAP_EXPORT_FORMAT_VERSION = 1;

export interface MapExportEnvelopeSingle {
  format: typeof MAP_EXPORT_FORMAT;
  formatVersion: typeof MAP_EXPORT_FORMAT_VERSION;
  map: CustomMap;
}

export interface MapExportEnvelopeAll {
  format: typeof MAP_EXPORT_FORMAT;
  formatVersion: typeof MAP_EXPORT_FORMAT_VERSION;
  maps: CustomMap[];
}

export function exportMap(map: CustomMap): MapExportEnvelopeSingle {
  return { format: MAP_EXPORT_FORMAT, formatVersion: MAP_EXPORT_FORMAT_VERSION, map };
}

export function exportAllMaps(maps: CustomMap[]): MapExportEnvelopeAll {
  return { format: MAP_EXPORT_FORMAT, formatVersion: MAP_EXPORT_FORMAT_VERSION, maps };
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'map';
}

/** Structural checks only (types/ranges) — static rule validation (LF00x/MZ00x) is a separate pass. */
function isPlausibleCustomMap(value: unknown): value is CustomMap {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.name !== 'string') return false;
  if (typeof v.createdAt !== 'string' || typeof v.updatedAt !== 'string') return false;
  if (v.mode === 'line') {
    return (
      typeof v.cols === 'number' &&
      typeof v.rows === 'number' &&
      typeof v.cellSizeMm === 'number' &&
      typeof v.bits === 'string' &&
      typeof v.start === 'object' &&
      v.start !== null
    );
  }
  if (v.mode === 'maze') {
    return (
      typeof v.cols === 'number' &&
      typeof v.rows === 'number' &&
      typeof v.cellSizeMm === 'number' &&
      typeof v.wallThicknessMm === 'number' &&
      typeof v.hWalls === 'string' &&
      typeof v.vWalls === 'string' &&
      typeof v.goal === 'object' &&
      v.goal !== null
    );
  }
  return false;
}

export class MapImportError extends Error {}

/** Parses an import envelope (single map or a batch) into a flat list of maps, or throws MapImportError. */
export function parseImportedMaps(json: unknown): CustomMap[] {
  if (typeof json !== 'object' || json === null) {
    throw new MapImportError('Not a valid map file.');
  }
  const envelope = json as Record<string, unknown>;
  if (envelope.format !== MAP_EXPORT_FORMAT) {
    throw new MapImportError('Not a VectorTrack map file.');
  }
  if (envelope.formatVersion !== MAP_EXPORT_FORMAT_VERSION) {
    throw new MapImportError(`Unsupported map file version: ${String(envelope.formatVersion)}`);
  }
  if (Array.isArray(envelope.maps)) {
    const maps = envelope.maps.filter(isPlausibleCustomMap);
    if (maps.length === 0) throw new MapImportError('No valid maps found in file.');
    return maps;
  }
  if (isPlausibleCustomMap(envelope.map)) {
    return [envelope.map];
  }
  throw new MapImportError('Map file is missing map data.');
}
