import { describe, expect, it } from 'vitest';
import type { CustomAlgorithm, CustomSensorLayout } from './types';
import {
  ALGORITHM_EXPORT_FORMAT,
  ALGORITHM_EXPORT_FORMAT_VERSION,
  AlgorithmImportError,
  exportAlgorithm,
  exportAllAlgorithms,
  parseImportedAlgorithms,
  slugify,
} from './codec';

function makeAlgorithm(id: string, source = 'on tick:\n  drive(200, 200)\n'): CustomAlgorithm {
  return {
    id,
    name: `Algo ${id}`,
    mode: 'line',
    source,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastCompile: { ok: true, codes: [] },
  };
}

function makeLayout(id: string): CustomSensorLayout {
  return {
    id,
    name: `Layout ${id}`,
    mode: 'line',
    basedOnRobotId: 'lf-scout',
    sensors: [{ id: 's0', type: 'reflectance', forwardMm: 40, lateralMm: 0, headingDeg: 0 }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('algorithm codec — export/import round-trip', () => {
  it('round-trips a single algorithm through exportAlgorithm/parseImportedAlgorithms', () => {
    const algo = makeAlgorithm('a1');
    const envelope = exportAlgorithm(algo);
    expect(envelope.format).toBe(ALGORITHM_EXPORT_FORMAT);
    expect(envelope.formatVersion).toBe(ALGORITHM_EXPORT_FORMAT_VERSION);

    const imported = parseImportedAlgorithms(JSON.parse(JSON.stringify(envelope)));
    expect(imported.algorithms).toEqual([algo]);
    expect(imported.sensorLayouts).toEqual([]);
  });

  it('round-trips a single algorithm with an embedded sensor layout', () => {
    const algo = makeAlgorithm('a1');
    const layout = makeLayout('l1');
    const envelope = exportAlgorithm(algo, layout);

    const imported = parseImportedAlgorithms(JSON.parse(JSON.stringify(envelope)));
    expect(imported.algorithms).toEqual([algo]);
    expect(imported.sensorLayouts).toEqual([layout]);
  });

  it('round-trips a batch export/import', () => {
    const algos = [makeAlgorithm('a1'), makeAlgorithm('a2')];
    const layouts = [makeLayout('l1')];
    const envelope = exportAllAlgorithms(algos, layouts);

    const imported = parseImportedAlgorithms(JSON.parse(JSON.stringify(envelope)));
    expect(imported.algorithms).toEqual(algos);
    expect(imported.sensorLayouts).toEqual(layouts);
  });

  it('rejects a file with the wrong format tag', () => {
    expect(() => parseImportedAlgorithms({ format: 'something-else', formatVersion: 1, algorithm: makeAlgorithm('a1') })).toThrow(
      AlgorithmImportError,
    );
  });

  it('rejects an unknown formatVersion', () => {
    const bad = { ...exportAlgorithm(makeAlgorithm('a1')), formatVersion: 99 };
    expect(() => parseImportedAlgorithms(bad)).toThrow(AlgorithmImportError);
  });

  it('rejects structurally incomplete algorithm data', () => {
    const bad = { format: ALGORITHM_EXPORT_FORMAT, formatVersion: ALGORITHM_EXPORT_FORMAT_VERSION, algorithm: { mode: 'line' } };
    expect(() => parseImportedAlgorithms(bad)).toThrow(AlgorithmImportError);
  });

  it('rejects an algorithm whose source does not compile', () => {
    const bad = exportAlgorithm(makeAlgorithm('a1', 'on tick:\n  this is not vtl\n'));
    expect(() => parseImportedAlgorithms(bad)).toThrow(/does not compile/);
  });

  it('rejects non-object input', () => {
    expect(() => parseImportedAlgorithms(null)).toThrow(AlgorithmImportError);
    expect(() => parseImportedAlgorithms('not an object')).toThrow(AlgorithmImportError);
  });

  it('slugify produces a filesystem-safe, lowercase, hyphenated name', () => {
    expect(slugify('My PID Follower!')).toBe('my-pid-follower');
    expect(slugify('   ')).toBe('algorithm');
  });
});
