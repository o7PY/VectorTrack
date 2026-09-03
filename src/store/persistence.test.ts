// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSaveData, defaultSaveData, loadSaveData, saveSaveDataDebounced } from './persistence';

const V2_KEY = 'vectortrack.v2';
const V1_KEY = 'vectortrack.v1';

describe('persistence v1 -> v2 migration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when nothing is saved', () => {
    expect(loadSaveData()).toEqual(defaultSaveData);
  });

  it('migrates a legacy v1 object forward to v2 and persists it under the new key', () => {
    const legacy = {
      schemaVersion: 1,
      lastSession: { mode: 'maze', mapId: 'mz-intro', robotId: 'mz-probe', algorithmId: 'wallFollower' },
      tunedParams: { 'mz-probe:wallFollower': { hand: 'right' } },
      bestRuns: {},
      completedMaps: ['mz-intro'],
      settings: { viewMode: '2d', cameraPreset: 'top', speedMultiplier: 2, showSensorOverlay: false },
    };
    localStorage.setItem(V1_KEY, JSON.stringify(legacy));

    const loaded = loadSaveData();
    expect(loaded.schemaVersion).toBe(2);
    expect(loaded.lastSession).toEqual(legacy.lastSession);
    expect(loaded.tunedParams).toEqual(legacy.tunedParams);
    expect(loaded.completedMaps).toEqual(legacy.completedMaps);
    expect(loaded.settings).toEqual(legacy.settings);

    // migration persists the result under the new key so it only runs once
    const migratedRaw = localStorage.getItem(V2_KEY);
    expect(migratedRaw).not.toBeNull();
    expect(JSON.parse(migratedRaw as string).schemaVersion).toBe(2);
  });

  it('prefers an existing v2 object over a legacy v1 one', () => {
    localStorage.setItem(V1_KEY, JSON.stringify({ ...defaultSaveData, schemaVersion: 1 }));
    const v2Data = {
      ...defaultSaveData,
      lastSession: { mode: 'line' as const, mapId: 'lf-sharp', robotId: 'lf-scout', algorithmId: 'pid' },
    };
    localStorage.setItem(V2_KEY, JSON.stringify(v2Data));

    expect(loadSaveData().lastSession.mapId).toBe('lf-sharp');
  });

  it('discards corrupt v1 data instead of crashing', () => {
    localStorage.setItem(V1_KEY, '{not json');
    expect(loadSaveData()).toEqual(defaultSaveData);
  });

  it('discards a legacy object with an unrecognized schema version', () => {
    localStorage.setItem(V1_KEY, JSON.stringify({ schemaVersion: 99 }));
    expect(loadSaveData()).toEqual(defaultSaveData);
  });

  it('discards corrupt v2 data instead of crashing', () => {
    localStorage.setItem(V2_KEY, '{not json');
    expect(loadSaveData()).toEqual(defaultSaveData);
  });

  it('saveSaveDataDebounced eventually writes to the v2 key', async () => {
    saveSaveDataDebounced(defaultSaveData, 10);
    await new Promise((r) => setTimeout(r, 50));
    expect(localStorage.getItem(V2_KEY)).not.toBeNull();
  });

  it('clearSaveData removes the v2 key', () => {
    localStorage.setItem(V2_KEY, JSON.stringify(defaultSaveData));
    clearSaveData();
    expect(localStorage.getItem(V2_KEY)).toBeNull();
  });
});
