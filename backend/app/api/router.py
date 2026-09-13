"""Aggregates all API routers under a single prefix."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import categories, chat, languages, meta, services, voice

api_router = APIRouter()
api_router.include_router(chat.router)
api_router.include_router(services.router)
api_router.include_router(categories.router)
api_router.include_router(languages.router)
api_router.include_router(voice.router)
api_router.include_router(meta.router)

__all__ = ["api_router"]
