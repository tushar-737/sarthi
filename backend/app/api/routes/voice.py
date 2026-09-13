"""Voice endpoints.

Two paths, because voice must never be the only way in:

* `POST /api/voice/process` — the browser already transcribed the speech
  (Web Speech API). SAARTHI understands it and, by default, answers straight
  away so the citizen does not have to press send twice.
* `POST /api/voice/transcribe` — the browser has no speech recognition, so the
  frontend uploads a MediaRecorder blob. Requires an AI provider with
  speech-to-text; otherwise it returns a clear, spoken-language explanation and
  the frontend falls back to the text box.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.ai.factory import get_ai_provider
from app.api.deps import enforce_rate_limit, get_db
from app.config import settings
from app.knowledge.language import SUPPORTED_CODES, available_languages
from app.schemas.chat import ChatRequest, ChatResponse
from app.schemas.voice import (
    AudioRecognitionSupport,
    VoiceProcessRequest,
    VoiceProcessResponse,
    VoiceTranscriptionOut,
)
from app.services.chat_service import get_chat_service

router = APIRouter(prefix="/voice", tags=["voice"])


@router.get("/support", response_model=AudioRecognitionSupport, summary="Voice capabilities")
def voice_support() -> AudioRecognitionSupport:
    """Tells the frontend which voice path to offer."""
    provider = get_ai_provider()
    server_stt = provider.supports_transcription
    locales = [lang.speech_locale for lang in available_languages()]
    return AudioRecognitionSupport(
        browser_stt_available=True,  # the frontend probes the real capability
        server_stt_available=server_stt,
        recommended_mode="browser",
        supported_locales=locales,
        notice=(
            "Voice input is optional. You can always type your question instead."
            if not server_stt
            else "Voice input is optional. You can always type your question instead."
        ),
    )


@router.post(
    "/process",
    response_model=VoiceProcessResponse,
    summary="Understand a spoken (already transcribed) request",
)
def process_voice(
    request: Request,
    payload: VoiceProcessRequest,
    session: Session = Depends(get_db),
) -> VoiceProcessResponse:
    enforce_rate_limit(request)

    transcript = (payload.transcript or "").strip()
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "empty_transcript",
                "message": "I did not catch that. Please try speaking again, or type your question.",
            },
        )

    language = payload.language if payload.language in SUPPORTED_CODES else None
    transcription = VoiceTranscriptionOut(
        ok=True,
        transcript=transcript,
        language=language,
        provider="browser",
    )

    # Show the transcript for confirmation unless the client asked to submit
    # straight away — editing a mis-heard word matters more than saving a tap.
    if not payload.auto_submit:
        return VoiceProcessResponse(
            transcription=transcription,
            chat=None,
            needs_confirmation=True,
        )

    chat_request = ChatRequest(
        message=transcript,
        language=language,
        conversation_id=payload.conversation_id,
        active_service_id=payload.active_service_id,
        pending_clarifier_id=payload.pending_clarifier_id,
        clarifier_answer=payload.clarifier_answer,
        state=payload.state,
        input_mode="voice",
    )
    response: ChatResponse = get_chat_service().handle(chat_request, session=session)
    return VoiceProcessResponse(
        transcription=transcription, chat=response, needs_confirmation=False
    )


@router.post(
    "/transcribe",
    response_model=VoiceTranscriptionOut,
    summary="Transcribe an uploaded audio recording",
)
async def transcribe_audio(
    request: Request,
    file: UploadFile = File(...),
    language: str | None = Form(default=None),
) -> VoiceTranscriptionOut:
    enforce_rate_limit(request)

    provider = get_ai_provider()

    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type and content_type not in settings.allowed_audio_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "code": "audio_unsupported",
                "message": "That audio format is not supported. Please record again.",
            },
        )

    audio = await file.read()
    if not audio:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "audio_empty", "message": "The recording was empty."},
        )
    if len(audio) > settings.max_audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "code": "audio_too_large",
                "message": "That recording is too long. Please speak for under a minute.",
            },
        )

    if not provider.supports_transcription:
        # Demo Mode has no speech-to-text engine. Say so plainly; the frontend
        # then offers the text box rather than failing silently.
        return VoiceTranscriptionOut(
            ok=False,
            provider=provider.name,
            error_code="transcription_unavailable",
            message=(
                "Voice recording needs an AI service with speech-to-text, which is not "
                "configured right now. Please type your question instead — everything "
                "else works exactly the same."
            ),
        )

    try:
        transcript = provider.transcribe(audio, language=language)
    except NotImplementedError:
        return VoiceTranscriptionOut(
            ok=False,
            provider=provider.name,
            error_code="transcription_unavailable",
            message="Speech-to-text is not available right now. Please type your question.",
        )
    except Exception:
        return VoiceTranscriptionOut(
            ok=False,
            provider=provider.name,
            error_code="transcription_failed",
            message="Sorry, I could not hear you clearly. Please try again or type your question.",
        )

    if not transcript.strip():
        return VoiceTranscriptionOut(
            ok=True,
            provider=provider.name,
            error_code="transcription_failed",
            message="I did not catch that. Please try speaking again, closer to the microphone.",
        )

    return VoiceTranscriptionOut(
        ok=True,
        transcript=transcript.strip(),
        provider=provider.name,
    )
