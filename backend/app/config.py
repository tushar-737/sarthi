"""Application configuration.

All settings are read from environment variables (or a local `.env` file).
Nothing secret is ever shipped to the frontend — see `docs/SECURITY.md`.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent
APP_ROOT = BACKEND_ROOT / "app"
KNOWLEDGE_DATA_DIR = APP_ROOT / "knowledge" / "data"
DATA_DIR = BACKEND_ROOT / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- App ---
    app_name: str = "SAARTHI AI"
    app_tagline: str = "Your Voice Companion for Digital Public Services"
    environment: str = "development"
    api_prefix: str = "/api"

    # --- CORS ---
    # Comma-separated list. The Vite dev server proxies /api, so browsers usually
    # talk to the same origin; this list only matters for direct cross-origin use.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Database ---
    # SQLite for local dev. Swap in a PostgreSQL URL in production, e.g.
    # postgresql+psycopg://user:pass@host:5432/sarthi
    database_url: str = f"sqlite:///{DATA_DIR / 'sarthi.sqlite3'}"
    db_echo: bool = False

    # --- AI provider ---
    # "auto"      -> use OpenAI when a key is present, otherwise the built-in
    #                deterministic local provider (Demo Mode).
    # "local"     -> always the built-in provider (offline-safe).
    # "openai"    -> require OpenAI; requests fail loudly if the key is missing.
    ai_provider: str = "auto"
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"
    ai_timeout_seconds: float = 12.0
    ai_temperature: float = 0.2

    # --- Retrieval tuning ---
    # Below `min_confidence` SAARTHI asks a clarifying question instead of guessing.
    retrieval_min_confidence: float = 0.42
    retrieval_top_k: int = 5

    # --- Voice ---
    max_audio_bytes: int = 12 * 1024 * 1024  # 12 MB
    allowed_audio_content_types: str = "audio/webm,audio/ogg,audio/wav,audio/mpeg,audio/mp4,audio/x-m4a"

    # --- Rate limiting (simple in-memory sliding window) ---
    rate_limit_enabled: bool = True
    rate_limit_requests: int = 20
    rate_limit_window_seconds: int = 60

    # --- Safety ---
    max_query_length: int = 600
    log_conversations: bool = True
    redact_pii_in_logs: bool = True

    # --- Supported languages ---
    default_language: str = "hi"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_audio_types(self) -> set[str]:
        return {c.strip() for c in self.allowed_audio_content_types.split(",") if c.strip()}

    @property
    def uses_openai(self) -> bool:
        """True when an OpenAI-backed provider is actually usable."""
        if self.ai_provider == "local":
            return False
        if self.ai_provider == "openai":
            return True
        return bool(self.openai_api_key)

    @property
    def demo_mode_default(self) -> bool:
        """Demo Mode = deterministic local provider is serving answers."""
        return not self.uses_openai

    def resolved_provider(self) -> str:
        if self.ai_provider in {"local", "openai"}:
            return self.ai_provider
        return "openai" if self.uses_openai else "local"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return settings


settings = get_settings()
