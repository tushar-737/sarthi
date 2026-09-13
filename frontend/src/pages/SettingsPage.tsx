/**
 * Accessibility settings.
 *
 * Every control here takes effect immediately and is remembered on this
 * device. Nothing is an account setting, because SAARTHI has no accounts.
 *
 * Voice support is reported honestly: if the browser cannot do speech
 * recognition and the backend has no transcription key, the toggle says so and
 * explains that typing always works.
 */

import { useEffect, useState } from 'react'
import {
  Check,
  Contrast,
  Globe,
  Info,
  MapPin,
  Mic,
  Minus,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  Type,
  Volume2,
  X,
  Zap,
} from 'lucide-react'
import { Button, Card, InlineNote, SectionHeading, Toggle } from '../components/ui'
import { LanguageSelector } from '../components/LanguageSelector'
import { useSettings, type TextSize } from '../context/SettingsContext'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAsync } from '../hooks/useAsync'
import { api } from '../lib/api'
import { hasVoiceFor, speak, stopSpeaking } from '../lib/tts'
import { isBrowserSpeechSupported, isRecordingSupported } from '../lib/speech'
import { STATES, stateLabel } from '../lib/states'
import type { AudioRecognitionSupport } from '../lib/types'

const TEXT_SIZES: TextSize[] = ['small', 'medium', 'large', 'xlarge']

