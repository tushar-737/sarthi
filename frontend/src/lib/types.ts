/**
 * Types mirroring the backend Pydantic contracts (`backend/app/schemas`).
 *
 * Kept in one file on purpose: when the API shape changes, the compiler points
 * at every place the UI depends on it.
 */

export type LanguageCode = 'hi' | 'en'
export type VerificationLevel =
  | 'verified_official'
  | 'general_guidance'
  | 'confirm_with_authority'

export type IntentType =
  | 'service_query'
  | 'clarify'
  | 'browse'
  | 'greeting'
  | 'gratitude'
  | 'out_of_scope'
  | 'unsupported_language'
  | 'followup'

export interface LinkOut {
  label: string
  url: string
}

export interface HelplineOut {
  label: string
  value: string
}

export interface SourceOut {
  service_id: string
  service_name: string
  authority: string
  url: string
  portal_label: string
  verification_level: VerificationLevel
  verification_label: string
  last_verified: string
  note: string
  extra_links: LinkOut[]
  helpline: HelplineOut | null
  state_portals: LinkOut[]
}

export interface DocumentOut {
  id: string
  name: string
  detail: string
  required: boolean
  required_label: string
}

export interface StepOut {
  index: number
  title: string
  detail: string
  tips: string[]
}

export interface FaqOut {
  question: string
  answer: string
}

export interface ClarifierOptionOut {
  id: string
  label: string
}

export interface ClarifierOut {
  id: string
  question: string
  options: ClarifierOptionOut[]
}

export interface ServiceSummary {
  id: string
  name: string
  tagline: string
  category_id: string
  category_name: string
  category_icon: string
  jurisdiction: string
  official_url: string
  verification_level: VerificationLevel
  verification_label: string
  last_verified: string
  step_count: number
  document_count: number
  confidence: number | null
}

export interface ServiceDetail extends ServiceSummary {
  description: string
  eligibility: string[]
  documents: DocumentOut[]
  steps: StepOut[]
  important_notes: string[]
  official_source: string
  portal_label: string
  extra_links: LinkOut[]
  helpline: HelplineOut | null
  state_portals: LinkOut[]
  verification_note: string
  clarifiers: ClarifierOut[]
  faq: FaqOut[]
  related_services: ServiceSummary[]
  source: SourceOut | null
}

export interface CategoryOut {
  id: string
  name: string
  description: string
  icon: string
  order: number
  service_count: number
  services: ServiceSummary[]
}

export interface LanguageOut {
  code: string
  bcp47: string
  name_en: string
  name_local: string
  speech_locale: string
  tts_voice_hint: string
  status: 'available' | 'planned'
  order: number
  rtl: boolean
}

export interface JourneyStepOut {
  id: string
  index: number
  title: string
  detail: string
  tips: string[]
  checklist: string[]
  action_label: string
  action_url: string
  kind: 'eligibility' | 'documents' | 'portal' | 'apply' | 'track' | 'generic'
}

export interface JourneyOut {
  service_id: string
  service_name: string
  total_steps: number
  steps: JourneyStepOut[]
  intro: string
  portal_label: string
  portal_url: string
  source: SourceOut | null
}

export interface JourneyProgressOut {
  service_id: string
  current_step: number
  total_steps: number
  completed_steps: string[]
  percent_complete: number
  journey: JourneyOut
}

/* --- Chat blocks --------------------------------------------------------- */

export interface TextBlock {
  type: 'text'
  text: string
  tone: 'neutral' | 'positive' | 'warning' | 'error'
}
export interface ServiceCardBlock {
  type: 'service_card'
  service: ServiceSummary
}
export interface ListBlock {
  type: 'eligibility' | 'notes'
  title: string
  items: string[]
  tone: 'neutral' | 'positive' | 'warning' | 'error'
}
export interface DocumentsBlock {
  type: 'documents'
  title: string
  items: DocumentOut[]
}
export interface StepsBlock {
  type: 'steps'
  title: string
  items: StepOut[]
}
export interface SourceBlock {
  type: 'source'
  title: string
  source: SourceOut
}
export interface ClarificationBlock {
  type: 'clarification'
  question: string
  reason: string
  options: ClarifierOptionOut[]
  allow_free_text: boolean
}
export interface JourneyCtaBlock {
  type: 'journey_cta'
  service_id: string
  service_name: string
  total_steps: number
  label: string
}
export interface RelatedBlock {
  type: 'related'
  title: string
  items: ServiceSummary[]
}
export interface PrivacyBlock {
  type: 'privacy'
  text: string
}

