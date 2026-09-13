"""AI provider abstraction.

SAARTHI is deliberately **not** coupled to one vendor. Everything the product
needs from "an AI" sits behind `AIProvider`:

* `analyze`  — turn a citizen's sentence into an intent + candidate services
* `compose`  — write a citizen-friendly, grounded explanation
* `transcribe` — turn recorded audio into text

Two implementations ship with the prototype:

`LocalProvider`   deterministic, offline, always available. It answers from the
                  verified knowledge base using templates. This is Demo Mode.
`OpenAIProvider`  calls an LLM, but is *constrained* to the retrieved records
                  and automatically degrades to `LocalProvider` on any error.

The critical invariant both honour: **never invent government information.**
If it is not in the knowledge base, SAARTHI says it could not verify it.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Literal

from app.knowledge.models import ServiceRecord

IntentType = Literal[
    "service_query",
    "clarify",
    "browse",
    "greeting",
    "gratitude",
    "out_of_scope",
    "unsupported_language",
    "followup",
]


@dataclass
class Entities:
    """Facts pulled out of the citizen's own words."""

    state: str | None = None
    study_level: str | None = None
    purpose: str | None = None
    age: int | None = None
    relation: str | None = None
    pension_type: str | None = None
    is_confused: bool = False
    wants_portal: bool = False
    wants_documents: bool = False
    wants_eligibility: bool = False
    wants_time_or_fee: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {k: v for k, v in self.__dict__.items() if v not in (None, False)}


@dataclass
class Candidate:
    service_id: str
    score: float
    confidence: float
    matched_terms: list[str] = field(default_factory=list)


@dataclass
class Analysis:
    """The understanding step: what did the citizen ask for?"""

    intent_type: IntentType
    language: str
    confidence: float = 0.0
    service_id: str | None = None
    category_id: str | None = None
    entities: Entities = field(default_factory=Entities)
    candidates: list[Candidate] = field(default_factory=list)
    reasoning: str = ""
    needs_clarification: bool = False
    clarification_kind: Literal["", "category_only", "low_confidence", "ambiguous_choice", "confused"] = ""
    unsupported_language: str | None = None
    followup_aspect: str | None = None


@dataclass
class ComposedAnswer:
    """The generation step: what should SAARTHI say?"""

    text: str
    spoken_text: str
    blocks: list[dict[str, Any]] = field(default_factory=list)
    provider: str = "local"
    demo_mode: bool = True
    grounded: bool = True
    notes: str = ""


class AIProvider(ABC):
    """Interface every AI backend must satisfy."""

    name: str = "provider"
    #: True when answers come from the built-in deterministic engine.
    demo_mode: bool = True

    @abstractmethod
    def analyze(
        self,
        query: str,
        *,
        language_hint: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> Analysis:
        """Detect language, intent, entities and candidate services."""

    @abstractmethod
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
        """Write the citizen-facing answer, grounded in `service`."""

    def transcribe(self, audio: bytes, *, language: str | None = None) -> str:
        """Speech-to-text. Providers that cannot do it raise `NotImplementedError`."""
        raise NotImplementedError

    @property
    def supports_transcription(self) -> bool:
        return False

    def health(self) -> dict[str, Any]:
        return {"provider": self.name, "demo_mode": self.demo_mode}
