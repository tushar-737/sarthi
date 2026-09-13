"""Shared API dependencies: database session, rate limiting, client identity."""

from __future__ import annotations

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database.session import get_session
from app.utils.ratelimit import rate_limiter


def db_session() -> Session:  # pragma: no cover - re-export for FastAPI Depends
    raise NotImplementedError


def get_db():
    """FastAPI dependency yielding a database session."""
    yield from get_session()


def client_key(request: Request) -> str:
    """Best-effort anonymous client identity.

    Uses the peer address (and X-Forwarded-For when behind a proxy). No cookies,
    no device fingerprinting, nothing that persists across sessions.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def enforce_rate_limit(request: Request) -> None:
    """Reject abusive traffic with a plain-language message, never a stack trace."""
    if not settings.rate_limit_enabled:
        return
    result = rate_limiter.check(client_key(request))
    if not result.allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "rate_limited",
                "message": "You have asked many questions quickly. Please wait a moment and try again.",
                "retry_after_seconds": result.retry_after_seconds,
            },
            headers={"Retry-After": str(result.retry_after_seconds)},
        )
