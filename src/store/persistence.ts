export interface SaveData {
  schemaVersion: 3;
  lastSession: {
    mode: 'line' | 'maze';
    mapId: string;
    robotId: string;
    algorithmId: string;
    // Sensor layout id, `robotId`'s own default when unset (Phase J). Additive field — a save
    // written before Phase J simply lacks this key; `mergeLastSession()` backfills it to that
    // session's own `robotId`, not the unrelated `defaultSaveData` robot.
    layoutId: string;
  };
  tunedParams: Record<string, Record<string, number | string>>;
  // Keyed `${mapId}:${robotId}:${algorithmId}:${layoutId}` since schemaVersion 3 — sensor
  // placement changes results, so a best time under one layout isn't comparable to another
  // (Algorithms.md §6 / Amendment A4).
  bestRuns: Record<string, { completed: boolean; timeMs: number; achievedAt: string }>;
  completedMaps: string[];
  // Remembers each robot's own last-picked sensor layout, keyed by robotId. Additive field — a
  // save written before this existed simply lacks the key, and `loadSaveData`'s spread over
  // `defaultSaveData` backfills it to `{}`. Without this, switching robots and switching back lost
  // track of a robot-specific saved layout, always reverting to that robot's built-in default
  // (ISSUES.md — user-reported: "changed the sensor, it did not come as [robot] custom").
  layoutByRobot: Record<string, string>;
  settings: {
    viewMode: '2d' | '3d';
    cameraPreset: 'iso' | 'top' | 'chase';
    speedMultiplier: number;
    showSensorOverlay: boolean;
  };
}

const STORAGE_KEY = 'vectortrack.v3';
const LEGACY_V2_STORAGE_KEY = 'vectortrack.v2';
const LEGACY_V1_STORAGE_KEY = 'vectortrack.v1';

export const defaultSaveData: SaveData = {
  schemaVersion: 3,
  lastSession: { mode: 'line', mapId: 'lf-oval', robotId: 'lf-scout', algorithmId: 'pid', layoutId: 'lf-scout' },
  tunedParams: {},
  bestRuns: {},
  completedMaps: [],
  settings: { viewMode: '3d', cameraPreset: 'iso', speedMultiplier: 1, showSensorOverlay: true },
  layoutByRobot: {},
};

interface SaveDataV2 extends Omit<SaveData, 'schemaVersion'> {
  schemaVersion: 2;
}

/**
 * Merges a parsed (possibly pre-Phase-J) `lastSession` over the defaults. `layoutId` is additive —
 * a save written before Phase J lacks the key entirely, and its implied layout is that session's
 * own `robotId` (same convention as `migrateBestRunKeysV2ToV3`'s bestRuns keys), not the unrelated
 * `defaultSaveData.lastSession.layoutId` a plain object-spread merge would otherwise produce.
 */
function mergeLastSession(parsed: Partial<SaveData['lastSession']> | undefined): SaveData['lastSession'] {
  const merged = { ...defaultSaveData.lastSession, ...parsed };
  return { ...merged, layoutId: parsed?.layoutId ?? merged.robotId };
}

/** v1 -> v2 is additive only: v1 had no custom-maps concept, so every v1 field maps straight across under schemaVersion 2. Custom maps live under their own `vectortrack.maps.v1` key (see store/customMaps.ts) and are untouched by this migration. */
function migrateLegacyV1(parsed: Record<string, unknown>): SaveDataV2 {
  return {
    ...structuredClone(defaultSaveData),
    ...parsed,
    schemaVersion: 2,
    lastSession: mergeLastSession(parsed.lastSession as Partial<SaveData['lastSession']>),
    settings: { ...defaultSaveData.settings, ...(parsed.settings as object) },
  };
}

