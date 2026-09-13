/**
 * Accessibility and personalisation settings.
 *
 * Single source of truth for language, text size, contrast, motion, voice and
 * TTS. Applied to `<html>` as data attributes so the CSS design system reacts
 * globally — including before React mounts, via the inline script in
 * `index.html`, which means no flash of the wrong text size on reload.
 *
 * Personalisation is deliberately minimal: a state code and nothing else.
 * SAARTHI never collects identifiers, documents or credentials.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { makeTranslator, type Translate } from '../lib/i18n'
import { api } from '../lib/api'
import { readJSON, writeJSON, SETTINGS_KEY } from '../lib/storage'
import type { LanguageCode, MetaConfig } from '../lib/types'

export type TextSize = 'small' | 'medium' | 'large' | 'xlarge'

/** Languages that will render right-to-left once they are added. */
const RTL_LANGUAGES: string[] = ['ur']

export interface Settings {
  language: LanguageCode
  textSize: TextSize
  voiceEnabled: boolean
  ttsEnabled: boolean
  reducedMotion: boolean
  highContrast: boolean
  /** Optional, non-identifying: improves state-specific guidance. */
  state: string | null
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'hi',
  textSize: 'medium',
  voiceEnabled: true,
  ttsEnabled: false,
  reducedMotion: false,
  highContrast: false,
  state: null,
}

interface SettingsContextValue {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  reset: () => void
  t: Translate
  dir: 'ltr' | 'rtl'
  meta: MetaConfig | null
  demoMode: boolean
  online: boolean
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

/** Respect the OS-level reduced-motion preference unless overridden. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const stored = readJSON<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS)
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      reducedMotion: stored.reducedMotion || prefersReducedMotion(),
    }
  })
  const [meta, setMeta] = useState<MetaConfig | null>(null)
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  const t = useMemo(() => makeTranslator(settings.language), [settings.language])
  // Planned right-to-left languages (Urdu) switch automatically when added.
  const dir: 'ltr' | 'rtl' = RTL_LANGUAGES.includes(settings.language) ? 'rtl' : 'ltr'

  // Persist and apply to <html>.
  useEffect(() => {
    writeJSON(SETTINGS_KEY, settings)
    const root = document.documentElement
    root.setAttribute('data-text', settings.textSize)
    root.setAttribute('data-contrast', settings.highContrast ? 'high' : 'normal')
    root.setAttribute('data-motion', settings.reducedMotion ? 'reduced' : 'auto')
    root.setAttribute('lang', settings.language)
    root.setAttribute('dir', dir)
  }, [settings, dir])

  // Backend copy + capabilities (disclaimer, demo mode, service counts).
  useEffect(() => {
    let cancelled = false
    api
      .metaConfig(settings.language)
      .then((config) => {
        if (!cancelled) setMeta(config)
      })
      .catch(() => {
        /* offline is fine — the UI has its own copy */
      })
    return () => {
      cancelled = true
    }
  }, [settings.language])

  // Offline detection so the UI can say something useful instead of spinning.
  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }))
  }, [])

  const reset = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() })
  }, [])

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      update,
      reset,
      t,
      dir,
      meta,
      demoMode: meta?.demo_mode ?? true,
      online,
    }),
    [settings, update, reset, t, dir, meta, online],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext)
  if (!context) throw new Error('useSettings must be used inside <SettingsProvider>')
  return context
}
