/**
 * Speech recognition.
 *
 * Primary path: the browser's Web Speech API. Recognition runs on the device,
 * so the citizen's voice never has to be uploaded.
 *
 * Fallback path: MediaRecorder. When the browser has no speech recognition
 * (Firefox, most in-app browsers) SAARTHI records audio and posts it to
 * `/api/voice/transcribe`. If no server-side engine is configured either, the
 * hook reports `unsupported` and the UI keeps the text input prominent —
 * voice is never the only way to use SAARTHI.
 */

import type { LanguageCode } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
type SpeechRecognitionCtor = new () => any
let SpeechRecognitionImpl: SpeechRecognitionCtor | undefined

if (typeof window !== 'undefined') {
  SpeechRecognitionImpl =
    (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
}

export const SPEECH_LOCALES: Record<LanguageCode, string> = {
  hi: 'hi-IN',
  en: 'en-IN',
}

export type MicPermission = 'unknown' | 'granted' | 'denied' | 'prompt'

export function isBrowserSpeechSupported(): boolean {
  return Boolean(SpeechRecognitionImpl)
}

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'
  )
}

export async function queryMicPermission(): Promise<MicPermission> {
  try {
    if (!navigator.permissions?.query) return 'unknown'
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    return status.state as MicPermission
  } catch {
    return 'unknown'
  }
}

export interface RecognitionCallbacks {
  onInterim?: (text: string) => void
  onFinal: (text: string, confidence: number | null) => void
  onError: (code: string, message: string) => void
  onEnd?: () => void
  onStart?: () => void
  onSoundLevel?: (level: number) => void
}

/**
 * Wraps the Web Speech API with SAARTHI's error vocabulary so the UI can show
 * one plain sentence per failure mode.
 */
export class BrowserSpeechSession {
  private recognition: any = null
  private stopped = false

  constructor(
    private readonly locale: string,
    private readonly callbacks: RecognitionCallbacks,
  ) {}

  start(): void {
    if (!SpeechRecognitionImpl) {
      this.callbacks.onError('unsupported', 'This browser does not support voice input.')
      return
    }
    const recognition = new SpeechRecognitionImpl()
    recognition.lang = this.locale
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      this.stopped = false
      this.callbacks.onStart?.()
    }

    recognition.onresult = (event: any) => {
      let interim = ''
      let finalText = ''
      let confidence: number | null = null
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const transcript: string = result[0]?.transcript ?? ''
        if (result.isFinal) {
          finalText += transcript
          confidence = typeof result[0]?.confidence === 'number' ? result[0].confidence : null
        } else {
          interim += transcript
        }
      }
      if (interim) this.callbacks.onInterim?.(interim.trim())
      if (finalText.trim()) this.callbacks.onFinal(finalText.trim(), confidence)
    }

    recognition.onerror = (event: any) => {
      const code = String(event?.error ?? 'unknown')
      this.callbacks.onError(code, describeRecognitionError(code))
    }

    recognition.onend = () => {
      if (!this.stopped) this.callbacks.onEnd?.()
    }

    this.recognition = recognition
    try {
      recognition.start()
    } catch {
      // start() throws if a session is already running; treat as a soft error.
      this.callbacks.onError('busy', 'Microphone is busy. Please try again.')
    }
  }

  stop(): void {
    this.stopped = true
    try {
      this.recognition?.stop()
    } catch {
      /* ignore */
    }
  }

  abort(): void {
    this.stopped = true
    try {
      this.recognition?.abort()
    } catch {
      /* ignore */
    }
  }
}

export function describeRecognitionError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'denied'
    case 'no-speech':
      return 'no_speech'
    case 'audio-capture':
      return 'no_microphone'
    case 'network':
      return 'network'
    case 'aborted':
      return 'aborted'
    case 'language-not-supported':
      return 'language_unsupported'
    default:
      return 'failed'
  }
}

/* --- MediaRecorder fallback --------------------------------------------- */

export interface RecorderHandle {
  stop: () => Promise<Blob>
}

export async function startRecording(): Promise<RecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      channelCount: 1,
    },
  })

  const mimeType = pickMimeType()
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
      stream.getTracks().forEach((track) => track.stop())
      resolve(blob)
    }
  })

  recorder.start(250)

  return {
    stop: async () => {
      if (recorder.state !== 'inactive') recorder.stop()
      return stopped
    },
  }
}

function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(candidate)) {
      return candidate
    }
  }
  return ''
}
