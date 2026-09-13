/**
 * AI Assistant.
 *
 * The whole conversation lives here: history, voice, text, quick actions and
 * read-aloud. Two behaviours matter for trust —
 *
 *  • nothing is sent until the citizen confirms what the microphone heard, and
 *  • every answer shows how confident SAARTHI is and where the information
 *    came from, with the disclaimer attached.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Mic, RefreshCw, ShieldCheck, Sparkles, WifiOff } from 'lucide-react'
import { Button, Card, InlineNote } from '../components/ui'
import { Composer, MessageView, SuggestedPrompts, ThinkingIndicator } from '../components/chat'
import { MicButton } from '../components/VoiceInput'
import { useChat } from '../context/ChatContext'
import { useSettings } from '../context/SettingsContext'
import { useTextToSpeech } from '../hooks/useTextToSpeech'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAsync } from '../hooks/useAsync'
import { useVoiceSupport } from '../hooks/useVoiceSupport'
import { api } from '../lib/api'
import { stateLabel } from '../lib/states'
import type { BlockHandlers } from '../components/blocks'
import type { QuickAction } from '../lib/types'

export function AssistantPage() {
  const { t, settings, meta, online, demoMode } = useSettings()
  useDocumentTitle(`${t('assistant.title')} — SAARTHI AI`)
  const { messages, stage, send, reset, retry, lastResponse } = useChat()
  const navigate = useNavigate()
  const tts = useTextToSpeech(settings.language)
  const voice = useVoiceSupport()

  const bottomRef = useRef<HTMLDivElement>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const spokenIds = useRef<Set<string>>(new Set())

  const phrases = useAsync(
    () => api.phrases(settings.language),
    [settings.language],
  )

  const busy = stage !== 'idle' && stage !== 'done'
  const isEmpty = messages.length === 0

  // Keep the newest message in view without stealing scroll position.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: settings.reducedMotion ? 'auto' : 'smooth',
      block: 'end',
    })
  }, [messages.length, stage, settings.reducedMotion])

  // Read answers aloud automatically only when the citizen asked for it.
  useEffect(() => {
    if (!settings.ttsEnabled || !tts.supported) return
    const last = [...messages].reverse().find((message) => message.response)
    if (!last || !last.response) return
    if (spokenIds.current.has(last.id)) return
    spokenIds.current.add(last.id)
    const spoken = last.response.reply.spoken_text || last.response.reply.text
    tts.speakText(last.id, spoken)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, settings.ttsEnabled, tts.supported])

  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      if (action.kind === 'navigate' && action.value) {
        navigate(action.value)
        return
      }
      if (action.kind === 'link' && action.value) {
        window.open(action.value, '_blank', 'noopener,noreferrer')
        return
      }
      if (action.kind === 'prompt' && action.value) {
        void send(action.value)
      }
    },
    [navigate, send],
  )

  const blockHandlers = useMemo<BlockHandlers>(
    () => ({
      // Tapping an option sends the option's words *and* its id, so the answer
      // is right whether or not the id happens to be a service id.
      onSelectClarifier: (optionId, label) => {
        void send(label, { clarifierAnswer: optionId })
      },
      onQuickPrompt: (text) => void send(text),
    }),
    [send],
  )

  const suggestions = lastResponse?.suggested_prompts ?? []
  const quickActions = lastResponse?.quick_actions ?? []
  const fallbackPrompts = phrases.data?.suggested_prompts?.slice(0, 6) ?? []
  const activeState = stateLabel(settings.state, settings.language)

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true)
      window.setTimeout(() => setConfirmReset(false), 5000)
      return
    }
    tts.stop()
    reset()
    setConfirmReset(false)
  }

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-navy-800 text-white">
            <Bot className="size-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-extrabold text-navy-800 sm:text-2xl">
              {t('assistant.title')}
            </h1>
            <p className="text-sm text-ink-soft">{t('assistant.subtitle')}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              {demoMode ? (
                <span className="inline-flex items-center gap-1 rounded-pill bg-attention-50 px-2 py-0.5 font-bold text-attention-700">
                  {t('assistant.demoMode')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-pill bg-success-50 px-2 py-0.5 font-bold text-success-700">
                  <ShieldCheck className="size-3" aria-hidden="true" />
                  {meta?.ai_provider}
                </span>
              )}
              {activeState ? (
                <span className="rounded-pill bg-surface-sunken px-2 py-0.5 font-semibold text-ink-soft">
                  {activeState}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {!isEmpty ? (
          <Button
            variant={confirmReset ? 'danger' : 'secondary'}
            size="sm"
            icon={confirmReset ? RefreshCw : RefreshCw}
            onClick={handleReset}
          >
            {confirmReset ? t('common.confirm') : t('assistant.clear')}
          </Button>
        ) : null}
      </div>

      {!online ? (
        <InlineNote tone="warning" className="mb-4">
          <span className="flex items-center gap-2">
            <WifiOff className="size-4 shrink-0" aria-hidden="true" />
            {t('assistant.offline')}
          </span>
        </InlineNote>
      ) : null}

      {/* Conversation */}
      <div className="flex-1">
        {isEmpty ? (
          <Card className="border-2 border-trust-100 bg-trust-50/40">
            <h2 className="text-lg font-bold text-navy-800">{t('assistant.emptyTitle')}</h2>
            <p className="mt-1 text-base text-ink-soft">{t('assistant.emptyBody')}</p>

            {settings.voiceEnabled && voice.available ? (
              <div className="mt-5 flex flex-col items-center rounded-xl border-2 border-line bg-white p-5">
                <MicButton
                  onResult={(text) => void send(text, { fromVoice: true })}
                  size="lg"
                  label={t('landing.tapToSpeak')}
                />
                <p className="mt-3 flex items-center gap-1.5 text-base font-bold text-navy-800">
                  <Mic className="size-4 text-trust-600" aria-hidden="true" />
                  {t('landing.tapToSpeak')}
                </p>
                <p className="mt-1 text-center text-sm text-ink-mute">
                  {t('assistant.transcriptHint')}
                </p>
              </div>
            ) : null}

            <div className="mt-5">
              <SuggestedPrompts
                prompts={fallbackPrompts}
                onSelect={(prompt) => void send(prompt)}
                title={t('assistant.suggested')}
              />
            </div>
          </Card>
        ) : (
          <div className="space-y-4" aria-live="polite" aria-relevant="additions text">
            <h2 className="sr-only">{t('assistant.messagesLive')}</h2>
            {messages.map((message) => (
              <MessageView
                key={message.id}
                message={message}
                blockHandlers={blockHandlers}
                tts={{
                  // The per-answer Listen button is available whenever the
                  // device has a voice; the *automatic* read-aloud below is
                  // what the setting controls.
                  supported: tts.supported,
                  speakingId: tts.speakingId,
                  speakText: tts.speakText,
                }}
                onRetry={message.failed ? retry : undefined}
              />
            ))}

            {busy ? <ThinkingIndicator stage={stage} /> : null}
            <div ref={bottomRef} aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Suggestions after an answer */}
      {!isEmpty && !busy && suggestions.length ? (
        <div className="mt-5">
          <SuggestedPrompts
            prompts={suggestions}
            onSelect={(prompt) => void send(prompt)}
            title={t('assistant.suggested')}
          />
        </div>
      ) : null}

      {/* Composer */}
      <div className="sticky bottom-20 z-30 mt-5 md:bottom-4">
        <Composer
          onSend={(text, options) => void send(text, options)}
          busy={busy}
          quickActions={quickActions}
          onQuickAction={handleQuickAction}
          autoFocus={isEmpty && !settings.voiceEnabled}
        />
      </div>

      {demoMode && !isEmpty ? (
        <p className="mt-4 flex items-start gap-2 text-xs text-ink-mute">
          <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {t('assistant.demoModeHint')}
        </p>
      ) : null}
    </div>
  )
}
