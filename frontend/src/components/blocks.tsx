/**
 * Block renderers.
 *
 * The backend returns typed blocks, so each one becomes a purpose-built
 * component: a document checklist is a real checklist you can tick, a source
 * card is a real link to a real government portal with its verification date.
 * Nothing here parses markdown out of a chat message.
 */

import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarCheck,
  CheckCircle2,
  Circle,
  Compass,
  ExternalLink,
  FileText,
  Info,
  ListChecks,
  Lock,
  Phone,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { Card, CategoryIcon, InlineNote, VerificationBadge } from './ui'
import { cn } from '../lib/cn'
import { useSettings } from '../context/SettingsContext'
import type {
  Block,
  ClarificationBlock,
  DocumentsBlock,
  JourneyCtaBlock,
  ListBlock,
  PrivacyBlock,
  RelatedBlock,
  ServiceCardBlock,
  SourceBlock,
  StepsBlock,
  TextBlock,
} from '../lib/types'

export interface BlockHandlers {
  onSelectClarifier?: (optionId: string, label: string) => void
  onQuickPrompt?: (text: string) => void
}

export function BlockRenderer({ block, handlers }: { block: Block; handlers?: BlockHandlers }) {
  switch (block.type) {
    case 'text':
      return <TextBlockView block={block} />
    case 'service_card':
      return <ServiceCardView block={block} />
    case 'eligibility':
    case 'notes':
      return <ListBlockView block={block} />
    case 'documents':
      return <DocumentsChecklist block={block} />
    case 'steps':
      return <StepsView block={block} />
    case 'source':
      return <SourceCard block={block} />
    case 'clarification':
      return <ClarificationCard block={block} handlers={handlers} />
    case 'journey_cta':
      return <JourneyCtaCard block={block} />
    case 'related':
      return <RelatedServices block={block} handlers={handlers} />
    case 'privacy':
      return <PrivacyNote block={block} />
    default:
      return null
  }
}

/* --- Text ---------------------------------------------------------------- */

const TONE_CLASSES = {
  neutral: 'text-ink',
  positive: 'text-navy-800 font-semibold',
  warning: 'text-attention-700',
  error: 'text-danger-700',
} as const

function TextBlockView({ block }: { block: TextBlock }) {
  return (
    <p
      className={cn(
        'whitespace-pre-line text-pretty leading-relaxed',
        TONE_CLASSES[block.tone] ?? TONE_CLASSES.neutral,
      )}
    >
      {block.text}
    </p>
  )
}

/* --- Service card -------------------------------------------------------- */

