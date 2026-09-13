"""ORM models.

The verified knowledge base JSON remains the source of truth; these tables are
a queryable mirror plus the small amount of runtime state SAARTHI keeps.

Privacy by design — what is deliberately NOT stored:
* no accounts, no names, no phone numbers, no email addresses
* no Aadhaar / PAN / bank / card numbers (the safety layer redacts them before
  anything is written)
* conversation logs store a redacted, truncated query only, and can be disabled
  entirely with LOG_CONVERSATIONS=false
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CategoryRow(Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    icon: Mapped[str] = mapped_column(String(64), default="folder")
    order_index: Mapped[int] = mapped_column(Integer, default=50)
    name_en: Mapped[str] = mapped_column(String(200), default="")
    name_hi: Mapped[str] = mapped_column(String(200), default="")
    description_en: Mapped[str] = mapped_column(Text, default="")
    description_hi: Mapped[str] = mapped_column(Text, default="")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)


class ServiceRow(Base):
    """Queryable mirror of a verified service record."""

    __tablename__ = "services"

    id: Mapped[str] = mapped_column(String(96), primary_key=True)
    category_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("categories.id", ondelete="CASCADE"), index=True
    )
    jurisdiction: Mapped[str] = mapped_column(String(16), default="national")
    priority: Mapped[int] = mapped_column(Integer, default=50)
    name_en: Mapped[str] = mapped_column(String(200), default="")
    name_hi: Mapped[str] = mapped_column(String(200), default="")
    official_source_en: Mapped[str] = mapped_column(String(300), default="")
    official_url: Mapped[str] = mapped_column(String(500), default="")
    verification_level: Mapped[str] = mapped_column(String(32), default="general_guidance")
    last_verified: Mapped[str] = mapped_column(String(16), default="")
    step_count: Mapped[int] = mapped_column(Integer, default=0)
    document_count: Mapped[int] = mapped_column(Integer, default=0)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    __table_args__ = (Index("ix_services_verification", "verification_level"),)


class ConversationLog(Base):
    """Structural facts about a turn — never the citizen's personal data."""

    __tablename__ = "conversation_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[str] = mapped_column(String(64), index=True)
    message_id: Mapped[str] = mapped_column(String(64), index=True)
    language: Mapped[str] = mapped_column(String(8), default="hi")
    input_mode: Mapped[str] = mapped_column(String(16), default="text")
    intent_type: Mapped[str] = mapped_column(String(32), default="")
    service_id: Mapped[str | None] = mapped_column(String(96), nullable=True)
    category_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    provider: Mapped[str] = mapped_column(String(32), default="local")
    demo_mode: Mapped[bool] = mapped_column(Boolean, default=True)
    error_code: Mapped[str | None] = mapped_column(String(48), nullable=True)
    #: Redacted + truncated. Disabled entirely when LOG_CONVERSATIONS=false.
    query_redacted: Mapped[str] = mapped_column(String(160), default="")
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )


class NavigatorProgress(Base):
    """Guided-journey progress, keyed by an opaque local id (no accounts)."""

    __tablename__ = "navigator_progress"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    service_id: Mapped[str] = mapped_column(String(96), index=True)
    language: Mapped[str] = mapped_column(String(8), default="hi")
    current_step: Mapped[int] = mapped_column(Integer, default=1)
    completed_steps: Mapped[list] = mapped_column(JSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class PreferenceProfile(Base):
    """Lightweight, non-identifying personalisation.

    Holds only what genuinely improves guidance — a state code and a coarse
    "student / working / senior" hint. It never holds documents or identifiers.
    """

    __tablename__ = "preference_profiles"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    language: Mapped[str] = mapped_column(String(8), default="hi")
    state_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    profile_kind: Mapped[str | None] = mapped_column(String(24), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )
