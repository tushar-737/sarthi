"""Chat orchestration — the pipeline from citizen query to structured reply.

    query → sanitise → language → intent → retrieval → grounding → compose
          → blocks + sources + quick actions

The backend is stateless per request: the frontend passes `conversation_id`
and `active_service_id` back in, so SAARTHI never has to hold a citizen's
conversation on the server. That is a deliberate privacy choice.
"""

from __future__ import annotations

import time
import uuid
from typing import Any

from pydantic import TypeAdapter
from sqlalchemy.orm import Session

from app.ai.base import AIProvider, Analysis
from app.ai.factory import get_ai_provider
from app.config import settings
from app.knowledge.base import KnowledgeStore, get_knowledge_store
from app.knowledge.language import normalize_language
from app.knowledge.models import ServiceRecord
from app.models.db_models import ConversationLog
from app.schemas.chat import (
    Block,
    ChatRequest,
    ChatResponse,
    ClarificationOut,
    EntityOut,
    IntentOut,
    QuickAction,
    ReplyOut,
    SuggestedPrompt,
)
from app.schemas.common import SourceOut
from app.schemas.service import ClarifierOptionOut
from app.services import serialization as ser
from app.utils.logging import get_logger
from app.utils.safety import UnsafeInputError, sanitize

logger = get_logger("services.chat")

_BLOCK_ADAPTER: TypeAdapter[list[Block]] = TypeAdapter(list[Block])