export function SettingsPage() {
  const { settings, update, reset, t, meta, demoMode } = useSettings()
  useDocumentTitle(`${t('settings.title')} — SAARTHI AI`)
  const [savedFlash, setSavedFlash] = useState(false)
  const [testingVoice, setTestingVoice] = useState(false)

  const support = useAsync<AudioRecognitionSupport>(
    () => api.voiceSupport(),
    [],
  )

  useEffect(() => {
    return () => stopSpeaking()
  }, [])

  const flashSaved = () => {
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 2200)
  }

  const change = (patch: Parameters<typeof update>[0]) => {
    update(patch)
    flashSaved()
  }

  const stepText = (delta: number) => {
    const index = TEXT_SIZES.indexOf(settings.textSize)
    const next = TEXT_SIZES[Math.min(Math.max(index + delta, 0), TEXT_SIZES.length - 1)]
    change({ textSize: next })
  }

  const sizeLabel: Record<TextSize, string> = {
    small: t('settings.small'),
    medium: t('settings.medium'),
    large: t('settings.large'),
    xlarge: t('settings.xlarge'),
  }

  const browserSpeech = isBrowserSpeechSupported()
  const recorder = isRecordingSupported()
  const voiceAvailable = browserSpeech || (recorder && Boolean(support.data?.server_stt_available))
  const ttsAvailable = hasVoiceFor(settings.language)

  const testVoice = () => {
    if (!ttsAvailable) return
    setTestingVoice(true)
    speak(t('settings.testVoiceText'), {
      language: settings.language,
      onEnd: () => setTestingVoice(false),
      onError: () => setTestingVoice(false),
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-navy-800 sm:text-3xl">
            <Settings2 className="size-7 text-trust-600" aria-hidden="true" />
            {t('settings.title')}
          </h1>
          <p className="mt-1 text-base text-ink-soft">{t('settings.subtitle')}</p>
        </div>
        <Button variant="secondary" size="md" icon={RotateCcw} onClick={reset}>
          {t('settings.reset')}
        </Button>
      </header>

      <p className="sr-only" role="status" aria-live="polite">
        {savedFlash ? t('settings.saved') : ''}
      </p>

      {/* Language */}
      <Card as="section">
        <SectionHeading icon={Globe} title={t('settings.language')} hint={t('settings.languageHint')} />
        <LanguageSelector />
        <p className="mt-3 text-sm text-ink-mute">
          {t('settings.languageNote')}{' '}
          {meta?.languages?.length
            ? `${meta.languages.length} ${t('settings.languagesAvailable')}`
            : null}
        </p>
      </Card>

      {/* Text size */}
      <Card as="section">
        <SectionHeading icon={Type} title={t('settings.textSize')} hint={t('settings.textSizeHint')} />
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="lg"
            icon={Minus}
            onClick={() => stepText(-1)}
            disabled={settings.textSize === 'small'}
            className="flex-1"
            aria-label={`${t('settings.textSize')}: ${sizeLabel.small}`}
          >
            A−
          </Button>
          <span
            className="min-w-24 text-center text-base font-bold text-navy-800"
            aria-live="polite"
          >
            {sizeLabel[settings.textSize]}
          </span>
          <Button
            variant="secondary"
            size="lg"
            icon={Plus}
            onClick={() => stepText(1)}
            disabled={settings.textSize === 'xlarge'}
            className="flex-1"
            aria-label={`${t('settings.textSize')}: ${sizeLabel.xlarge}`}
          >
            A+
          </Button>
        </div>

        <div className="mt-3 rounded-xl border-2 border-line bg-surface-muted p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-mute">
            {t('settings.preview')}
          </p>
          <p className="mt-1 text-base leading-relaxed text-ink">{t('settings.previewText')}</p>
          <p className="mt-2 text-sm text-ink-soft">{t('assistant.emptyBody')}</p>
        </div>
      </Card>

      {/* Voice input */}
      <Card as="section">
        <SectionHeading icon={Mic} title={t('settings.voice')} hint={t('settings.voiceHint')} />
        <div className="divide-y divide-line">
          <Toggle
            checked={settings.voiceEnabled}
            onChange={(next) => change({ voiceEnabled: next })}
            label={t('settings.voice')}
            hint={t('settings.voiceHint')}
            onLabel={t('settings.on')}
            offLabel={t('settings.off')}
          />
        </div>

        {support.loading ? (
          <p className="mt-2 text-sm text-ink-mute">{t('common.loading')}</p>
        ) : (
          <InlineNote tone={voiceAvailable ? 'info' : 'warning'} className="mt-3">
            <span className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {support.data?.notice ?? t('settings.autoVoiceHint')}
                <span className="mt-1 block text-xs">
                  {t('settings.browserVoice')}: {browserSpeech ? t('settings.available') : t('settings.unavailable')} ·{' '}
                  {t('settings.serverVoice')}: {support.data?.server_stt_available ? t('settings.available') : t('settings.unavailable')}
                  {support.data?.recommended_mode
                    ? ` · ${t('settings.recommended')}: ${support.data.recommended_mode}`
                    : ''}
                </span>
              </span>
            </span>
          </InlineNote>
        )}

        {!voiceAvailable ? (
          <p className="mt-2 text-sm text-ink-soft">{t('assistant.voiceUnsupported')}</p>
        ) : null}
      </Card>

      {/* Read aloud */}
      <Card as="section">
        <SectionHeading
          icon={Volume2}
          title={t('settings.tts')}
          hint={t('settings.ttsHint')}
        />
        <div className="divide-y divide-line">
          <Toggle
            checked={settings.ttsEnabled}
            onChange={(next) => change({ ttsEnabled: next })}
            label={t('settings.tts')}
            hint={t('settings.ttsHint')}
            onLabel={t('settings.on')}
            offLabel={t('settings.off')}
            disabled={!ttsAvailable}
          />
        </div>

        {ttsAvailable ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="md"
              icon={testingVoice ? X : Volume2}
              onClick={() => (testingVoice ? stopSpeaking() : testVoice())}
            >
              {testingVoice ? t('service.stopListen') : t('settings.testVoice')}
            </Button>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success-700">
              <Check className="size-4" aria-hidden="true" />
              {t('settings.voiceReady')}
            </span>
          </div>
        ) : (
          <InlineNote tone="warning" className="mt-3">
            {t('settings.noVoice')}
          </InlineNote>
        )}
      </Card>

      {/* Contrast + motion */}
      <Card as="section">
        <SectionHeading icon={Contrast} title={t('settings.display')} hint={t('settings.displayHint')} />
        <div className="divide-y divide-line">
          <Toggle
            checked={settings.highContrast}
            onChange={(next) => change({ highContrast: next })}
            label={t('settings.highContrast')}
            hint={t('settings.highContrastHint')}
            onLabel={t('settings.on')}
            offLabel={t('settings.off')}
          />
          <Toggle
            checked={settings.reducedMotion}
            onChange={(next) => change({ reducedMotion: next })}
            label={t('settings.reducedMotion')}
            hint={t('settings.reducedMotionHint')}
            onLabel={t('settings.on')}
            offLabel={t('settings.off')}
          />
        </div>
        <p className="mt-2 flex items-start gap-2 text-sm text-ink-mute">
          <Zap className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t('settings.keyboardNote')}
        </p>
      </Card>

      {/* Personalisation — state only */}
      <Card as="section">
        <SectionHeading
          icon={MapPin}
          title={t('settings.personalisation')}
          hint={t('settings.personalisationHint')}
        />
        <label className="block" htmlFor="state-select">
          <span className="mb-1.5 block text-sm font-bold text-navy-800">
            {t('settings.stateLabel')}
          </span>
          <div className="relative flex items-center">
            <select
              id="state-select"
              value={settings.state ?? ''}
              onChange={(event) => change({ state: event.target.value || null })}
              className="min-h-12 w-full appearance-none rounded-xl border-2 border-line bg-white px-3 pr-10 text-base font-semibold text-navy-800 hover:border-trust-300 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600"
            >
              <option value="">{t('settings.stateNone')}</option>
              {STATES.map((state) => (
                <option key={state.code} value={state.code}>
                  {settings.language === 'hi' ? state.hi : state.en}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 text-ink-mute" aria-hidden="true">
              ▾
            </span>
          </div>
        </label>

        {settings.state ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-trust-50 px-3 py-1 text-sm font-semibold text-trust-700">
              <MapPin className="size-4" aria-hidden="true" />
              {stateLabel(settings.state, settings.language)}
            </span>
            <Button variant="ghost" size="sm" icon={X} onClick={() => change({ state: null })}>
              {t('settings.clearState')}
            </Button>
          </div>
        ) : null}

        <InlineNote tone="success" className="mt-3">
          {meta?.privacy_notice ?? t('common.privacy')}
        </InlineNote>
      </Card>

      {/* Prototype + demo mode */}
      <Card as="section" className="bg-surface-muted">
        <SectionHeading icon={Sparkles} title={t('settings.aboutThis')} />
        <p className="text-sm leading-relaxed text-ink-soft">
          {meta?.prototype_notice ?? t('app.prototype')}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {meta?.disclaimer ?? t('common.disclaimer')}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-pill bg-surface-sunken px-2.5 py-1 font-semibold text-ink-soft">
            {t('settings.version')}: {meta?.version ?? '—'}
          </span>
          <span className="rounded-pill bg-surface-sunken px-2.5 py-1 font-semibold text-ink-soft">
            {t('settings.provider')}: {meta?.ai_provider ?? 'local'}
          </span>
          {demoMode ? (
            <span className="rounded-pill bg-attention-50 px-2.5 py-1 font-bold text-attention-700">
              {t('assistant.demoMode')}
            </span>
          ) : null}
          {meta?.knowledge_base ? (
            <span className="rounded-pill bg-surface-sunken px-2.5 py-1 font-semibold text-ink-soft">
              {meta.knowledge_base.services} {t('services.count')} ·{' '}
              {meta.knowledge_base.categories} {t('landing.categories')} ·{' '}
              {t('service.lastVerified')}: {meta.knowledge_base.last_updated}
            </span>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
