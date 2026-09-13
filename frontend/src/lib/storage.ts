/** Typed localStorage helpers. Storage is a convenience, never a requirement. */

export const SETTINGS_KEY = 'sarthi.settings'
export const JOURNEY_KEY_PREFIX = 'sarthi.journey.'
export const CONVERSATION_KEY = 'sarthi.conversation'

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...(JSON.parse(raw) as T) }
  } catch {
    return fallback
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode or quota — the app keeps working in memory */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** Read a value without merging — use for arrays and primitives. */
export function readValue<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** Every stored key starting with `prefix` (e.g. saved journeys). */
export function keysWithPrefix(prefix: string): string[] {
  try {
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key && key.startsWith(prefix)) keys.push(key)
    }
    return keys
  } catch {
    return []
  }
}
