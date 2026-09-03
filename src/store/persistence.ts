export interface SaveData {
  schemaVersion: 2;
  lastSession: {
    mode: 'line' | 'maze';
    mapId: string;
    robotId: string;
    algorithmId: string;
  };
  tunedParams: Record<string, Record<string, number | string>>;
  bestRuns: Record<string, { completed: boolean; timeMs: number; achievedAt: string }>;
  completedMaps: string[];
  settings: {
    viewMode: '2d' | '3d';
    cameraPreset: 'iso' | 'top' | 'chase';
    speedMultiplier: number;
    showSensorOverlay: boolean;
  };
}

const STORAGE_KEY = 'vectortrack.v2';
const LEGACY_V1_STORAGE_KEY = 'vectortrack.v1';

export const defaultSaveData: SaveData = {
  schemaVersion: 2,
  lastSession: { mode: 'line', mapId: 'lf-oval', robotId: 'lf-scout', algorithmId: 'pid' },
  tunedParams: {},
  bestRuns: {},
  completedMaps: [],
  settings: { viewMode: '3d', cameraPreset: 'iso', speedMultiplier: 1, showSensorOverlay: true },
};

/** v1 -> v2 is additive only: v1 had no custom-maps concept, so every v1 field maps straight across under schemaVersion 2. Custom maps live under their own `vectortrack.maps.v1` key (see store/customMaps.ts) and are untouched by this migration. */
function migrateLegacyV1(parsed: Record<string, unknown>): SaveData {
  return {
    ...structuredClone(defaultSaveData),
    ...parsed,
    schemaVersion: 2,
    lastSession: { ...defaultSaveData.lastSession, ...(parsed.lastSession as object) },
    settings: { ...defaultSaveData.settings, ...(parsed.settings as object) },
  };
}

export function loadSaveData(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.schemaVersion !== 2) return structuredClone(defaultSaveData);
      return {
        ...structuredClone(defaultSaveData),
        ...parsed,
        lastSession: { ...defaultSaveData.lastSession, ...parsed.lastSession },
        settings: { ...defaultSaveData.settings, ...parsed.settings },
      };
    }
    const legacyRaw = localStorage.getItem(LEGACY_V1_STORAGE_KEY);
    if (legacyRaw) {
      const legacyParsed = JSON.parse(legacyRaw);
      if (legacyParsed?.schemaVersion !== 1) return structuredClone(defaultSaveData);
      const migrated = migrateLegacyV1(legacyParsed);
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

export function saveSaveDataDebounced(data: SaveData, delayMs = 500): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // storage unavailable/full: drop silently, never crash the app
    }
  }, delayMs);
}

export function clearSaveData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
