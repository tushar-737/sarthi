/**
 * Journey index.
 *
 * "Pick up where you left off" first — a citizen who applied for an income
 * certificate last week should not have to search for it again — then every
 * service that has a guided journey, grouped by category.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Circle, Compass, Lock, TriangleAlert } from 'lucide-react'
import { Card, CategoryIcon, InlineNote } from '../components/ui'
import { useSettings } from '../context/SettingsContext'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAsync } from '../hooks/useAsync'
import { api } from '../lib/api'
import { listJourneys, type SavedJourney } from '../lib/journey'
import type { CategoryOut } from '../lib/types'

export function NavigatorIndexPage() {
  const { t, settings } = useSettings()
  useDocumentTitle(`${t('navigator.title')} — SAARTHI AI`)
  const categories = useAsync<CategoryOut[]>(
    () => api.categories(settings.language),
    [settings.language],
  )
  const [saved, setSaved] = useState<SavedJourney[]>([])

  // Re-read on focus: the citizen may have just finished a step elsewhere.
  useEffect(() => {
    const refresh = () => setSaved(listJourneys())
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [settings.language])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-navy-800 sm:text-3xl">
          <Compass className="size-7 text-trust-600" aria-hidden="true" />
          {t('navigator.title')}
        </h1>
        <p className="mt-1 text-base text-ink-soft">{t('navigator.indexSubtitle')}</p>
      </header>

      <InlineNote tone="info">
        <span className="flex items-start gap-2">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{t('navigator.privacyNote')}</span>
        </span>
      </InlineNote>

      {/* Saved journeys */}
      {saved.length ? (
        <section aria-labelledby="saved-heading">
          <h2 id="saved-heading" className="mb-3 text-lg font-bold text-navy-800">
            {t('navigator.continueTitle')}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {saved.map((journey) => (
              <li key={journey.service_id}>
                <Link
                  to={`/navigator/${journey.service_id}`}
                  className="group flex h-full flex-col rounded-card border-2 border-trust-100 bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-trust-300 hover:shadow-lift focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold text-navy-800 group-hover:text-trust-800">
                        {journey.service_name}
                      </h3>
                      <p className="mt-0.5 text-sm text-ink-soft">
                        {t('navigator.stepOf', {
                          current: Math.min(journey.current_step, journey.total_steps || 1),
                          total: journey.total_steps,
                        })}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-pill bg-trust-50 px-2.5 py-1 text-xs font-bold text-trust-700 tabular-nums">
                      {journey.percent_complete}%
                    </span>
                  </div>

                  <div
                    className="mt-3 h-2.5 w-full overflow-hidden rounded-pill bg-surface-sunken"
                    role="progressbar"
                    aria-valuenow={journey.percent_complete}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={t('navigator.progress')}
                  >
                    <div
                      className="h-full rounded-pill bg-trust-600 transition-all duration-300"
                      style={{ width: `${journey.percent_complete}%` }}
                    />
                  </div>

                  <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-trust-700">
                    {t('navigator.continue')}
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Start a new journey */}
      <section aria-labelledby="start-heading">
        <h2 id="start-heading" className="mb-3 text-lg font-bold text-navy-800">
          {t('navigator.startTitle')}
        </h2>

        {categories.loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className="h-40 animate-pulse rounded-card border border-line bg-surface-sunken"
                aria-hidden="true"
              />
            ))}
            <span className="sr-only" role="status">
              {t('common.loading')}
            </span>
          </div>
        ) : categories.error ? (
          <InlineNote tone="danger">
            <span className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {categories.error}{' '}
                <button
                  type="button"
                  onClick={categories.reload}
                  className="font-bold underline underline-offset-4"
                >
                  {t('assistant.retry')}
                </button>
              </span>
            </span>
          </InlineNote>
        ) : (
          <div className="space-y-4">
            {(categories.data ?? []).map((category) => (
              <Card key={category.id} as="section">
                <h3 className="flex items-center gap-2.5 text-base font-bold text-navy-800">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-trust-50 text-trust-700">
                    <CategoryIcon name={category.icon} className="size-5" />
                  </span>
                  {category.name}
                </h3>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {category.services.map((service) => {
                    const savedEntry = saved.find((item) => item.service_id === service.id)
                    return (
                      <li key={service.id}>
                        <Link
                          to={`/navigator/${service.id}`}
                          className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-line p-3 transition-colors hover:border-trust-300 hover:bg-trust-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600"
                        >
                          {savedEntry ? (
                            <CheckCircle2
                              className="size-5 shrink-0 text-success-600"
                              aria-hidden="true"
                            />
                          ) : (
                            <Circle className="size-5 shrink-0 text-line-strong" aria-hidden="true" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-navy-800">
                              {service.name}
                            </span>
                            <span className="block truncate text-xs text-ink-mute">
                              {savedEntry
                                ? `${t('navigator.progress')}: ${savedEntry.percent_complete}%`
                                : `${service.step_count} ${t('services.stepCount')}`}
                            </span>
                          </span>
                          <ArrowRight className="size-4 shrink-0 text-line-strong" aria-hidden="true" />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
