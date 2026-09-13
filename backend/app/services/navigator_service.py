"""Service Navigator — the guided journey.

This is SAARTHI's core differentiator: instead of dumping information, it walks
a citizen through an ordered journey and remembers where they got to, using an
opaque local id (no account, no personal data).
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.knowledge.base import KnowledgeStore, get_knowledge_store
from app.knowledge.language import normalize_language
from app.models.db_models import NavigatorProgress
from app.schemas.service import JourneyOut, JourneyProgressOut
from app.services import serialization as ser
from app.utils.logging import get_logger

logger = get_logger("services.navigator")


class NavigatorService:
    def __init__(self, store: KnowledgeStore | None = None) -> None:
        self.store = store or get_knowledge_store()

    def journey_for(self, service_id: str, language: str | None = None) -> JourneyOut | None:
        record = self.store.get_service(service_id)
        if not record:
            return None
        return ser.to_journey(self.store, record, normalize_language(language))

    def progress(
        self,
        session: Session,
        *,
        service_id: str,
        language: str | None = None,
        progress_id: str | None = None,
        completed_steps: list[str] | None = None,
        current_step: int = 1,
    ) -> JourneyProgressOut | None:
        """Read or create journey progress, clamped to the real step count."""
        journey = self.journey_for(service_id, language)
        if journey is None:
            return None

        language_code = normalize_language(language)
        total = journey.total_steps
        completed = [
            step_id
            for step_id in (completed_steps or [])
            if step_id in {s.id for s in journey.steps}
        ]
        current = max(1, min(current_step, total))

        row: NavigatorProgress | None = None
        if progress_id:
            row = session.get(NavigatorProgress, progress_id)
            if row is not None and row.service_id != service_id:
                row = None  # id belongs to another service; start fresh
        else:
            row = session.scalar(
                select(NavigatorProgress)
                .where(NavigatorProgress.service_id == service_id)
                .order_by(NavigatorProgress.updated_at.desc())
                .limit(1)
            )

        if row is None:
            row = NavigatorProgress(
                id=progress_id or f"nav_{uuid.uuid4().hex[:16]}",
                service_id=service_id,
                language=language_code,
                current_step=current,
                completed_steps=completed,
            )
            session.add(row)
        else:
            row.current_step = current
            row.completed_steps = completed
            row.language = language_code
        session.commit()

        percent = int(round(len(completed) / total * 100)) if total else 0
        return JourneyProgressOut(
            service_id=service_id,
            current_step=current,
            total_steps=total,
            completed_steps=completed,
            percent_complete=min(percent, 100),
            journey=journey,
        )


_navigator: NavigatorService | None = None


def get_navigator_service() -> NavigatorService:
    global _navigator
    if _navigator is None:
        _navigator = NavigatorService()
    return _navigator
