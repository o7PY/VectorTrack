import { CUSTOM_MAPS_STORAGE_KEY, CUSTOM_MAP_SOFT_CAP } from '../maps/custom/types';
import type { CustomMap, CustomMapStore } from '../maps/custom/types';

export const defaultCustomMapStore: CustomMapStore = { schemaVersion: 1, maps: {} };

export class MapQuotaError extends Error {}

export function loadCustomMapStore(): CustomMapStore {
  try {
    const raw = localStorage.getItem(CUSTOM_MAPS_STORAGE_KEY);
    if (!raw) return structuredClone(defaultCustomMapStore);
    const parsed = JSON.parse(raw);
    if (parsed?.schemaVersion !== 1 || typeof parsed.maps !== 'object' || parsed.maps === null) {
      return structuredClone(defaultCustomMapStore);
    }
    return parsed as CustomMapStore;
  } catch {
    return structuredClone(defaultCustomMapStore);
  }
}

/** Synchronous save — throws MapQuotaError on quota exhaustion so callers (e.g. an explicit "Save" button) can surface a real message instead of silently losing work. */
export function saveCustomMapStore(store: CustomMapStore): void {
  try {
    localStorage.setItem(CUSTOM_MAPS_STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      throw new MapQuotaError('Storage full — export and delete some maps.');
    }
    throw err;
  }
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced background autosave (e.g. drafts). Quota errors are reported via onQuotaExceeded rather than thrown, since there's no caller left on the stack to catch them by the time the timer fires. */
export function saveCustomMapStoreDebounced(
  store: CustomMapStore,
  delayMs = 500,
  onQuotaExceeded?: (err: MapQuotaError) => void,
): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      saveCustomMapStore(store);
    } catch (err) {
      if (err instanceof MapQuotaError) onQuotaExceeded?.(err);
    }
  }, delayMs);
}

export function upsertCustomMap(store: CustomMapStore, map: CustomMap): CustomMapStore {
  const isNew = !(map.id in store.maps);
  if (isNew && Object.keys(store.maps).length >= CUSTOM_MAP_SOFT_CAP) {
    throw new MapQuotaError(`You've reached the ${CUSTOM_MAP_SOFT_CAP}-map limit — export and delete some maps.`);
  }
  return { ...store, maps: { ...store.maps, [map.id]: map } };
}

export function deleteCustomMap(store: CustomMapStore, id: string): CustomMapStore {
  const maps = { ...store.maps };
  delete maps[id];
  return { ...store, maps };
}

export function getCustomMap(store: CustomMapStore, id: string): CustomMap | undefined {
  return store.maps[id];
}

export function listCustomMaps(store: CustomMapStore): CustomMap[] {
  return Object.values(store.maps).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function clearCustomMapStore(): void {
  try {
    localStorage.removeItem(CUSTOM_MAPS_STORAGE_KEY);
  } catch {
    // ignore
  }
}
