"""OpenAI-backed provider.

Safety architecture — this is the important part:

* **Facts come from the knowledge base, never from the model.** Every
  structured block (eligibility, documents, steps, official URLs, verification
  dates) is built by the local composer from `ServiceRecord`s. The LLM is only
  allowed to write the short conversational lead-in.
* **Retrieval is not delegated.** Candidates always come from the deterministic
  retriever, so the model cannot "recall" a scheme that does not exist.
* **Every failure degrades gracefully.** A timeout, a 429, a bad key or a
  malformed JSON reply all fall back to `LocalProvider` and set `demo_mode`,
  so the citizen still gets correct guidance.
* **Audio is optional.** Transcription is only offered when a key is present.

Nothing here is reachable without `OPENAI_API_KEY` being set in the backend
environment. No key is ever sent to the frontend.
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from app.ai.base import AIProvider, Analysis, ComposedAnswer
from app.ai.composer import describe_entities
from app.ai.local_provider import LocalProvider
from app.config import settings
from app.knowledge.base import KnowledgeStore
from app.knowledge.models import ServiceRecord
from app.utils.logging import get_logger
from app.utils.safety import redact_pii

logger = get_logger("ai.openai")

SYSTEM_PROMPT = """You are SAARTHI, a voice-first assistant that helps Indian citizens
understand and access digital public services.

ABSOLUTE RULES
1. You may ONLY use the VERIFIED KNOWLEDGE supplied in the user message. Never add
   schemes, eligibility rules, fees, deadlines, document names or URLs from memory.
2. If the supplied knowledge does not answer the question, say you cannot verify it
   and direct the citizen to the official source. Never guess.
3. Write in the citizen's language. Short sentences. Simple words. No jargon.
4. Never ask for Aadhaar numbers, passwords, OTPs, bank details or card numbers.
5. Never promise an outcome. Never give legal or financial advice.
6. Do not claim to be a government body. You are a guidance prototype.

You are writing only the short conversational lead-in. Structured details
(checklists, steps, links) are rendered separately from the verified data, so do
not repeat them as lists."""

ANALYZE_PROMPT = """Given the citizen's message and the candidate services retrieved from the
verified knowledge base, decide the single best interpretation.

Reply with STRICT JSON only, no prose:
{
  "intent_type": "service_query" | "clarify" | "browse" | "greeting" | "gratitude"
                 | "out_of_scope" | "followup",
  "service_id": "<one of the candidate ids, or null>",
  "category_id": "<one of the category ids, or null>",
  "confidence": <number 0..1>,
  "needs_clarification": <true|false>,
  "reasoning": "<max 12 words>"
}

