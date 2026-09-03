// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { CUSTOM_MAPS_STORAGE_KEY, CUSTOM_MAP_SOFT_CAP } from '../maps/custom/types';
import type { CustomLineMap } from '../maps/custom/types';
import {
  MapQuotaError,
  clearCustomMapStore,
  defaultCustomMapStore,
  deleteCustomMap,
  getCustomMap,
  listCustomMaps,
  loadCustomMapStore,
  saveCustomMapStore,
  upsertCustomMap,
} from './customMaps';

function makeMap(id: string, updatedAt: string): CustomLineMap {
  return {
    id,
    name: `Map ${id}`,
    mode: 'line',
    createdAt: updatedAt,
    updatedAt,
    validationRobotId: 'lf-ranger',
    lastValidation: null,
    cols: 2,
    rows: 2,
    cellSizeMm: 20,
    bits: 'AA==',
    start: { xMm: 0, yMm: 0, headingDeg: 0 },
  };
}

describe('customMaps store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty when nothing is saved', () => {
    expect(loadCustomMapStore()).toEqual(defaultCustomMapStore);
  });

  it('discards corrupt saved data instead of crashing', () => {
    localStorage.setItem(CUSTOM_MAPS_STORAGE_KEY, '{not json');
    expect(loadCustomMapStore()).toEqual(defaultCustomMapStore);
  });

  it('discards data with an unrecognized schema version', () => {
    localStorage.setItem(CUSTOM_MAPS_STORAGE_KEY, JSON.stringify({ schemaVersion: 99, maps: {} }));
    expect(loadCustomMapStore()).toEqual(defaultCustomMapStore);
  });

  it('round-trips upsert -> save -> load', () => {
    const map = makeMap('custom-1', '2026-01-01T00:00:00.000Z');
    const store = upsertCustomMap(defaultCustomMapStore, map);
    saveCustomMapStore(store);
    const loaded = loadCustomMapStore();
    expect(getCustomMap(loaded, 'custom-1')).toEqual(map);
  });

  it('deletes a map', () => {
    const map = makeMap('custom-1', '2026-01-01T00:00:00.000Z');
    let store = upsertCustomMap(defaultCustomMapStore, map);
    store = deleteCustomMap(store, 'custom-1');
    expect(getCustomMap(store, 'custom-1')).toBeUndefined();
  });

  it('lists maps most-recently-updated first', () => {
    let store = defaultCustomMapStore;
    store = upsertCustomMap(store, makeMap('a', '2026-01-01T00:00:00.000Z'));
    store = upsertCustomMap(store, makeMap('b', '2026-03-01T00:00:00.000Z'));
    store = upsertCustomMap(store, makeMap('c', '2026-02-01T00:00:00.000Z'));
    expect(listCustomMaps(store).map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('throws MapQuotaError when adding a new map past the soft cap', () => {
    let store = defaultCustomMapStore;
    for (let i = 0; i < CUSTOM_MAP_SOFT_CAP; i++) {
      store = upsertCustomMap(store, makeMap(`m${i}`, '2026-01-01T00:00:00.000Z'));
    }
    expect(() => upsertCustomMap(store, makeMap('one-too-many', '2026-01-01T00:00:00.000Z'))).toThrow(MapQuotaError);
  });

  it('allows updating an existing map even at the soft cap', () => {
    let store = defaultCustomMapStore;
    for (let i = 0; i < CUSTOM_MAP_SOFT_CAP; i++) {
      store = upsertCustomMap(store, makeMap(`m${i}`, '2026-01-01T00:00:00.000Z'));
    }
    const updated = { ...makeMap('m0', '2026-05-01T00:00:00.000Z') };
    expect(() => upsertCustomMap(store, updated)).not.toThrow();
  });

  it('clearCustomMapStore removes the key', () => {
    saveCustomMapStore(upsertCustomMap(defaultCustomMapStore, makeMap('custom-1', '2026-01-01T00:00:00.000Z')));
    clearCustomMapStore();
    expect(localStorage.getItem(CUSTOM_MAPS_STORAGE_KEY)).toBeNull();
  });
});