class ChatService:
    def __init__(
        self,
        store: KnowledgeStore | None = None,
        provider: AIProvider | None = None,
    ) -> None:
        self.store = store or get_knowledge_store()
        self.provider = provider or get_ai_provider()

    # --- public API ------------------------------------------------------
    def handle(self, request: ChatRequest, session: Session | None = None) -> ChatResponse:
        started = time.perf_counter()
        conversation_id = request.conversation_id or f"conv_{uuid.uuid4().hex[:16]}"
        message_id = f"msg_{uuid.uuid4().hex[:16]}"
        language = normalize_language(request.language, settings.default_language)

        error_code: str | None = None
        message = request.message.strip()

        # 1. Input safety.
        try:
            message = sanitize(message)
        except UnsafeInputError:
            error_code = "too_long"
        if not message and not error_code:
            error_code = "empty_input"

        if error_code:
            response = self._error_response(
                error_code, conversation_id, message_id, language, request
            )
        else:
            try:
                response = self._process(message, conversation_id, message_id, language, request)
            except Exception:  # pragma: no cover - never leak a stack trace
                logger.exception("chat pipeline failed")
                response = self._error_response(
                    "server_error", conversation_id, message_id, language, request
                )

        response = self._finalize(response, message_id, conversation_id)

        # 2. Structured logging (no personal data).
        if session is not None and settings.log_conversations:
            self._log(session, response, request, message, started, error_code)

        return response

    # --- pipeline --------------------------------------------------------
    def _process(
        self,
        message: str,
        conversation_id: str,
        message_id: str,
        language: str,
        request: ChatRequest,
    ) -> ChatResponse:
        context: dict[str, Any] = {
            "conversation_id": conversation_id,
            "active_service_id": request.active_service_id,
            "active_category_id": request.active_category_id,
            "pending_clarifier_id": request.pending_clarifier_id,
            "clarifier_answer": request.clarifier_answer,
            "state": request.state,
            "input_mode": request.input_mode,
        }

        # A quick reply that names a service id resolves directly — the citizen
        # tapped an option, so there is nothing to guess.
        direct = self._resolve_quick_reply(request)

        analysis: Analysis = (
            self.provider.analyze(message, language_hint=request.language, context=context)
            if not direct
            else direct
        )

        # Answer in the language the citizen actually used, not the UI setting.
        answer_language = analysis.language if analysis.language in {"hi", "en"} else language

        service = self.store.get_service(analysis.service_id) if analysis.service_id else None
        related = self._related(service)

        answer = self.provider.compose(
            query=message,
            analysis=analysis,
            service=service,
            related=related,
            language=answer_language,
            context=context,
        )

        blocks = self._parse_blocks(answer.blocks)
        sources = [ser.to_source(self.store, service, answer_language)] if service else []

        return ChatResponse(
            conversation_id=conversation_id,
            message_id=message_id,
            reply=ReplyOut(
                text=answer.text,
                spoken_text=answer.spoken_text or answer.text,
                blocks=blocks,
                language=answer_language,
            ),
            intent=self._intent_out(analysis, service, answer_language),
            service=ser.to_service_detail(self.store, service, answer_language) if service else None,
            clarification=self._clarification_out(blocks),
            quick_actions=self._quick_actions(service, analysis, answer_language),
            suggested_prompts=self._suggested_prompts(answer_language, message),
            sources=sources,
            disclaimer=self.store.phrases.get("disclaimer", answer_language),
            demo_mode=bool(answer.demo_mode or self.provider.demo_mode),
            provider=answer.provider or self.provider.name,
            verification_level=service.verification.level if service else None,
        )

    def _resolve_quick_reply(self, request: ChatRequest) -> Analysis | None:
        """Handle a tapped clarification option that names a known service."""
        answer = (request.clarifier_answer or "").strip()
        if not answer:
            return None
        service = self.store.get_service(answer)
        if not service:
            return None
        return Analysis(
            intent_type="service_query",
            language=normalize_language(request.language, settings.default_language),
            confidence=0.99,
            service_id=service.id,
            category_id=service.category_id,
            reasoning="quick_reply_selection",
        )

    # --- helpers ---------------------------------------------------------
    def _related(self, service: ServiceRecord | None) -> list[ServiceRecord]:
        if not service:
            return []
        return self.store.services_by_ids(service.related_service_ids)[:3]

    def _parse_blocks(self, raw_blocks: list[dict[str, Any]]) -> list[Block]:
        if not raw_blocks:
            return []
        try:
            return _BLOCK_ADAPTER.validate_python(raw_blocks)
        except Exception:
            logger.exception("block validation failed; falling back to plain text")
            # Degrade to text rather than failing the whole reply.
            from app.schemas.chat import TextBlock

            texts = [b.get("text", "") for b in raw_blocks if b.get("type") == "text"]
            return [TextBlock(text=t) for t in texts if t]

    def _intent_out(
        self, analysis: Analysis, service: ServiceRecord | None, language: str
    ) -> IntentOut:
        category = self.store.get_category(analysis.category_id) if analysis.category_id else None
        candidates = [
            ser.to_service_summary(self.store, record, language, confidence=c.confidence)
            for c in analysis.candidates
            if (record := self.store.get_service(c.service_id))
        ]
        entities = analysis.entities
        return IntentOut(
            intent_type=analysis.intent_type,
            service_id=analysis.service_id,
            service_name=service.name(language) if service else None,
            category_id=analysis.category_id,
            category_name=category.name(language) if category else None,
            confidence=round(analysis.confidence, 4),
            entities=EntityOut(
                state=entities.state,
                study_level=entities.study_level,
                purpose=entities.purpose,
                age=entities.age,
                relation=entities.relation,
                pension_type=entities.pension_type,
            ),
            detected_language=analysis.language,
            candidates=candidates,
            reasoning=analysis.reasoning,
        )

    @staticmethod
    def _clarification_out(blocks: list[Block]) -> ClarificationOut:
        for block in blocks:
            if block.type == "clarification":
                return ClarificationOut(
                    needed=True,
                    question=block.question,
                    options=[ClarifierOptionOut(id=o.id, label=o.label) for o in block.options],
                    reason=block.reason,
                )
        return ClarificationOut(needed=False)

    def _quick_actions(
        self, service: ServiceRecord | None, analysis: Analysis, language: str
    ) -> list[QuickAction]:
        phrases = self.store.phrases
        if service:
            return [
                QuickAction(
                    id="documents",
                    label=phrases.get("quick_actions.documents", language),
                    kind="prompt",
                    value=phrases.get("quick_actions.documents", language),
                ),
                QuickAction(
                    id="eligibility",
                    label=phrases.get("quick_actions.eligibility", language),
                    kind="prompt",
                    value=phrases.get("quick_actions.eligibility", language),
                ),
                QuickAction(
                    id="steps",
                    label=phrases.get("quick_actions.steps", language),
                    kind="prompt",
                    value=phrases.get("quick_actions.steps", language),
                ),
                QuickAction(
                    id="portal",
                    label=phrases.get("quick_actions.portal", language),
                    kind="link",
                    value=service.official_url,
                ),
                QuickAction(
                    id="journey",
                    label=phrases.get("quick_actions.journey", language),
                    kind="navigate",
                    value=f"/navigator/{service.id}",
                ),
                QuickAction(
                    id="another_service",
                    label=phrases.get("quick_actions.another_service", language),
                    kind="navigate",
                    value="/services",
                ),
            ]
        return [
            QuickAction(
                id="browse",
                label=phrases.get("quick_actions.another_service", language),
                kind="navigate",
                value="/services",
            ),
            QuickAction(
                id="speak",
                label=phrases.get("listen", language),
                kind="prompt",
                value="",
            ),
        ]

    def _suggested_prompts(self, language: str, message: str) -> list[SuggestedPrompt]:
        items = self.store.phrases.section_list("suggested_prompts")
        prompts: list[SuggestedPrompt] = []
        for item in items:
            text = item.get(language) or item.get("en") or item.get("hi")
            if not text or text.lower() == message.lower():
                continue
            prompts.append(SuggestedPrompt(id=str(item.get("id", text[:12])), text=text))
        return prompts[:4]

    def _error_response(
        self,
        code: str,
        conversation_id: str,
        message_id: str,
        language: str,
        request: ChatRequest,
    ) -> ChatResponse:
        from app.ai.composer import compose_error

        answer = compose_error(self.store, code, language)
        blocks = self._parse_blocks(answer.blocks)
        return ChatResponse(
            conversation_id=conversation_id,
            message_id=message_id,
            reply=ReplyOut(
                text=answer.text,
                spoken_text=answer.spoken_text,
                blocks=blocks,
                language=language,
            ),
            intent=IntentOut(
                intent_type="out_of_scope",
                confidence=0.0,
                detected_language=language,
                reasoning=f"error:{code}",
            ),
            quick_actions=self._quick_actions(None, Analysis(intent_type="out_of_scope", language=language), language),
            suggested_prompts=self._suggested_prompts(language, ""),
            disclaimer=self.store.phrases.get("disclaimer", language),
            demo_mode=True,
            provider=self.provider.name,
            error=code,
        )

    def _finalize(
        self, response: ChatResponse, message_id: str, conversation_id: str
    ) -> ChatResponse:
        response.message_id = message_id
        response.conversation_id = conversation_id
        return response

    # --- logging ---------------------------------------------------------
    @staticmethod
    def _log(
        session: Session,
        response: ChatResponse,
        request: ChatRequest,
        message: str,
        started: float,
        error_code: str | None,
    ) -> None:
        from app.utils.safety import safe_for_logging

        try:
            session.add(
                ConversationLog(
                    conversation_id=response.conversation_id,
                    message_id=response.message_id,
                    language=response.reply.language,
                    input_mode=request.input_mode,
                    intent_type=response.intent.intent_type,
                    service_id=response.intent.service_id,
                    category_id=response.intent.category_id,
                    confidence=response.intent.confidence,
                    provider=response.provider,
                    demo_mode=response.demo_mode,
                    error_code=error_code or response.error,
                    query_redacted=safe_for_logging(message),
                    latency_ms=int((time.perf_counter() - started) * 1000),
                )
            )
            session.commit()
        except Exception:  # pragma: no cover - logging must never break a reply
            logger.warning("conversation log write failed", exc_info=True)
            session.rollback()

    # --- read helpers ----------------------------------------------------
    def source_for(self, service_id: str, language: str) -> SourceOut | None:
        service = self.store.get_service(service_id)
        return ser.to_source(self.store, service, language) if service else None


_chat_service: ChatService | None = None


def get_chat_service() -> ChatService:
    global _chat_service
    if _chat_service is None:
        _chat_service = ChatService()
    return _chat_service


def reset_chat_service() -> None:
    global _chat_service
    _chat_service = None
