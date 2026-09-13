/**
 * Voice input: the microphone button and the listening overlay.
 *
 * The overlay always ends at an editable transcript with an explicit send,
 * because a mis-heard word is worse than one extra tap. If neither browser
 * speech recognition nor a server transcription engine is available, the
 * overlay explains that in one plain sentence and points at the text box —
 * voice is a convenience, never a requirement.
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Check, Mic, MicOff, Pencil, Send, X } from 'lucide-react'
import { Button } from './ui'
import { cn } from '../lib/cn'
import { useSettings } from '../context/SettingsContext'
import { useSpeechRecognition, type VoiceErrorKind } from '../hooks/useSpeechRecognition'
import { useVoiceSupport, type VoiceSupport } from '../hooks/useVoiceSupport'
import { speak, stopSpeaking } from '../lib/tts'

const ERROR_MESSAGE_KEYS: Record<VoiceErrorKind, string> = {
  unsupported: 'assistant.voiceUnsupported',
  denied: 'assistant.voiceDenied',
  no_speech: 'assistant.voiceFailed',
  no_microphone: 'assistant.voiceDenied',
  network: 'assistant.offline',
  language_unsupported: 'assistant.voiceUnsupported',
  server_unavailable: 'assistant.voiceUnsupported',
  failed: 'assistant.voiceFailed',
  aborted: 'assistant.voiceFailed',
}

export interface MicButtonProps {
  onResult: (text: string) => void
  size?: 'md' | 'lg' | 'xl'
  label?: string
  className?: string
  disabled?: boolean
}

export function MicButton({
  onResult,
  size = 'md',
  label,
  className,
  disabled,
}: MicButtonProps) {
  const { settings, t } = useSettings()
  const support = useVoiceSupport()
  const [overlayOpen, setOverlayOpen] = useState(false)

  const speech = useSpeechRecognition(settings.language, () => {
    /* the overlay handles confirmation */
  })

  const sizes = {
    md: 'size-12',
    lg: 'size-16',
    xl: 'size-24',
  } as const
  const iconSizes = { md: 'size-5', lg: 'size-7', xl: 'size-10' } as const

  const handleClick = () => {
    stopSpeaking()
    setOverlayOpen(true)
    // A tick of delay lets the overlay paint before the mic permission prompt,
    // which otherwise steals focus and can leave the overlay stuck.
    window.setTimeout(() => speech.start(), 60)
  }

  // No microphone is offered when the citizen turned voice off, or when no
  // recognition route exists — typing is always available beside it.
  if (!settings.voiceEnabled || !support.available) return null

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-label={label ?? t('assistant.speak')}
        className={cn(
          'relative grid shrink-0 place-items-center rounded-full bg-trust-700 text-white shadow-lift',
          'transition-transform duration-150 hover:bg-trust-800 hover:scale-105 active:scale-95',
          'focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-trust-600',
          'disabled:opacity-50 disabled:hover:scale-100',
          sizes[size],
          className,
        )}
      >
        <Mic className={iconSizes[size]} aria-hidden="true" />
      </button>

      {overlayOpen
        ? createPortal(
            <VoiceOverlay
              speech={speech}
              support={support}
              onClose={() => {
                speech.cancel()
                setOverlayOpen(false)
              }}
              onConfirm={(text) => {
                onResult(text)
                speech.clearTranscript()
                setOverlayOpen(false)
              }}
            />,
            document.body,
          )
        : null}
    </>
  )
}

interface VoiceOverlayProps {
  speech: ReturnType<typeof useSpeechRecognition>
  support: VoiceSupport
  onClose: () => void
  onConfirm: (text: string) => void
}

