"""Shared pytest fixtures."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Tests must never depend on a real API key or a shared database file.
os.environ.setdefault("AI_PROVIDER", "local")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{Path(tempfile.gettempdir()) / 'sarthi_test.sqlite3'}")


@pytest.fixture(scope="session")
def store():
    from app.knowledge.base import get_knowledge_store

    return get_knowledge_store()


@pytest.fixture(scope="session")
def retriever(store):
    from app.knowledge.retriever import Retriever

    return Retriever(store)


@pytest.fixture(scope="session")
def analyzer(store, retriever):
    from app.ai.intent import IntentAnalyzer

    return IntentAnalyzer(store, retriever)


@pytest.fixture(scope="session")
def provider(store):
    from app.ai.local_provider import LocalProvider

    return LocalProvider(store)


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
