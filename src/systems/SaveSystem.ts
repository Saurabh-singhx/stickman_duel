/**
 * Safe, versioned localStorage persistence with automatic schema migration.
 * Gracefully degrades to an in-memory map in headless/private environments.
 */
export const CURRENT_SAVE_VERSION = 5;

export interface VersionedEnvelope<T> {
  readonly version: number;
  readonly data: T;
}

const memoryFallback = new Map<string, string>();

/**
 * Safely reads a string value from localStorage with try/catch fallback.
 */
export function safeGetItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // Fallback to memory store if storage is blocked or full
  }
  return memoryFallback.get(key) ?? null;
}

/**
 * Safely writes a string value to localStorage with try/catch fallback.
 */
export function safeSetItem(key: string, value: string): boolean {
  memoryFallback.set(key, value);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return true;
    }
  } catch {
    return false;
  }
  return true;
}

/**
 * Loads a versioned JSON record and runs the provided migration function if older.
 */
export function loadVersioned<T>(
  key: string,
  defaultValue: T,
  migrate: (raw: unknown, fromVersion: number) => T,
): T {
  const rawStr = safeGetItem(key);
  if (!rawStr) return defaultValue;
  try {
    const parsed = JSON.parse(rawStr) as Partial<VersionedEnvelope<unknown>>;
    if (typeof parsed !== 'object' || parsed === null) return defaultValue;
    const ver = typeof parsed.version === 'number' ? parsed.version : 1;
    if (ver === CURRENT_SAVE_VERSION && parsed.data !== undefined) {
      return parsed.data as T;
    }
    const migrated = migrate(parsed.data ?? parsed, ver);
    saveVersioned(key, migrated);
    return migrated;
  } catch {
    return defaultValue;
  }
}

/**
 * Saves a versioned JSON record safely.
 */
export function saveVersioned<T>(key: string, data: T): boolean {
  const envelope: VersionedEnvelope<T> = {
    version: CURRENT_SAVE_VERSION,
    data,
  };
  return safeSetItem(key, JSON.stringify(envelope));
}