function VoiceOverlay({ speech, onClose, onConfirm, support }: VoiceOverlayProps) {
  const { t, settings } = useSettings()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  // Escape closes and releases the microphone.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        speech.cancel()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, speech])

  // Keep the editable draft in sync with what was heard.
  useEffect(() => {
    if (speech.transcript) setDraft(speech.transcript)
  }, [speech.transcript])

  useEffect(() => {
    if (speech.state === 'error' && speech.errorKind) {
      const message = t(ERROR_MESSAGE_KEYS[speech.errorKind] ?? 'assistant.voiceFailed')
      if (settings.ttsEnabled) speak(message, { language: settings.language })
    }
  }, [speech.state, speech.errorKind, settings.ttsEnabled, settings.language, t])

  const hasTranscript = Boolean(draft.trim())
  const statusLabel =
    speech.state === 'listening'
      ? t('assistant.listening')
      : speech.state === 'processing'
        ? t('assistant.processing')
        : speech.state === 'error'
          ? t(ERROR_MESSAGE_KEYS[speech.errorKind ?? 'failed'] ?? 'assistant.voiceFailed')
          : t('assistant.ready')

  const canRecord =
    speech.browserSupported || (speech.recorderSupported && support.serverTranscription)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-overlay-title"
      onClick={onClose}
    >
      <motion.div
        {...(settings.reducedMotion
          ? {}
          : {
              initial: { opacity: 0, y: 24 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.24, ease: 'easeOut' as const },
            })}
        className="w-full max-w-lg rounded-t-card bg-white p-5 shadow-lift sm:rounded-card sm:p-6 safe-bottom"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="voice-overlay-title" className="text-lg font-bold text-navy-800">
            {t('assistant.speak')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="grid size-10 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-sunken focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {!canRecord ? (
          <div className="mt-5 text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-surface-sunken text-ink-mute">
              <MicOff className="size-8" aria-hidden="true" />
            </span>
            <p className="mt-4 text-ink leading-relaxed">{t('assistant.voiceUnsupported')}</p>
            <Button variant="primary" size="lg" className="mt-5" fullWidth onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        ) : (
          <>
            {/* Microphone visualisation */}
            <div className="mt-6 flex flex-col items-center">
              <div className="relative grid size-32 place-items-center">
                {speech.state === 'listening' ? (
                  <>
                    <span
                      className="absolute inset-0 rounded-full bg-trust-200 animate-sarthi-pulse"
                      aria-hidden="true"
                    />
                    <span
                      className="absolute inset-3 rounded-full bg-trust-100 animate-sarthi-pulse [animation-delay:0.4s]"
                      aria-hidden="true"
                    />
                  </>
                ) : null}
                <span
                  className={cn(
                    'relative grid size-20 place-items-center rounded-full transition-colors',
                    speech.state === 'error'
                      ? 'bg-danger-50 text-danger-600'
                      : speech.state === 'listening'
                        ? 'bg-danger-600 text-white'
                        : 'bg-trust-700 text-white',
                  )}
                >
                  {speech.state === 'error' ? (
                    <MicOff className="size-9" aria-hidden="true" />
                  ) : (
                    <Mic className="size-9" aria-hidden="true" />
                  )}
                </span>
              </div>

              {/* Waveform — decorative, and flattened under reduced motion. */}
              <div
                className="mt-4 flex h-8 items-end justify-center gap-1"
                aria-hidden="true"
              >
                {[0, 1, 2, 3, 4, 5, 6].map((bar) => (
                  <span
                    key={bar}
                    className={cn(
                      'w-1.5 rounded-full bg-trust-400',
                      speech.state === 'listening' ? 'animate-sarthi-wave' : 'h-2 opacity-40',
                    )}
                    style={
                      speech.state === 'listening'
                        ? {
                            height: `${[40, 70, 100, 60, 90, 45, 75][bar]}%`,
                            animationDelay: `${bar * 0.09}s`,
                          }
                        : undefined
                    }
                  />
                ))}
              </div>

              <p
                className="mt-3 text-center text-base font-semibold text-navy-800"
                role="status"
                aria-live="polite"
              >
                {statusLabel}
              </p>
              {speech.usingFallbackRecorder ? (
                <p className="mt-1 text-center text-xs text-ink-mute">
                  {t('settings.autoVoiceHint')}
                </p>
              ) : null}
            </div>

            {/* Transcript — editable before sending */}
            <div className="mt-5">
              {editing ? (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-navy-800">
                    {t('assistant.transcriptHint')}
                  </span>
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={3}
                    autoFocus
                    className="w-full resize-none rounded-xl border-2 border-trust-300 p-3 text-base text-ink focus:border-trust-600 focus-visible:outline-none"
                  />
                </label>
              ) : (
                <div className="rounded-xl border-2 border-line bg-surface-muted p-3">
                  <p className="min-h-6 text-base text-ink leading-relaxed">
                    {draft || speech.interim || (
                      <span className="text-ink-mute">{t('assistant.listening')}</span>
                    )}
                  </p>
                </div>
              )}

              {hasTranscript ? (
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={editing ? Check : Pencil}
                    onClick={() => setEditing((current) => !current)}
                    aria-expanded={editing}
                  >
                    {editing ? t('common.confirm') : t('assistant.editTranscript')}
                  </Button>
                </div>
              ) : null}
            </div>

            {/* Controls */}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              {speech.state === 'listening' ? (
              <Button variant="danger" size="lg" icon={Mic} fullWidth onClick={speech.stop}>
                {t('assistant.stopSpeaking')}
              </Button>
              ) : (
                <Button variant="secondary" size="lg" icon={Mic} fullWidth onClick={speech.start}>
                  {hasTranscript ? t('assistant.retry') : t('assistant.speak')}
                </Button>
              )}
              <Button
                variant="primary"
                size="lg"
                icon={Send}
                fullWidth
                disabled={!hasTranscript}
                onClick={() => onConfirm(draft.trim())}
              >
                {t('assistant.send')}
              </Button>
            </div>

            <p className="mt-4 text-center text-xs text-ink-mute">
              {support.notice || t('common.privacy')}
            </p>
          </>
        )}
      </motion.div>
    </div>
  )
}
