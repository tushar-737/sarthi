"""Answer composition.

Turns a verified `ServiceRecord` plus the intent analysis into the structured
reply SAARTHI sends back: a short human sentence, a TTS-friendly version, and
typed UI blocks.

Voice-first rule: `spoken_text` is always much shorter than `text`. Reading 11
application steps aloud is useless — SAARTHI says the headline and the next
step, and lets the citizen look at the screen for the rest.
"""

from __future__ import annotations

from typing import Any

from app.ai.base import Analysis, ComposedAnswer, Entities
from app.knowledge.base import KnowledgeStore
from app.knowledge.models import ServiceRecord, pick
from app.services import serialization as ser

MAX_SPOKEN_ITEMS = 3


def _documents_block(store: KnowledgeStore, record: ServiceRecord, language: str) -> dict[str, Any]:
    detail = ser.to_service_detail(store, record, language)
    return {
        "type": "documents",
        "title": store.phrases.get("section_headings.documents", language),
        "items": [doc.model_dump() for doc in detail.documents],
    }


def _eligibility_block(store: KnowledgeStore, record: ServiceRecord, language: str) -> dict[str, Any]:
    return {
        "type": "eligibility",
        "title": store.phrases.get("section_headings.eligibility", language),
        "items": [pick(item, language) for item in record.eligibility if pick(item, language)],
        "tone": "neutral",
    }


def _steps_block(store: KnowledgeStore, record: ServiceRecord, language: str) -> dict[str, Any]:
    return {
        "type": "steps",
        "title": store.phrases.get("section_headings.steps", language),
        "items": [
            {
                "index": index + 1,
                "title": pick(step.title, language),
                "detail": pick(step.detail, language),
                "tips": [pick(tip, language) for tip in step.tips if pick(tip, language)],
            }
            for index, step in enumerate(record.steps)
        ],
    }


def _notes_block(store: KnowledgeStore, record: ServiceRecord, language: str) -> dict[str, Any]:
    return {
        "type": "notes",
        "title": store.phrases.get("section_headings.notes", language),
        "items": [pick(n, language) for n in record.important_notes if pick(n, language)],
        "tone": "warning",
    }


def _source_block(store: KnowledgeStore, record: ServiceRecord, language: str) -> dict[str, Any]:
    source = ser.to_source(store, record, language)
    return {
        "type": "source",
        "title": store.phrases.get("section_headings.source", language),
        "source": source.model_dump(),
    }


def _service_card_block(store: KnowledgeStore, record: ServiceRecord, language: str) -> dict[str, Any]:
    return {
        "type": "service_card",
        "service": ser.to_service_summary(store, record, language).model_dump(),
    }


def _journey_cta_block(store: KnowledgeStore, record: ServiceRecord, language: str) -> dict[str, Any]:
    journey = ser.to_journey(store, record, language)
    return {
        "type": "journey_cta",
        "service_id": record.id,
        "service_name": record.name(language),
        "total_steps": journey.total_steps,
        "label": store.phrases.get("start_journey", language),
    }


def _related_block(store: KnowledgeStore, records: list[ServiceRecord], language: str) -> dict[str, Any] | None:
    if not records:
        return None
    return {
        "type": "related",
        "title": store.phrases.get("ask_more", language),
        "items": [ser.to_service_summary(store, r, language).model_dump() for r in records],
    }


def _faq_text(store: KnowledgeStore, record: ServiceRecord, language: str) -> str:
    if not record.faq:
        return ""
    lines = [store.phrases.get("section_headings.faq", language)]
    for item in record.faq[:3]:
        lines.append(f"• {pick(item.q, language)} — {pick(item.a, language)}")
    return "\n".join(lines)


def _speak(*parts: str) -> str:
    return " ".join(p.strip() for p in parts if p and p.strip())


# --- Answer builders --------------------------------------------------------


def compose_service_answer(
    store: KnowledgeStore,
    record: ServiceRecord,
    analysis: Analysis,
    language: str,
    related: list[ServiceRecord] | None = None,
) -> ComposedAnswer:
    """Full guidance for an identified service."""
    name = record.name(language)
    intro = f"{store.phrases.get('service_found_prefix', language)} {name}"
    tagline = pick(record.tagline, language)

    blocks: list[dict[str, Any]] = [
        {"type": "text", "text": intro, "tone": "positive"},
        _service_card_block(store, record, language),
    ]
    if tagline:
        blocks.append({"type": "text", "text": tagline})

    blocks.extend(
        [
            _eligibility_block(store, record, language),
            _documents_block(store, record, language),
            _steps_block(store, record, language),
            _notes_block(store, record, language),
            _source_block(store, record, language),
            _journey_cta_block(store, record, language),
        ]
    )

    related_block = _related_block(store, related or [], language)
    if related_block:
        blocks.append(related_block)

    first_step = pick(record.steps[0].title, language) if record.steps else ""
    spoken = _speak(
        store.phrases.get("service_found", language),
        name + ".",
        tagline,
        f"{store.phrases.get('next_step', language)}: {first_step}" if first_step else "",
    )

    text = "\n\n".join(
        [intro, pick(record.description, language)] + [f"{store.phrases.get('next_step', language)}: {first_step}"]
    )

    return ComposedAnswer(text=text, spoken_text=spoken, blocks=blocks, grounded=True)


