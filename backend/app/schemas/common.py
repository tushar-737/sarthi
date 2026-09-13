"""Shared API schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

VerificationLevel = Literal["verified_official", "general_guidance", "confirm_with_authority"]


class LinkOut(BaseModel):
    label: str
    url: str


class HelplineOut(BaseModel):
    label: str
    value: str


class SourceOut(BaseModel):
    """Official-source transparency block.

    Every factual claim SAARTHI makes is traceable to one of these, and the
    verification level tells the citizen how much weight to give it.
    """

    service_id: str
    service_name: str
    authority: str
    url: str
    portal_label: str = ""
    verification_level: VerificationLevel
    verification_label: str
    last_verified: str
    note: str = ""
    extra_links: list[LinkOut] = Field(default_factory=list)
    helpline: HelplineOut | None = None
    state_portals: list[LinkOut] = Field(default_factory=list)


class ErrorOut(BaseModel):
    code: str
    message: str
    detail: str | None = None


class HealthOut(BaseModel):
    status: str
    app: str
    version: str
    demo_mode: bool
    ai_provider: str
    knowledge_base: dict
    languages: list[str]
