"""SAARTHI AI — FastAPI application entrypoint.

Kept deliberately thin: routing, middleware, error handling and lifecycle.
All real behaviour lives in `app/services`, `app/ai` and `app/knowledge`.
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import __version__
from app.api.router import api_router
from app.config import settings
from app.database.seed import seed_database
from app.database.session import database_backend, init_db
from app.utils.logging import get_logger, setup_logging
from app.utils.ratelimit import configure as configure_rate_limiter

logger = get_logger("main")

FRIENDLY_HTTP_MESSAGES = {
    400: "That request did not look right. Please try again.",
    404: "I could not find that. Please check and try again.",
    413: "That was too large. Please try something smaller.",
    415: "That file type is not supported.",
    429: "You have asked many questions quickly. Please wait a moment and try again.",
    500: "Something went wrong on my side. Please try again in a moment.",
    503: "I am temporarily unavailable. Please try again in a moment.",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("starting %s v%s", settings.app_name, __version__)

    # Knowledge base first: everything else depends on it being valid.
    from app.knowledge.base import get_knowledge_store

    store = get_knowledge_store()
    logger.info("knowledge base: %s", store.stats())

    init_db()
    seed_database(store)
    configure_rate_limiter(
        settings.rate_limit_requests, settings.rate_limit_window_seconds
    )

    from app.ai.factory import get_ai_provider

    provider = get_ai_provider()
    if provider.demo_mode:
        logger.warning(
            "DEMO MODE: no external AI key configured — answers come from the "
            "built-in verified knowledge base"
        )
    else:
        logger.info("AI provider: %s", provider.name)

    yield

    logger.info("shutting down")


app = FastAPI(
    title=settings.app_name,
    description=(
        "Voice-first multilingual digital public service assistant. "
        "Guidance is grounded in a verified knowledge base; SAARTHI never "
        "invents government information."
    ),
    version=__version__,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,  # no cookies, no accounts: nothing to be stolen
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "X-Language"],
    max_age=600,
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Baseline hardening. Cheap, and it keeps the prototype honest."""
    start = time.perf_counter()
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault(
        "Permissions-Policy", "geolocation=(), payment=(), camera=()"
    )
    response.headers.setdefault(
        "X-Response-Time-Ms", str(int((time.perf_counter() - start) * 1000))
    )
    return response


def _error_body(code: str, message: str, status_code: int) -> dict:
    return {
        "error": {
            "code": code,
            "message": message,
            "status": status_code,
            # Never a stack trace: citizens should see one plain sentence.
            "support_hint": "You can also type your question instead of speaking.",
        }
    }


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail
    if isinstance(detail, dict) and "message" in detail:
        return JSONResponse(status_code=exc.status_code, content={"error": detail})
    message = FRIENDLY_HTTP_MESSAGES.get(exc.status_code, str(detail))
    code = {404: "not_found", 429: "rate_limited", 400: "bad_request"}.get(
        exc.status_code, "http_error"
    )
    return JSONResponse(
        status_code=exc.status_code, content=_error_body(code, message, exc.status_code)
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return a plain sentence instead of Pydantic's technical detail list."""
    logger.info("validation error on %s: %s", request.url.path, exc.errors()[:1])
    return JSONResponse(
        status_code=422,
        content=_error_body(
            "invalid_request",
            "I could not read that request. Please try again, or type your question.",
            422,
        ),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("unhandled error on %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content=_error_body("server_error", FRIENDLY_HTTP_MESSAGES[500], 500),
    )


app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="/api/health")


@app.get("/api", include_in_schema=False)
def api_index() -> dict:
    return {
        "app": settings.app_name,
        "tagline": settings.app_tagline,
        "version": __version__,
        "demo_mode": settings.demo_mode_default,
        "database": database_backend(),
        "endpoints": {
            "health": "/api/health",
            "config": "/api/meta/config",
            "chat": "POST /api/chat",
            "voice_process": "POST /api/voice/process",
            "voice_transcribe": "POST /api/voice/transcribe",
            "voice_support": "GET /api/voice/support",
            "services": "GET /api/services",
            "service_detail": "GET /api/services/{id}",
            "service_search": "POST /api/service/search",
            "journey": "GET /api/services/{id}/journey",
            "journey_progress": "POST /api/services/{id}/journey/progress",
            "categories": "GET /api/categories",
            "languages": "GET /api/languages",
            "phrases": "GET /api/meta/phrases",
            "docs": "/api/docs",
        },
        "notice": "Hackathon prototype. Not affiliated with any government body.",
    }
