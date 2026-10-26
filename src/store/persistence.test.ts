// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSaveData, defaultSaveData, flushSaveData, loadSaveData, saveSaveDataDebounced } from './persistence';

const V3_KEY = 'vectortrack.v3';
const V2_KEY = 'vectortrack.v2';
const V1_KEY = 'vectortrack.v1';

describe('persistence v1 -> v2 -> v3 migration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when nothing is saved', () => {
    expect(loadSaveData()).toEqual(defaultSaveData);
  });

  it('migrates a legacy v1 object all the way forward to v3 and persists it under the new key', () => {
    const legacy = {
      schemaVersion: 1,
      lastSession: { mode: 'maze', mapId: 'mz-intro', robotId: 'mz-probe', algorithmId: 'wallFollower' },
      tunedParams: { 'mz-probe:wallFollower': { hand: 'right' } },
      bestRuns: { 'mz-intro:mz-probe:wallFollower': { completed: true, timeMs: 12000, achievedAt: '2026-01-01T00:00:00.000Z' } },
      completedMaps: ['mz-intro'],
      settings: { viewMode: '2d', cameraPreset: 'top', speedMultiplier: 2, showSensorOverlay: false },
    };
    localStorage.setItem(V1_KEY, JSON.stringify(legacy));

    const loaded = loadSaveData();
    expect(loaded.schemaVersion).toBe(3);
    // layoutId is additive (Phase J) — backfilled to the robot's own id, matching the pre-Phase-J
    // implicit default layout, since `legacy.lastSession` predates the concept entirely.
    expect(loaded.lastSession).toEqual({ ...legacy.lastSession, layoutId: legacy.lastSession.robotId });
    expect(loaded.tunedParams).toEqual(legacy.tunedParams);
    expect(loaded.completedMaps).toEqual(legacy.completedMaps);
    expect(loaded.settings).toEqual(legacy.settings);
    // bestRuns keys gain the trailing `:${robotId}` layout segment along the way.
    expect(loaded.bestRuns).toEqual({
      'mz-intro:mz-probe:wallFollower:mz-probe': legacy.bestRuns['mz-intro:mz-probe:wallFollower'],
    });

    // migration persists the result under the new key so it only runs once
    const migratedRaw = localStorage.getItem(V3_KEY);
    expect(migratedRaw).not.toBeNull();
    expect(JSON.parse(migratedRaw as string).schemaVersion).toBe(3);
  });

  it('migrates a v2 object forward to v3, appending the robot id as the implied layout id on bestRuns keys', () => {
    const v2Data = {
      schemaVersion: 2,
      lastSession: { mode: 'line', mapId: 'lf-oval', robotId: 'lf-scout', algorithmId: 'pid' },
      tunedParams: { 'lf-scout:pid': { Kp: 0.4, Ki: 0, Kd: 0.1, baseSpeed: 300 } },
      bestRuns: { 'lf-oval:lf-scout:pid': { completed: true, timeMs: 5000, achievedAt: '2026-02-01T00:00:00.000Z' } },
      completedMaps: ['lf-oval'],
      settings: defaultSaveData.settings,
    };
    localStorage.setItem(V2_KEY, JSON.stringify(v2Data));

    const loaded = loadSaveData();
    expect(loaded.schemaVersion).toBe(3);
    expect(loaded.bestRuns).toEqual({
      'lf-oval:lf-scout:pid:lf-scout': v2Data.bestRuns['lf-oval:lf-scout:pid'],
    });

    const migratedRaw = localStorage.getItem(V3_KEY);
    expect(migratedRaw).not.toBeNull();
    expect(JSON.parse(migratedRaw as string).schemaVersion).toBe(3);
  });

  it('leaves an already-v3-shaped bestRuns key untouched', () => {
    const v2Data = {
      ...defaultSaveData,
      schemaVersion: 2,
      bestRuns: { 'lf-oval:lf-scout:pid:layout-custom-1': { completed: true, timeMs: 4000, achievedAt: '2026-02-01T00:00:00.000Z' } },
    };
    localStorage.setItem(V2_KEY, JSON.stringify(v2Data));

    const loaded = loadSaveData();
    expect(loaded.bestRuns).toEqual(v2Data.bestRuns);
  });

  it('prefers an existing v3 object over legacy v1/v2 ones', () => {
    localStorage.setItem(V1_KEY, JSON.stringify({ ...defaultSaveData, schemaVersion: 1 }));
    localStorage.setItem(V2_KEY, JSON.stringify({ ...defaultSaveData, schemaVersion: 2 }));
    const v3Data = {
      ...defaultSaveData,
      lastSession: { mode: 'line' as const, mapId: 'lf-sharp', robotId: 'lf-scout', algorithmId: 'pid' },
    };
    localStorage.setItem(V3_KEY, JSON.stringify(v3Data));

    expect(loadSaveData().lastSession.mapId).toBe('lf-sharp');
  });

  it('prefers an existing v2 object over a legacy v1 one when there is no v3 object yet', () => {
    localStorage.setItem(V1_KEY, JSON.stringify({ ...defaultSaveData, schemaVersion: 1 }));
    const v2Data = {
      ...defaultSaveData,
      schemaVersion: 2,
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

  it('discards corrupt v3 data instead of crashing', () => {
    localStorage.setItem(V3_KEY, '{not json');
    expect(loadSaveData()).toEqual(defaultSaveData);
  });

  it('saveSaveDataDebounced eventually writes to the v3 key', async () => {
    saveSaveDataDebounced(defaultSaveData, 10);
    await new Promise((r) => setTimeout(r, 50));
    expect(localStorage.getItem(V3_KEY)).not.toBeNull();
  });

  it('flushSaveData writes a still-pending debounced save immediately, without waiting out the delay', () => {
    const withCustomLayout = { ...defaultSaveData, lastSession: { ...defaultSaveData.lastSession, layoutId: 'layout:abc123' } };
    saveSaveDataDebounced(withCustomLayout, 10_000); // long enough that it would not fire on its own during this test.
    flushSaveData();
    expect(JSON.parse(localStorage.getItem(V3_KEY)!).lastSession.layoutId).toBe('layout:abc123');
  });

  it('flushSaveData is a no-op when nothing is pending (e.g. already written, or never scheduled)', () => {
    localStorage.setItem(V3_KEY, JSON.stringify(defaultSaveData));
    expect(() => flushSaveData()).not.toThrow();
    expect(JSON.parse(localStorage.getItem(V3_KEY)!)).toEqual(defaultSaveData);
  });

  it('clearSaveData removes the v3 key', () => {
    localStorage.setItem(V3_KEY, JSON.stringify(defaultSaveData));
    clearSaveData();
    expect(localStorage.getItem(V3_KEY)).toBeNull();
  });
});
