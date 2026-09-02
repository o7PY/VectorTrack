export interface SaveData {
  schemaVersion: 1;
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

const STORAGE_KEY = 'vectortrack.v1';

export const defaultSaveData: SaveData = {
  schemaVersion: 1,
  lastSession: { mode: 'line', mapId: 'lf-oval', robotId: 'lf-scout', algorithmId: 'pid' },
  tunedParams: {},
  bestRuns: {},
  completedMaps: [],
  settings: { viewMode: '3d', cameraPreset: 'iso', speedMultiplier: 1, showSensorOverlay: true },
};

export function loadSaveData(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultSaveData);
    const parsed = JSON.parse(raw);
    if (parsed?.schemaVersion !== 1) return structuredClone(defaultSaveData);
    return {
      ...structuredClone(defaultSaveData),
      ...parsed,
      lastSession: { ...defaultSaveData.lastSession, ...parsed.lastSession },
      settings: { ...defaultSaveData.settings, ...parsed.settings },
    };
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
