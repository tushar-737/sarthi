"""The knowledge store: loads and validates every verified record.

This is the single place the rest of the backend gets service facts from.
Nothing in the AI layer is allowed to invent government information — if it
is not in here, SAARTHI says it cannot verify it.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from app.config import KNOWLEDGE_DATA_DIR
from app.knowledge.models import Category, Phrases, ServiceRecord
from app.utils.logging import get_logger

logger = get_logger("knowledge.store")

SERVICES_DIR = KNOWLEDGE_DATA_DIR / "services"


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


class KnowledgeStore:
    """In-memory, read-only view over the verified knowledge base."""

    def __init__(self, data_dir: Path = KNOWLEDGE_DATA_DIR) -> None:
        self.data_dir = data_dir
        self.categories: dict[str, Category] = {}
        self.services: dict[str, ServiceRecord] = {}
        self.phrases = Phrases()
        self.version = "0.0.0"
        self.last_updated = ""
        self._service_order: list[str] = []
        self.load()

    # --- loading ---------------------------------------------------------
    def load(self) -> None:
        categories_payload = _load_json(self.data_dir / "categories.json")
        self.categories = {
            item["id"]: Category(**item) for item in categories_payload.get("categories", [])
        }

        phrases_payload = _load_json(self.data_dir / "phrases.json")
        self.phrases = Phrases(raw=phrases_payload)

        services_dir = self.data_dir / "services"
        service_files = sorted(services_dir.glob("*.json"))
        services: dict[str, ServiceRecord] = {}
        for path in service_files:
            payload = _load_json(path)
            record = ServiceRecord(**payload)
            if record.id in services:
                raise ValueError(f"Duplicate service id '{record.id}' in {path.name}")
            if record.category_id not in self.categories:
                raise ValueError(
                    f"Service '{record.id}' references unknown category '{record.category_id}'"
                )
            services[record.id] = record

        self.services = services
        self._service_order = sorted(
            services, key=lambda sid: (-services[sid].priority, services[sid].id)
        )
        self.version = str(categories_payload.get("version", "1.0.0"))
        self.last_updated = str(categories_payload.get("last_updated", ""))
        logger.info(
            "knowledge base loaded: %d services, %d categories",
            len(self.services),
            len(self.categories),
        )

    # --- queries ---------------------------------------------------------
    def all_services(self) -> list[ServiceRecord]:
        return [self.services[sid] for sid in self._service_order]

    def get_service(self, service_id: str) -> ServiceRecord | None:
        return self.services.get(service_id)

    def get_category(self, category_id: str) -> Category | None:
        return self.categories.get(category_id)

    def services_by_category(self, category_id: str) -> list[ServiceRecord]:
        return [s for s in self.all_services() if s.category_id == category_id]

    def services_by_ids(self, ids: list[str]) -> list[ServiceRecord]:
        return [self.services[i] for i in ids if i in self.services]

    def stats(self) -> dict[str, int | str]:
        return {
            "services": len(self.services),
            "categories": len(self.categories),
            "version": self.version,
            "last_updated": self.last_updated,
        }


@lru_cache
def get_knowledge_store() -> KnowledgeStore:
    return KnowledgeStore()


def reload_knowledge_store() -> KnowledgeStore:
    """Force a reload (used by tests and the admin refresh endpoint)."""
    get_knowledge_store.cache_clear()
    return get_knowledge_store()
