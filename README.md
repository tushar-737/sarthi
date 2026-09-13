# SAARTHI AI 🎙️

> **Your Voice Companion for Digital Public Services**
> Making public services simple, accessible, and inclusive.

SAARTHI AI is a voice-first, multilingual assistant that helps Indian citizens understand and access digital public services. A citizen speaks or types a question in Hindi or English — *"मुझे आय प्रमाण पत्र बनवाना है"* — and SAARTHI identifies the service, explains eligibility, hands over a document checklist, walks through the application step by step, and links to the official government portal.

SAARTHI is **not a chatbot**. It is an **Intelligent Digital Public Service Navigator**: it turns complex government portals into a simple guided journey.

> ⚠️ **Hackathon prototype.** SAARTHI AI is not affiliated with, endorsed by, or operated by the Government of India or any State Government. It provides guidance based on a verified knowledge base — always confirm final requirements with the relevant official authority.

---

## Table of contents

1. [Problem](#the-problem)
2. [Solution](#the-solution)
3. [Demo scenarios](#demo-scenarios)
4. [Features](#features)
5. [Architecture](#architecture)
6. [Tech stack](#tech-stack)
7. [Getting started](#getting-started)
8. [Configuration](#configuration)
9. [API reference](#api-reference)
10. [Verified knowledge base](#the-verified-knowledge-base)
11. [AI safety and reliability](#ai-safety-and-reliability)
12. [Accessibility](#accessibility)
13. [Testing](#testing)
14. [Project structure](#project-structure)
15. [Future scope](#future-scope)

---

## The problem

Government services in India are available online, but reaching them is hard:

- **Language barriers.** Most portals are English-first; many citizens are not.
- **Limited digital literacy.** Forms, logins and dropdowns are confusing for first-time users.
- **Complex portals.** Eligibility rules are buried in legal language across several pages.
- **Unclear requirements.** People do not know which documents to collect before they start.
- **Accessibility gaps.** Small text, poor contrast, and interfaces that assume a mouse and good eyesight.
- **Wrong-service risk.** Citizens apply for the wrong certificate, get rejected, and start over.

The result: people depend on paid agents, or give up on benefits they are entitled to.

## The solution

SAARTHI answers in the citizen's own language, in plain words, and then **walks them through the whole journey**:

```
Question → Understanding → Service Identification → Eligibility
        → Documents → Application Steps → Official Portal → Next Action
```

Three design commitments make it trustworthy:

1. **Grounded, never generated.** Every fact comes from a verified knowledge-base record carrying an official source, a verification level and a last-verified date. SAARTHI never invents a scheme, a fee, a deadline or a URL. When it cannot verify something, it says so.
2. **Asks instead of guessing.** Below a confidence floor — or when the citizen says they are confused — SAARTHI asks one short question with tappable options.
3. **Voice is primary, never mandatory.** Tap-to-speak, live transcript you can edit before sending, and text-to-speech on every answer — with a text input always available.

## Demo scenarios

All three are covered by automated tests (`backend/tests/test_intent.py`, `backend/tests/test_api.py`).

### Scenario 1 — Hindi voice
> 🎙️ **"मुझे आय प्रमाण पत्र बनवाना है।"**

1. Detects Hindi (Devanagari)
2. Identifies **Income Certificate** at 0.95 confidence
3. Shows the service card, eligibility, a 6-item document checklist and 8 application steps
4. Shows the official source with its last-verified date and a *Visit Official Portal* button
5. Offers **Start Guided Journey** — a 10-step navigator with progress tracking
6. Speaks a short summary aloud instead of reading all ten steps

### Scenario 2 — Scholarship, English
> 💬 **"I need financial help for my college education."**

1. Detects English, extracts `study_level=college`, `purpose=scholarship`
2. Identifies **Scholarships — National Scholarship Portal** at 0.93
3. Offers the service's own clarifying questions (*"Which level are you studying at?"*)
4. Explains OTR registration, documents and institute verification
5. Links to `scholarships.gov.in`

### Scenario 3 — Confused citizen
> 💬 **"मुझे समझ नहीं आ रहा कि मुझे कौन सा certificate चाहिए।"**

SAARTHI detects confusion, **does not pick a service**, and replies:

> *"कोई बात नहीं। मैं आपकी मदद करने के लिए ही यहाँ हूँ। आपको प्रमाण पत्र या सेवा किस काम के लिए चाहिए?"*

with tappable options: छात्रवृत्ति या पढ़ाई · नौकरी या काम · बैंक खाता या ऋण · सरकारी नौकरी या परीक्षा · इलाज · घर या आवास · बुज़ुर्ग के लिए पेंशन · कुछ और

### Also worth demoing
- **Hinglish:** `"income certificate kaise banwaye"` → detected as Hindi, correct service.
- **Refusal to invent:** `"what is the weather today"` → *"I could not verify this information…"*
- **Secret safety:** typing an Aadhaar number never echoes it back — it is redacted.
- **Language switch:** changing भाषा in the header re-renders every page instantly.

---

## Features

| # | Feature | What it does |
|---|---|---|
| 1 | 🎙️ Voice-first interaction | Tap-to-speak with ready / listening / processing / speaking states, live mic animation, editable transcript, MediaRecorder fallback upload |
| 2 | 💬 Structured conversation | Typed **blocks**, not markdown: service cards, checklists, step lists, source cards, quick actions |
| 3 | 🌐 Multilingual | Hindi + English live; 11 more languages scaffolded (`bn mr ta te gu kn ml pa or as ur`) with speech locales |
| 4 | 🧠 Intent understanding | Language detection, intent type, category, service, entities, confidence score |
| 5 | 📚 Verified knowledge base | 13 services × 7 categories, each bilingual with source, verification level and last-verified date |
| 6 | 🔍 Retrieval (RAG-ready) | Alias-phrase + weighted-token + IDF + bigram hybrid retriever; answers grounded in retrieved records |
| 7 | 🧭 Service Navigator | Guided journey per service, tick-off progress, forward/back, persisted |
| 8 | 📋 Document checklist | Required vs optional, each with a plain-language explanation |
| 9 | 🔗 Source transparency | Authority name, official URL, verification badge, last-verified date, state portals, helplines |
| 10 | ♿ Accessibility | Text size A−/A/A+, high contrast, reduced motion, keyboard nav, ARIA live regions, screen-reader semantics, TTS |
| 11 | 🛡️ Safety | PII redaction, prompt-injection guard, rate limiting, security headers, friendly errors, no accounts |
| 12 | 🎬 Demo Mode | Fully deterministic offline answers when no AI key is configured — clearly labelled in the UI |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Frontend — React 19 · Vite · TypeScript · Tailwind CSS 4           │
│                                                                     │
│  Landing · Assistant · Services · Service Detail · Navigator · A11y │
│  Voice (Web Speech API + MediaRecorder fallback) · TTS · i18n       │
│  Settings context (language, text size, contrast, motion, TTS)      │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ /api  (Vite proxy → same-origin)
┌───────────────────────────▼─────────────────────────────────────────┐
│  Backend — FastAPI · Pydantic · SQLAlchemy                          │
│                                                                     │
│  api/        routes + deps (rate limit, session)                    │
│  services/   chat orchestration · navigator · serialization         │
│  ai/         AIProvider abstraction                                 │
│              ├─ LocalProvider   deterministic, offline (Demo Mode)  │
│              └─ OpenAIProvider  constrained + auto-degrading        │
│              intent · composer                                      │
│  knowledge/  JSON store · retriever · language · models             │
│  models/     SQLAlchemy ORM      database/ session + seeding        │
│  schemas/    Pydantic contracts  utils/   safety · ratelimit · text │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │ SQLite (→ PostgreSQL ready)│
              │ + verified JSON knowledge  │
              └────────────────────────────┘
```

### Request pipeline

```
query → sanitise → detect language → analyse intent → retrieve candidates
      → ground in verified record → compose blocks + spoken text
      → sources + quick actions + disclaimer → response
```

### The provider abstraction

Everything the product needs from "an AI" sits behind one interface, so no vendor is load-bearing:

```python
class AIProvider(ABC):
    def analyze(query, *, language_hint, context) -> Analysis: ...
    def compose(*, query, analysis, service, related, language) -> ComposedAnswer: ...
    def transcribe(audio, *, language) -> str: ...
```

Adding a provider means adding one subclass and one line in `app/ai/factory.py`.

---

## Tech stack

**Frontend** — React 19, Vite, TypeScript, Tailwind CSS 4, React Router 7, Lucide icons, Framer Motion (subtle, respects reduced-motion).

**Backend** — Python 3.11, FastAPI, Pydantic v2, SQLAlchemy 2, httpx, pytest.

**Database** — SQLite for development; `DATABASE_URL` accepts a PostgreSQL DSN unchanged.

**Voice** — Web Speech API for on-device transcription (no audio leaves the phone), MediaRecorder + server transcription as fallback.

---

## Getting started

### Prerequisites
- Python 3.11+
- Node.js 20+

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # optional — everything has sane defaults

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

API docs: http://localhost:8000/api/docs · Health: http://localhost:8000/api/health

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — Vite proxies `/api` to the backend, so the browser only ever talks to one origin.

### 3. Run the tests

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npm run typecheck
```

---

## Configuration

All settings are optional. Copy `backend/.env.example` to `backend/.env`.

| Variable | Default | Purpose |
|---|---|---|
| `AI_PROVIDER` | `auto` | `auto` · `local` (Demo Mode) · `openai` |
| `OPENAI_API_KEY` | *(empty)* | Leave empty to run fully offline in Demo Mode. Never sent to the browser. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model used when a key is present |
| `AI_TIMEOUT_SECONDS` | `12` | LLM timeout before falling back to Demo Mode |
| `RETRIEVAL_MIN_CONFIDENCE` | `0.42` | Below this, SAARTHI asks instead of guessing |
| `DATABASE_URL` | SQLite file | Swap in PostgreSQL for production |
| `CORS_ORIGINS` | localhost:5173 | Comma-separated allowed origins |
| `RATE_LIMIT_REQUESTS` / `_WINDOW_SECONDS` | `20` / `60` | Sliding-window limit per client IP |
| `MAX_QUERY_LENGTH` | `600` | Longer input gets a friendly "too long" reply |
| `LOG_CONVERSATIONS` | `true` | Set `false` to store no query text at all |
| `REDACT_PII_IN_LOGS` | `true` | Redacts Aadhaar/PAN/card/IFSC before logging |
| `DEFAULT_LANGUAGE` | `hi` | Fallback language |

**Demo Mode** is on whenever no AI key is configured. It is deterministic, offline and clearly labelled in the UI, so the demo works even if an external API is down.

---

## API reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/chat` | Process a citizen query → structured, grounded reply |
| `POST` | `/api/voice/process` | Understand a browser transcript; optionally answer immediately |
| `POST` | `/api/voice/transcribe` | Transcribe an uploaded audio blob (needs an AI provider) |
| `GET` | `/api/voice/support` | Which voice path the client should offer |
| `GET` | `/api/services` | List verified services (`?language=`, `?category_id=`) |
| `GET` | `/api/services/{id}` | Full guidance: eligibility, documents, steps, source |
| `POST` | `/api/service/search` | Search services with confidence scores |
| `GET` | `/api/services/{id}/journey` | The guided journey |
| `POST` | `/api/services/{id}/journey/progress` | Save navigator progress |
| `GET` | `/api/categories` | Service categories with counts |
| `GET` | `/api/languages` | Supported + planned languages |
| `GET` | `/api/meta/config` | App copy, disclaimer, capabilities |
| `GET` | `/api/meta/phrases` | All localised assistant copy |
| `GET` | `/api/health` | Health, provider and knowledge-base stats |

### Chat response shape

Rather than a blob of markdown, `/api/chat` returns **typed blocks** the UI renders as real components:

```jsonc
{
  "reply": {
    "text": "…",              // readable fallback
    "spoken_text": "…",       // short, TTS-optimised
    "blocks": [
      { "type": "text", "text": "…", "tone": "positive" },
      { "type": "service_card", "service": { … } },
      { "type": "eligibility", "items": ["…"] },
      { "type": "documents", "items": [{ "name": "…", "required": true }] },
      { "type": "steps", "items": [{ "index": 1, "title": "…", "tips": [] }] },
      { "type": "notes", "items": ["…"], "tone": "warning" },
      { "type": "source", "source": { "url": "…", "last_verified": "2026-09-13" } },
      { "type": "journey_cta", "service_id": "income_certificate", "total_steps": 10 }
    ],
    "language": "hi"
  },
  "intent": { "intent_type": "service_query", "service_id": "income_certificate",
              "confidence": 0.9514, "entities": { "state": "up", "age": null } },
  "clarification": { "needed": false, "question": "", "options": [] },
  "quick_actions": [ { "id": "documents", "kind": "prompt", "label": "…" } ],
  "sources": [ { "authority": "…", "url": "https://…", "verification_level": "…",
                 "last_verified": "2026-09-13" } ],
  "disclaimer": "…",
  "demo_mode": true
}
```

---

## The verified knowledge base

`backend/app/knowledge/data/services/*.json` — one file per service, validated at startup, so a malformed record fails loudly rather than producing wrong guidance.

**13 services across 7 categories:**

| Category | Services |
|---|---|
| 📄 Certificates | Income Certificate · Caste Certificate (SC/ST/OBC) · Domicile / Residence Certificate |
| 🪪 Identity | Aadhaar enrolment & update · PAN card · Voter ID (EPIC) |
| 🎓 Education | Scholarships — National Scholarship Portal |
| 💼 Employment | Job search & registration (NCS) · MGNREGA job card · Driving licence |
| 🏥 Health | Ayushman Bharat PM-JAY card |
| 👴 Social welfare | Old age & social pension (NSAP) |
| 🏠 Housing | PM Awas Yojana (Urban) |

Every record carries:

```jsonc
{
  "id": "income_certificate",
  "category_id": "certificates",
  "jurisdiction": "state",
  "names":     { "en": "Income Certificate", "hi": "आय प्रमाण पत्र" },
  "aliases":   { "en": ["income proof", …], "hi": ["आमदनी का प्रमाण पत्र", …] },
  "eligibility": [ { "en": "…", "hi": "…" } ],
  "documents":   [ { "id": "identity_proof", "name": {…}, "required": true } ],
  "steps":       [ { "title": {…}, "detail": {…}, "tips": [{…}] } ],
  "important_notes": [ {…} ],
  "official_source": { "en": "Revenue Department of your State Government", "hi": "…" },
  "official_url": "https://www.india.gov.in/",
  "state_portals": [ { "state_id": "up", "portal_url": "https://edistrict.up.gov.in/" } ],
  "clarifiers": [ { "id": "state", "question": {…}, "options": […] } ],
  "faq": [ { "q": {…}, "a": {…} } ],
  "verification": {
    "level": "general_guidance",     // or verified_official / confirm_with_authority
    "last_verified": "2026-09-13",
    "note": { "en": "Rules, fees and timelines vary by state — confirm on your state portal.", "hi": "…" }
  }
}
```

### Verification levels are shown to the citizen, not hidden

- 🟢 **`verified_official`** — a national service with a single authoritative portal (Aadhaar, PAN, NSP, PM-JAY, NCS, MGNREGA, Voter ID).
- 🟡 **`general_guidance`** — the process is standard but rules, fees and timelines vary by state (Income / Caste / Domicile certificates, pensions, PMAY, driving licence). The record tells the citizen to confirm with their own authority, and lists verified state portals.

Tests enforce this: `test_government_urls_use_government_domains` fails the build if any URL points at a non-government domain that is not an explicitly documented, government-authorised provider.

### Adding a service

Drop a new JSON file in `data/services/`, restart (or `POST /api/meta/reload`). The retriever re-indexes, the database mirror re-syncs, and the service becomes reachable by name, alias and category — no code changes.

---

## AI safety and reliability

| Risk | Mitigation |
|---|---|
| Inventing schemes, fees, deadlines or URLs | Facts only ever come from knowledge-base records. The LLM writes a short lead-in sentence; **all** structured blocks are built locally from verified data. |
| Hallucinated service ids | The model may only choose among retrieved candidates; unknown ids are logged and rejected. |
| Over-confidence | Model confidence is clamped to never exceed the retrieval evidence. |
| Guessing when unsure | Below `RETRIEVAL_MIN_CONFIDENCE`, or when the citizen says they are confused, SAARTHI asks one short question with tappable options. |
| Collecting secrets | SAARTHI never asks for Aadhaar, passwords, OTPs, bank PINs or card numbers. Any such input is redacted before logging or reaching a provider. |
| Prompt injection | Steering attempts are detected; a jailbreak cannot produce a fabricated service. |
| Leaking internals | Custom exception handlers return one plain sentence — never a stack trace. |
| Vendor failure | `OpenAIProvider` degrades to `LocalProvider` after 3 consecutive failures and sets `demo_mode`, so the citizen still gets correct guidance. |
| Abuse | Sliding-window rate limiting per client IP, input length caps, audio size and content-type validation. |

Visible disclaimer on every answer:

> *"SAARTHI AI provides guidance based on available verified information. Please confirm final requirements through the relevant official authority or portal."*

### Privacy

No accounts, no authentication, no cookies, no device fingerprinting. Conversation logs store only structural facts (language, intent type, service id, confidence, latency) plus a **redacted, truncated** query — and can be switched off entirely with `LOG_CONVERSATIONS=false`. The backend is stateless per request: the frontend passes `conversation_id` and `active_service_id` back in, so SAARTHI never holds a citizen's conversation server-side.

---

## Accessibility

Accessibility is a first-class requirement, not an afterthought — the people who need this product most are the ones most often excluded by it.

- **Adjustable text size** — A− / A / A+ driven by a root CSS custom property, so the whole layout scales.
- **High-contrast mode** — a dedicated token set, not a filter hack.
- **Reduced motion** — honours both the user setting and `prefers-reduced-motion`; animations degrade to fades.
- **Keyboard navigation** — every control reachable and focusable, with a visible focus ring and a skip link.
- **Screen readers** — semantic landmarks, `aria-live` regions for transcript and reply updates, labelled controls, no information conveyed by colour alone (icons and text accompany every status).
- **Large touch targets** — the mic button and primary actions are comfortably above 44×44 CSS pixels.
- **Voice in, voice out** — speak a question, and hear any answer read aloud.
- **Mobile-first** — no horizontal scrolling, single-column flows, bottom-anchored controls on phones.

---

## Testing

```bash
cd backend && .venv/bin/python -m pytest -q
# 134 passed
```

| Suite | Covers |
|---|---|
| `test_intent.py` (47) | The three demo scenarios, language detection, Hinglish, unsupported scripts, entity extraction, follow-ups, and a guard proving **every** service is reachable by its own name |
| `test_knowledge.py` (14) | Knowledge-base integrity: official URLs are real government domains, every record is bilingual, verification metadata present, state services disclose variation |
| `test_safety.py` (14) | PII redaction, injection detection, refusal to invent, secrets never echoed |
| `test_api.py` (59) | All endpoints end to end, friendly errors, voice degradation, navigator progress, and a check that all 13 services render completely in both languages |

Frontend type-checks with `npm run typecheck`.

---

## Project structure

```
sarthi/
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI app, middleware, error handlers
│   │   ├── config.py             # Settings (env-driven)
│   │   ├── api/                  # Routes + dependencies
│   │   │   └── routes/           # chat, voice, services, categories, languages, meta
│   │   ├── services/             # chat_service, navigator_service, serialization
│   │   ├── ai/                   # base (AIProvider), local_provider, openai_provider,
│   │   │   │                     #   factory, intent, composer
│   │   ├── knowledge/            # store, retriever, language, models
│   │   │   └── data/             # categories, languages, phrases, services/*.json
│   │   ├── models/               # SQLAlchemy ORM
│   │   ├── schemas/              # Pydantic contracts
│   │   ├── database/             # session + seeding
│   │   └── utils/                # text, safety, ratelimit, logging
│   ├── tests/                    # 134 tests
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── pages/                # Landing, Assistant, Services, ServiceDetail,
    │   │   │                     #   Navigator, Settings, NotFound
    │   ├── components/           # voice, chat, blocks, navigator, a11y, layout
    │   ├── context/              # SettingsProvider, ChatProvider
    │   ├── lib/                  # api client, speech, tts, i18n, storage
    │   ├── hooks/
    │   └── styles/
    ├── index.html
    ├── vite.config.ts
    └── package.json
```

---

## Future scope

- **More languages.** Eleven are already scaffolded with speech locales; adding one means a phrases file plus translated records — no architecture change.
- **Vector retrieval.** The hybrid retriever is deliberately dependency-free for the MVP; its `Retriever` interface can be swapped for embeddings + vector search without touching callers.
- **PostgreSQL.** Change `DATABASE_URL`; the ORM already avoids SQLite-specific SQL.
- **State-specific records.** `state_portals` is the seed of a state-branching knowledge base with per-state fees and timelines.
- **Application-status tracking.** Deep links into each portal's status page.
- **Offline / low-bandwidth mode.** Service-worker caching of the knowledge base for rural connectivity.
- **Assisted mode.** A volunteer or CSC operator driving the journey on someone's behalf.
- **Analytics for gaps.** Aggregate, anonymised "could not verify" queries reveal which services citizens ask for but SAARTHI does not yet cover.

---

## Licence

Prototype built for demonstration. Government service information is sourced from official public portals; each record cites its authority and last-verified date.
