/** Not found — always offers a way back rather than a dead end. */

import { Compass, Home, MessageCircle, Search } from 'lucide-react'
import { LinkButton } from '../components/ui'
import { useSettings } from '../context/SettingsContext'

export function NotFoundPage() {
  const { t } = useSettings()

  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-surface-sunken text-ink-mute">
        <Search className="size-8" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-2xl font-extrabold text-navy-800">{t('notfound.title')}</h1>
      <p className="mt-2 text-base text-ink-soft">{t('notfound.body')}</p>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <LinkButton to="/" variant="primary" size="lg" icon={Home}>
          {t('notfound.home')}
        </LinkButton>
        <LinkButton to="/assistant" variant="secondary" size="lg" icon={MessageCircle}>
          {t('nav.ask')}
        </LinkButton>
        <LinkButton to="/services" variant="secondary" size="lg" icon={Compass}>
          {t('nav.services')}
        </LinkButton>
      </div>
    </div>
  )
}