Rules: choose "clarify" with needs_clarification=true whenever the message is
ambiguous or confidence is below 0.6. Prefer service_id=null over a wrong guess."""


class OpenAIProvider(AIProvider):
    name = "openai"
    demo_mode = False

    def __init__(self, store: KnowledgeStore, fallback: LocalProvider | None = None) -> None:
        self.store = store
        self.fallback = fallback or LocalProvider(store)
        self._client = httpx.Client(
            base_url=settings.openai_base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {settings.openai_api_key or ''}"},
            timeout=settings.ai_timeout_seconds,
        )
        self._consecutive_failures = 0
        self._degraded = False

    # --- transport -------------------------------------------------------
    def _chat(self, messages: list[dict[str, str]], *, json_mode: bool = False) -> str | None:
        if self._degraded:
            return None
        payload: dict[str, Any] = {
            "model": settings.openai_model,
            "messages": messages,
            "temperature": settings.ai_temperature,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        try:
            response = self._client.post("/chat/completions", json=payload)
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            self._consecutive_failures = 0
            return content
        except Exception as exc:
            self._consecutive_failures += 1
            if self._consecutive_failures >= 3:
                self._degraded = True
                logger.warning("openai degraded to demo mode after repeated failures")
            logger.warning("openai call failed: %s", type(exc).__name__)
            return None

    # --- understanding ---------------------------------------------------
    def analyze(
        self,
        query: str,
        *,
        language_hint: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> Analysis:
        # The deterministic analysis is always computed first: it is the floor.
        baseline = self.fallback.analyze(query, language_hint=language_hint, context=context)
        if baseline.intent_type in {"unsupported_language", "greeting", "gratitude"}:
            return baseline

        candidates = [
            {"id": c.service_id, "confidence": round(c.confidence, 3), "terms": c.matched_terms[:4]}
            for c in baseline.candidates
        ]
        user = json.dumps(
            {
                "message": redact_pii(query)[:400],
                "language_hint": language_hint,
                "detected_language": baseline.language,
                "active_service_id": (context or {}).get("active_service_id"),
                "candidate_services": candidates,
                "categories": sorted(self.store.categories),
                "baseline_intent": baseline.intent_type,
                "baseline_service_id": baseline.service_id,
                "baseline_confidence": baseline.confidence,
                "entities": baseline.entities.as_dict(),
            },
            ensure_ascii=False,
        )
        raw = self._chat(
            [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": ANALYZE_PROMPT + "\n\n" + user}],
            json_mode=True,
        )
        if not raw:
            return baseline

        try:
            parsed = json.loads(raw)
        except (ValueError, TypeError):
            logger.info("openai returned non-JSON analysis; keeping baseline")
            return baseline

        refined = self._merge(baseline, parsed)
        return refined

    def _merge(self, baseline: Analysis, parsed: dict[str, Any]) -> Analysis:
        """Apply the model's opinion only where it cannot invent facts.

        The model may *lower* confidence, ask for clarification, or pick among
        candidates the retriever already surfaced. It may not introduce a
        service id that was not retrieved.
        """
        allowed_ids = {c.service_id for c in baseline.candidates}
        allowed_ids |= {s.id for s in self.store.all_services()}

        service_id = parsed.get("service_id")
        if service_id and service_id not in allowed_ids:
            logger.info("rejected hallucinated service_id from model")
            service_id = baseline.service_id

        confidence = parsed.get("confidence")
        try:
            confidence = float(confidence) if confidence is not None else baseline.confidence
        except (TypeError, ValueError):
            confidence = baseline.confidence
        # Never let the model claim more certainty than the retrieval evidence.
        confidence = min(max(confidence, 0.0), max(baseline.confidence, 0.0))

        intent_type = parsed.get("intent_type") or baseline.intent_type
        valid_intents = {
            "service_query", "clarify", "browse", "greeting", "gratitude",
            "out_of_scope", "unsupported_language", "followup",
        }
        if intent_type not in valid_intents:
            intent_type = baseline.intent_type

        needs_clarification = bool(parsed.get("needs_clarification")) or baseline.needs_clarification
        if needs_clarification and intent_type not in {"clarify", "out_of_scope"}:
            intent_type = "clarify"

        return Analysis(
            intent_type=intent_type,  # type: ignore[arg-type]
            language=baseline.language,
            confidence=round(confidence, 4),
            service_id=service_id or baseline.service_id,
            category_id=parsed.get("category_id") or baseline.category_id,
            entities=baseline.entities,
            candidates=baseline.candidates,
            reasoning=str(parsed.get("reasoning") or baseline.reasoning)[:80],
            needs_clarification=needs_clarification,
            clarification_kind=baseline.clarification_kind or ("low_confidence" if needs_clarification else ""),
            unsupported_language=baseline.unsupported_language,
            followup_aspect=baseline.followup_aspect,
        )

    # --- generation ------------------------------------------------------
    def compose(
        self,
        *,
        query: str,
        analysis: Analysis,
        service: ServiceRecord | None,
        related: list[ServiceRecord],
        language: str,
        context: dict[str, Any] | None = None,
    ) -> ComposedAnswer:
        # Blocks are ALWAYS produced locally from verified records.
        grounded = self.fallback.compose(
            query=query,
            analysis=analysis,
            service=service,
            related=related,
            language=language,
            context=context,
        )
        if service is None or analysis.intent_type not in {"service_query", "followup"}:
            grounded.provider = self.name if not grounded.demo_mode else "local"
            grounded.demo_mode = self._degraded
            return grounded

        lead = self._write_lead(query, service, analysis, language)
        if not lead:
            grounded.demo_mode = True
            grounded.notes = (grounded.notes + " | llm_lead_failed").strip(" |")
            return grounded

        # Replace only the first text block; keep every factual block intact.
        for index, block in enumerate(grounded.blocks):
            if block.get("type") == "text":
                grounded.blocks[index] = {"type": "text", "text": lead, "tone": "positive"}
                break
        grounded.text = f"{lead}\n\n{grounded.text}"
        grounded.spoken_text = lead
        grounded.provider = self.name
        grounded.demo_mode = False
        grounded.notes = describe_entities(analysis.entities, self.store, language)
        return grounded

    def _write_lead(
        self, query: str, service: ServiceRecord, analysis: Analysis, language: str
    ) -> str | None:
        language_name = "Hindi" if language == "hi" else "English"
        knowledge = {
            "service_name": service.name(language),
            "service_name_en": service.name("en"),
            "tagline": service.description and service.tagline.get(language, ""),
            "category": service.category_id,
            "jurisdiction": service.jurisdiction,
            "first_step": service.steps[0].title.get(language, "") if service.steps else "",
            "official_source": service.official_source.get(language, ""),
            "verification_level": service.verification.level,
            "entities": analysis.entities.as_dict(),
        }
        user = json.dumps(
            {
                "citizen_message": redact_pii(query)[:300],
                "reply_language": language_name,
                "verified_knowledge": knowledge,
                "task": (
                    f"Write ONE short {language_name} sentence (max 25 words) that acknowledges "
                    "what the citizen asked and names the service. Warm, plain language, no "
                    "bullet points, no URLs, no markdown. If verification_level is not "
                    "'verified_official', add a brief reminder to confirm with the official authority."
                ),
            },
            ensure_ascii=False,
        )
        raw = self._chat(
            [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}]
        )
        if not raw:
            return None
        lead = raw.strip().strip('"').strip()
        # Refuse anything that looks like the model started inventing structure.
        if not lead or len(lead) > 300 or lead.count("\n") > 2:
            return None
        if "http" in lead:
            return None
        return lead

    # --- speech-to-text --------------------------------------------------
    def transcribe(self, audio: bytes, *, language: str | None = None) -> str:
        if self._degraded:
            raise NotImplementedError
        files = {"file": ("audio.webm", audio, "audio/webm")}
        data = {"model": "whisper-1", "response_format": "json"}
        if language and len(language) == 2:
            data["language"] = language
        try:
            response = self._client.post("/audio/transcriptions", files=files, data=data)
            response.raise_for_status()
            return str(response.json().get("text", "")).strip()
        except Exception as exc:
            logger.warning("transcription failed: %s", type(exc).__name__)
            raise RuntimeError("transcription_failed") from exc

    @property
    def supports_transcription(self) -> bool:
        return bool(settings.openai_api_key) and not self._degraded

    def health(self) -> dict[str, Any]:
        return {
            "provider": self.name,
            "demo_mode": self._degraded,
            "degraded": self._degraded,
            "consecutive_failures": self._consecutive_failures,
            "model": settings.openai_model,
        }

    def close(self) -> None:
        self._client.close()
