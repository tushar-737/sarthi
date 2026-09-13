/**
 * Conversation state.
 *
 * The backend is stateless and holds no citizen session, so the transcript
 * lives here (and in localStorage for convenience). `activeServiceId` is sent
 * back with each request, which is what makes follow-up questions like
 * "what documents do I need?" work without the server remembering anything.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api, ApiError } from '../lib/api'
import type { ChatResponse, LanguageCode } from '../lib/types'

export type MessageRole = 'user' | 'assistant'
export type PipelineStage = 'idle' | 'understanding' | 'retrieving' | 'composing' | 'done'

export interface ChatMessage {
  id: string
  role: MessageRole
  /** For user messages: what they said. For assistant messages: reply.text. */
  text: string
  language: LanguageCode
  createdAt: number
  response?: ChatResponse
  /** Set when the message came from the microphone. */
  fromVoice?: boolean
  failed?: boolean
}

interface ChatContextValue {
  messages: ChatMessage[]
  stage: PipelineStage
  stageLabel: string
  error: string | null
  conversationId: string | null
  activeServiceId: string | null
  lastResponse: ChatResponse | null
  send: (
    text: string,
    options?: { fromVoice?: boolean; clarifierAnswer?: string; language?: LanguageCode },
  ) => Promise<void>
  reset: () => void
  retry: () => void
  clearError: () => void
  language: LanguageCode
  state: string | null
}

const ChatContext = createContext<ChatContextValue | null>(null)

const STORAGE_KEY = 'sarthi.conversation.v1'
const MAX_STORED = 40

interface PersistedChat {
  conversationId: string | null
  activeServiceId: string | null
  messages: ChatMessage[]
}

function loadPersisted(): PersistedChat {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { conversationId: null, activeServiceId: null, messages: [] }
    const parsed = JSON.parse(raw) as PersistedChat
    return {
      conversationId: parsed.conversationId ?? null,
      activeServiceId: parsed.activeServiceId ?? null,
      messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-MAX_STORED) : [],
    }
  } catch {
    return { conversationId: null, activeServiceId: null, messages: [] }
  }
}

function persist(value: PersistedChat) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...value, messages: value.messages.slice(-MAX_STORED) }))
  } catch {
    /* storage is best-effort */
  }
}

/** Stage labels are shown while the pipeline runs, so waiting feels explained. */
const STAGE_KEYS: Record<Exclude<PipelineStage, 'idle' | 'done'>, string> = {
  understanding: 'assistant.thinking',
  retrieving: 'assistant.retrieving',
  composing: 'assistant.composing',
}

interface ChatProviderProps {
  children: ReactNode
  language: LanguageCode
  state: string | null
  translate: (key: string) => string
}

export function ChatProvider({ children, language, state, translate }: ChatProviderProps) {
  const initial = useRef<PersistedChat>(loadPersisted())
  const [messages, setMessages] = useState<ChatMessage[]>(initial.current.messages)
  const [conversationId, setConversationId] = useState<string | null>(initial.current.conversationId)
  const [activeServiceId, setActiveServiceId] = useState<string | null>(
    initial.current.activeServiceId,
  )
  const [stage, setStage] = useState<PipelineStage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastRequest, setLastRequest] = useState<{
    text: string
    fromVoice: boolean
    clarifierAnswer?: string
  } | null>(null)

  const inFlight = useRef(false)

  useEffect(() => {
    persist({ conversationId, activeServiceId, messages })
  }, [conversationId, activeServiceId, messages])

  const stageLabel = useMemo(() => {
    if (stage === 'idle' || stage === 'done') return ''
    return translate(STAGE_KEYS[stage])
  }, [stage, translate])

  const reset = useCallback(() => {
    setMessages([])
    setConversationId(null)
    setActiveServiceId(null)
    setStage('idle')
    setError(null)
    setLastRequest(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const send = useCallback(
    async (
      text: string,
      options?: { fromVoice?: boolean; clarifierAnswer?: string; language?: LanguageCode },
    ) => {
      const trimmed = text.trim()
      if (!trimmed || inFlight.current) return

      inFlight.current = true
      setError(null)
      setLastRequest({
        text: trimmed,
        fromVoice: Boolean(options?.fromVoice),
        clarifierAnswer: options?.clarifierAnswer,
      })

      const userMessage: ChatMessage = {
        id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        role: 'user',
        text: trimmed,
        language: options?.language ?? language,
        createdAt: Date.now(),
        fromVoice: options?.fromVoice,
      }
      setMessages((current) => [...current, userMessage])

      // Walk the pipeline visibly: understanding → retrieving → composing.
      setStage('understanding')
      const timers = [
        window.setTimeout(() => setStage('retrieving'), 320),
        window.setTimeout(() => setStage('composing'), 720),
      ]

      try {
        const response = await api.chat({
          message: trimmed,
          language: options?.language ?? language,
          conversation_id: conversationId,
          active_service_id: activeServiceId,
          clarifier_answer: options?.clarifierAnswer ?? null,
          state,
          input_mode: options?.clarifierAnswer
            ? 'quick_reply'
            : options?.fromVoice
              ? 'voice'
              : 'text',
        })

        setConversationId(response.conversation_id)
        if (response.intent.service_id) setActiveServiceId(response.intent.service_id)
        else if (response.intent.intent_type === 'browse') setActiveServiceId(null)

        const assistantMessage: ChatMessage = {
          id: response.message_id,
          role: 'assistant',
          text: response.reply.text,
          language: response.reply.language,
          createdAt: Date.now(),
          response,
        }
        setMessages((current) => [...current, assistantMessage])
        setStage('done')
      } catch (caught) {
        const message =
          caught instanceof ApiError
            ? caught.code === 'offline'
              ? translate('assistant.offline')
              : caught.message
            : translate('assistant.errorGeneric')

        setError(message)
        setMessages((current) => [
          ...current,
          {
            id: `e_${Date.now()}`,
            role: 'assistant',
            text: message,
            language,
            createdAt: Date.now(),
            failed: true,
          },
        ])
        setStage('idle')
      } finally {
        timers.forEach(window.clearTimeout)
        inFlight.current = false
      }
    },
    [activeServiceId, conversationId, language, state, translate],
  )

  const retry = useCallback(() => {
    if (!lastRequest) return
    // Drop the failed pair so the retry does not duplicate the question.
    setMessages((current) => current.filter((message) => !message.failed))
    void send(lastRequest.text, {
      fromVoice: lastRequest.fromVoice,
      clarifierAnswer: lastRequest.clarifierAnswer,
    })
  }, [lastRequest, send])

  const clearError = useCallback(() => setError(null), [])

  const value = useMemo<ChatContextValue>(
    () => ({
      messages,
      stage,
      stageLabel,
      error,
      conversationId,
      activeServiceId,
      lastResponse: [...messages].reverse().find((m) => m.response)?.response ?? null,
      send,
      reset,
      retry,
      clearError,
      language,
      state,
    }),
    [messages, stage, stageLabel, error, conversationId, activeServiceId, send, reset, retry, clearError, language, state],
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat(): ChatContextValue {
  const context = useContext(ChatContext)
  if (!context) throw new Error('useChat must be used inside <ChatProvider>')
  return context
}
