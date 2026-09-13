/**
 * API client.
 *
 * Every call goes to a relative `/api/...` path so the browser only ever talks
 * to one origin — the Vite dev server proxies to FastAPI. No API keys, no
 * backend hostnames, nothing environment-specific is baked into the client.
 */

import type {
  AudioRecognitionSupport,
  CategoryOut,
  ChatRequest,
  ChatResponse,
  HealthOut,
  JourneyOut,
  JourneyProgressOut,
  LanguageCode,
  LanguageOut,
  MetaConfig,
  PhrasesOut,
  ServiceDetail,
  ServiceSummary,
  VoiceProcessRequest,
  VoiceProcessResponse,
  VoiceTranscriptionOut,
} from './types'

export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    // Network failure — surfaced as an offline error the UI can phrase kindly.
    throw new ApiError('offline', 'Could not reach SAARTHI. Check your connection.', 0)
  }

  if (!response.ok) {
    let message = 'Something went wrong. Please try again.'
    let code = 'http_error'
    try {
      const body = await response.json()
      const error = body?.error ?? body?.detail
      if (error?.message) message = error.message
      if (error?.code) code = error.code
    } catch {
      /* keep the generic message */
    }
    throw new ApiError(code, message, response.status)
  }

  return (await response.json()) as T
}

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value))
    }
  }
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

export const api = {
  health: () => request<HealthOut>('/health'),

  metaConfig: (language: LanguageCode) =>
    request<MetaConfig>(`/meta/config${qs({ language })}`),

  /**
   * The backend's own localised copy — suggested questions, section headings,
   * error sentences. Using it keeps the UI and the assistant in one voice.
   */
  phrases: (language: LanguageCode) =>
    request<PhrasesOut>(`/meta/phrases${qs({ language })}`),

  languages: () => request<LanguageOut[]>('/languages'),

  categories: (language: LanguageCode) =>
    request<CategoryOut[]>(`/categories${qs({ language })}`),

  services: (language: LanguageCode, categoryId?: string) =>
    request<{ total: number; language: string; services: ServiceSummary[] }>(
      `/services${qs({ language, category_id: categoryId })}`,
    ),

  service: (serviceId: string, language: LanguageCode) =>
    request<ServiceDetail>(`/services/${encodeURIComponent(serviceId)}${qs({ language })}`),

  journey: (serviceId: string, language: LanguageCode) =>
    request<JourneyOut>(
      `/services/${encodeURIComponent(serviceId)}/journey${qs({ language })}`,
    ),

  saveJourneyProgress: (
    serviceId: string,
    payload: { completed_steps: string[]; current_step: number; language: LanguageCode },
  ) =>
    request<JourneyProgressOut>(
      `/services/${encodeURIComponent(serviceId)}/journey/progress`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: serviceId, ...payload }),
      },
    ),

  search: (query: string, language: LanguageCode, limit = 6) =>
    request<{
      query: string
      language: string
      detected_language: string
      matches: { service: ServiceSummary; confidence: number; matched_terms: string[] }[]
      categories: CategoryOut[]
    }>('/service/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, language, limit }),
    }),

  chat: (payload: ChatRequest) =>
    request<ChatResponse>('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  voiceProcess: (payload: VoiceProcessRequest) =>
    request<VoiceProcessResponse>('/voice/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  voiceTranscribe: (audio: Blob, language?: LanguageCode) => {
    const form = new FormData()
    form.append('file', audio, 'recording.webm')
    if (language) form.append('language', language)
    return request<VoiceTranscriptionOut>('/voice/transcribe', {
      method: 'POST',
      body: form,
    })
  },

  voiceSupport: () => request<AudioRecognitionSupport>('/voice/support'),
}
