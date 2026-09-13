/**
 * Service detail.
 *
 * One screen per service, in the order a citizen actually needs it: what it is,
 * who qualifies, what to keep ready, how to apply, what to watch out for, and
 * where the official portal is — with the verification date and level attached
 * so nobody mistakes guidance for a guarantee.
 *
 * The eligibility, document, step and note sections render through the same
 * block components the assistant uses, so the two screens never drift apart.
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronDown,
  Compass,
  ExternalLink,
  HelpCircle,
  MessageCircle,
  SearchX,
  TriangleAlert,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { BlockRenderer, SourceCard } from '../components/blocks'
import { Button, Card, CategoryIcon, InlineNote, LinkButton, VerificationBadge } from '../components/ui'
import { useSettings } from '../context/SettingsContext'
import { useChat } from '../context/ChatContext'
import { useTextToSpeech } from '../hooks/useTextToSpeech'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAsync } from '../hooks/useAsync'
import { api } from '../lib/api'
import { JOURNEY_KEY_PREFIX, readJSON } from '../lib/storage'
import { makeSpeakable } from '../lib/tts'
import type { Block, ServiceDetail } from '../lib/types'

export function ServiceDetailPage() {
  const { serviceId = '' } = useParams()
  const { t, settings } = useSettings()
  const { send } = useChat()
  const navigate = useNavigate()
  const tts = useTextToSpeech(settings.language)
  const [openFaq, setOpenFaq] = useState<string | null>(null)

  const { data: service, loading, error, reload } = useAsync<ServiceDetail>(
    () => api.service(serviceId, settings.language),
    [serviceId, settings.language],
  )

  // Reuse the assistant's block renderers so the detail page and the chat
  // answer for the same service look identical.
  const blocks = useMemo<Block[]>(() => {
    if (!service) return []
    const out: Block[] = []
    if (service.eligibility.length) {
      out.push({
        type: 'eligibility',
        title: t('service.eligibility'),
        items: service.eligibility,
        tone: 'neutral',
      })
    }
    if (service.documents.length) {
      out.push({
        type: 'documents',
        title: t('service.documents'),
        items: service.documents,
      })
    }
    if (service.steps.length) {
      out.push({ type: 'steps', title: t('service.steps'), items: service.steps })
    }
    if (service.important_notes.length) {
      out.push({
        type: 'notes',
        title: t('service.notes'),
        items: service.important_notes,
        tone: 'warning',
      })
    }
    return out
  }, [service, t])

  useDocumentTitle(
    `${service?.name ?? t('common.loading')} — ${t('app.name')}`,
  )

  const savedProgress = useMemo(() => {
    const stored = readJSON<{ current_step?: number; total_steps?: number; completed?: string[] }>(
      `${JOURNEY_KEY_PREFIX}${serviceId}`,
      {},
    )
    return stored?.current_step && stored.current_step > 1 ? stored : null
  }, [serviceId])

  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <span className="sr-only">{t('common.loading')}</span>
        <div className="h-32 animate-pulse rounded-card border border-line bg-surface-sunken" />
        <div className="h-56 animate-pulse rounded-card border border-line bg-surface-sunken" />
        <div className="h-40 animate-pulse rounded-card border border-line bg-surface-sunken" />
      </div>
    )
  }

  if (error || !service) {
    return (
      <div className="mx-auto max-w-lg py-8 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-danger-50 text-danger-600">
          <SearchX className="size-8" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-extrabold text-navy-800">{t('service.notFound')}</h1>
        <p className="mt-2 text-base text-ink-soft">{error ?? t('service.notFoundBody')}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <LinkButton to="/services" variant="primary" size="lg" icon={ArrowLeft}>
            {t('services.title')}
          </LinkButton>
          <Button variant="secondary" size="lg" onClick={reload}>
            {t('assistant.retry')}
          </Button>
        </div>
      </div>
    )
  }

  const spoken = makeSpeakable(
    [
      service.name,
      service.description,
      service.eligibility.slice(0, 3).join('. '),
      service.verification_note,
    ]
      .filter(Boolean)
      .join('. '),
  )
  const speaking = tts.speakingId === service.id

  const askAssistant = async (question?: string) => {
    navigate('/assistant')
    await send(question?.trim() ? question.trim() : service.name)
  }

  return (
    <div className="space-y-5">
      <nav aria-label={t('nav.back')}>
        <Link
          to="/services"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg text-sm font-semibold text-trust-700 underline underline-offset-4 hover:text-trust-800"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('services.title')}
        </Link>
      </nav>

      {/* Header */}
      <Card className="border-l-4 border-l-trust-600">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-trust-50 text-trust-700">
            <CategoryIcon name={service.category_icon} className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <Link
              to={`/services?category=${service.category_id}`}
              className="text-xs font-bold uppercase tracking-wide text-trust-700 hover:underline"
            >
              {service.category_name}
            </Link>
            <h1 className="mt-0.5 text-2xl font-extrabold leading-tight text-navy-800 sm:text-3xl">
              {service.name}
            </h1>
            {service.tagline ? (
              <p className="mt-1 text-base text-ink-soft">{service.tagline}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <VerificationBadge
            level={service.verification_level}
            label={service.verification_label}
          />
          <span className="rounded-pill bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-ink-soft">
            {t('service.lastVerified')}: {service.last_verified}
          </span>
          <span className="rounded-pill bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-ink-soft">
            {t(
              service.jurisdiction === 'state'
                ? 'common.jurisdiction.state'
                : 'common.jurisdiction.national',
            )}
          </span>
          <span className="rounded-pill bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-ink-soft tabular-nums">
            {service.step_count} {t('services.stepCount')} · {service.document_count}{' '}
            {t('services.docCount')}
          </span>
        </div>

        {/* Primary actions */}
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <LinkButton
            to={`/navigator/${service.id}`}
            variant="primary"
            size="lg"
            icon={Compass}
            fullWidth
          >
            {savedProgress
              ? `${t('navigator.continue')} · ${t('navigator.stepOf', {
                  current: savedProgress.current_step ?? 1,
                  total: service.step_count,
                })}`
              : t('service.startJourney')}
          </LinkButton>
          <LinkButton
            to={service.official_url}
            external
            variant="secondary"
            size="lg"
            icon={ExternalLink}
            fullWidth
          >
            {service.portal_label || t('service.visitPortal')}
          </LinkButton>
          {tts.supported ? (
            <Button
              variant="secondary"
              size="lg"
              icon={speaking ? VolumeX : Volume2}
              onClick={() => tts.speakText(service.id, spoken)}
              aria-pressed={speaking}
              fullWidth
            >
              {speaking ? t('service.stopListen') : t('service.listen')}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="lg"
            icon={MessageCircle}
            onClick={() => void askAssistant()}
            fullWidth
          >
            {t('service.askAssistant')}
          </Button>
        </div>

        <p className="mt-2 text-center text-xs text-ink-mute">
          {t('service.opensNewTab')} · {t('common.privacy')}
        </p>
      </Card>

      {/* Verification explanation */}
      <InlineNote
        tone={service.verification_level === 'verified_official' ? 'success' : 'warning'}
        title={t('service.verificationNote')}
      >
        <p>
          {service.verification_note ||
            t(`verification.${service.verification_level}.long`)}
        </p>
        <p className="mt-1.5">
          <strong>{t('service.sourceLabel')}:</strong> {service.official_source}
        </p>
      </InlineNote>

      {/* About */}
      {service.description ? (
        <Card as="section">
          <h2 className="text-lg font-bold text-navy-800">{t('service.about')}</h2>
          <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-ink">
            {service.description}
          </p>
        </Card>
      ) : null}

      {/* Eligibility, documents, steps, notes */}
      {blocks.map((block, index) => (
        <Card as="section" key={`${block.type}-${index}`}>
          <BlockRenderer block={block} />
        </Card>
      ))}

      {/* FAQ */}
      {service.faq.length ? (
        <Card as="section">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-navy-800">
            <HelpCircle className="size-5 text-trust-600" aria-hidden="true" />
            {t('service.faq')}
          </h2>
          <ul className="space-y-2">
            {service.faq.map((item) => {
              const open = openFaq === item.question
              return (
                <li key={item.question} className="rounded-xl border-2 border-line bg-white">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : item.question)}
                    aria-expanded={open}
                    className="flex min-h-12 w-full items-center justify-between gap-3 px-3.5 py-3 text-left font-semibold text-navy-800 focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-trust-600"
                  >
                    <span className="min-w-0">{item.question}</span>
                    <ChevronDown
                      className={`size-5 shrink-0 text-trust-600 transition-transform ${open ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  {open ? (
                    <p className="border-t border-line px-3.5 py-3 text-sm leading-relaxed text-ink-soft">
                      {item.answer}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}

      {/* Official source */}
      {service.source ? (
        <SourceCard
          block={{
            type: 'source',
            title: t('service.source'),
            source: service.source,
          }}
        />
      ) : null}

      {/* Related */}
      {service.related_services.length ? (
        <Card as="section">
          <h2 className="mb-3 text-lg font-bold text-navy-800">{t('service.related')}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {service.related_services.map((related) => (
              <li key={related.id}>
                <Link
                  to={`/services/${related.id}`}
                  className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-line p-3 transition-colors hover:border-trust-300 hover:bg-trust-50"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-trust-50 text-trust-700">
                    <CategoryIcon name={related.category_icon} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-navy-800">
                      {related.name}
                    </span>
                    <span className="block truncate text-xs text-ink-mute">
                      {related.category_name}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Things SAARTHI would need to know — asked up front, in the open. */}
      {service.clarifiers.length ? (
        <Card as="section" className="bg-surface-muted">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-navy-800">
            <TriangleAlert className="size-5 text-attention-600" aria-hidden="true" />
            {t('service.clarifierTitle')}
          </h2>
          <ul className="space-y-3">
            {service.clarifiers.map((clarifier) => (
              <li key={clarifier.id} className="rounded-xl border-2 border-line bg-white p-3">
                <p className="font-semibold text-navy-800">{clarifier.question}</p>
                {clarifier.options.length ? (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {clarifier.options.map((option) => (
                      <li key={option.id}>
                        <button
                          type="button"
                          onClick={() =>
                            void askAssistant(`${service.name} — ${option.label}`)
                          }
                          className="min-h-10 rounded-pill border-2 border-line bg-white px-3 py-1.5 text-sm font-medium text-navy-700 transition-colors hover:border-trust-300 hover:bg-trust-50 hover:text-trust-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600"
                        >
                          {option.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <InlineNote tone="warning">
        <span className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{t('common.disclaimer')}</span>
        </span>
      </InlineNote>
    </div>
  )
}