/**
 * v2 -> v3 is additive only, except every `bestRuns` key gains a trailing `:${layoutId}` segment
 * (Algorithms.md §6 / Amendment A4) — built-in robots don't yet have a distinct custom sensor
 * layout (that ships in Phase J's `robots/layouts.ts`), so a pre-v3 key's implied layout is defined
 * to be the robot's own id; Phase J's built-in layout ids must match their robot's id exactly so
 * this migration's assumption stays correct and never needs re-doing.
 */
function migrateBestRunKeysV2ToV3(bestRuns: SaveData['bestRuns']): SaveData['bestRuns'] {
  const migrated: SaveData['bestRuns'] = {};
  for (const [key, value] of Object.entries(bestRuns)) {
    const parts = key.split(':');
    if (parts.length === 3) {
      const [mapId, robotId, algorithmId] = parts;
      migrated[`${mapId}:${robotId}:${algorithmId}:${robotId}`] = value;
    } else {
      migrated[key] = value; // already v3-shaped, or an unrecognized shape — pass through untouched
    }
  }
  return migrated;
}

function migrateV2ToV3(parsed: Record<string, unknown>): SaveData {
  return {
    ...structuredClone(defaultSaveData),
    ...parsed,
    schemaVersion: 3,
    lastSession: mergeLastSession(parsed.lastSession as Partial<SaveData['lastSession']>),
    settings: { ...defaultSaveData.settings, ...(parsed.settings as object) },
    bestRuns: migrateBestRunKeysV2ToV3((parsed.bestRuns as SaveData['bestRuns']) ?? {}),
  };
}

export function loadSaveData(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.schemaVersion !== 3) return structuredClone(defaultSaveData);
      return {
        ...structuredClone(defaultSaveData),
        ...parsed,
        lastSession: mergeLastSession(parsed.lastSession),
        settings: { ...defaultSaveData.settings, ...parsed.settings },
      };
    }

    const v2Raw = localStorage.getItem(LEGACY_V2_STORAGE_KEY);
    if (v2Raw) {
      const v2Parsed = JSON.parse(v2Raw);
      if (v2Parsed?.schemaVersion !== 2) return structuredClone(defaultSaveData);
      const migrated = migrateV2ToV3(v2Parsed);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      } catch {
        // migration write failed (e.g. quota): still return the migrated data for this session
      }
      return migrated;
    }

    const legacyRaw = localStorage.getItem(LEGACY_V1_STORAGE_KEY);
    if (legacyRaw) {
      const legacyParsed = JSON.parse(legacyRaw);
      if (legacyParsed?.schemaVersion !== 1) return structuredClone(defaultSaveData);
      const migrated = migrateV2ToV3(migrateLegacyV1(legacyParsed) as unknown as Record<string, unknown>);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      } catch {
        // migration write failed (e.g. quota): still return the migrated data for this session
      }
      return migrated;
    }

    return structuredClone(defaultSaveData);
  } catch {
    return structuredClone(defaultSaveData);
  }
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
let pendingWrite: SaveData | null = null;

function writeNow(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable/full: drop silently, never crash the app
  }
}

export function saveSaveDataDebounced(data: SaveData, delayMs = 500): void {
  if (writeTimer) clearTimeout(writeTimer);
  pendingWrite = data;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    pendingWrite = null;
    writeNow(data);
  }, delayMs);
}

/**
 * Writes a still-pending debounced save immediately, a no-op otherwise. Without this, a save made
 * right before the tab closes/reloads (e.g. saving a sensor layout and immediately refreshing) can
 * lose up to `delayMs` of state — the selection reverts to whatever was last flushed — even though
 * the debounce itself is desirable for high-frequency writes like param dragging.
 */
export function flushSaveData(): void {
  if (writeTimer === null || pendingWrite === null) return;
  clearTimeout(writeTimer);
  writeTimer = null;
  const data = pendingWrite;
  pendingWrite = null;
  writeNow(data);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushSaveData);
  window.addEventListener('beforeunload', flushSaveData);
}

export function clearSaveData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
