/**
 * Voice input hook.
 *
 * States mirror what the citizen can see: ready → listening → processing →
 * (error) → transcript for confirmation. Nothing is sent until the citizen
 * confirms, because a mis-heard word costs more than an extra tap.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BrowserSpeechSession,
  describeRecognitionError,
  isBrowserSpeechSupported,
  isRecordingSupported,
  queryMicPermission,
  startRecording,
  type RecorderHandle,
} from '../lib/speech'
import { api } from '../lib/api'
import type { LanguageCode } from '../lib/types'

export type VoiceState = 'idle' | 'listening' | 'processing' | 'error'

export type VoiceErrorKind =
  | 'unsupported'
  | 'denied'
  | 'no_speech'
  | 'no_microphone'
  | 'network'
  | 'language_unsupported'
  | 'server_unavailable'
  | 'failed'
  | 'aborted'

export interface SpeechRecognitionResult {
  state: VoiceState
  transcript: string
  interim: string
  errorKind: VoiceErrorKind | null
  browserSupported: boolean
  recorderSupported: boolean
  usingFallbackRecorder: boolean
  start: () => void
  stop: () => void
  cancel: () => void
  clearTranscript: () => void
  setTranscript: (value: string) => void
  clearError: () => void
}

export function useSpeechRecognition(
  language: LanguageCode,
  onFinal?: (text: string) => void,
): SpeechRecognitionResult {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [errorKind, setErrorKind] = useState<VoiceErrorKind | null>(null)
  const [usingFallbackRecorder, setUsingFallbackRecorder] = useState(false)

  const sessionRef = useRef<BrowserSpeechSession | null>(null)
  const recorderRef = useRef<RecorderHandle | null>(null)
  const onFinalRef = useRef(onFinal)
  const languageRef = useRef(language)

  useEffect(() => {
    onFinalRef.current = onFinal
  }, [onFinal])
  useEffect(() => {
    languageRef.current = language
  }, [language])

  const browserSupported = isBrowserSpeechSupported()
  const recorderSupported = isRecordingSupported()

  const handleError = useCallback((kind: VoiceErrorKind) => {
    setErrorKind(kind)
    setState('error')
  }, [])

  // Always release the microphone when the component goes away.
  useEffect(() => {
    return () => {
      sessionRef.current?.abort()
      void recorderRef.current?.stop().catch(() => undefined)
    }
  }, [])

  const startBrowserSession = useCallback(() => {
    const session = new BrowserSpeechSession(languageRef.current === 'hi' ? 'hi-IN' : 'en-IN', {
      onStart: () => {
        setState('listening')
        setInterim('')
        setTranscript('')
        setErrorKind(null)
      },
      onInterim: (text) => setInterim(text),
      onFinal: (text) => {
        setTranscript(text)
        setInterim('')
        setState('processing')
        onFinalRef.current?.(text)
      },
      onError: (_code, message) => {
        const kind = describeRecognitionError(_code) as VoiceErrorKind
        handleError(kind === 'failed' && message ? 'failed' : kind)
      },
      onEnd: () => {
        setState((current) => (current === 'listening' ? 'processing' : current))
        setInterim('')
      },
    })
    sessionRef.current = session
    session.start()
  }, [handleError])

  const startFallbackRecording = useCallback(async () => {
    setUsingFallbackRecorder(true)
    setState('listening')
    setErrorKind(null)
    setTranscript('')
    try {
      recorderRef.current = await startRecording()
    } catch {
      handleError('denied')
      setUsingFallbackRecorder(false)
    }
  }, [handleError])

  const start = useCallback(async () => {
    setErrorKind(null)

    if (!browserSupported && !recorderSupported) {
      handleError('unsupported')
      return
    }

    // A remembered denial is worth reporting before the browser shows a prompt
    // that will not appear: it saves the citizen a confused silence.
    const permission = await queryMicPermission()
    if (permission === 'denied') {
      handleError('denied')
      return
    }

    if (browserSupported) startBrowserSession()
    else await startFallbackRecording()
  }, [browserSupported, recorderSupported, startBrowserSession, startFallbackRecording, handleError])

  const stop = useCallback(async () => {
    if (sessionRef.current) {
      sessionRef.current.stop()
      sessionRef.current = null
      setState((current) => (current === 'listening' ? 'processing' : current))
      return
    }

    if (recorderRef.current) {
      const recorder = recorderRef.current
      recorderRef.current = null
      setState('processing')
      try {
        const blob = await recorder.stop()
        if (blob.size === 0) {
          handleError('no_speech')
          setUsingFallbackRecorder(false)
          return
        }
        const result = await api.voiceTranscribe(blob, languageRef.current)
        if (!result.ok || !result.transcript) {
          handleError(result.error_code === 'transcription_unavailable' ? 'server_unavailable' : 'failed')
          setUsingFallbackRecorder(false)
          return
        }
        setTranscript(result.transcript)
        setState('processing')
        onFinalRef.current?.(result.transcript)
      } catch {
        handleError('failed')
      } finally {
        setUsingFallbackRecorder(false)
      }
    }
  }, [handleError])

  const cancel = useCallback(() => {
    sessionRef.current?.abort()
    sessionRef.current = null
    void recorderRef.current?.stop().catch(() => undefined)
    recorderRef.current = null
    setUsingFallbackRecorder(false)
    setState('idle')
    setInterim('')
    setTranscript('')
    setErrorKind(null)
  }, [])

  const clearTranscript = useCallback(() => {
    setTranscript('')
    setInterim('')
    setState('idle')
  }, [])

  const clearError = useCallback(() => {
    setErrorKind(null)
    setState('idle')
  }, [])

  return {
    state,
    transcript,
    interim,
    errorKind,
    browserSupported,
    recorderSupported,
    usingFallbackRecorder,
    start: () => void start(),
    stop: () => void stop(),
    cancel,
    clearTranscript,
    setTranscript,
    clearError,
  }
}
