"""Health, configuration and knowledge-base metadata.

`/api/meta/config` ships the assistant's own copy (disclaimer, suggested
questions, error messages, section headings) so the UI and the backend never
drift apart on wording.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app import __version__
from app.ai.factory import get_ai_provider
from app.config import settings
from app.database.session import database_backend
from app.knowledge.base import get_knowledge_store, reload_knowledge_store
from app.knowledge.language import SUPPORTED_CODES, available_languages
from app.schemas.common import HealthOut

router = APIRouter(tags=["meta"])


class MetaConfigOut(BaseModel):
    app_name: str
    tagline: str
    version: str
    languages: list[str]
    default_language: str
    disclaimer: str
    prototype_notice: str
    privacy_notice: str
    demo_mode: bool
    ai_provider: str
    voice: dict = Field(default_factory=dict)
    knowledge_base: dict = Field(default_factory=dict)


@router.get("/health", response_model=HealthOut, summary="Service health")
def health() -> HealthOut:
    store = get_knowledge_store()
    provider = get_ai_provider()
    return HealthOut(
        status="ok",
        app=settings.app_name,
        version=__version__,
        demo_mode=bool(provider.demo_mode),
        ai_provider=provider.name,
        knowledge_base={k: v for k, v in store.stats().items()},
        languages=list(SUPPORTED_CODES),
    )


@router.get("/meta/config", response_model=MetaConfigOut, summary="UI copy and capabilities")
def meta_config(language: str = "hi") -> MetaConfigOut:
    store = get_knowledge_store()
    provider = get_ai_provider()
    lang = language if language in SUPPORTED_CODES else settings.default_language
    return MetaConfigOut(
        app_name=settings.app_name,
        tagline=settings.app_tagline,
        version=__version__,
        languages=[l.code for l in available_languages()],
        default_language=settings.default_language,
        disclaimer=store.phrases.get("disclaimer", lang),
        prototype_notice=store.phrases.get("prototype_notice", lang),
        privacy_notice=store.phrases.get("privacy_notice", lang),
        demo_mode=bool(provider.demo_mode),
        ai_provider=provider.name,
        voice={
            "server_stt_available": provider.supports_transcription,
            "speech_locales": [l.speech_locale for l in available_languages()],
        },
        knowledge_base={
            "services": store.stats()["services"],
            "categories": store.stats()["categories"],
            "last_updated": store.stats()["last_updated"],
            "database": database_backend(),
        },
    )


@router.get("/meta/phrases", summary="All assistant copy in one language")
def phrases(language: str = "hi") -> dict:
    """Localised copy for section headings, labels and error messages."""
    store = get_knowledge_store()
    lang = language if language in SUPPORTED_CODES else settings.default_language

    def localize(node):
        if isinstance(node, dict):
            if "en" in node and "hi" in node and all(
                isinstance(v, str) for v in node.values()
            ):
                return node.get(lang) or node.get("en") or node.get("hi")
            return {k: localize(v) for k, v in node.items()}
        if isinstance(node, list):
            return [localize(item) for item in node]
        return node

    return localize(store.phrases.raw)


@router.post("/meta/reload", summary="Reload the knowledge base from disk")
def reload_knowledge() -> dict:
    """Development helper: pick up edited JSON without restarting the server."""
    store = reload_knowledge_store()
    from app.ai.factory import reset_providers
    from app.api.routes.services import reset_retriever_cache
    from app.database.seed import seed_database
    from app.services.chat_service import reset_chat_service

    reset_retriever_cache()
    reset_providers()
    reset_chat_service()
    seeded = seed_database(store)
    return {"status": "reloaded", "stats": store.stats(), "database": seeded}
