/**
 * Landing / welcome.
 *
 * The one job of this screen: get a citizen asking their question in under ten
 * seconds. Tap to Speak is the largest thing on the page, typing is right
 * beside it, and the suggested questions are real questions from the knowledge
 * base in the citizen's own language.
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Compass,
  FileText,
  Keyboard,
  ListChecks,
  Mic,
  MicOff,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  WifiOff,
} from 'lucide-react'
import { Button, Card, CategoryIcon, InlineNote, LinkButton, VerificationBadge } from '../components/ui'
import { MicButton } from '../components/VoiceInput'
import { LanguageSelector } from '../components/LanguageSelector'
import { useSettings } from '../context/SettingsContext'
import { useChat } from '../context/ChatContext'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAsync } from '../hooks/useAsync'
import { useVoiceSupport } from '../hooks/useVoiceSupport'
import { api } from '../lib/api'
import { cn } from '../lib/cn'

export function LandingPage() {
  const { t, settings, meta, online, demoMode } = useSettings()
  const { send, messages } = useChat()
  const voice = useVoiceSupport()
  const navigate = useNavigate()

  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const categories = useAsync(() => api.categories(settings.language), [settings.language])
  const phrases = useAsync(() => api.phrases(settings.language), [settings.language])

  const suggestions = phrases.data?.suggested_prompts?.slice(0, 6) ?? []

  // Ask, then walk the citizen into the conversation.
  const ask = async (text: string, fromVoice = false) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setBusy(true)
    navigate('/assistant')
    await send(trimmed, { fromVoice })
    setBusy(false)
  }

  const appName = meta?.app_name ?? t('app.name')
  const tagline = meta?.tagline ?? t('app.tagline')
  useDocumentTitle(`${appName} — ${tagline}`)
  const serviceCount = meta?.knowledge_base?.services ?? 0

  return (
    <div className="space-y-8">
      {/* --- Hero -------------------------------------------------------- */}
      <section className="rounded-card border border-line bg-white p-5 shadow-card sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-trust-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-trust-700">
              <Sparkles className="size-3.5" aria-hidden="true" />
              {t('app.prototype')}
            </span>

            <h1 className="mt-4 text-balance text-3xl font-extrabold leading-tight text-navy-800 sm:text-4xl">
              {appName}
            </h1>
            <p className="mt-1 text-lg font-semibold text-trust-700 sm:text-xl">{tagline}</p>
            <p className="mt-3 max-w-xl text-pretty text-base leading-relaxed text-ink-soft sm:text-lg">
              {t('landing.body')}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <LanguageSelector />
              <LinkButton to="/services" variant="secondary" size="md" icon={FileText}>
                {t('landing.browseServices')}
              </LinkButton>
              {serviceCount ? (
                <span className="text-sm text-ink-mute">
                  {serviceCount} {t('services.count')}
                </span>
              ) : null}
            </div>
          </div>

          {/* Primary action: speak. Secondary: type. */}
          <div className="rounded-card border-2 border-trust-100 bg-trust-50/50 p-5">
            {settings.voiceEnabled && voice.available ? (
              <div className="flex flex-col items-center text-center">
                <div className="relative grid size-40 place-items-center">
                  <span
                    className="absolute inset-6 animate-sarthi-pulse rounded-full bg-trust-200"
                    aria-hidden="true"
                  />
                  <MicButton
                    onResult={(text) => void ask(text, true)}
                    size="xl"
                    label={t('landing.tapToSpeak')}
                    disabled={busy}
                  />
                </div>
                <p className="mt-3 text-lg font-bold text-navy-800">{t('landing.tapToSpeak')}</p>
                <p className="mt-1 text-sm text-ink-soft">{t('assistant.subtitle')}</p>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-line bg-white p-4 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-surface-sunken text-ink-mute">
                  <MicOff className="size-6" aria-hidden="true" />
                </span>
                <p className="mt-3 font-bold text-navy-800">
                  {settings.voiceEnabled
                    ? t('landing.voiceUnavailableTitle')
                    : t('landing.voiceOffTitle')}
                </p>
                <p className="mt-1 text-sm text-ink-soft">
                  {settings.voiceEnabled
                    ? t('assistant.voiceUnsupported')
                    : t('landing.voiceOffBody')}
                </p>
                <Link
                  to="/settings"
                  className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-line px-3.5 py-2 text-sm font-semibold text-trust-700 hover:border-trust-300 hover:bg-trust-50"
                >
                  {t('settings.voice')}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            )}

            <div className="mt-5">
              <label
                htmlFor="landing-question"
                className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-navy-800"
              >
                <Keyboard className="size-4 text-trust-600" aria-hidden="true" />
                {t('landing.typeQuestion')}
              </label>
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void ask(draft)
                  setDraft('')
                }}
              >
                <input
                  id="landing-question"
                  type="text"
                  value={draft}
                  maxLength={4000}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t('assistant.placeholder')}
                  className="min-h-12 flex-1 rounded-xl border-2 border-line bg-white px-3 py-2 text-base text-ink placeholder:text-ink-mute focus:border-trust-600 focus-visible:outline-none"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  icon={ArrowRight}
                  disabled={!draft.trim() || busy}
                  aria-label={t('assistant.send')}
                >
                  <span className="sr-only sm:not-sr-only">{t('assistant.send')}</span>
                </Button>
              </form>
              <p className="mt-2 text-xs text-ink-mute">{t('common.privacy')}</p>
            </div>

            {messages.length ? (
              <Link
                to="/assistant"
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-line bg-white px-4 py-2.5 text-sm font-semibold text-navy-800 hover:border-trust-300 hover:text-trust-700"
              >
                {t('nav.ask')}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </div>

        {!online ? (
          <InlineNote tone="warning" className="mt-6">
            <span className="flex items-center gap-2">
              <WifiOff className="size-4 shrink-0" aria-hidden="true" />
              {t('assistant.offline')}
            </span>
          </InlineNote>
        ) : null}

        {demoMode ? (
          <InlineNote tone="info" className="mt-4">
            {t('assistant.demoMode')}: {t('assistant.demoModeHint')}
          </InlineNote>
        ) : null}
      </section>

      {/* --- Suggested questions ------------------------------------------ */}
      {suggestions.length ? (
        <section aria-labelledby="suggested-heading">
          <h2
            id="suggested-heading"
            className="mb-3 flex items-center gap-2 text-lg font-bold text-navy-800"
          >
            <Sparkles className="size-5 text-trust-600" aria-hidden="true" />
            {t('landing.tryThese')}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void ask(prompt)}
                disabled={busy}
                className="flex min-h-16 items-center justify-between gap-3 rounded-xl border-2 border-line bg-white p-3.5 text-left text-sm font-medium text-navy-800 transition-colors hover:border-trust-300 hover:bg-trust-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600 disabled:opacity-60"
              >
                <span className="min-w-0">{prompt}</span>
                <ArrowRight className="size-4 shrink-0 text-trust-600" aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* --- Categories ---------------------------------------------------- */}
      <section aria-labelledby="categories-heading">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2
            id="categories-heading"
            className="flex items-center gap-2 text-lg font-bold text-navy-800"
          >
            <ListChecks className="size-5 text-trust-600" aria-hidden="true" />
            {t('landing.services')}
          </h2>
          <Link
            to="/services"
            className="shrink-0 text-sm font-semibold text-trust-700 underline underline-offset-4 hover:text-trust-800"
          >
            {t('services.title')}
          </Link>
        </div>

        {categories.loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <div
                key={index}
                className="h-28 animate-pulse rounded-card border border-line bg-surface-sunken"
                aria-hidden="true"
              />
            ))}
            <span className="sr-only" role="status">
              {t('common.loading')}
            </span>
          </div>
        ) : categories.error ? (
          <InlineNote tone="danger">
            {categories.error}{' '}
            <button
              type="button"
              onClick={categories.reload}
              className="font-bold underline underline-offset-4"
            >
              {t('assistant.retry')}
            </button>
          </InlineNote>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(categories.data ?? []).map((category) => (
              <Card key={category.id} as="section" className="flex flex-col">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-trust-50 text-trust-700">
                    <CategoryIcon name={category.icon} className="size-6" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-navy-800 leading-snug">
                      {category.name}
                    </h3>
                    <p className="text-sm text-ink-mute">
                      {category.service_count} {t('services.count')}
                    </p>
                  </div>
                </div>
                <p className="mt-2.5 flex-1 text-sm leading-relaxed text-ink-soft">
                  {category.description}
                </p>
                <ul className="mt-3 space-y-1.5">
                  {category.services.slice(0, 3).map((service) => (
                    <li key={service.id}>
                      <Link
                        to={`/services/${service.id}`}
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-navy-700 transition-colors hover:bg-trust-50 hover:text-trust-800"
                      >
                        <span className="truncate">{service.name}</span>
                        <ArrowRight className="size-4 shrink-0 text-line-strong" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link
                  to={`/services?category=${category.id}`}
                  className="mt-3 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-line px-3 py-2 text-sm font-semibold text-trust-700 transition-colors hover:border-trust-300 hover:bg-trust-50"
                >
                  {t('common.viewDetails')}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* --- How it works -------------------------------------------------- */}
      <section aria-labelledby="how-heading">
        <h2 id="how-heading" className="mb-3 text-lg font-bold text-navy-800">
          {t('landing.howItWorks')}
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: Mic, title: t('landing.step1.title'), body: t('landing.step1.body') },
            { icon: FileText, title: t('landing.step2.title'), body: t('landing.step2.body') },
            { icon: ShieldCheck, title: t('landing.step3.title'), body: t('landing.step3.body') },
          ].map((step, index) => (
            <li key={step.title}>
              <Card className="h-full">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-navy-800 text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <step.icon className="size-5 text-trust-600" aria-hidden="true" />
                </div>
                <h3 className="mt-3 text-base font-bold text-navy-800">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{step.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* --- Trust, privacy, disclaimer ------------------------------------ */}
      <section className="grid gap-3 lg:grid-cols-2">
        <Card className={cn('border-l-4 border-l-success-600')}>
          <h2 className="flex items-center gap-2 text-base font-bold text-navy-800">
            <ShieldCheck className="size-5 text-success-600" aria-hidden="true" />
            {t('landing.trustTitle')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t('landing.trustBody')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <VerificationBadge level="verified_official" size="sm" />
            <VerificationBadge level="general_guidance" size="sm" />
            <VerificationBadge level="confirm_with_authority" size="sm" />
          </div>
          {meta?.knowledge_base?.last_updated ? (
            <p className="mt-3 text-xs text-ink-mute">
              {t('service.lastVerified')}: {meta.knowledge_base.last_updated} ·{' '}
              {meta.knowledge_base.database}
            </p>
          ) : null}
        </Card>

        <Card className="border-l-4 border-l-trust-600">
          <h2 className="flex items-center gap-2 text-base font-bold text-navy-800">
            <Compass className="size-5 text-trust-600" aria-hidden="true" />
            {t('landing.privacy')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t('landing.privacyBody')}</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {meta?.privacy_notice ?? t('common.privacy')}
          </p>
          <Link
            to="/settings"
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-line px-3 py-2 text-sm font-semibold text-trust-700 hover:border-trust-300 hover:bg-trust-50"
          >
            {t('nav.settings')}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Card>
      </section>

      <InlineNote tone="warning">
        <span className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{meta?.disclaimer ?? t('common.disclaimer')}</span>
        </span>
      </InlineNote>
    </div>
  )
}
