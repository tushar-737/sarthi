/** Text-to-speech hook with a single active utterance at a time. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { isSpeechSynthesisSupported, makeSpeakable, speak, stopSpeaking } from '../lib/tts'
import type { LanguageCode } from '../lib/types'

export function useTextToSpeech(language: LanguageCode) {
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const supported = isSpeechSynthesisSupported()
  const languageRef = useRef(language)

  useEffect(() => {
    languageRef.current = language
  }, [language])

  // Never leave audio playing after the user navigates away.
  useEffect(() => {
    return () => stopSpeaking()
  }, [])

  const speakText = useCallback(
    (id: string, text: string) => {
      if (!supported) return
      if (speakingId === id) {
        stopSpeaking()
        setSpeakingId(null)
        return
      }
      const ok = speak(makeSpeakable(text), {
        language: languageRef.current,
        onStart: () => setSpeakingId(id),
        onEnd: () => setSpeakingId((current) => (current === id ? null : current)),
        onError: () => setSpeakingId(null),
      })
      if (!ok) setSpeakingId(null)
    },
    [speakingId, supported],
  )

  const stop = useCallback(() => {
    stopSpeaking()
    setSpeakingId(null)
  }, [])

  return { supported, speakingId, speakText, stop }
}
