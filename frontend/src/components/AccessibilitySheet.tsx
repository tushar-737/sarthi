/**
 * Quick accessibility sheet.
 *
 * The controls people need most — text size, contrast, motion and read-aloud —
 * reachable from any page in two taps, without a trip to the settings screen.
 */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Contrast, Minus, Plus, Settings2, Volume2, Zap } from 'lucide-react'
import { cn } from '../lib/cn'
import { useSettings, type TextSize } from '../context/SettingsContext'
import { Button, LinkButton } from './ui'

const TEXT_SIZES: TextSize[] = ['small', 'medium', 'large', 'xlarge']

export function AccessibilitySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, update, t } = useSettings()
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on Escape and keep focus inside while open.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (!focusables.length) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const stepText = (delta: number) => {
    const index = TEXT_SIZES.indexOf(settings.textSize)
    const next = TEXT_SIZES[Math.min(Math.max(index + delta, 0), TEXT_SIZES.length - 1)]
    update({ textSize: next })
  }

  const sizeLabel: Record<TextSize, string> = {
    small: t('settings.small'),
    medium: t('settings.medium'),
    large: t('settings.large'),
    xlarge: t('settings.xlarge'),
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-navy-900/50 p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.title')}
        className="mt-14 w-full max-w-sm rounded-card bg-white p-4 shadow-lift animate-sarthi-rise focus-visible:outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-navy-800 mb-3">{t('common.accessibility')}</h2>

        {/* Text size: A− / A / A+ */}
        <div className="rounded-xl border-2 border-line p-3">
          <p className="text-sm font-bold text-navy-800 mb-2">{t('settings.textSize')}</p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="md"
              icon={Minus}
              onClick={() => stepText(-1)}
              disabled={settings.textSize === 'small'}
              aria-label={`${t('settings.textSize')} −`}
              className="flex-1"
            >
              <span className="sr-only">{sizeLabel.small}</span>A−
            </Button>
            <span
              className="min-w-16 text-center text-sm font-semibold text-ink-soft"
              aria-live="polite"
            >
              {sizeLabel[settings.textSize]}
            </span>
            <Button
              variant="secondary"
              size="md"
              icon={Plus}
              onClick={() => stepText(1)}
              disabled={settings.textSize === 'xlarge'}
              aria-label={`${t('settings.textSize')} +`}
              className="flex-1"
            >
              <span className="sr-only">{sizeLabel.xlarge}</span>A+
            </Button>
          </div>
          <p className="mt-2 rounded-lg bg-surface-muted p-2 text-sm text-ink">
            {t('settings.previewText')}
          </p>
        </div>

        <div className="mt-3 space-y-2">
          <QuickToggle
            icon={Contrast}
            label={t('settings.highContrast')}
            checked={settings.highContrast}
            onChange={(next) => update({ highContrast: next })}
          />
          <QuickToggle
            icon={Zap}
            label={t('settings.reducedMotion')}
            checked={settings.reducedMotion}
            onChange={(next) => update({ reducedMotion: next })}
          />
          <QuickToggle
            icon={Volume2}
            label={t('settings.tts')}
            checked={settings.ttsEnabled}
            onChange={(next) => update({ ttsEnabled: next })}
          />
        </div>

        <div className="mt-4 flex gap-2">
          <LinkButton to="/settings" variant="secondary" size="md" icon={Settings2} fullWidth>
            {t('nav.settings')}
          </LinkButton>
          <Button variant="primary" size="md" fullWidth onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function QuickToggle({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: typeof Contrast
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex w-full min-h-12 items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors duration-150',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600',
        checked
          ? 'border-trust-300 bg-trust-50 text-trust-800'
          : 'border-line bg-white text-ink-soft hover:border-line-strong',
      )}
    >
      <Icon className={cn('size-5 shrink-0', checked ? 'text-trust-700' : 'text-ink-mute')} aria-hidden="true" />
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <span
        className={cn(
          'shrink-0 rounded-pill px-2 py-0.5 text-xs font-bold',
          checked ? 'bg-success-600 text-white' : 'bg-surface-sunken text-ink-mute',
        )}
      >
        {checked ? 'ON' : 'OFF'}
      </span>
    </button>
  )
}
