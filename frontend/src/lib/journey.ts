/**
 * Guided-journey progress.
 *
 * Progress belongs to the device, not to an account: SAARTHI has no login and
 * stores no identity. Entries are kept in localStorage so a citizen can close
 * the tab and come back to step 4 of 10, and mirrored to the backend's
 * progress endpoint so the same journey can be resumed on another session.
 */

import { JOURNEY_KEY_PREFIX, keysWithPrefix, readValue, remove, writeJSON } from './storage'

export interface SavedJourney {
  service_id: string
  service_name: string
  current_step: number
  total_steps: number
  completed: string[]
  percent_complete: number
  updated_at: number
}

const key = (serviceId: string) => `${JOURNEY_KEY_PREFIX}${serviceId}`

export function loadJourney(serviceId: string): SavedJourney | null {
  const stored = readValue<SavedJourney>(key(serviceId))
  if (!stored || typeof stored.service_id !== 'string') return null
  return {
    ...stored,
    completed: Array.isArray(stored.completed) ? stored.completed : [],
    current_step: Number(stored.current_step) || 1,
    total_steps: Number(stored.total_steps) || 0,
    percent_complete: Number(stored.percent_complete) || 0,
  }
}

export function saveJourney(entry: SavedJourney): void {
  writeJSON(key(entry.service_id), { ...entry, updated_at: Date.now() })
}

export function clearJourney(serviceId: string): void {
  remove(key(serviceId))
}

export function listJourneys(): SavedJourney[] {
  return keysWithPrefix(JOURNEY_KEY_PREFIX)
    .map((storageKey) => readValue<SavedJourney>(storageKey))
    .filter((entry): entry is SavedJourney => Boolean(entry && entry.service_id))
    .sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0))
}

export function percentComplete(completed: string[], total: number): number {
  if (!total) return 0
  return Math.round((completed.length / total) * 100)
}
