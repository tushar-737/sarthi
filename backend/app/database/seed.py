"""Seed the database mirror from the verified knowledge base.

Runs on startup. It is idempotent and safe to re-run after editing any JSON
record, which is what makes the knowledge base easy to extend during a
hackathon: drop in a new service file, restart, done.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.knowledge.base import KnowledgeStore, get_knowledge_store
from app.models.db_models import CategoryRow, ServiceRow
from app.utils.logging import get_logger

logger = get_logger("database.seed")


def sync_categories(session: Session, store: KnowledgeStore) -> int:
    existing = {row.id for row in session.scalars(select(CategoryRow)).all()}
    count = 0
    for category in store.categories.values():
        payload = category.model_dump()
        if category.id in existing:
            row = session.get(CategoryRow, category.id)
            if row is None:  # pragma: no cover - defensive
                continue
            row.icon = category.icon
            row.order_index = category.order
            row.name_en = category.names.get("en", "")
            row.name_hi = category.names.get("hi", "")
            row.description_en = category.description.get("en", "")
            row.description_hi = category.description.get("hi", "")
            row.payload = payload
        else:
            session.add(
                CategoryRow(
                    id=category.id,
                    icon=category.icon,
                    order_index=category.order,
                    name_en=category.names.get("en", ""),
                    name_hi=category.names.get("hi", ""),
                    description_en=category.description.get("en", ""),
                    description_hi=category.description.get("hi", ""),
                    payload=payload,
                )
            )
        count += 1
    return count


def sync_services(session: Session, store: KnowledgeStore) -> int:
    existing = {row.id for row in session.scalars(select(ServiceRow)).all()}
    count = 0
    for service in store.all_services():
        payload = service.model_dump()
        values = dict(
            category_id=service.category_id,
            jurisdiction=service.jurisdiction,
            priority=service.priority,
            name_en=service.names.get("en", ""),
            name_hi=service.names.get("hi", ""),
            official_source_en=service.official_source.get("en", ""),
            official_url=service.official_url,
            verification_level=service.verification.level,
            last_verified=service.verification.last_verified,
            step_count=len(service.steps),
            document_count=len(service.documents),
            payload=payload,
        )
        if service.id in existing:
            row = session.get(ServiceRow, service.id)
            if row is None:  # pragma: no cover - defensive
                continue
            for key, value in values.items():
                setattr(row, key, value)
        else:
            session.add(ServiceRow(id=service.id, **values))
        count += 1
    return count


def seed_database(store: KnowledgeStore | None = None) -> dict[str, int]:
    """Create tables if needed and sync the knowledge base into them."""
    from app.database.session import init_db, session_scope

    store = store or get_knowledge_store()
    init_db()
    with session_scope() as session:
        categories = sync_categories(session, store)
        services = sync_services(session, store)
    logger.info("database synced: %d categories, %d services", categories, services)
    return {"categories": categories, "services": services}