function ServiceCardView({ block }: { block: ServiceCardBlock }) {
  const { t } = useSettings()
  const service = block.service
  return (
    <Card className="border-l-4 border-l-trust-600">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-trust-50 text-trust-700">
          <CategoryIcon name={service.category_icon} className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">
            {service.category_name}
          </p>
          <h3 className="text-xl font-bold text-navy-800 leading-tight">{service.name}</h3>
          {service.tagline ? (
            <p className="text-sm text-ink-soft mt-1">{service.tagline}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <VerificationBadge
              level={service.verification_level}
              label={service.verification_label}
              size="sm"
            />
            <span className="inline-flex items-center gap-1 text-xs text-ink-mute">
              <CalendarCheck className="size-3.5" aria-hidden="true" />
              {t('service.lastVerified')}: {service.last_verified}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-ink-mute">
              <Compass className="size-3.5" aria-hidden="true" />
              {t(
                service.jurisdiction === 'state'
                  ? 'common.jurisdiction.state'
                  : 'common.jurisdiction.national',
              )}
            </span>
          </div>
          <div className="mt-3">
            <Link
              to={`/services/${service.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-trust-700 hover:text-trust-800 underline underline-offset-4"
            >
              <FileText className="size-4" aria-hidden="true" />
              {t('common.viewDetails')}
            </Link>
          </div>
        </div>
      </div>
    </Card>
  )
}

/* --- Eligibility / important notes --------------------------------------- */

function ListBlockView({ block }: { block: ListBlock }) {
  const headingId = useId()
  const isWarning = block.type === 'notes' || block.tone === 'warning'
  return (
    <section aria-labelledby={headingId}>
      <h3
        id={headingId}
        className="flex items-center gap-2 text-base font-bold text-navy-800 mb-2"
      >
        {isWarning ? (
          <TriangleAlert className="size-5 text-attention-600" aria-hidden="true" />
        ) : (
          <ShieldCheck className="size-5 text-trust-600" aria-hidden="true" />
        )}
        {block.title}
      </h3>
      <ul className="space-y-2">
        {block.items.map((item, index) => (
          <li key={index} className="flex items-start gap-2.5">
            <span
              className={cn(
                'mt-2 size-1.5 shrink-0 rounded-full',
                isWarning ? 'bg-attention-600' : 'bg-trust-500',
              )}
              aria-hidden="true"
            />
            <span className={cn('text-sm leading-relaxed', isWarning ? 'text-ink' : 'text-ink')}>
              {item}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* --- Document checklist --------------------------------------------------- */

function DocumentsChecklist({ block }: { block: DocumentsBlock }) {
  const { t } = useSettings()
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  const { done, total } = useMemo(() => {
    const ids = block.items.map((item) => item.id)
    return { done: ids.filter((id) => checked[id]).length, total: ids.length }
  }, [block.items, checked])

  const allDone = total > 0 && done === total

  return (
    <Card className={cn(allDone && 'border-success-100 bg-success-50/40')}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="flex items-center gap-2 text-base font-bold text-navy-800">
          <ListChecks className="size-5 text-trust-600" aria-hidden="true" />
          {block.title}
        </h3>
        <span
          className="shrink-0 rounded-pill bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-ink-soft tabular-nums"
          aria-live="polite"
        >
          {done}/{total}
        </span>
      </div>

      <ul className="space-y-2">
        {block.items.map((doc) => {
          const isChecked = Boolean(checked[doc.id])
          return (
            <li key={doc.id}>
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-colors duration-150',
                  isChecked
                    ? 'border-success-100 bg-success-50'
                    : 'border-line bg-white hover:border-trust-200',
                )}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(event) =>
                    setChecked((current) => ({ ...current, [doc.id]: event.target.checked }))
                  }
                  className="mt-0.5 size-5 shrink-0 accent-[#15803d]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'font-semibold text-navy-800',
                        isChecked && 'text-success-700 line-through decoration-2',
                      )}
                    >
                      {doc.name}
                    </span>
                    <span
                      className={cn(
                        'rounded-pill px-2 py-0.5 text-xs font-bold uppercase tracking-wide',
                        doc.required
                          ? 'bg-danger-50 text-danger-700'
                          : 'bg-surface-sunken text-ink-mute',
                      )}
                    >
                      {doc.required ? t('service.required') : t('service.optional')}
                    </span>
                  </span>
                  {doc.detail ? (
                    <span className="mt-0.5 block text-sm text-ink-soft leading-relaxed">
                      {doc.detail}
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {allDone ? (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-success-700" role="status">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {t('navigator.markedComplete')}
        </p>
      ) : null}
    </Card>
  )
}

/* --- Steps ---------------------------------------------------------------- */

function StepsView({ block }: { block: StepsBlock }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <h3
        id={headingId}
        className="flex items-center gap-2 text-base font-bold text-navy-800 mb-3"
      >
        <Compass className="size-5 text-trust-600" aria-hidden="true" />
        {block.title}
      </h3>
      <ol className="relative space-y-3 border-l-2 border-line pl-5">
        {block.items.map((step) => (
          <li key={step.index} className="relative">
            <span
              className="absolute -left-[1.95rem] grid size-7 place-items-center rounded-full bg-trust-700 text-xs font-bold text-white"
              aria-hidden="true"
            >
              {step.index}
            </span>
            <p className="font-semibold text-navy-800 leading-snug">{step.title}</p>
            {step.detail ? (
              <p className="text-sm text-ink-soft mt-0.5 leading-relaxed">{step.detail}</p>
            ) : null}
            {step.tips.length ? (
              <ul className="mt-2 space-y-1">
                {step.tips.map((tip, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 rounded-lg bg-attention-50 px-2.5 py-1.5 text-sm text-attention-700"
                  >
                    <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  )
}

/* --- Official source ------------------------------------------------------ */

export function SourceCard({ block }: { block: SourceBlock }) {
  const { t } = useSettings()
  const source = block.source
  return (
    <Card className="border-2 border-trust-100 bg-trust-50/50">
      <h3 className="flex items-center gap-2 text-base font-bold text-navy-800 mb-3">
        <ShieldCheck className="size-5 text-trust-700" aria-hidden="true" />
        {block.title || t('service.source')}
      </h3>

      <dl className="space-y-2 text-sm">
        <div className="flex gap-2">
          <dt className="font-semibold text-ink-soft shrink-0">{t('service.sourceLabel')}:</dt>
          <dd className="text-navy-800 min-w-0">{source.authority}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-semibold text-ink-soft shrink-0">
            {t('service.lastVerified')}:
          </dt>
          <dd className="text-navy-800 tabular-nums">{source.last_verified}</dd>
        </div>
      </dl>

      <div className="mt-3">
        <VerificationBadge level={source.verification_level} label={source.verification_label} />
      </div>

      {source.note ? (
        <p className="mt-2 text-sm text-ink-soft leading-relaxed">{source.note}</p>
      ) : null}

      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-trust-700 px-4 py-3 text-base font-bold text-white transition-colors hover:bg-trust-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600"
      >
        <ExternalLink className="size-5" aria-hidden="true" />
        {source.portal_label || t('service.visitPortal')}
      </a>
      <p className="mt-1.5 text-center text-xs text-ink-mute break-all">{source.url}</p>
      <p className="mt-1 text-center text-xs text-ink-mute">{t('service.opensNewTab')}</p>

      {source.extra_links.length ? (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
          {source.extra_links.map((link) => (
            <li key={link.url}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-trust-700 hover:text-trust-800 underline underline-offset-4"
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {source.state_portals.length ? (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-sm font-bold text-navy-800 mb-2">{t('service.statePortals')}</p>
          <ul className="flex flex-wrap gap-2">
            {source.state_portals.map((portal) => (
              <li key={portal.url + portal.label}>
                <a
                  href={portal.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1.5 rounded-pill border-2 border-line bg-white px-3 py-1.5 text-sm font-medium text-navy-700 hover:border-trust-300 hover:text-trust-700"
                >
                  {portal.label}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {source.helpline ? (
        <p className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-sm text-ink-soft">
          <Phone className="size-4 shrink-0 text-trust-600" aria-hidden="true" />
          <span>
            {source.helpline.label}: <strong className="text-navy-800">{source.helpline.value}</strong>
          </span>
        </p>
      ) : null}
    </Card>
  )
}

/* --- Clarification -------------------------------------------------------- */

function ClarificationCard({
  block,
  handlers,
}: {
  block: ClarificationBlock
  handlers?: BlockHandlers
}) {
  const { t } = useSettings()
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <Card className="border-2 border-indigo-soft-100 bg-indigo-soft-50/40">
      <h3 className="flex items-center gap-2 text-base font-bold text-navy-800 mb-3">
        <Sparkles className="size-5 text-indigo-soft-600" aria-hidden="true" />
        {block.question}
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {block.options.map((option) => {
          const isSelected = selected === option.id
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isSelected}
              disabled={Boolean(selected)}
              onClick={() => {
                setSelected(option.id)
                handlers?.onSelectClarifier?.(option.id, option.label)
              }}
              className={cn(
                'flex min-h-12 items-center gap-2.5 rounded-xl border-2 px-3.5 py-2.5 text-left text-sm font-semibold transition-colors duration-150',
                'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600',
                isSelected
                  ? 'border-trust-600 bg-trust-50 text-trust-800'
                  : 'border-line bg-white text-navy-800 hover:border-trust-300 hover:bg-trust-50',
                selected && !isSelected && 'opacity-55',
              )}
            >
              {isSelected ? (
                <CheckCircle2 className="size-5 shrink-0 text-trust-700" aria-hidden="true" />
              ) : (
                <Circle className="size-5 shrink-0 text-line-strong" aria-hidden="true" />
              )}
              <span className="min-w-0">{option.label}</span>
            </button>
          )
        })}
      </div>
      {block.allow_free_text ? (
        <p className="mt-3 text-xs text-ink-mute">{t('assistant.orTypeYourOwn')}</p>
      ) : null}
    </Card>
  )
}

/* --- Journey CTA ---------------------------------------------------------- */

function JourneyCtaCard({ block }: { block: JourneyCtaBlock }) {
  const { t } = useSettings()
  return (
    <Card className="bg-navy-800 border-navy-700 text-white">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-bold text-white">
            <Compass className="size-5 text-trust-200" aria-hidden="true" />
            {t('navigator.title')}
          </h3>
          <p className="text-sm text-navy-100 mt-1">
            {block.service_name} · {t('navigator.stepOf', { current: 1, total: block.total_steps })}
          </p>
        </div>
        <Link
          to={`/navigator/${block.service_id}`}
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-base font-bold text-navy-800 transition-colors hover:bg-trust-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Compass className="size-5" aria-hidden="true" />
          {block.label}
        </Link>
      </div>
    </Card>
  )
}

/* --- Related services ----------------------------------------------------- */

function RelatedServices({ block, handlers }: { block: RelatedBlock; handlers?: BlockHandlers }) {
  const headingId = useId()
  if (!block.items.length) return null
  return (
    <section aria-labelledby={block.title ? headingId : undefined}>
      {block.title ? (
        <h3
          id={headingId}
          className="text-sm font-bold text-navy-800 mb-2"
        >
          {block.title}
        </h3>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {block.items.map((service) => (
          <button
            key={service.id}
            type="button"
            onClick={() => handlers?.onQuickPrompt?.(service.name)}
            className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-line bg-white p-3 text-left transition-colors hover:border-trust-300 hover:bg-trust-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-trust-50 text-trust-700">
              <CategoryIcon name={service.category_icon} className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-navy-800">{service.name}</span>
              <span className="block truncate text-xs text-ink-mute">{service.category_name}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

/* --- Privacy note --------------------------------------------------------- */

function PrivacyNote({ block }: { block: PrivacyBlock }) {
  return (
    <InlineNote tone="info" className="bg-surface-sunken border-line">
      <span className="flex items-start gap-2">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{block.text}</span>
      </span>
    </InlineNote>
  )
}