def compose_followup(
    store: KnowledgeStore,
    record: ServiceRecord,
    aspect: str,
    language: str,
) -> ComposedAnswer:
    """A focused answer to a follow-up about the service already in view."""
    name = record.name(language)
    blocks: list[dict[str, Any]] = []
    text = ""
    spoken = ""

    if aspect == "documents":
        blocks.append(_documents_block(store, record, language))
        required = [pick(d.name, language) for d in record.documents if d.required][:MAX_SPOKEN_ITEMS]
        text = store.phrases.get("section_headings.documents", language) + ": " + ", ".join(required)
        spoken = _speak(
            f"{name} — " + store.phrases.get("quick_actions.documents", language),
            ", ".join(required),
        )
    elif aspect == "eligibility":
        blocks.append(_eligibility_block(store, record, language))
        items = [pick(i, language) for i in record.eligibility][:MAX_SPOKEN_ITEMS]
        text = "\n".join(f"• {i}" for i in items)
        spoken = _speak(name + ".", *items[:2])
    elif aspect == "steps":
        blocks.append(_steps_block(store, record, language))
        titles = [pick(s.title, language) for s in record.steps][:MAX_SPOKEN_ITEMS]
        text = "\n".join(f"{i + 1}. {t}" for i, t in enumerate(titles))
        spoken = _speak(name + ".", ", ".join(titles))
    elif aspect == "portal":
        blocks.append(_source_block(store, record, language))
        text = f"{pick(record.official_source, language)} — {record.official_url}"
        spoken = _speak(
            store.phrases.get("section_headings.source", language) + ":",
            pick(record.official_source, language) + ".",
            store.phrases.get("visit_portal", language) + ".",
        )
    elif aspect in {"time_fee", "status"}:
        faq = _faq_text(store, record, language)
        blocks.append({"type": "text", "text": faq} if faq else _notes_block(store, record, language))
        blocks.append(_source_block(store, record, language))
        first_faq = pick(record.faq[0].a, language) if record.faq else pick(record.verification.note, language)
        text = first_faq
        spoken = _speak(name + ".", first_faq)
    elif aspect == "faq":
        faq = _faq_text(store, record, language)
        blocks.append({"type": "text", "text": faq or pick(record.description, language)})
        text = faq or pick(record.description, language)
        spoken = _speak(name + ".", pick(record.faq[0].a, language) if record.faq else pick(record.tagline, language))
    else:
        return compose_service_answer(store, record, Analysis(intent_type="followup", language=language), language)

    blocks.append(_journey_cta_block(store, record, language))
    return ComposedAnswer(text=text, spoken_text=spoken, blocks=blocks, grounded=True)


def compose_clarification(
    store: KnowledgeStore,
    analysis: Analysis,
    language: str,
) -> ComposedAnswer:
    """Ask one short question instead of guessing."""
    kind = analysis.clarification_kind
    blocks: list[dict[str, Any]] = []

    if kind == "confused":
        question = store.phrases.get("confused_user", language)
        options = [
            {"id": key, "label": store.phrases.get(f"confused_options.{key}", language)}
            for key in ("scholarship", "job", "bank", "govt_service", "medical", "housing", "pension", "other")
        ]
        blocks.append({"type": "text", "text": question})
        blocks.append(
            {
                "type": "clarification",
                "question": store.phrases.get("confused_options_title", language),
                "reason": "user_confused",
                "options": options,
                "allow_free_text": True,
            }
        )
        spoken = question
        text = question
    else:
        # Category is clear but the service is not: offer the services inside it.
        category_id = analysis.category_id
        category = store.get_category(category_id) if category_id else None
        services = store.services_by_category(category_id) if category_id else []

        lead = store.phrases.get("low_confidence", language)
        blocks.append({"type": "text", "text": lead})

        if category:
            question = (
                f"{category.name(language)} — "
                + store.phrases.get("low_confidence_options_title", language)
            )
        else:
            question = store.phrases.get("low_confidence_options_title", language)

        options = [
            {"id": service.id, "label": service.name(language)} for service in services[:6]
        ]
        if not options:
            # No category signal — offer the strongest retrieved candidates only.
            # Never pad the list with unrelated services: that is how a chatbot
            # starts guessing.
            by_id = {c.service_id: c for c in analysis.candidates}
            options = [
                {"id": service.id, "label": service.name(language)}
                for service in store.all_services()
                if by_id.get(service.id) and by_id[service.id].confidence >= 0.30
            ][:6]
        options.append({"id": "__other__", "label": store.phrases.get("confused_options.other", language)})

        blocks.append(
            {
                "type": "clarification",
                "question": question,
                "reason": kind,
                "options": options,
                "allow_free_text": True,
            }
        )
        spoken = _speak(lead, question)
        text = f"{lead}\n\n{question}\n" + "\n".join(f"• {o['label']}" for o in options)

    if analysis.category_id and kind != "confused":
        category_block = _category_block(store, [analysis.category_id], language)
        if category_block:
            blocks.append(category_block)

    return ComposedAnswer(text=text, spoken_text=spoken, blocks=blocks, grounded=True)


