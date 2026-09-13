/**
 * Application shell: header, content, footer and the mobile tab bar.
 *
 * Mobile-first. On a phone the five primary destinations live in a thumb
 * reach bottom bar; from `md` up the same destinations move into the header and
 * the bar hides. A skip link is the first focusable element on every page.
 */

import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Compass, FileText, Home, MessageCircle, Settings2, Accessibility } from 'lucide-react'
import { cn } from '../lib/cn'
import { useSettings } from '../context/SettingsContext'
import { AccessibilitySheet } from './AccessibilitySheet'
import { LanguageSelector } from './LanguageSelector'
import type { LucideIcon } from 'lucide-react'

interface NavItem {
  to: string
  icon: LucideIcon
  labelKey: string
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', icon: Home, labelKey: 'nav.home' },
  { to: '/assistant', icon: MessageCircle, labelKey: 'nav.ask' },
  { to: '/services', icon: FileText, labelKey: 'nav.services' },
  { to: '/navigator', icon: Compass, labelKey: 'nav.navigator' },
  { to: '/settings', icon: Settings2, labelKey: 'nav.settings' },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { t, meta, demoMode } = useSettings()
  const [a11yOpen, setA11yOpen] = useState(false)
  const location = useLocation()

  // `meta` arrives from the backend; the UI must be complete before it does.
  const appName = meta?.app_name ?? t('app.name')
  const tagline = meta?.tagline ?? t('app.tagline')

  return (
    <div className="flex min-h-dvh flex-col bg-surface-muted">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-xl focus:bg-navy-800 focus:px-4 focus:py-3 focus:text-base focus:font-bold focus:text-white"
      >
        {t('nav.skip')}
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center gap-3 px-3 sm:px-4">
          <NavLink to="/" className="flex items-center gap-2.5 shrink-0 group">
            <span className="grid size-10 place-items-center rounded-xl bg-navy-800 text-white shadow-card transition-transform group-hover:scale-105">
              <Compass className="size-6" aria-hidden="true" />
            </span>
            <span className="leading-tight">
              <span className="block text-lg font-extrabold tracking-tight text-navy-800">
                {appName}
              </span>
              <span className="hidden text-xs text-ink-mute sm:block">{tagline}</span>
            </span>
          </NavLink>

          <nav className="ml-auto hidden md:flex items-center gap-1" aria-label={t('nav.main')}>
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
                    'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600',
                    isActive
                      ? 'bg-trust-50 text-trust-800'
                      : 'text-ink-soft hover:bg-surface-sunken hover:text-navy-800',
                  )
                }
              >
                <item.icon className="size-4.5" aria-hidden="true" />
                {t(item.labelKey)}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex md:ml-2 items-center gap-2">
            <LanguageSelector compact />
            <button
              type="button"
              onClick={() => setA11yOpen(true)}
              aria-label={t('common.accessibility')}
              aria-haspopup="dialog"
              className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-line bg-white text-navy-700 transition-colors hover:border-trust-300 hover:text-trust-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600"
            >
              <Accessibility className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" className="flex-1 pb-24 md:pb-8" tabIndex={-1}>
        <div
          key={location.pathname}
          className="mx-auto w-full max-w-6xl animate-sarthi-rise px-3 py-4 sm:px-4 sm:py-6"
        >
          {children}
        </div>
      </main>

      <footer className="hidden md:block border-t border-line bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-6">
          <p className="text-sm font-semibold text-navy-800">
            {appName} — {tagline}
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-mute">
            {meta?.disclaimer ?? t('common.disclaimer')}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-mute">
            <span>{meta?.privacy_notice ?? t('common.privacy')}</span>
            {demoMode ? (
              <span className="inline-flex items-center gap-1 rounded-pill bg-attention-50 px-2 py-0.5 font-bold text-attention-700">
                {t('assistant.demoMode')}
              </span>
            ) : null}
            <span className="text-navy-700">
              {meta?.prototype_notice ?? t('app.prototype')}
            </span>
          </div>
        </div>
      </footer>

      {/* Mobile tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label={t('nav.main')}
      >
        <ul className="mx-auto flex w-full max-w-lg items-stretch">
          {NAV_ITEMS.map((item) => (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold transition-colors',
                    'focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-trust-600',
                    isActive ? 'text-trust-700' : 'text-ink-mute',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'grid size-8 place-items-center rounded-lg',
                        isActive && 'bg-trust-50',
                      )}
                    >
                      <item.icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="truncate max-w-full">{t(item.labelKey)}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <AccessibilitySheet open={a11yOpen} onClose={() => setA11yOpen(false)} />
    </div>
  )
}
