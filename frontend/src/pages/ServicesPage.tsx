/**
 * Service discovery.
 *
 * Two ways in: browse by category, or search. Search hits the same retriever
 * the assistant uses, so "आधार" and "income certificate" both land somewhere
 * useful. When nothing matches, SAARTHI says so plainly instead of padding the
 * screen with guesses.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Compass, ListFilter, Search, SearchX, TriangleAlert } from 'lucide-react'
import { Card, CategoryIcon, InlineNote, VerificationBadge } from '../components/ui'
import { useSettings } from '../context/SettingsContext'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAsync } from '../hooks/useAsync'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import type { CategoryOut, ServiceSummary } from '../lib/types'

export function ServicesPage() {
  const { t, settings } = useSettings()
  useDocumentTitle(`${t('services.title')} — SAARTHI AI`)
  const [params, setParams] = useSearchParams()
  const activeCategory = params.get('category') ?? 'all'
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [matches, setMatches] = useState<ServiceSummary[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const categories = useAsync<CategoryOut[]>(
    () => api.categories(settings.language),
    [settings.language],
  )

  // Debounce so typing does not fire a request per keystroke.
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(query.trim()), 350)
    return () => window.clearTimeout(handle)
  }, [query])

  useEffect(() => {
    if (!debounced) {
      setMatches(null)
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    setSearchError(null)
    api
      .search(debounced, settings.language, 8)
      .then((result) => {
        if (!cancelled) setMatches(result.matches.map((match) => match.service))
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSearchError(error instanceof Error ? error.message : 'Search failed.')
          setMatches([])
        }
      })
      .finally(() => {
        if (!cancelled) setSearching(false)
      })
    return () => {
      cancelled = true
    }
  }, [debounced, settings.language])

  const allCategories = categories.data ?? []

  const visibleServices = useMemo(() => {
    if (matches) return matches
    if (activeCategory === 'all') {
      return allCategories.flatMap((category) => category.services)
    }
    return allCategories.find((category) => category.id === activeCategory)?.services ?? []
  }, [matches, activeCategory, allCategories])

  const setCategory = (id: string) => {
    const next = new URLSearchParams(params)
    if (id === 'all') next.delete('category')
    else next.set('category', id)
    setParams(next, { replace: true })
  }

  const activeCategoryName =
    allCategories.find((category) => category.id === activeCategory)?.name ?? null

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-navy-800 sm:text-3xl">
          <Compass className="size-7 text-trust-600" aria-hidden="true" />
          {t('services.title')}
        </h1>
        <p className="mt-1 text-base text-ink-soft">{t('services.subtitle')}</p>
      </header>

      {/* Search */}
      <div>
        <label htmlFor="service-search" className="sr-only">
          {t('services.searchPlaceholder')}
        </label>
        <div className="flex items-center gap-2 rounded-card border-2 border-line bg-white p-2 shadow-card focus-within:border-trust-400">
          <Search className="ml-1 size-5 shrink-0 text-ink-mute" aria-hidden="true" />
          <input
            id="service-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('services.searchPlaceholder')}
            className="min-h-11 flex-1 bg-transparent px-1 text-base text-ink placeholder:text-ink-mute focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="min-h-10 shrink-0 rounded-lg px-3 text-sm font-semibold text-ink-soft hover:bg-surface-sunken"
            >
              {t('common.cancel')}
            </button>
          ) : null}
        </div>
        <p className="mt-1.5 px-1 text-xs text-ink-mute">{t('services.searchHint')}</p>
      </div>

      {/* Category filter */}
      <div aria-label={t('services.allCategories')}>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-navy-800">
          <ListFilter className="size-4 text-trust-600" aria-hidden="true" />
          {t('landing.categories')}
        </p>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-thin">
          <CategoryChip
            label={t('services.allCategories')}
            active={activeCategory === 'all' && !matches}
            onClick={() => {
              setQuery('')
              setCategory('all')
            }}
          />
          {allCategories.map((category) => (
            <CategoryChip
              key={category.id}
              label={category.name}
              count={category.service_count}
              icon={category.icon}
              active={activeCategory === category.id && !matches}
              onClick={() => {
                setQuery('')
                setCategory(category.id)
              }}
            />
          ))}
        </div>
      </div>

      {/* Results */}
      <section aria-live="polite">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold text-navy-800">
            {matches
              ? t('services.results')
              : activeCategoryName
                ? `${t('services.servicesIn')} ${activeCategoryName}`
                : t('landing.services')}
          </h2>
          {!categories.loading ? (
            <span className="shrink-0 text-sm text-ink-mute tabular-nums">
              {visibleServices.length} {t('services.count')}
            </span>
          ) : null}
        </div>

        {searchError ? (
          <InlineNote tone="danger" className="mb-3">
            {searchError}
          </InlineNote>
        ) : null}

        {categories.loading && !matches ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((index) => (
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
        ) : categories.error && !matches ? (
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
        ) : searching ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((index) => (
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
        ) : visibleServices.length === 0 ? (
          <Card className="text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-surface-sunken text-ink-mute">
              <SearchX className="size-7" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-lg font-bold text-navy-800">{t('services.noResults')}</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
              {t('services.noResultsHint')}
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setCategory('all')
              }}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-line px-4 py-2 text-sm font-semibold text-trust-700 hover:border-trust-300 hover:bg-trust-50"
            >
              {t('services.allCategories')}
            </button>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleServices.map((service) => (
              <li key={service.id}>
                <Link
                  to={`/services/${service.id}`}
                  className="group flex h-full flex-col rounded-card border border-line bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-trust-300 hover:shadow-lift focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-trust-50 text-trust-700">
                      <CategoryIcon name={service.category_icon} className="size-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">
                        {service.category_name}
                      </p>
                      <h3 className="text-lg font-bold leading-snug text-navy-800 group-hover:text-trust-800">
                        {service.name}
                      </h3>
                    </div>
                    <ArrowRight
                      className="mt-1 size-5 shrink-0 text-line-strong transition-colors group-hover:text-trust-600"
                      aria-hidden="true"
                    />
                  </div>

                  {service.tagline ? (
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">
                      {service.tagline}
                    </p>
                  ) : (
                    <span className="flex-1" />
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-mute">
                    <span className="rounded-pill bg-surface-sunken px-2 py-0.5 font-semibold">
                      {service.step_count} {t('services.stepCount')}
                    </span>
                    <span className="rounded-pill bg-surface-sunken px-2 py-0.5 font-semibold">
                      {service.document_count} {t('services.docCount')}
                    </span>
                    <span className="rounded-pill bg-surface-sunken px-2 py-0.5 font-semibold">
                      {t(
                        service.jurisdiction === 'state'
                          ? 'common.jurisdiction.state'
                          : 'common.jurisdiction.national',
                      )}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    <VerificationBadge
                      level={service.verification_level}
                      label={service.verification_label}
                      size="sm"
                    />
                    <span className="text-xs text-ink-mute">
                      {t('service.lastVerified')}: {service.last_verified}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function CategoryChip({
  label,
  count,
  icon,
  active,
  onClick,
}: {
  label: string
  count?: number
  icon?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-pill border-2 px-3.5 py-2 text-sm font-semibold transition-colors',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600',
        active
          ? 'border-trust-600 bg-trust-700 text-white'
          : 'border-line bg-white text-navy-700 hover:border-trust-300 hover:bg-trust-50',
      )}
    >
      {icon ? (
        <CategoryIcon
          name={icon}
          className={cn('size-4', active ? 'text-white' : 'text-trust-600')}
        />
      ) : null}
      {label}
      {typeof count === 'number' ? (
        <span
          className={cn(
            'rounded-pill px-1.5 py-0.5 text-xs font-bold tabular-nums',
            active ? 'bg-white/20 text-white' : 'bg-surface-sunken text-ink-mute',
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  )
}
