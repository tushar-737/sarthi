"""Typed models for the verified knowledge base.

The JSON files under `app/knowledge/data/` are the source of truth. These
models validate them at startup, so a malformed record fails loudly instead
of silently producing wrong citizen guidance.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

VerificationLevel = Literal["verified_official", "general_guidance", "confirm_with_authority"]
Jurisdiction = Literal["national", "state"]

# A localised string: {"en": "...", "hi": "..."}. Extra language codes are
# allowed so new languages can be added without touching the schema.
Localized = dict[str, str]

FALLBACK_LANGUAGES = ("hi", "en")


def pick(localized: Localized | None, language: str) -> str:
    """Return the string for `language`, falling back to Hindi then English."""
    if not localized:
        return ""
    value = localized.get(language)
    if value:
        return value
    for fallback in FALLBACK_LANGUAGES:
        value = localized.get(fallback)
        if value:
            return value
    # Last resort: any available value.
    return next(iter(localized.values()), "")


def pick_list(localized: dict[str, list[str]] | None, language: str) -> list[str]:
    if not localized:
        return []
    values = localized.get(language)
    if values:
        return list(values)
    for fallback in FALLBACK_LANGUAGES:
        values = localized.get(fallback)
        if values:
            return list(values)
    for values in localized.values():
        return list(values)
    return []


class DocumentItem(BaseModel):
    id: str
    name: Localized
    detail: Localized = Field(default_factory=dict)
    required: bool = True


class StepItem(BaseModel):
    title: Localized
    detail: Localized = Field(default_factory=dict)
    tips: list[Localized] = Field(default_factory=list)


class VerificationInfo(BaseModel):
    level: VerificationLevel = "general_guidance"
    last_verified: str = ""
    note: Localized = Field(default_factory=dict)


class StatePortal(BaseModel):
    state_id: str
    state_name: Localized
    portal_url: str
    note: Localized = Field(default_factory=dict)


class ClarifierOption(BaseModel):
    id: str
    label: Localized


class Clarifier(BaseModel):
    id: str
    question: Localized
    options: list[ClarifierOption]


class FaqItem(BaseModel):
    q: Localized
    a: Localized


class ExtraLink(BaseModel):
    label: Localized
    url: str


class Helpline(BaseModel):
    label: Localized
    value: str


class ServiceRecord(BaseModel):
    """One verified public service."""

    id: str
    category_id: str
    jurisdiction: Jurisdiction = "national"
    priority: int = 50
    names: Localized
    tagline: Localized = Field(default_factory=dict)
    description: Localized = Field(default_factory=dict)
    aliases: dict[str, list[str]] = Field(default_factory=dict)
    keywords: dict[str, list[str]] = Field(default_factory=dict)
    eligibility: list[Localized] = Field(default_factory=list)
    documents: list[DocumentItem] = Field(default_factory=list)
    steps: list[StepItem] = Field(default_factory=list)
    important_notes: list[Localized] = Field(default_factory=list)
    official_source: Localized
    official_url: str
    portal_label: Localized = Field(default_factory=dict)
    extra_links: list[ExtraLink] = Field(default_factory=list)
    helpline: Helpline | None = None
    verification: VerificationInfo = Field(default_factory=VerificationInfo)
    state_portals: list[StatePortal] = Field(default_factory=list)
    clarifiers: list[Clarifier] = Field(default_factory=list)
    faq: list[FaqItem] = Field(default_factory=list)
    related_service_ids: list[str] = Field(default_factory=list)

    @field_validator("official_url")
    @classmethod
    def must_be_https(cls, value: str) -> str:
        if not value.startswith(("https://", "http://")):
            raise ValueError("official_url must be an absolute http(s) URL")
        return value

    def name(self, language: str) -> str:
        return pick(self.names, language)

    def searchable_text(self, language: str) -> str:
        """Everything a citizen might plausibly type, in one string."""
        parts: list[str] = [
            pick(self.names, language),
            pick(self.tagline, language),
            pick(self.description, language),
        ]
        parts.extend(pick_list(self.aliases, language))
        parts.extend(pick_list(self.keywords, language))
        parts.extend(pick_list(self.aliases, "en"))
        parts.extend(pick_list(self.keywords, "en"))
        parts.extend(pick_list(self.aliases, "hi"))
        parts.extend(pick_list(self.keywords, "hi"))
        return " ".join(p for p in parts if p)


class Category(BaseModel):
    id: str
    icon: str = "folder"
    order: int = 50
    names: Localized
    description: Localized = Field(default_factory=dict)

    def name(self, language: str) -> str:
        return pick(self.names, language)


class Language(BaseModel):
    code: str
    bcp47: str
    name_en: str
    name_local: str
    speech_locale: str
    tts_voice_hint: str
    status: Literal["available", "planned"] = "available"
    order: int = 50
    rtl: bool = False


class Phrases(BaseModel):
    """All assistant-facing UI copy, keyed by phrase id."""

    raw: dict = Field(default_factory=dict)

    def get(self, key: str, language: str) -> str:
        """Dotted lookup, e.g. `get('errors.speech_failed', 'hi')`."""
        node: object = self.raw
        for part in key.split("."):
            if not isinstance(node, dict) or part not in node:
                return ""
            node = node[part]
        if isinstance(node, str):
            return node
        return pick(node, language)  # type: ignore[arg-type]

    def section(self, key: str) -> dict:
        """Dotted lookup returning a dict section (e.g. `confused_options`)."""
        node = self.raw_section(key)
        return node if isinstance(node, dict) else {}

    def section_list(self, key: str) -> list:
        """Dotted lookup returning a list section (e.g. `suggested_prompts`)."""
        node = self.raw_section(key)
        return node if isinstance(node, list) else []

    def raw_section(self, key: str) -> object:
        node: object = self.raw
        for part in key.split("."):
            if not isinstance(node, dict) or part not in node:
                return None
            node = node[part]
        return node
