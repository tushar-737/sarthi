/**
 * States SAARTHI can personalise for.
 *
 * Codes and names mirror `backend/app/knowledge/language.py:STATES`, so the
 * value sent with a chat request is the one the backend's entity extraction
 * understands. This is the *only* personalisation SAARTHI stores — no
 * identifier, no document number, no credentials.
 */

import type { LanguageCode } from './types'

export interface StateOption {
  code: string
  en: string
  hi: string
}

export const STATES: StateOption[] = [
  { code: 'up', en: 'Uttar Pradesh', hi: 'उत्तर प्रदेश' },
  { code: 'dl', en: 'Delhi', hi: 'दिल्ली' },
  { code: 'br', en: 'Bihar', hi: 'बिहार' },
  { code: 'mp', en: 'Madhya Pradesh', hi: 'मध्य प्रदेश' },
  { code: 'mh', en: 'Maharashtra', hi: 'महाराष्ट्र' },
  { code: 'wb', en: 'West Bengal', hi: 'पश्चिम बंगाल' },
  { code: 'tn', en: 'Tamil Nadu', hi: 'तमिलनाडु' },
  { code: 'rj', en: 'Rajasthan', hi: 'राजस्थान' },
  { code: 'gj', en: 'Gujarat', hi: 'गुजरात' },
  { code: 'kt', en: 'Karnataka', hi: 'कर्नाटक' },
  { code: 'kl', en: 'Kerala', hi: 'केरल' },
  { code: 'ap', en: 'Andhra Pradesh', hi: 'आंध्र प्रदेश' },
  { code: 'tg', en: 'Telangana', hi: 'तेलंगाना' },
  { code: 'pb', en: 'Punjab', hi: 'पंजाब' },
  { code: 'hr', en: 'Haryana', hi: 'हरियाणा' },
  { code: 'jh', en: 'Jharkhand', hi: 'झारखंड' },
  { code: 'cg', en: 'Chhattisgarh', hi: 'छत्तीसगढ़' },
  { code: 'as', en: 'Assam', hi: 'असम' },
  { code: 'od', en: 'Odisha', hi: 'ओडिशा' },
  { code: 'uk', en: 'Uttarakhand', hi: 'उत्तराखंड' },
  { code: 'hp', en: 'Himachal Pradesh', hi: 'हिमाचल प्रदेश' },
  { code: 'goa', en: 'Goa', hi: 'गोवा' },
]

export function stateLabel(code: string | null, language: LanguageCode): string | null {
  if (!code) return null
  const found = STATES.find((state) => state.code === code)
  if (!found) return code
  return language === 'hi' ? found.hi : found.en
}
