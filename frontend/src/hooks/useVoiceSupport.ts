/**
 * Voice capability probe.
 *
 * Two independent things decide whether speaking can work:
 *   1. the browser's own speech recognition (Chrome, Edge, Safari), and
 *   2. a server-side transcription engine, used with a MediaRecorder fallback.
 *
 * If neither exists, the microphone is not shown at all — offering a button
 * that can only fail is worse than not offering it. The backend answer is
 * cached for the session, so this costs one request.
 */

import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { isBrowserSpeechSupported, isRecordingSupported } from '../lib/speech'
import type { AudioRecognitionSupport } from '../lib/types'

export interface VoiceSupport {
  /** Voice input can work by at least one route. */
  available: boolean
  browser: boolean
  recorder: boolean
  serverTranscription: boolean
  /** Best route for this device: browser recognition, upload, or typing. */
  mode: 'browser' | 'server' | 'text_only'
  notice: string
  checked: boolean
}

let cached: VoiceSupport | null = null
let inflight: Promise<VoiceSupport> | null = null

function localSupport(): VoiceSupport {
  const browser = isBrowserSpeechSupported()
  const recorder = isRecordingSupported()
  return {
    // Before the backend answers, only browser recognition is certain to work:
    // uploading a recording needs a transcription engine behind it.
    available: browser,
    browser,
    recorder,
    serverTranscription: false,
    mode: browser ? 'browser' : recorder ? 'server' : 'text_only',
    notice: '',
    checked: false,
  }
}

async function probe(): Promise<VoiceSupport> {
  if (cached) return cached
  if (!inflight) {
    inflight = api
      .voiceSupport()
      .then((support: AudioRecognitionSupport) => {
        const browser = isBrowserSpeechSupported()
        const recorder = isRecordingSupported()
        const result: VoiceSupport = {
          available:
            support.recommended_mode !== 'text_only' && (browser || (recorder && support.server_stt_available)),
          browser,
          recorder,
          serverTranscription: support.server_stt_available,
          mode: support.recommended_mode,
          notice: support.notice,
          checked: true,
        }
        cached = result
        return result
      })
      .catch(() => {
        // Offline or backend down: fall back to what the browser can do locally.
        const fallback = localSupport()
        cached = fallback
        return fallback
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export function useVoiceSupport(): VoiceSupport {
  const [support, setSupport] = useState<VoiceSupport>(cached ?? localSupport())

  useEffect(() => {
    let active = true
    void probe().then((result) => {
      if (active) setSupport(result)
    })
    return () => {
      active = false
    }
  }, [])

  return support
}
