/**
 * Step-by-step navigator.
 *
 * One step per screen, with a clear "Step X of N", tips for that step, a
 * checklist, and Prev / Continue. Progress is saved to the device and mirrored
 * to the backend, so a citizen can leave at step 4 and come back to step 4.
 *
 * Announcements go through an aria-live region and focus moves to the new step
 * heading, so a screen-reader user always knows where they are.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Compass,
  ExternalLink,
  ListChecks,
  MessageCircle,
  PartyPopper,
  RotateCcw,
  SearchX,
  TriangleAlert,
} from 'lucide-react'
import { Button, Card, InlineNote, LinkButton } from '../components/ui'
import { useSettings } from '../context/SettingsContext'
import { useChat } from '../context/ChatContext'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAsync } from '../hooks/useAsync'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { clearJourney, loadJourney, percentComplete, saveJourney } from '../lib/journey'
import type { JourneyOut, JourneyStepOut } from '../lib/types'

const KIND_LABEL_KEYS: Record<JourneyStepOut['kind'], string> = {
  eligibility: 'navigator.kind.eligibility',
  documents: 'navigator.kind.documents',
  portal: 'navigator.kind.portal',
  apply: 'navigator.kind.apply',
  track: 'navigator.kind.track',
  generic: 'navigator.kind.generic',
}

interface PersistedState {
  current_step: number
  completed: string[]
  checks: Record<string, string[]>
}

export function NavigatorPage() {
  const { serviceId = '' } = useParams()
  const { t, settings } = useSettings()
  const { send } = useChat()
  const navigate = useNavigate()

  const { data: journey, loading, error, reload } = useAsync<JourneyOut>(
    () => api.journey(serviceId, settings.language),
    [serviceId, settings.language],
  )

  useDocumentTitle(`${t('navigator.title')} — ${t('app.name')}`)

  const [current, setCurrent] = useState(1)
  const [completed, setCompleted] = useState<string[]>([])
  const [checks, setChecks] = useState<Record<string, string[]>>({})
  const [announced, setAnnounced] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const hydrated = useRef(false)

  /* --- Load saved progress once the journey is known --------------------- */
  useEffect(() => {
    if (!journey || hydrated.current) return
    hydrated.current = true
    const saved = loadJourney(journey.service_id)
    const restored: PersistedState = {
      current_step: 1,
      completed: [],
      checks: {},
    }
    if (saved && saved.total_steps === journey.total_steps) {
      restored.current_step = Math.min(Math.max(saved.current_step, 1), journey.total_steps)
      restored.completed = saved.completed.filter((id) =>
        journey.steps.some((step) => step.id === id),
      )
    }
    setCurrent(restored.current_step)
    setCompleted(restored.completed)
    setChecks(restored.checks)
    setAnnounced(t('navigator.stepOf', { current: restored.current_step, total: journey.total_steps }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey])

  /* --- Persist (device first, then mirror to the backend) ---------------- */
  useEffect(() => {
    if (!journey || !hydrated.current) return
    const total = journey.total_steps
    const percent = percentComplete(completed, total)

    saveJourney({
      service_id: journey.service_id,
      service_name: journey.service_name,
      current_step: current,
      total_steps: total,
      completed,
      percent_complete: percent,
      updated_at: Date.now(),
    })

    // Mirroring is best-effort: the journey must keep working offline.
    api
      .saveJourneyProgress(journey.service_id, {
        completed_steps: completed,
        current_step: current,
        language: settings.language,
      })
      .catch(() => undefined)
  }, [journey, current, completed, settings.language])

  const step = useMemo<JourneyStepOut | null>(() => {
    if (!journey) return null
    return journey.steps[Math.min(Math.max(current, 1), journey.steps.length) - 1] ?? null
  }, [journey, current])

  const percent = journey ? percentComplete(completed, journey.total_steps) : 0
  const allDone = Boolean(journey) && journey!.total_steps > 0 && percent === 100
  const stepChecks = step ? (checks[step.id] ?? []) : []

  const goTo = useCallback(
    (index: number) => {
      if (!journey) return
      const next = Math.min(Math.max(index, 1), journey.total_steps)
      setCurrent(next)
      setAnnounced(t('navigator.stepOf', { current: next, total: journey.total_steps }))
      if (!settings.reducedMotion) {
        window.setTimeout(() => headingRef.current?.focus(), 60)
      } else {
        headingRef.current?.focus()
      }
    },
    [journey, settings.reducedMotion, t],
  )

  const toggleComplete = useCallback(
    (id: string) => {
      setCompleted((currentList) =>
        currentList.includes(id) ? currentList.filter((item) => item !== id) : [...currentList, id],
      )
    },
    [],
  )

  const toggleCheck = useCallback((stepId: string, item: string) => {
    setChecks((currentChecks) => {
      const list = currentChecks[stepId] ?? []
      const next = list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item]
      return { ...currentChecks, [stepId]: next }
    })
  }, [])

  const handleContinue = () => {
    if (!journey || !step) return
    if (!completed.includes(step.id)) toggleComplete(step.id)
    const isLast = current >= journey.total_steps
    setAnnounced(
      isLast ? t('navigator.markedComplete') : t('navigator.stepOf', { current: current + 1, total: journey.total_steps }),
    )
    if (!isLast) goTo(current + 1)
  }

  const handleRestart = () => {
    if (!journey) return
    clearJourney(journey.service_id)
    setCompleted([])
    setChecks({})
    setCurrent(1)
    setAnnounced(t('navigator.stepOf', { current: 1, total: journey.total_steps }))
  }

  const askAboutStep = async () => {
    if (!journey || !step) return
    navigate('/assistant')
    await send(`${step.title} — ${journey.service_name}`, {})
  }

  /* --- Loading / error states ------------------------------------------- */
  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <span className="sr-only">{t('common.loading')}</span>
        <div className="h-24 animate-pulse rounded-card border border-line bg-surface-sunken" />
        <div className="h-72 animate-pulse rounded-card border border-line bg-surface-sunken" />
      </div>
    )
  }

  if (error || !journey || !step) {
    return (
      <div className="mx-auto max-w-lg py-8 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-danger-50 text-danger-600">
          <SearchX className="size-8" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-extrabold text-navy-800">{t('service.notFound')}</h1>
        <p className="mt-2 text-base text-ink-soft">{error ?? t('service.notFoundBody')}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <LinkButton to="/navigator" variant="primary" size="lg" icon={ArrowLeft}>
            {t('navigator.title')}
          </LinkButton>
          <Button variant="secondary" size="lg" onClick={reload}>
            {t('assistant.retry')}
          </Button>
        </div>
      </div>
    )
  }

  const pendingChecks = step.checklist.filter((item) => !stepChecks.includes(item))

  return (
    <div className="space-y-5">
      <nav aria-label={t('nav.back')} className="flex flex-wrap items-center gap-3">
        <Link
          to={`/services/${journey.service_id}`}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg text-sm font-semibold text-trust-700 underline underline-offset-4 hover:text-trust-800"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('navigator.backToService')}
        </Link>
        <Link
          to="/navigator"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg text-sm font-semibold text-ink-soft underline underline-offset-4 hover:text-navy-800"
        >
          <Compass className="size-4" aria-hidden="true" />
          {t('navigator.allSteps')}
        </Link>
      </nav>

      {/* Progress header */}
      <Card className="border-l-4 border-l-trust-600">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-mute">
              {t('navigator.title')}
            </p>
            <h1 className="text-xl font-extrabold text-navy-800 sm:text-2xl">
              {journey.service_name}
            </h1>
            <p className="mt-1 text-base font-semibold text-trust-700">
              {t('navigator.stepOf', { current, total: journey.total_steps })}
            </p>
          </div>
          <span className="shrink-0 rounded-pill bg-trust-50 px-3 py-1.5 text-sm font-bold text-trust-700 tabular-nums">
            {percent}%
          </span>
        </div>

        <div
          className="mt-3 h-3 w-full overflow-hidden rounded-pill bg-surface-sunken"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${t('navigator.progress')} — ${journey.service_name}`}
        >
          <div
            className="h-full rounded-pill bg-trust-600 transition-all duration-300"
            style={{ width: `${Math.max(percent, 2)}%` }}
          />
        </div>

        {journey.intro && current === 1 ? (
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">{journey.intro}</p>
        ) : null}

        <p className="sr-only" role="status" aria-live="polite">
          {announced}
        </p>
      </Card>

      {allDone ? (
        <Card className="border-2 border-success-100 bg-success-50">
          <div className="flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-success-600 text-white">
              <PartyPopper className="size-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-extrabold text-navy-800">
                {t('navigator.completeTitle')}
              </h2>
              <p className="mt-1 text-base leading-relaxed text-ink-soft">
                {t('navigator.completeBody')}
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <LinkButton
                  to={journey.portal_url}
                  external
                  variant="primary"
                  size="lg"
                  icon={ExternalLink}
                >
                  {journey.portal_label || t('navigator.visitPortal')}
                </LinkButton>
                <Button variant="secondary" size="lg" icon={RotateCcw} onClick={handleRestart}>
                  {t('navigator.restart')}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Current step */}
      <Card as="section" className="border-2 border-trust-100">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-trust-700 text-base font-extrabold text-white">
            {step.index}
          </span>
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center rounded-pill bg-surface-sunken px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
              {t(KIND_LABEL_KEYS[step.kind] ?? 'navigator.kind.generic')}
            </span>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="mt-1.5 text-xl font-extrabold leading-snug text-navy-800 focus-visible:outline-none"
            >
              {step.title}
            </h2>
          </div>
        </div>

        {step.detail ? (
          <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-ink">
            {step.detail}
          </p>
        ) : null}

        {step.tips.length ? (
          <div className="mt-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-navy-800">
              <TriangleAlert className="size-4 text-attention-600" aria-hidden="true" />
              {t('navigator.tips')}
            </h3>
            <ul className="space-y-2">
              {step.tips.map((tip) => (
                <li
                  key={tip}
                  className="rounded-xl border-2 border-attention-100 bg-attention-50 p-3 text-sm leading-relaxed text-attention-700"
                >
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {step.checklist.length ? (
          <div className="mt-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-navy-800">
              <ListChecks className="size-4 text-trust-600" aria-hidden="true" />
              {t('navigator.checklist')}
              <span className="rounded-pill bg-surface-sunken px-2 py-0.5 text-xs font-semibold text-ink-mute tabular-nums">
                {stepChecks.length}/{step.checklist.length}
              </span>
            </h3>
            <ul className="space-y-2">
              {step.checklist.map((item) => {
                const done = stepChecks.includes(item)
                return (
                  <li key={item}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-colors',
                        done
                          ? 'border-success-100 bg-success-50'
                          : 'border-line bg-white hover:border-trust-200',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => toggleCheck(step.id, item)}
                        className="mt-0.5 size-5 shrink-0 accent-[#15803d]"
                      />
                      <span
                        className={cn(
                          'text-sm font-medium leading-relaxed text-navy-800',
                          done && 'text-success-700 line-through decoration-2',
                        )}
                      >
                        {item}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        {step.action_url && step.action_label ? (
          <div className="mt-4">
            <LinkButton
              to={step.action_url}
              external
              variant="secondary"
              size="lg"
              icon={ExternalLink}
              fullWidth
            >
              {step.action_label}
            </LinkButton>
            <p className="mt-1 text-center text-xs text-ink-mute">{t('service.opensNewTab')}</p>
          </div>
        ) : null}

        {/* Step status + controls */}
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={completed.includes(step.id) ? 'success' : 'secondary'}
              size="md"
              icon={completed.includes(step.id) ? CheckCircle2 : Circle}
              onClick={() => toggleComplete(step.id)}
              aria-pressed={completed.includes(step.id)}
            >
              {completed.includes(step.id) ? t('navigator.markedComplete') : t('navigator.markComplete')}
            </Button>
            {completed.includes(step.id) ? (
              <Button variant="ghost" size="md" icon={RotateCcw} onClick={() => toggleComplete(step.id)}>
                {t('navigator.undo')}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="md"
              icon={MessageCircle}
              onClick={() => void askAboutStep()}
            >
              {t('navigator.askSarthi')}
            </Button>
          </div>

          {pendingChecks.length && !completed.includes(step.id) ? (
            <p className="mt-2 text-xs text-ink-mute">
              {t('navigator.pendingChecks', { count: pendingChecks.length })}
            </p>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              variant="secondary"
              size="lg"
              icon={ArrowLeft}
              onClick={() => goTo(current - 1)}
              disabled={current <= 1}
              fullWidth
            >
              {t('navigator.previous')}
            </Button>
            {current >= journey.total_steps ? (
              <Button
                variant="primary"
                size="lg"
                icon={Check}
                onClick={handleContinue}
                disabled={allDone}
                fullWidth
              >
                {t('navigator.finish')}
              </Button>
            ) : (
              <Button variant="primary" size="lg" onClick={handleContinue} fullWidth>
                {t('navigator.continue')}
                <ArrowRight className="size-5" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* All steps, for orientation */}
      <Card as="section">
        <h2 className="mb-3 text-base font-bold text-navy-800">{t('navigator.allSteps')}</h2>
        <ol className="space-y-1.5">
          {journey.steps.map((item) => {
            const done = completed.includes(item.id)
            const isCurrent = item.index === current
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => goTo(item.index)}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={cn(
                    'flex w-full min-h-12 items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors',
                    'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600',
                    isCurrent
                      ? 'border-trust-600 bg-trust-50'
                      : done
                        ? 'border-success-100 bg-success-50/50'
                        : 'border-line bg-white hover:border-trust-200',
                  )}
                >
                  {done ? (
                    <CheckCircle2 className="size-5 shrink-0 text-success-600" aria-hidden="true" />
                  ) : isCurrent ? (
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-trust-700 text-[11px] font-bold text-white">
                      {item.index}
                    </span>
                  ) : (
                    <Circle className="size-5 shrink-0 text-line-strong" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-navy-800">
                      {item.title}
                    </span>
                    <span className="block text-xs text-ink-mute">
                      {done
                        ? t('navigator.stepDone')
                        : isCurrent
                          ? t('navigator.stepCurrent')
                          : t('navigator.stepPending')}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-line-strong" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ol>
      </Card>

      <InlineNote tone="warning">
        <span className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{t('common.disclaimer')}</span>
        </span>
      </InlineNote>
    </div>
  )
}
