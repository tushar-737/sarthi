"""Chat conversation schemas.

The reply is deliberately **structured** rather than a single blob of text.
SAARTHI returns typed `blocks` so the frontend can render a document
checklist, a step list and a source card as real UI instead of parsing
markdown out of a chatbot message.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

from app.schemas.common import SourceOut, VerificationLevel
from app.schemas.service import (
    ClarifierOptionOut,
    DocumentOut,
    ServiceDetail,
    ServiceSummary,
    StepOut,
)

BlockType = Literal[
    "text",
    "service_card",
    "eligibility",
    "documents",
    "steps",
    "notes",
    "source",
    "clarification",
    "journey_cta",
    "related",
    "privacy",
]


class TextBlock(BaseModel):
    type: Literal["text"] = "text"
    text: str
    tone: Literal["neutral", "positive", "warning", "error"] = "neutral"


class ServiceCardBlock(BaseModel):
    type: Literal["service_card"] = "service_card"
    service: ServiceSummary


class ListBlock(BaseModel):
    """Used for eligibility criteria and important notes."""

    type: Literal["eligibility", "notes"]
    title: str = ""
    items: list[str] = Field(default_factory=list)
    tone: Literal["neutral", "positive", "warning", "error"] = "neutral"


class DocumentsBlock(BaseModel):
    type: Literal["documents"] = "documents"
    title: str = ""
    items: list[DocumentOut] = Field(default_factory=list)


class StepsBlock(BaseModel):
    type: Literal["steps"] = "steps"
    title: str = ""
    items: list[StepOut] = Field(default_factory=list)


class SourceBlock(BaseModel):
    type: Literal["source"] = "source"
    title: str = ""
    source: SourceOut


class ClarificationBlock(BaseModel):
    type: Literal["clarification"] = "clarification"
    question: str
    reason: str = ""
    options: list[ClarifierOptionOut] = Field(default_factory=list)
    allow_free_text: bool = True


class JourneyCtaBlock(BaseModel):
    type: Literal["journey_cta"] = "journey_cta"
    service_id: str
    service_name: str
    total_steps: int
    label: str


class RelatedBlock(BaseModel):
    type: Literal["related"] = "related"
    title: str = ""
    items: list[ServiceSummary] = Field(default_factory=list)


class PrivacyBlock(BaseModel):
    type: Literal["privacy"] = "privacy"
    text: str


Block = Annotated[
    Union[
        TextBlock,
        ServiceCardBlock,
        ListBlock,
        DocumentsBlock,
        StepsBlock,
        SourceBlock,
        ClarificationBlock,
        JourneyCtaBlock,
        RelatedBlock,
        PrivacyBlock,
    ],
    Field(discriminator="type"),
]


class EntityOut(BaseModel):
    state: str | None = None
    study_level: str | None = None
    purpose: str | None = None
    age: int | None = None
    relation: str | None = None
    pension_type: str | None = None


class IntentOut(BaseModel):
    """What SAARTHI understood — exposed so the UI can show its reasoning."""

    intent_type: Literal[
        "service_query",
        "clarify",
        "browse",
        "greeting",
        "gratitude",
        "out_of_scope",
        "unsupported_language",
        "followup",
    ]
    service_id: str | None = None
    service_name: str | None = None
    category_id: str | None = None
    category_name: str | None = None
    confidence: float = 0.0
    entities: EntityOut = Field(default_factory=EntityOut)
    detected_language: str = "hi"
    candidates: list[ServiceSummary] = Field(default_factory=list)
    reasoning: str = ""


class QuickAction(BaseModel):
    id: str
    label: str
    kind: Literal["prompt", "navigate", "link"] = "prompt"
    value: str = ""


class SuggestedPrompt(BaseModel):
    id: str
    text: str


class ReplyOut(BaseModel):
    text: str
    spoken_text: str
    blocks: list[Block] = Field(default_factory=list)
    language: str


class ClarificationOut(BaseModel):
    needed: bool = False
    question: str = ""
    options: list[ClarifierOptionOut] = Field(default_factory=list)
    reason: str = ""


class ChatRequest(BaseModel):
    # Hard transport cap only; the friendly "that was too long" message is
    # produced by the safety layer at `settings.max_query_length`.
    message: str = Field(default="", max_length=4000)
    language: str | None = None
    conversation_id: str | None = None
    # Context carried by the frontend so follow-ups work without server state.
    active_service_id: str | None = None
    active_category_id: str | None = None
    pending_clarifier_id: str | None = None
    clarifier_answer: str | None = None
    # Personalisation that the citizen volunteered (never sensitive data).
    state: str | None = None
    input_mode: Literal["text", "voice", "quick_reply"] = "text"


class ChatResponse(BaseModel):
    conversation_id: str
    message_id: str
    reply: ReplyOut
    intent: IntentOut
    service: ServiceDetail | None = None
    clarification: ClarificationOut = Field(default_factory=ClarificationOut)
    quick_actions: list[QuickAction] = Field(default_factory=list)
    suggested_prompts: list[SuggestedPrompt] = Field(default_factory=list)
    sources: list[SourceOut] = Field(default_factory=list)
    disclaimer: str = ""
    demo_mode: bool = False
    provider: str = "local"
    verification_level: VerificationLevel | None = None
    error: str | None = None


class ConversationTurn(BaseModel):
    """Client-supplied history so the backend stays stateless and private."""

    role: Literal["user", "assistant"]
    text: str = ""
    service_id: str | None = None


class ChatRequestWithHistory(ChatRequest):
    history: list[ConversationTurn] = Field(default_factory=list, max_length=20)
