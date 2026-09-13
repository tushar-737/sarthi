"""Conversion from verified knowledge-base records to API schemas.

This is the only place that renders a `ServiceRecord` for the citizen, so the
chat replies, the service pages and the navigator all describe a service
identically — and all of it stays traceable to the knowledge base.
"""

from __future__ import annotations

from app.knowledge.base import KnowledgeStore
from app.knowledge.models import ServiceRecord, pick
from app.schemas.common import HelplineOut, LinkOut, SourceOut
from app.schemas.service import (
    CategoryOut,
    ClarifierOptionOut,
    ClarifierOut,
    DocumentOut,
    FaqOut,
    JourneyOut,
    JourneyStepOut,
    ServiceDetail,
    ServiceSummary,
    StepOut,
)

JOURNEY_PREFIX = ("check_eligibility", "prepare_documents")
JOURNEY_SUFFIX = ("track_status",)

_PORTAL_HINTS = (
    "portal", "website", "site", "online", "visit", "open", "log in", "login",
    "पोर्टल", "वेबसाइट", "साइट", "ऑनलाइन", "खोलें", "लॉगिन", "जाएँ",
)


_TRACKING_HINTS = ("track", "status", "download", "स्थिति", "ट्रैक", "डाउनलोड", "प्राप्त")


def _last_step_tracks(record: ServiceRecord) -> bool:
    """True when the service's own final step already tells the citizen to track."""
    if not record.steps:
        return False
    last = record.steps[-1]
    haystack = f"{pick(last.title, 'en')} {pick(last.title, 'hi')}".lower()
    return any(hint in haystack for hint in _TRACKING_HINTS)


def _find_portal_step(steps: list[JourneyStepOut], language: str) -> int:
    """Index of the journey step where the citizen should open the portal."""
    for index, step in enumerate(steps):
        if step.kind != "apply":
            continue
        haystack = f"{step.title} {step.detail}".lower()
        if any(hint in haystack for hint in _PORTAL_HINTS):
            return index
    for index, step in enumerate(steps):
        if step.kind == "apply":
            return index
    return max(len(steps) - 1, 0)


def verification_label(store: KnowledgeStore, level: str, language: str) -> str:
    return store.phrases.get(f"verification_labels.{level}", language)


def to_source(store: KnowledgeStore, record: ServiceRecord, language: str) -> SourceOut:
    level = record.verification.level
    return SourceOut(
        service_id=record.id,
        service_name=record.name(language),
        authority=pick(record.official_source, language),
        url=record.official_url,
        portal_label=pick(record.portal_label, language) or store.phrases.get("visit_portal", language),
        verification_level=level,
        verification_label=verification_label(store, level, language),
        last_verified=record.verification.last_verified,
        note=pick(record.verification.note, language),
        extra_links=[
            LinkOut(label=pick(link.label, language), url=link.url) for link in record.extra_links
        ],
        helpline=(
            HelplineOut(label=pick(record.helpline.label, language), value=record.helpline.value)
            if record.helpline
            else None
        ),
        state_portals=[
            LinkOut(
                label=pick(sp.state_name, language) + (f" — {pick(sp.note, language)}" if pick(sp.note, language) else ""),
                url=sp.portal_url,
            )
            for sp in record.state_portals
        ],
    )


def to_service_summary(
    store: KnowledgeStore,
    record: ServiceRecord,
    language: str,
    confidence: float | None = None,
) -> ServiceSummary:
    category = store.get_category(record.category_id)
    return ServiceSummary(
        id=record.id,
        name=record.name(language),
        tagline=pick(record.tagline, language),
        category_id=record.category_id,
        category_name=category.name(language) if category else "",
        category_icon=category.icon if category else "folder",
        jurisdiction=record.jurisdiction,
        official_url=record.official_url,
        verification_level=record.verification.level,
        verification_label=verification_label(store, record.verification.level, language),
        last_verified=record.verification.last_verified,
        step_count=len(record.steps),
        document_count=len(record.documents),
        confidence=confidence,
    )


