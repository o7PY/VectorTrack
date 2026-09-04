// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CUSTOM_ALGORITHMS_STORAGE_KEY, CUSTOM_ALGORITHM_SOFT_CAP, CUSTOM_SENSOR_LAYOUT_SOFT_CAP } from '../algorithms/custom/types';
import type { CustomAlgorithm, CustomSensorLayout } from '../algorithms/custom/types';
import {
  AlgorithmQuotaError,
  clearAlgorithmDraft,
  clearCustomAlgorithmStore,
  defaultCustomAlgorithmStore,
  deleteCustomAlgorithm,
  deleteCustomSensorLayout,
  gcAlgorithmDrafts,
  getCustomAlgorithm,
  getCustomSensorLayout,
  listCustomAlgorithms,
  listCustomSensorLayouts,
  loadAlgorithmDraft,
  loadCustomAlgorithmStore,
  saveAlgorithmDraft,
  saveCustomAlgorithmStore,
  upsertCustomAlgorithm,
  upsertCustomSensorLayout,
} from './customAlgorithms';

function makeAlgorithm(id: string, updatedAt: string): CustomAlgorithm {
  return {
    id,
    name: `Algo ${id}`,
    mode: 'line',
    source: 'on tick:\n  drive(200, 200)\n',
    createdAt: updatedAt,
    updatedAt,
    lastCompile: { ok: true, codes: [] },
  };
}

function makeLayout(id: string, updatedAt: string): CustomSensorLayout {
  return {
    id,
    name: `Layout ${id}`,
    mode: 'line',
    basedOnRobotId: 'lf-scout',
    sensors: [{ id: 's0', type: 'reflectance', forwardMm: 40, lateralMm: 0, headingDeg: 0 }],
    createdAt: updatedAt,
    updatedAt,
  };
}

