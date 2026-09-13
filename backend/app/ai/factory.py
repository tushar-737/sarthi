"""Provider selection.

`AI_PROVIDER=auto` (the default) picks OpenAI when a key exists and otherwise
runs fully offline in Demo Mode. Swapping in another vendor later means adding
one more `AIProvider` subclass and one line here — nothing else in the app
changes, because the rest of the backend only ever sees the abstract interface.
"""

from __future__ import annotations

from functools import lru_cache

from app.ai.base import AIProvider
from app.ai.local_provider import LocalProvider
from app.config import settings
from app.knowledge.base import KnowledgeStore, get_knowledge_store
from app.utils.logging import get_logger

logger = get_logger("ai.factory")


@lru_cache
def get_local_provider() -> LocalProvider:
    return LocalProvider(get_knowledge_store())


@lru_cache
def get_ai_provider() -> AIProvider:
    store: KnowledgeStore = get_knowledge_store()
    mode = settings.resolved_provider()

    if mode == "openai" and settings.openai_api_key:
        from app.ai.openai_provider import OpenAIProvider  # local import: optional dependency

        logger.info("using OpenAI provider (model=%s)", settings.openai_model)
        return OpenAIProvider(store, fallback=get_local_provider())

    if mode == "openai" and not settings.openai_api_key:
        logger.warning("AI_PROVIDER=openai but OPENAI_API_KEY is missing — using Demo Mode")

    logger.info("using local deterministic provider (Demo Mode)")
    return get_local_provider()


def reset_providers() -> None:
    """Clear cached providers (used by tests and config reloads)."""
    get_ai_provider.cache_clear()
    get_local_provider.cache_clear()
