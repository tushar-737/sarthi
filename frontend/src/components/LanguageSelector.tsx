/**
 * Language selector.
 *
 * A native <select> on purpose: it is keyboard accessible, works with screen
 * readers, opens the platform picker on mobile, and never traps focus. Planned
 * languages are listed but disabled, so the roadmap is visible without
 * offering a control that silently does nothing.
 */

import { Globe } from 'lucide-react'
import { cn } from '../lib/cn'
import { useSettings } from '../context/SettingsContext'
import { LANGUAGES } from '../lib/i18n'
import type { LanguageCode } from '../lib/types'

const PLANNED = [
  { code: 'bn', native: 'বাংলা', english: 'Bengali' },
  { code: 'mr', native: 'मराठी', english: 'Marathi' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil' },
  { code: 'te', native: 'తెలుగు', english: 'Telugu' },
  { code: 'gu', native: 'ગુજરાતી', english: 'Gujarati' },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada' },
  { code: 'ml', native: 'മലയാളം', english: 'Malayalam' },
  { code: 'pa', native: 'ਪੰਜਾਬੀ', english: 'Punjabi' },
  { code: 'or', native: 'ଓଡ଼ିଆ', english: 'Odia' },
  { code: 'as', native: 'অসমীয়া', english: 'Assamese' },
  { code: 'ur', native: 'اردو', english: 'Urdu' },
]

export function LanguageSelector({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  const { settings, update, t } = useSettings()

  return (
    <div className={cn('relative flex items-center', className)}>
      <label className="sr-only" htmlFor="language-select">
        {t('common.languageSelector')}
      </label>
      <Globe
        className={cn(
          'pointer-events-none absolute left-2.5 text-trust-600',
          compact ? 'size-4' : 'size-5',
        )}
        aria-hidden="true"
      />
      <select
        id="language-select"
        value={settings.language}
        onChange={(event) => update({ language: event.target.value as LanguageCode })}
        className={cn(
          'appearance-none rounded-xl border-2 border-line bg-white font-semibold text-navy-800',
          'pl-9 pr-8 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600',
          'hover:border-trust-300 cursor-pointer',
          compact ? 'min-h-10 text-sm' : 'min-h-12 text-base',
        )}
      >
        <optgroup label={t('common.languageSelector')}>
          {LANGUAGES.map((language) => (
            <option key={language.code} value={language.code}>
              {language.native} — {language.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Coming soon">
          {PLANNED.map((language) => (
            <option key={language.code} value={language.code} disabled>
              {language.native} — {language.english}
            </option>
          ))}
        </optgroup>
      </select>
      <span
        className="pointer-events-none absolute right-2.5 text-ink-mute"
        aria-hidden="true"
      >
        ▾
      </span>
    </div>
  )
}
