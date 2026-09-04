import {
  ALGORITHM_DRAFT_KEY_PREFIX,
  ALGORITHM_DRAFT_MAX_AGE_MS,
  CUSTOM_ALGORITHMS_STORAGE_KEY,
  CUSTOM_ALGORITHM_SOFT_CAP,
  CUSTOM_SENSOR_LAYOUT_SOFT_CAP,
} from '../algorithms/custom/types';
import type { CustomAlgorithm, CustomAlgorithmStore, CustomSensorLayout } from '../algorithms/custom/types';

export const defaultCustomAlgorithmStore: CustomAlgorithmStore = { schemaVersion: 1, algorithms: {}, sensorLayouts: {} };

export class AlgorithmQuotaError extends Error {}

export function loadCustomAlgorithmStore(): CustomAlgorithmStore {
  try {
    const raw = localStorage.getItem(CUSTOM_ALGORITHMS_STORAGE_KEY);
    if (!raw) return structuredClone(defaultCustomAlgorithmStore);
    const parsed = JSON.parse(raw);
    if (
      parsed?.schemaVersion !== 1 ||
      typeof parsed.algorithms !== 'object' ||
      parsed.algorithms === null ||
      typeof parsed.sensorLayouts !== 'object' ||
      parsed.sensorLayouts === null
    ) {
      return structuredClone(defaultCustomAlgorithmStore);
    }
    return parsed as CustomAlgorithmStore;
  } catch {
    return structuredClone(defaultCustomAlgorithmStore);
  }
}

/** Synchronous save — throws AlgorithmQuotaError on quota exhaustion so callers (e.g. an explicit "Save" button) can surface a real message instead of silently losing work. */
export function saveCustomAlgorithmStore(store: CustomAlgorithmStore): void {
  try {
    localStorage.setItem(CUSTOM_ALGORITHMS_STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      throw new AlgorithmQuotaError('Storage full — export and delete some algorithms.');
    }
    throw err;
  }
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced background autosave. Quota errors are reported via onQuotaExceeded rather than thrown, since there's no caller left on the stack to catch them by the time the timer fires. */
export function saveCustomAlgorithmStoreDebounced(
  store: CustomAlgorithmStore,
  delayMs = 500,
  onQuotaExceeded?: (err: AlgorithmQuotaError) => void,
): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      saveCustomAlgorithmStore(store);
    } catch (err) {
      if (err instanceof AlgorithmQuotaError) onQuotaExceeded?.(err);
    }
  }, delayMs);
}

export function upsertCustomAlgorithm(store: CustomAlgorithmStore, algorithm: CustomAlgorithm): CustomAlgorithmStore {
  const isNew = !(algorithm.id in store.algorithms);
  if (isNew && Object.keys(store.algorithms).length >= CUSTOM_ALGORITHM_SOFT_CAP) {
    throw new AlgorithmQuotaError(`You've reached the ${CUSTOM_ALGORITHM_SOFT_CAP}-algorithm limit — export and delete some algorithms.`);
  }
  return { ...store, algorithms: { ...store.algorithms, [algorithm.id]: algorithm } };
}

export function deleteCustomAlgorithm(store: CustomAlgorithmStore, id: string): CustomAlgorithmStore {
  const algorithms = { ...store.algorithms };
  delete algorithms[id];
  return { ...store, algorithms };
}

export function getCustomAlgorithm(store: CustomAlgorithmStore, id: string): CustomAlgorithm | undefined {
  return store.algorithms[id];
}

export function listCustomAlgorithms(store: CustomAlgorithmStore): CustomAlgorithm[] {
  return Object.values(store.algorithms).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function upsertCustomSensorLayout(store: CustomAlgorithmStore, layout: CustomSensorLayout): CustomAlgorithmStore {
  const isNew = !(layout.id in store.sensorLayouts);
  if (isNew && Object.keys(store.sensorLayouts).length >= CUSTOM_SENSOR_LAYOUT_SOFT_CAP) {
    throw new AlgorithmQuotaError(`You've reached the ${CUSTOM_SENSOR_LAYOUT_SOFT_CAP}-sensor-layout limit — export and delete some layouts.`);
  }
  return { ...store, sensorLayouts: { ...store.sensorLayouts, [layout.id]: layout } };
}

export function deleteCustomSensorLayout(store: CustomAlgorithmStore, id: string): CustomAlgorithmStore {
  const sensorLayouts = { ...store.sensorLayouts };
  delete sensorLayouts[id];
  return { ...store, sensorLayouts };
}

export function getCustomSensorLayout(store: CustomAlgorithmStore, id: string): CustomSensorLayout | undefined {
  return store.sensorLayouts[id];
}

export function listCustomSensorLayouts(store: CustomAlgorithmStore): CustomSensorLayout[] {
  return Object.values(store.sensorLayouts).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function clearCustomAlgorithmStore(): void {
  try {
    localStorage.removeItem(CUSTOM_ALGORITHMS_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// --- Draft autosave (Algorithms.md §4/§3.2) — separate per-algorithm key, never touches
// CustomAlgorithmStore until an explicit save.

export interface AlgorithmDraft {
  source: string;
  savedAt: string; // ISO
}

function draftKey(algorithmId: string): string {
  return `${ALGORITHM_DRAFT_KEY_PREFIX}${algorithmId}`;
}

export function saveAlgorithmDraft(algorithmId: string, source: string): void {
  const draft: AlgorithmDraft = { source, savedAt: new Date().toISOString() };
  try {
    localStorage.setItem(draftKey(algorithmId), JSON.stringify(draft));
  } catch {
    // best-effort — a lost draft autosave isn't worth surfacing an error for
  }
}

let draftTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced draft autosave — the editor calls this on every keystroke; §4 specifies a 2s cadence. */
export function saveAlgorithmDraftDebounced(algorithmId: string, source: string, delayMs = 2000): void {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => saveAlgorithmDraft(algorithmId, source), delayMs);
}

export function loadAlgorithmDraft(algorithmId: string): AlgorithmDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(algorithmId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.source !== 'string' || typeof parsed?.savedAt !== 'string') return null;
    return parsed as AlgorithmDraft;
  } catch {
    return null;
  }
}

export function clearAlgorithmDraft(algorithmId: string): void {
  try {
    localStorage.removeItem(draftKey(algorithmId));
  } catch {
    // ignore
  }
}

/** Garbage-collects drafts older than ALGORITHM_DRAFT_MAX_AGE_MS ("GC'd after 7 days", §4). Call opportunistically (e.g. on app start) since localStorage has no TTL support. */
export function gcAlgorithmDrafts(): void {
  const now = Date.now();
  const staleKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(ALGORITHM_DRAFT_KEY_PREFIX)) continue;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? '');
      const savedAt = Date.parse(parsed?.savedAt);
      if (!Number.isNaN(savedAt) && now - savedAt > ALGORITHM_DRAFT_MAX_AGE_MS) staleKeys.push(key);
    } catch {
      staleKeys.push(key); // corrupt draft — safe to drop
    }
  }
  for (const key of staleKeys) localStorage.removeItem(key);
}
