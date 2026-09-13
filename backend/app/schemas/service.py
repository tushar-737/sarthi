"""Service and category schemas returned to the frontend."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.common import HelplineOut, LinkOut, SourceOut, VerificationLevel


class LocalizedOut(BaseModel):
    """A string that SAARTHI can speak in more than one language."""

    text: str
    language: str


class DocumentOut(BaseModel):
    id: str
    name: str
    detail: str = ""
    required: bool = True
    required_label: str = ""


class StepOut(BaseModel):
    index: int
    title: str
    detail: str = ""
    tips: list[str] = Field(default_factory=list)


class FaqOut(BaseModel):
    question: str
    answer: str


class ClarifierOptionOut(BaseModel):
    id: str
    label: str


class ClarifierOut(BaseModel):
    id: str
    question: str
    options: list[ClarifierOptionOut] = Field(default_factory=list)


class ServiceSummary(BaseModel):
    """Compact card used in chat replies, category grids and search results."""

    id: str
    name: str
    tagline: str = ""
    category_id: str
    category_name: str = ""
    category_icon: str = "folder"
    jurisdiction: str = "national"
    official_url: str = ""
    verification_level: VerificationLevel = "general_guidance"
    verification_label: str = ""
    last_verified: str = ""
    step_count: int = 0
    document_count: int = 0
    confidence: float | None = None


class ServiceDetail(ServiceSummary):
    description: str = ""
    eligibility: list[str] = Field(default_factory=list)
    documents: list[DocumentOut] = Field(default_factory=list)
    steps: list[StepOut] = Field(default_factory=list)
    important_notes: list[str] = Field(default_factory=list)
    official_source: str = ""
    portal_label: str = ""
    extra_links: list[LinkOut] = Field(default_factory=list)
    helpline: HelplineOut | None = None
    state_portals: list[LinkOut] = Field(default_factory=list)
    verification_note: str = ""
    clarifiers: list[ClarifierOut] = Field(default_factory=list)
    faq: list[FaqOut] = Field(default_factory=list)
    related_services: list[ServiceSummary] = Field(default_factory=list)
    source: SourceOut | None = None


class CategoryOut(BaseModel):
    id: str
    name: str
    description: str = ""
    icon: str = "folder"
    order: int = 50
    service_count: int = 0
    services: list[ServiceSummary] = Field(default_factory=list)


class LanguageOut(BaseModel):
    code: str
    bcp47: str
    name_en: str
    name_local: str
    speech_locale: str
    tts_voice_hint: str
    status: str
    order: int
    rtl: bool = False


class ServiceListOut(BaseModel):
    total: int
    language: str
    services: list[ServiceSummary]


class ServiceSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=600)
    language: str | None = None
    category_id: str | None = None
    limit: int = Field(default=5, ge=1, le=20)


class ServiceSearchMatch(BaseModel):
    service: ServiceSummary
    confidence: float
    matched_terms: list[str] = Field(default_factory=list)


class ServiceSearchOut(BaseModel):
    query: str
    language: str
    detected_language: str
    matches: list[ServiceSearchMatch]
    categories: list[CategoryOut] = Field(default_factory=list)


# --- Guided journey (Service Navigator) ------------------------------------


class JourneyStepOut(BaseModel):
    id: str
    index: int
    title: str
    detail: str = ""
    tips: list[str] = Field(default_factory=list)
    checklist: list[str] = Field(default_factory=list)
    action_label: str = ""
    action_url: str = ""
    kind: str = "generic"


class JourneyOut(BaseModel):
    service_id: str
    service_name: str
    total_steps: int
    steps: list[JourneyStepOut]
    intro: str = ""
    portal_label: str = ""
    portal_url: str = ""
    source: SourceOut | None = None


class JourneyProgressRequest(BaseModel):
    service_id: str
    completed_steps: list[str] = Field(default_factory=list)
    current_step: int = 1
    language: str | None = None


class JourneyProgressOut(BaseModel):
    service_id: str
    current_step: int
    total_steps: int
    completed_steps: list[str]
    percent_complete: int
    journey: JourneyOut
