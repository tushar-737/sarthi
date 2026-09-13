"""The built-in deterministic provider — SAARTHI's Demo Mode.

Always available, no network, no API key, no cost. It is a real implementation
rather than a stub: intent analysis, entity extraction and answer composition
all run here, grounded entirely in the verified knowledge base.

This is what makes the hackathon demo reliable when an external AI API is slow,
rate-limited or unreachable — and it is also the safety net the OpenAI provider
falls back to on any error.
"""

from __future__ import annotations

from typing import Any

from app.ai.base import AIProvider, Analysis, ComposedAnswer
from app.ai.composer import (
    compose_browse,
    compose_clarification,
    compose_error,
    compose_followup,
    compose_gratitude,
    compose_greeting,
    compose_not_found,
    compose_service_answer,
    compose_unsupported_language,
    describe_entities,
)
from app.ai.intent import IntentAnalyzer
from app.knowledge.base import KnowledgeStore
from app.knowledge.models import ServiceRecord
from app.utils.logging import get_logger

logger = get_logger("ai.local")


class LocalProvider(AIProvider):
    name = "local"
    demo_mode = True

    def __init__(self, store: KnowledgeStore) -> None:
        self.store = store
        self.analyzer = IntentAnalyzer(store)

    # --- understanding ---------------------------------------------------
    def analyze(
        self,
        query: str,
        *,
        language_hint: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> Analysis:
        try:
            return self.analyzer.analyze(query, language_hint=language_hint, context=context)
        except Exception:  # pragma: no cover - defensive
            logger.exception("intent analysis failed")
            return Analysis(
                intent_type="out_of_scope",
                language=language_hint or "hi",
                needs_clarification=True,
                clarification_kind="low_confidence",
                reasoning="analysis_error",
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
        context = context or {}

        if analysis.intent_type == "unsupported_language":
            return compose_unsupported_language(
                self.store, analysis.unsupported_language or language
            )

        if analysis.intent_type == "greeting":
            return compose_greeting(self.store, language)

        if analysis.intent_type == "gratitude":
            return compose_gratitude(self.store, language)

        if analysis.intent_type == "browse":
            return compose_browse(self.store, language)

        # Out of scope. If a category still showed up, guide the citizen back to
        # it; otherwise be honest that SAARTHI cannot help with this.
        if analysis.intent_type == "out_of_scope":
            if analysis.category_id or analysis.confidence >= 0.30:
                return compose_clarification(self.store, analysis, language)
            return compose_not_found(self.store, analysis, language)

        if analysis.intent_type == "followup" and service:
            answer = compose_followup(
                self.store, service, analysis.followup_aspect or "steps", language
            )
            answer.notes = describe_entities(analysis.entities, self.store, language)
            return answer

        if service and analysis.confidence >= 0.35:
            answer = compose_service_answer(self.store, service, analysis, language, related)
            answer.notes = describe_entities(analysis.entities, self.store, language)
            return answer

        if analysis.needs_clarification and (analysis.candidates or analysis.category_id):
            return compose_clarification(self.store, analysis, language)

        if context.get("error"):
            return compose_error(self.store, str(context["error"]), language)

        return compose_not_found(self.store, analysis, language)

    def transcribe(self, audio: bytes, *, language: str | None = None) -> str:
        raise NotImplementedError("local provider has no speech-to-text engine")

    @property
    def supports_transcription(self) -> bool:
        return False

    def health(self) -> dict[str, Any]:
        return {
            "provider": self.name,
            "demo_mode": True,
            "knowledge_base": self.store.stats(),
        }