def to_service_detail(store: KnowledgeStore, record: ServiceRecord, language: str) -> ServiceDetail:
    base = to_service_summary(store, record, language)
    return ServiceDetail(
        **base.model_dump(),
        description=pick(record.description, language),
        eligibility=[pick(item, language) for item in record.eligibility if pick(item, language)],
        documents=[
            DocumentOut(
                id=doc.id,
                name=pick(doc.name, language),
                detail=pick(doc.detail, language),
                required=doc.required,
                required_label=store.phrases.get(
                    "required" if doc.required else "optional", language
                ),
            )
            for doc in record.documents
        ],
        steps=[
            StepOut(
                index=index + 1,
                title=pick(step.title, language),
                detail=pick(step.detail, language),
                tips=[pick(tip, language) for tip in step.tips if pick(tip, language)],
            )
            for index, step in enumerate(record.steps)
        ],
        important_notes=[
            pick(note, language) for note in record.important_notes if pick(note, language)
        ],
        official_source=pick(record.official_source, language),
        portal_label=pick(record.portal_label, language),
        extra_links=[
            LinkOut(label=pick(link.label, language), url=link.url) for link in record.extra_links
        ],
        helpline=(
            HelplineOut(label=pick(record.helpline.label, language), value=record.helpline.value)
            if record.helpline
            else None
        ),
        state_portals=[
            LinkOut(
                label=pick(sp.state_name, language),
                url=sp.portal_url,
            )
            for sp in record.state_portals
        ],
        verification_note=pick(record.verification.note, language),
        clarifiers=[
            ClarifierOut(
                id=clarifier.id,
                question=pick(clarifier.question, language),
                options=[
                    ClarifierOptionOut(id=option.id, label=pick(option.label, language))
                    for option in clarifier.options
                ],
            )
            for clarifier in record.clarifiers
        ],
        faq=[
            FaqOut(question=pick(item.q, language), answer=pick(item.a, language))
            for item in record.faq
            if pick(item.q, language)
        ],
        related_services=[
            to_service_summary(store, related, language)
            for related in store.services_by_ids(record.related_service_ids)
        ],
        source=to_source(store, record, language),
    )


def to_category(
    store: KnowledgeStore,
    category_id: str,
    language: str,
    *,
    with_services: bool = True,
) -> CategoryOut | None:
    category = store.get_category(category_id)
    if not category:
        return None
    services = store.services_by_category(category_id)
    return CategoryOut(
        id=category.id,
        name=category.name(language),
        description=pick(category.description, language),
        icon=category.icon,
        order=category.order,
        service_count=len(services),
        services=[to_service_summary(store, s, language) for s in services] if with_services else [],
    )


def all_categories(store: KnowledgeStore, language: str) -> list[CategoryOut]:
    ordered = sorted(store.categories.values(), key=lambda c: c.order)
    return [out for out in (to_category(store, c.id, language) for c in ordered) if out]


def to_journey(store: KnowledgeStore, record: ServiceRecord, language: str) -> JourneyOut:
    """Build the guided journey for a service.

    The journey wraps the service's own application steps with two orientation
    steps — check eligibility, prepare documents — so a first-time user always
    starts from "am I eligible and what do I need" rather than from a form.
    """
    steps: list[JourneyStepOut] = []

    steps.append(
        JourneyStepOut(
            id="check_eligibility",
            index=1,
            title=store.phrases.get("journey_steps.check_eligibility", language),
            detail=pick(record.tagline, language),
            checklist=[pick(item, language) for item in record.eligibility if pick(item, language)],
            kind="eligibility",
        )
    )

    steps.append(
        JourneyStepOut(
            id="prepare_documents",
            index=2,
            title=store.phrases.get("journey_steps.prepare_documents", language),
            detail=store.phrases.get("section_headings.documents", language),
            checklist=[
                f"{pick(doc.name, language)}"
                + ("" if doc.required else f" ({store.phrases.get('optional', language)})")
                for doc in record.documents
            ],
            kind="documents",
        )
    )

    for offset, step in enumerate(record.steps):
        steps.append(
            JourneyStepOut(
                id=f"step_{offset + 1}",
                index=len(steps) + 1,
                title=pick(step.title, language),
                detail=pick(step.detail, language),
                tips=[pick(tip, language) for tip in step.tips if pick(tip, language)],
                kind="apply",
            )
        )

    # Attach the portal action to the step that actually tells the citizen to
    # open the official site, falling back to the first application step.
    portal_index = _find_portal_step(steps, language)
    steps[portal_index] = steps[portal_index].model_copy(
        update={
            "action_label": pick(record.portal_label, language)
            or store.phrases.get("visit_portal", language),
            "action_url": record.official_url,
            "kind": "portal",
        }
    )

    # Close the journey with a tracking step — unless the service's own final
    # step already covers it, which would just show the citizen the same thing
    # twice at the end of a long journey.
    if not _last_step_tracks(record):
        steps.append(
            JourneyStepOut(
                id="track_status",
                index=len(steps) + 1,
                title=store.phrases.get("journey_steps.track_status", language),
                detail=store.phrases.get("followup_prompt", language),
                kind="track",
                action_label=pick(record.portal_label, language)
                or store.phrases.get("visit_portal", language),
                action_url=record.official_url,
            )
        )

    return JourneyOut(
        service_id=record.id,
        service_name=record.name(language),
        total_steps=len(steps),
        steps=steps,
        intro=store.phrases.get("journey_intro", language),
        portal_label=pick(record.portal_label, language),
        portal_url=record.official_url,
        source=to_source(store, record, language),
    )
