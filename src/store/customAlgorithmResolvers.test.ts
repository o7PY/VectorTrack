// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { CustomAlgorithm, CustomSensorLayout } from '../algorithms/custom/types';
import { loadCustomAlgorithmStore, saveCustomAlgorithmStore, upsertCustomAlgorithm, upsertCustomSensorLayout } from './customAlgorithms';
import {
  isSensorLayoutRuntimeId,
  isVtlRuntimeId,
  resolveCompiledCustomAlgorithm,
  resolveCustomAlgorithm,
  resolveCustomSensorLayout,
  toBareSensorLayoutId,
  toBareVtlId,
  toSensorLayoutRuntimeId,
  toVtlRuntimeId,
} from './customAlgorithmResolvers';

function makeAlgorithm(id: string, mode: 'line' | 'maze' = 'line', source = 'on tick:\n  drive(200, 200)\n'): CustomAlgorithm {
  return {
    id,
    name: `Algo ${id}`,
    mode,
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

/**
 * Exercises the exact functions every consumer (engine, param panel, telemetry panel, best-run
 * keys, export path) must call to turn a `vtl:${id}`/`layout:${id}` id into runnable data — see
 * customMapResolvers.test.ts for the map-id precedent this mirrors.
 */
describe('id prefix helpers', () => {
  it('round-trips vtl: ids', () => {
    expect(toVtlRuntimeId('a1')).toBe('vtl:a1');
    expect(isVtlRuntimeId('vtl:a1')).toBe(true);
    expect(isVtlRuntimeId('pid')).toBe(false);
    expect(toBareVtlId('vtl:a1')).toBe('a1');
  });

  it('round-trips layout: ids', () => {
    expect(toSensorLayoutRuntimeId('l1')).toBe('layout:l1');
    expect(isSensorLayoutRuntimeId('layout:l1')).toBe(true);
    expect(isSensorLayoutRuntimeId('lf-scout')).toBe(false);
    expect(toBareSensorLayoutId('layout:l1')).toBe('l1');
  });
});

describe('resolveCustomAlgorithm / resolveCompiledCustomAlgorithm / resolveCustomSensorLayout', () => {
  beforeEach(() => localStorage.clear());

  it('resolves a saved custom algorithm by its vtl: runtime id', () => {
    saveCustomAlgorithmStore(upsertCustomAlgorithm(loadCustomAlgorithmStore(), makeAlgorithm('a1')));
    const resolved = resolveCustomAlgorithm(toVtlRuntimeId('a1'));
    expect(resolved.id).toBe('a1');
  });

  it('resolves and compiles a saved custom algorithm', () => {
    saveCustomAlgorithmStore(upsertCustomAlgorithm(loadCustomAlgorithmStore(), makeAlgorithm('a1')));
    const { algorithm, program } = resolveCompiledCustomAlgorithm(toVtlRuntimeId('a1'));
    expect(algorithm.id).toBe('a1');
    expect(program.events.length).toBeGreaterThan(0);
  });

  it('throws a clear error for an id that was never saved', () => {
    expect(() => resolveCustomAlgorithm(toVtlRuntimeId('nope'))).toThrow(/Unknown custom algorithm/);
  });

  it('throws when resolved against an unexpected mode', () => {
    saveCustomAlgorithmStore(upsertCustomAlgorithm(loadCustomAlgorithmStore(), makeAlgorithm('a1', 'line')));
    expect(() => resolveCompiledCustomAlgorithm(toVtlRuntimeId('a1'), 'maze')).toThrow(/expected "maze"/);
  });

  it('throws a clear error when the stored source no longer compiles', () => {
    saveCustomAlgorithmStore(upsertCustomAlgorithm(loadCustomAlgorithmStore(), makeAlgorithm('a1', 'line', 'not vtl at all')));
    expect(() => resolveCompiledCustomAlgorithm(toVtlRuntimeId('a1'))).toThrow(/does not compile/);
  });

  it('resolves a saved custom sensor layout by its layout: runtime id', () => {
    saveCustomAlgorithmStore(upsertCustomSensorLayout(loadCustomAlgorithmStore(), makeLayout('l1')));
    const resolved = resolveCustomSensorLayout(toSensorLayoutRuntimeId('l1'));
    expect(resolved.id).toBe('l1');
  });

  it('throws a clear error for a sensor layout id that was never saved', () => {
    expect(() => resolveCustomSensorLayout(toSensorLayoutRuntimeId('nope'))).toThrow(/Unknown custom sensor layout/);
  });
});
