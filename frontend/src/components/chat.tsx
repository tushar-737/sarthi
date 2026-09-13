/**
 * Chat presentation: message bubbles, the thinking indicator and the composer.
 *
 * The assistant side is not a wall of text. Blocks arrive already structured,
 * so the citizen sees a service card, a checklist they can tick and a source
 * card they can verify — with the confidence and verification level stated in
 * plain words underneath.
 */

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Bot,
  ExternalLink,
  MessageCircleQuestion,
  RotateCcw,
  Send,
  ShieldCheck,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { cn } from '../lib/cn'
import { Button, VerificationBadge } from './ui'
import { BlockRenderer, type BlockHandlers } from './blocks'
import { MicButton } from './VoiceInput'
import { useSettings } from '../context/SettingsContext'
import type { ChatMessage as ChatMessageModel, PipelineStage } from '../context/ChatContext'
import type { QuickAction, SuggestedPrompt } from '../lib/types'

/** Mirrors the backend's 4000-character input limit. */
const MAX_INPUT = 4000

const STAGE_KEYS: Record<'understanding' | 'retrieving' | 'composing', string> = {
  understanding: 'assistant.thinking',
  retrieving: 'assistant.retrieving',
  composing: 'assistant.composing',
}

/* --- Thinking indicator --------------------------------------------------- */

export function ThinkingIndicator({ stage }: { stage: PipelineStage }) {
  const { t } = useSettings()
  const key =
    stage === 'understanding' || stage === 'retrieving' || stage === 'composing'
      ? STAGE_KEYS[stage]
      : 'assistant.thinking'

  return (
    <div className="flex gap-3" role="status" aria-live="polite">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-navy-800 text-white">
        <Bot className="size-5" aria-hidden="true" />
      </span>
      <div className="max-w-[85%] rounded-card rounded-tl-sm border border-line bg-white p-4 shadow-card">
        <p className="text-base font-semibold text-navy-800">{t(key)}</p>
        <div className="mt-3 flex items-center gap-1.5">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="size-2 animate-sarthi-dot rounded-full bg-trust-500"
              style={{ animationDelay: `${dot * 0.18}s` }}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* --- Message -------------------------------------------------------------- */

/** Confidence is shown as a word, not a number a citizen cannot act on. */
export function confidenceKey(confidence: number): string {
  if (confidence >= 0.8) return 'assistant.confidence.high'
  if (confidence >= 0.55) return 'assistant.confidence.medium'
  return 'assistant.confidence.low'
}

export interface TtsControls {
  supported: boolean
  speakingId: string | null
  speakText: (id: string, text: string) => void
}

export interface MessageProps {
  message: ChatMessageModel
  blockHandlers?: BlockHandlers
  tts?: TtsControls
  onRetry?: () => void
}

export function MessageView({ message, blockHandlers, tts, onRetry }: MessageProps) {
  const { t, settings } = useSettings()
  const isUser = message.role === 'user'
  const response = message.response
  const speaking = tts?.speakingId === message.id

  // A short rise as each message lands. Disabled outright under reduced motion.
  const entrance = settings.reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.22, ease: 'easeOut' as const },
      }

  return (
    <motion.div {...entrance} className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-xl text-white',
          isUser ? 'bg-trust-600' : 'bg-navy-800',
        )}
        aria-hidden="true"
      >
        {isUser ? <User className="size-5" /> : <Bot className="size-5" />}
      </span>

      <div
        className={cn(
          'min-w-0 max-w-[88%] space-y-3 rounded-card border p-4 shadow-card sm:max-w-[80%]',
          isUser
            ? 'rounded-tr-sm border-trust-700 bg-trust-700 text-white'
            : 'rounded-tl-sm border-line bg-white text-ink',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-line text-base leading-relaxed">{message.text}</p>
        ) : message.failed ? (
          <div className="space-y-3">
            <p className="font-semibold text-danger-700">{message.text}</p>
            <div className="flex flex-wrap items-center gap-2">
              {onRetry ? (
                <Button variant="secondary" size="sm" icon={RotateCcw} onClick={onRetry}>
                  {t('assistant.retry')}
                </Button>
              ) : null}
              <Link
                to="/services"
                className="inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-semibold text-trust-700 underline underline-offset-4 hover:text-trust-800"
              >
                {t('assistant.exploreServices')}
              </Link>
            </div>
          </div>
        ) : response ? (
          <>
            {response.reply.blocks.length ? (
              <div className="space-y-3">
                {response.reply.blocks.map((block, index) => (
                  <BlockRenderer
                    key={`${message.id}-block-${index}`}
                    block={block}
                    handlers={blockHandlers}
                  />
                ))}
              </div>
            ) : (
              <p className="whitespace-pre-line text-base leading-relaxed">
                {response.reply.text}
              </p>
            )}

            {/* Confidence and verification, stated in words. */}
            {response.intent.service_id ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-ink-soft">
                  <ShieldCheck className="size-3.5 text-trust-600" aria-hidden="true" />
                  {t(confidenceKey(response.intent.confidence))}
                </span>
                {response.verification_level ? (
                  <VerificationBadge level={response.verification_level} size="sm" />
                ) : null}
              </div>
            ) : null}

            {response.sources.length ? (
              <ul className="space-y-1 border-t border-line pt-3">
                {response.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-trust-700 underline underline-offset-4 hover:text-trust-800"
                    >
                      <ExternalLink className="size-3" aria-hidden="true" />
                      {source.authority} · {source.portal_label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}

            {response.disclaimer ? (
              <p className="border-t border-line pt-3 text-xs leading-relaxed text-ink-mute">
                {response.disclaimer}
              </p>
            ) : null}

            {response.demo_mode ? (
              <p className="rounded-lg bg-attention-50 px-2.5 py-1.5 text-xs font-semibold text-attention-700">
                {t('assistant.demoMode')} — {t('assistant.demoModeHint')}
              </p>
            ) : null}

            {tts?.supported && response.reply.spoken_text ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={speaking ? VolumeX : Volume2}
                  onClick={() => tts.speakText(message.id, response.reply.spoken_text)}
                  aria-pressed={speaking}
                >
                  {speaking ? t('assistant.stopListen') : t('assistant.listen')}
                </Button>
                <span className="text-xs text-ink-mute">{t('assistant.listenHint')}</span>
              </div>
            ) : null}
          </>
        ) : (
          <p className="whitespace-pre-line text-base leading-relaxed">{message.text}</p>
        )}
      </div>
    </motion.div>
  )
}