def _category_block(
    store: KnowledgeStore, category_ids: list[str] | None, language: str
) -> dict[str, Any] | None:
    categories = ser.all_categories(store, language)
    if category_ids:
        categories = [c for c in categories if c.id in category_ids] or categories
    if not categories:
        return None
    return {
        "type": "related",
        "title": store.phrases.get("related_title", language),
        "items": [svc.model_dump() for cat in categories for svc in cat.services],
    }


def compose_browse(store: KnowledgeStore, language: str) -> ComposedAnswer:
    """Show the whole catalogue, grouped by category."""
    categories = ser.all_categories(store, language)
    blocks: list[dict[str, Any]] = [
        {"type": "text", "text": store.phrases.get("greeting", language)},
        {
            "type": "related",
            "title": store.phrases.get("related_title", language),
            "items": [svc.model_dump() for cat in categories for svc in cat.services],
        },
    ]
    # `categories` holds API-schema objects, where `name` is a plain string.
    text = "\n".join(
        f"{c.name}: " + ", ".join(s.name for s in c.services) for c in categories
    )
    spoken = _speak(
        store.phrases.get("greeting", language),
        store.phrases.get("ask_more", language),
    )
    return ComposedAnswer(text=text, spoken_text=spoken, blocks=blocks, grounded=True)


def compose_greeting(store: KnowledgeStore, language: str) -> ComposedAnswer:
    text = store.phrases.get("greeting", language)
    blocks: list[dict[str, Any]] = [{"type": "text", "text": text, "tone": "positive"}]
    grid = _category_block(store, None, language)
    if grid:
        blocks.append(grid)
    return ComposedAnswer(text=text, spoken_text=text, blocks=blocks, grounded=True)


def compose_gratitude(store: KnowledgeStore, language: str) -> ComposedAnswer:
    text = store.phrases.get("ask_more", language)
    return ComposedAnswer(
        text=text,
        spoken_text=text,
        blocks=[{"type": "text", "text": text, "tone": "positive"}],
        grounded=True,
    )


def compose_not_found(store: KnowledgeStore, analysis: Analysis, language: str) -> ComposedAnswer:
    """SAARTHI could not verify the request — say so plainly, never invent."""
    text = store.phrases.get("not_found", language)
    blocks: list[dict[str, Any]] = [
        {"type": "text", "text": text, "tone": "warning"},
        {
            "type": "text",
            "text": store.phrases.get("prototype_notice", language),
            "tone": "neutral",
        },
    ]
    grid = _category_block(store, [analysis.category_id] if analysis.category_id else None, language)
    if grid:
        blocks.append(grid)
    blocks.append({"type": "privacy", "text": store.phrases.get("privacy_notice", language)})
    return ComposedAnswer(text=text, spoken_text=text, blocks=blocks, grounded=True)


def compose_unsupported_language(store: KnowledgeStore, language_code: str) -> ComposedAnswer:
    """A language SAARTHI cannot serve yet. Answer in English and Hindi."""
    english = store.phrases.get("errors.unsupported_language", "en")
    hindi = store.phrases.get("errors.unsupported_language", "hi")
    text = f"{english}\n\n{hindi}"
    return ComposedAnswer(
        text=text,
        spoken_text=english,
        blocks=[{"type": "text", "text": text, "tone": "warning"}],
        grounded=True,
        notes=f"unsupported_language:{language_code}",
    )


def compose_error(store: KnowledgeStore, key: str, language: str) -> ComposedAnswer:
    text = store.phrases.get(f"errors.{key}", language) or store.phrases.get(
        "errors.server_error", language
    )
    return ComposedAnswer(
        text=text,
        spoken_text=text,
        blocks=[{"type": "text", "text": text, "tone": "error"}],
        grounded=True,
        notes=f"error:{key}",
    )


def describe_entities(entities: Entities, store: KnowledgeStore, language: str) -> str:
    """Short human-readable summary of what SAARTHI picked up (for debugging UI)."""
    parts: list[str] = []
    if entities.state:
        parts.append(f"state={entities.state}")
    if entities.study_level:
        parts.append(f"study_level={entities.study_level}")
    if entities.age:
        parts.append(f"age={entities.age}")
    if entities.purpose:
        parts.append(f"purpose={entities.purpose}")
    if entities.pension_type:
        parts.append(f"pension_type={entities.pension_type}")
    return ", ".join(parts)