describe('customAlgorithms store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty when nothing is saved', () => {
    expect(loadCustomAlgorithmStore()).toEqual(defaultCustomAlgorithmStore);
  });

  it('discards corrupt saved data instead of crashing', () => {
    localStorage.setItem(CUSTOM_ALGORITHMS_STORAGE_KEY, '{not json');
    expect(loadCustomAlgorithmStore()).toEqual(defaultCustomAlgorithmStore);
  });

  it('discards data with an unrecognized schema version', () => {
    localStorage.setItem(CUSTOM_ALGORITHMS_STORAGE_KEY, JSON.stringify({ schemaVersion: 99, algorithms: {}, sensorLayouts: {} }));
    expect(loadCustomAlgorithmStore()).toEqual(defaultCustomAlgorithmStore);
  });

  it('round-trips upsert -> save -> load for algorithms', () => {
    const algo = makeAlgorithm('a1', '2026-01-01T00:00:00.000Z');
    const store = upsertCustomAlgorithm(defaultCustomAlgorithmStore, algo);
    saveCustomAlgorithmStore(store);
    expect(getCustomAlgorithm(loadCustomAlgorithmStore(), 'a1')).toEqual(algo);
  });

  it('round-trips upsert -> save -> load for sensor layouts', () => {
    const layout = makeLayout('l1', '2026-01-01T00:00:00.000Z');
    const store = upsertCustomSensorLayout(defaultCustomAlgorithmStore, layout);
    saveCustomAlgorithmStore(store);
    expect(getCustomSensorLayout(loadCustomAlgorithmStore(), 'l1')).toEqual(layout);
  });

  it('deletes an algorithm without touching sensor layouts', () => {
    let store = upsertCustomAlgorithm(defaultCustomAlgorithmStore, makeAlgorithm('a1', '2026-01-01T00:00:00.000Z'));
    store = upsertCustomSensorLayout(store, makeLayout('l1', '2026-01-01T00:00:00.000Z'));
    store = deleteCustomAlgorithm(store, 'a1');
    expect(getCustomAlgorithm(store, 'a1')).toBeUndefined();
    expect(getCustomSensorLayout(store, 'l1')).toBeDefined();
  });

  it('deletes a sensor layout without touching algorithms', () => {
    let store = upsertCustomAlgorithm(defaultCustomAlgorithmStore, makeAlgorithm('a1', '2026-01-01T00:00:00.000Z'));
    store = upsertCustomSensorLayout(store, makeLayout('l1', '2026-01-01T00:00:00.000Z'));
    store = deleteCustomSensorLayout(store, 'l1');
    expect(getCustomSensorLayout(store, 'l1')).toBeUndefined();
    expect(getCustomAlgorithm(store, 'a1')).toBeDefined();
  });

  it('lists algorithms most-recently-updated first', () => {
    let store = defaultCustomAlgorithmStore;
    store = upsertCustomAlgorithm(store, makeAlgorithm('a', '2026-01-01T00:00:00.000Z'));
    store = upsertCustomAlgorithm(store, makeAlgorithm('b', '2026-03-01T00:00:00.000Z'));
    store = upsertCustomAlgorithm(store, makeAlgorithm('c', '2026-02-01T00:00:00.000Z'));
    expect(listCustomAlgorithms(store).map((a) => a.id)).toEqual(['b', 'c', 'a']);
  });

  it('lists sensor layouts most-recently-updated first', () => {
    let store = defaultCustomAlgorithmStore;
    store = upsertCustomSensorLayout(store, makeLayout('a', '2026-01-01T00:00:00.000Z'));
    store = upsertCustomSensorLayout(store, makeLayout('b', '2026-03-01T00:00:00.000Z'));
    expect(listCustomSensorLayouts(store).map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('throws AlgorithmQuotaError when adding a new algorithm past the soft cap', () => {
    let store = defaultCustomAlgorithmStore;
    for (let i = 0; i < CUSTOM_ALGORITHM_SOFT_CAP; i++) {
      store = upsertCustomAlgorithm(store, makeAlgorithm(`m${i}`, '2026-01-01T00:00:00.000Z'));
    }
    expect(() => upsertCustomAlgorithm(store, makeAlgorithm('one-too-many', '2026-01-01T00:00:00.000Z'))).toThrow(AlgorithmQuotaError);
  });

  it('allows updating an existing algorithm even at the soft cap', () => {
    let store = defaultCustomAlgorithmStore;
    for (let i = 0; i < CUSTOM_ALGORITHM_SOFT_CAP; i++) {
      store = upsertCustomAlgorithm(store, makeAlgorithm(`m${i}`, '2026-01-01T00:00:00.000Z'));
    }
    expect(() => upsertCustomAlgorithm(store, makeAlgorithm('m0', '2026-05-01T00:00:00.000Z'))).not.toThrow();
  });

  it('throws AlgorithmQuotaError when adding a new sensor layout past its own, independent soft cap', () => {
    let store = defaultCustomAlgorithmStore;
    for (let i = 0; i < CUSTOM_SENSOR_LAYOUT_SOFT_CAP; i++) {
      store = upsertCustomSensorLayout(store, makeLayout(`l${i}`, '2026-01-01T00:00:00.000Z'));
    }
    expect(() => upsertCustomSensorLayout(store, makeLayout('one-too-many', '2026-01-01T00:00:00.000Z'))).toThrow(AlgorithmQuotaError);
  });

  it('clearCustomAlgorithmStore removes the key', () => {
    saveCustomAlgorithmStore(upsertCustomAlgorithm(defaultCustomAlgorithmStore, makeAlgorithm('a1', '2026-01-01T00:00:00.000Z')));
    clearCustomAlgorithmStore();
    expect(localStorage.getItem(CUSTOM_ALGORITHMS_STORAGE_KEY)).toBeNull();
  });

  describe('draft autosave', () => {
    it('round-trips save -> load for a draft', () => {
      saveAlgorithmDraft('a1', 'on tick:\n  drive(1, 1)\n');
      const draft = loadAlgorithmDraft('a1');
      expect(draft?.source).toBe('on tick:\n  drive(1, 1)\n');
    });

    it('returns null for a draft that was never saved', () => {
      expect(loadAlgorithmDraft('nope')).toBeNull();
    });

    it('clearAlgorithmDraft removes it', () => {
      saveAlgorithmDraft('a1', 'x');
      clearAlgorithmDraft('a1');
      expect(loadAlgorithmDraft('a1')).toBeNull();
    });

    it('gcAlgorithmDrafts removes drafts older than the max age, keeps fresh ones', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      saveAlgorithmDraft('old', 'stale source');
      vi.setSystemTime(new Date('2026-01-10T00:00:00.000Z')); // 9 days later — past the 7-day GC window
      saveAlgorithmDraft('fresh', 'fresh source');

      gcAlgorithmDrafts();

      expect(loadAlgorithmDraft('old')).toBeNull();
      expect(loadAlgorithmDraft('fresh')).not.toBeNull();
      vi.useRealTimers();
    });

    it('gcAlgorithmDrafts drops corrupt draft entries', () => {
      localStorage.setItem('vectortrack.draft.algo.corrupt', '{not json');
      gcAlgorithmDrafts();
      expect(localStorage.getItem('vectortrack.draft.algo.corrupt')).toBeNull();
    });
  });
});