export type Block =
  | TextBlock
  | ServiceCardBlock
  | ListBlock
  | DocumentsBlock
  | StepsBlock
  | SourceBlock
  | ClarificationBlock
  | JourneyCtaBlock
  | RelatedBlock
  | PrivacyBlock

export interface EntityOut {
  state: string | null
  study_level: string | null
  purpose: string | null
  age: number | null
  relation: string | null
  pension_type: string | null
}

export interface IntentOut {
  intent_type: IntentType
  service_id: string | null
  service_name: string | null
  category_id: string | null
  category_name: string | null
  confidence: number
  entities: EntityOut
  detected_language: string
  candidates: ServiceSummary[]
  reasoning: string
}

export interface QuickAction {
  id: string
  label: string
  kind: 'prompt' | 'navigate' | 'link'
  value: string
}

export interface SuggestedPrompt {
  id: string
  text: string
}

export interface ReplyOut {
  text: string
  spoken_text: string
  blocks: Block[]
  language: LanguageCode
}

export interface ClarificationOut {
  needed: boolean
  question: string
  options: ClarifierOptionOut[]
  reason: string
}

export interface ChatResponse {
  conversation_id: string
  message_id: string
  reply: ReplyOut
  intent: IntentOut
  service: ServiceDetail | null
  clarification: ClarificationOut
  quick_actions: QuickAction[]
  suggested_prompts: SuggestedPrompt[]
  sources: SourceOut[]
  disclaimer: string
  demo_mode: boolean
  provider: string
  verification_level: VerificationLevel | null
  error: string | null
}

export interface ChatRequest {
  message: string
  language?: LanguageCode | null
  conversation_id?: string | null
  active_service_id?: string | null
  active_category_id?: string | null
  pending_clarifier_id?: string | null
  clarifier_answer?: string | null
  state?: string | null
  input_mode?: 'text' | 'voice' | 'quick_reply'
}

export interface VoiceProcessRequest {
  transcript: string
  language?: LanguageCode | null
  speech_locale?: string | null
  confidence?: number | null
  conversation_id?: string | null
  active_service_id?: string | null
  state?: string | null
  auto_submit?: boolean
}

export interface VoiceTranscriptionOut {
  ok: boolean
  transcript: string
  language: string | null
  provider: string
  error_code: string
  message: string
}

export interface VoiceProcessResponse {
  transcription: VoiceTranscriptionOut | null
  chat: ChatResponse | null
  needs_confirmation: boolean
}

export interface AudioRecognitionSupport {
  browser_stt_available: boolean
  server_stt_available: boolean
  recommended_mode: 'browser' | 'server' | 'text_only'
  supported_locales: string[]
  notice: string
}

export interface MetaConfig {
  app_name: string
  tagline: string
  version: string
  languages: string[]
  default_language: LanguageCode
  disclaimer: string
  prototype_notice: string
  privacy_notice: string
  demo_mode: boolean
  ai_provider: string
  voice: { server_stt_available: boolean; speech_locales: string[] }
  knowledge_base: {
    services: number
    categories: number
    last_updated: string
    database: string
  }
}

export interface HealthOut {
  status: string
  app: string
  version: string
  demo_mode: boolean
  ai_provider: string
  knowledge_base: Record<string, string | number>
  languages: string[]
}

export interface ApiError {
  error: { code: string; message: string; detail?: string }
}

/** Localised copy served by `GET /api/meta/phrases`. */
export interface PhrasesOut {
  disclaimer: string
  prototype_notice: string
  privacy_notice: string
  greeting: string
  stage_understanding: string
  stage_retrieving: string
  stage_composing: string
  suggested_prompts: string[]
  quick_actions: Record<string, string>
  section_headings: Record<string, string>
  errors: Record<string, string>
  demo_mode_banner: string
  [key: string]: unknown
}