/* --- Suggested prompts ---------------------------------------------------- */

export function SuggestedPrompts({
  prompts,
  onSelect,
  title,
}: {
  prompts: SuggestedPrompt[] | string[]
  onSelect: (prompt: string) => void
  title?: string
}) {
  const items = prompts.map((prompt) => (typeof prompt === 'string' ? prompt : prompt.text))
  if (!items.length) return null

  return (
    <div>
      {title ? (
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-navy-800">
          <MessageCircleQuestion className="size-4 text-trust-600" aria-hidden="true" />
          {title}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {items.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelect(prompt)}
            className="min-h-11 rounded-pill border-2 border-line bg-white px-3.5 py-2 text-sm font-medium text-navy-800 transition-colors hover:border-trust-300 hover:bg-trust-50 hover:text-trust-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}

/* --- Composer ------------------------------------------------------------- */

export interface ComposerProps {
  onSend: (text: string, options?: { fromVoice?: boolean }) => void
  busy?: boolean
  placeholder?: string
  quickActions?: QuickAction[]
  /**
   * Quick actions are not all prompts: some navigate inside the app and some
   * open an official portal in a new tab. The page decides what each does.
   */
  onQuickAction?: (action: QuickAction) => void
  autoFocus?: boolean
}

export function Composer({
  onSend,
  busy = false,
  placeholder,
  quickActions = [],
  onQuickAction,
  autoFocus = false,
}: ComposerProps) {
  const { settings, t } = useSettings()
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Grow with content, up to a maximum that keeps the send button reachable.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [draft])

  const submit = (value?: string, fromVoice = false) => {
    const text = (value ?? draft).trim()
    if (!text || busy) return
    onSend(text, { fromVoice })
    setDraft('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const runQuickAction = (action: QuickAction) => {
    if (onQuickAction) {
      onQuickAction(action)
      return
    }
    if (action.kind === 'prompt' && action.value) submit(action.value)
  }

  // A prompt action with no value cannot do anything, so it is not shown.
  const visibleActions = quickActions.filter(
    (action) => action.kind !== 'prompt' || Boolean(action.value?.trim()),
  )

  return (
    <div className="space-y-2">
      {visibleActions.length ? (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-thin">
          {visibleActions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => runQuickAction(action)}
              disabled={busy}
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-pill border-2 border-line bg-white px-3 py-1.5 text-sm font-semibold text-navy-700 transition-colors hover:border-trust-300 hover:bg-trust-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trust-600 disabled:opacity-50"
            >
              {action.kind === 'link' ? (
                <ExternalLink className="size-3.5" aria-hidden="true" />
              ) : action.kind === 'navigate' ? (
                <ArrowRight className="size-3.5" aria-hidden="true" />
              ) : null}
              {action.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-2 rounded-card border-2 border-line bg-white p-2 shadow-card transition-colors focus-within:border-trust-400">
        <label className="sr-only" htmlFor="chat-composer">
          {t('assistant.placeholder')}
        </label>
        <textarea
          id="chat-composer"
          ref={textareaRef}
          rows={1}
          value={draft}
          disabled={busy}
          autoFocus={autoFocus}
          maxLength={MAX_INPUT}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder ?? t('assistant.placeholder')}
          className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2 text-base text-ink placeholder:text-ink-mute focus:outline-none disabled:opacity-60"
        />

        {settings.voiceEnabled ? (
          <MicButton onResult={(text) => submit(text, true)} disabled={busy} />
        ) : null}

        <Button
          variant="primary"
          size="md"
          icon={Send}
          onClick={() => submit()}
          disabled={busy || !draft.trim()}
          aria-label={t('assistant.send')}
          className="shrink-0 px-3.5"
        >
          <span className="hidden sm:inline">{t('assistant.send')}</span>
        </Button>
      </div>

      <p className="px-1 text-xs text-ink-mute">
        {settings.voiceEnabled ? t('assistant.voiceHint') : t('assistant.typeHint')} ·{' '}
        {t('common.privacy')}
      </p>
    </div>
  )
}
