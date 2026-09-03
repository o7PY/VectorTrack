import { describe, expect, it } from 'vitest';
import {
  MAP_EXPORT_FORMAT,
  MAP_EXPORT_FORMAT_VERSION,
  MapImportError,
  base64ToBits,
  bitsToBase64,
  exportAllMaps,
  exportMap,
  parseImportedMaps,
  slugify,
} from './codec';
import type { CustomLineMap, CustomMazeMap } from './types';

function makeLineMap(id: string): CustomLineMap {
  return {
    id,
    name: 'My Track',
    mode: 'line',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    validationRobotId: 'lf-ranger',
    lastValidation: null,
    cols: 3,
    rows: 3,
    cellSizeMm: 20,
    bits: bitsToBase64(new Uint8Array([0, 1, 0, 1, 1, 1, 0, 1, 0])),
    start: { xMm: 30, yMm: 30, headingDeg: 0 },
  };
}

function makeMazeMap(id: string): CustomMazeMap {
  const cells = 4 * 4;
  return {
    id,
    name: 'My Maze',
    mode: 'maze',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    validationRobotId: 'mz-sprint',
    lastValidation: null,
    rows: 4,
    cols: 4,
    cellSizeMm: 180,
    wallThicknessMm: 12,
    hWalls: bitsToBase64(new Uint8Array(cells + 4).fill(1)),
    vWalls: bitsToBase64(new Uint8Array(cells + 4).fill(1)),
    start: { row: 0, col: 0, headingDeg: 0 },
    goal: { row: 3, col: 3, width: 1, height: 1 },
  };
}

describe('bitsToBase64 / base64ToBits', () => {
  it('round-trips an arbitrary bit pattern', () => {
    const bits = new Uint8Array([1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0]);
    const b64 = bitsToBase64(bits);
    const back = base64ToBits(b64, bits.length);
    expect(Array.from(back)).toEqual(Array.from(bits));
  });

  it('round-trips a length that is not a multiple of 8', () => {
    const bits = new Uint8Array([1, 1, 1]);
    const back = base64ToBits(bitsToBase64(bits), 3);
    expect(Array.from(back)).toEqual([1, 1, 1]);
  });

  it('round-trips an all-zero and all-one grid', () => {
    const zeros = new Uint8Array(17);
    const ones = new Uint8Array(17).fill(1);
    expect(Array.from(base64ToBits(bitsToBase64(zeros), 17))).toEqual(Array.from(zeros));
    expect(Array.from(base64ToBits(bitsToBase64(ones), 17))).toEqual(Array.from(ones));
  });
});

describe('slugify', () => {
  it('lowercases, replaces non-alphanumerics with hyphens, and trims edge hyphens', () => {
    expect(slugify('My Cool Track!!')).toBe('my-cool-track');
    expect(slugify('  Spiral #2  ')).toBe('spiral-2');
  });

  it('falls back to "map" for a name with no alphanumeric characters', () => {
    expect(slugify('***')).toBe('map');
  });
});

describe('export / import envelope round trip', () => {
  it('exports and re-imports a single map', () => {
    const map = makeLineMap('custom-1');
    const envelope = exportMap(map);
    expect(envelope.format).toBe(MAP_EXPORT_FORMAT);
    expect(envelope.formatVersion).toBe(MAP_EXPORT_FORMAT_VERSION);

    const json = JSON.parse(JSON.stringify(envelope));
    const imported = parseImportedMaps(json);
    expect(imported).toEqual([map]);
  });

  it('exports and re-imports a batch of maps', () => {
    const maps = [makeLineMap('custom-1'), makeMazeMap('custom-2')];
    const json = JSON.parse(JSON.stringify(exportAllMaps(maps)));
    const imported = parseImportedMaps(json);
    expect(imported).toEqual(maps);
  });

  it('rejects a file with the wrong format tag', () => {
    expect(() => parseImportedMaps({ format: 'something-else', formatVersion: 1, map: makeLineMap('x') })).toThrow(
      MapImportError,
    );
  });

  it('rejects an unknown formatVersion', () => {
    const bad = { ...exportMap(makeLineMap('x')), formatVersion: 99 };
    expect(() => parseImportedMaps(bad)).toThrow(MapImportError);
  });

  it('rejects a map missing required fields', () => {
    const bad = { format: MAP_EXPORT_FORMAT, formatVersion: MAP_EXPORT_FORMAT_VERSION, map: { mode: 'line' } };
    expect(() => parseImportedMaps(bad)).toThrow(MapImportError);
  });

  it('rejects a non-object payload', () => {
    expect(() => parseImportedMaps(null)).toThrow(MapImportError);
    expect(() => parseImportedMaps('not an object')).toThrow(MapImportError);
  });
});
