/**
 * Text-to-speech.
 *
 * Voice out matters as much as voice in: an elderly citizen or a screen-reader
 * user should be able to hear an answer without reading it. SAARTHI speaks the
 * short `spoken_text` the backend prepares, never the full ten-step list.
 */

import type { LanguageCode } from './types'
import { SPEECH_LOCALES } from './speech'

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** Slightly slower than default: clarity beats speed for first-time users. */
const RATE = 0.92

let cachedVoices: SpeechSynthesisVoice[] = []
let voicesLoaded = false

function loadVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisSupported()) return []
  if (voicesLoaded && cachedVoices.length) return cachedVoices
  cachedVoices = window.speechSynthesis.getVoices()
  if (cachedVoices.length) voicesLoaded = true
  return cachedVoices
}

if (isSpeechSynthesisSupported()) {
  loadVoices()
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices()
    voicesLoaded = true
  }
}

/** Prefer a voice whose locale matches, then any voice for that language. */
export function pickVoice(language: LanguageCode): SpeechSynthesisVoice | null {
  const voices = loadVoices()
  if (!voices.length) return null
  const target = SPEECH_LOCALES[language]
  const base = language

  const exact = voices.find((voice) => voice.lang?.toLowerCase() === target.toLowerCase())
  if (exact) return exact

  const sameLanguage = voices.find((voice) => voice.lang?.toLowerCase().startsWith(base))
  if (sameLanguage) return sameLanguage

  // Hindi has no installed voice on many systems; Devanagari text still needs
  // *something* rather than silence, so fall back to the default voice.
  return voices[0] ?? null
}

export function hasVoiceFor(language: LanguageCode): boolean {
  const voices = loadVoices()
  const base = language
  return voices.some((voice) => voice.lang?.toLowerCase().startsWith(base))
}

export interface SpeakOptions {
  language: LanguageCode
  onStart?: () => void
  onEnd?: () => void
  onError?: (message: string) => void
}

/** Speak `text`. Cancels anything already in progress. */
export function speak(text: string, options: SpeakOptions): boolean {
  if (!isSpeechSynthesisSupported()) {
    options.onError?.('speech_unsupported')
    return false
  }
  const clean = text?.trim()
  if (!clean) {
    options.onError?.('empty')
    return false
  }

  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(clean)
  utterance.lang = SPEECH_LOCALES[options.language] ?? options.language
  utterance.rate = RATE
  utterance.pitch = 1
  utterance.volume = 1

  const voice = pickVoice(options.language)
  if (voice) utterance.voice = voice

  utterance.onstart = () => options.onStart?.()
  utterance.onend = () => options.onEnd?.()
  utterance.onerror = (event) => {
    // 'interrupted' and 'canceled' happen when the user stops or starts again.
    if (event.error === 'interrupted' || event.error === 'canceled') {
      options.onEnd?.()
      return
    }
    options.onError?.(event.error || 'speech_failed')
    options.onEnd?.()
  }

  window.speechSynthesis.speak(utterance)
  return true
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel()
}

export function isSpeaking(): boolean {
  return isSpeechSynthesisSupported() && window.speechSynthesis.speaking
}

/**
 * URLs read aloud are noise. Strip them so "visit uidai.gov.in" becomes
 * "visit the official portal" rather than a string of letters.
 */
export function makeSpeakable(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[•●▪]/g, ',')
    .trim()
}
