// @vitest-environment jsdom
//
// jsdom only because loadCustomAlgorithmStore reads localStorage — none of this touches canvas.
import { beforeEach, describe, expect, it } from 'vitest';
import { loadCustomAlgorithmStore, saveCustomAlgorithmStore, upsertCustomAlgorithm } from '../store/customAlgorithms';
import { toVtlRuntimeId } from '../store/customAlgorithmResolvers';
import type { CustomAlgorithm } from './custom/types';
import { getAlgorithmMeta, getDefaultParams } from './registry';

function saveAlgorithm(id: string, source: string, mode: 'line' | 'maze' = 'line'): CustomAlgorithm {
  const algorithm: CustomAlgorithm = { id, name: `Custom ${id}`, mode, source, createdAt: '2024-01-01', updatedAt: '2024-01-01', lastCompile: null };
  saveCustomAlgorithmStore(upsertCustomAlgorithm(loadCustomAlgorithmStore(), algorithm));
  return algorithm;
}

describe('registry.ts vtl: awareness', () => {
  beforeEach(() => localStorage.clear());

  it('derives ParamSpec/choiceParams from a compiled program\'s param decls', () => {
    const source = `param Kp = 0.45 range 0..2
param mode = "fast" options "fast","slow"

on tick:
  drive(0, 0)
`;
    saveAlgorithm('a1', source);
    const meta = getAlgorithmMeta(toVtlRuntimeId('a1'));

    expect(meta.name).toBe('Custom a1');
    expect(meta.mode).toBe('line');
    expect(meta.params).toEqual([{ key: 'Kp', label: 'Kp', min: 0, max: 2, step: 0.01 }]);
    expect(meta.choiceParams).toEqual([
      { key: 'mode', label: 'mode', options: [{ value: 'fast', label: 'fast' }, { value: 'slow', label: 'slow' }] },
    ]);
  });

  it('reads a param named baseSpeed like any other declared param', () => {
    const source = `param baseSpeed = 300 range 50..800

on tick:
  drive(baseSpeed, baseSpeed)
`;
    saveAlgorithm('a2', source);
    const meta = getAlgorithmMeta(toVtlRuntimeId('a2'));
    expect(meta.params).toEqual([{ key: 'baseSpeed', label: 'baseSpeed', min: 50, max: 800, step: 5 }]);
    expect(getDefaultParams('any-robot', toVtlRuntimeId('a2'))).toEqual({ baseSpeed: 300 });
  });

  it('degrades to zero tunable params, without throwing, for a saved algorithm that no longer compiles', () => {
    saveAlgorithm('broken', 'on tick:\n  this is not valid vtl\n');
    const meta = getAlgorithmMeta(toVtlRuntimeId('broken'));
    expect(meta.name).toBe('Custom broken');
    expect(meta.params).toEqual([]);
    expect(meta.choiceParams).toBeUndefined();
    expect(getDefaultParams('any-robot', toVtlRuntimeId('broken'))).toEqual({});
  });

  it('still throws a clear error for a vtl id that was never saved', () => {
    expect(() => getAlgorithmMeta(toVtlRuntimeId('nope'))).toThrow(/Unknown custom algorithm/);
  });

  it('leaves built-in algorithm ids untouched', () => {
    expect(getAlgorithmMeta('pid').name).toBe('PID');
    expect(getDefaultParams('lf-scout', 'wallFollower')).toEqual({ hand: 'right' });
  });
});
