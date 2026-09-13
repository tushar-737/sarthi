"""Voice pipeline schemas.

SAARTHI accepts speech input in two ways:

1. **Browser transcription** — the Web Speech API produces text on the device
   and the frontend posts it to `/api/voice/process`. Preferred: no audio ever
   leaves the citizen's phone.
2. **Uploaded audio** — when the browser has no speech recognition, the
   frontend records with MediaRecorder and posts the blob. The backend hands it
   to the configured `AIProvider` for transcription, and falls back to a clear
   spoken-language error when no provider is available.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.chat import ChatResponse


class VoiceProcessRequest(BaseModel):
    """Transcript captured in the browser, ready to be understood."""

    transcript: str = Field(min_length=1, max_length=600)
    language: str | None = None
    speech_locale: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    conversation_id: str | None = None
    active_service_id: str | None = None
    pending_clarifier_id: str | None = None
    clarifier_answer: str | None = None
    state: str | None = None
    auto_submit: bool = False


class VoiceTranscriptionOut(BaseModel):
    """Result of server-side transcription of uploaded audio."""

    ok: bool
    transcript: str = ""
    language: str | None = None
    provider: str = ""
    error_code: Literal[
        "",
        "audio_too_large",
        "audio_unsupported",
        "transcription_unavailable",
        "transcription_failed",
        "audio_empty",
    ] = ""
    message: str = ""


class VoiceProcessResponse(BaseModel):
    transcription: VoiceTranscriptionOut | None = None
    # When a transcript is supplied (or auto_submit is set for uploaded audio)
    # SAARTHI answers straight away, so the citizen never has to press send
    # twice after speaking.
    chat: ChatResponse | None = None
    needs_confirmation: bool = False


class AudioRecognitionSupport(BaseModel):
    """Tells the frontend which voice path to use."""

    browser_stt_available: bool
    server_stt_available: bool
    recommended_mode: Literal["browser", "server", "text_only"]
    supported_locales: list[str] = Field(default_factory=list)
    notice: str = ""
