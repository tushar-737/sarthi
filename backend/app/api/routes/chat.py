"""POST /api/chat — the main conversational endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import enforce_rate_limit, get_db
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.chat_service import ChatService, get_chat_service

router = APIRouter(tags=["chat"])


def chat_service() -> ChatService:
    return get_chat_service()


@router.post("/chat", response_model=ChatResponse, summary="Process a citizen query")
def post_chat(
    request: Request,
    payload: ChatRequest,
    session: Session = Depends(get_db),
    service: ChatService = Depends(chat_service),
) -> ChatResponse:
    """Understand a citizen's message and return grounded, structured guidance.

    Works with typed text (`input_mode="text"`), a browser speech transcript
    (`input_mode="voice"`) or a tapped quick-reply option
    (`input_mode="quick_reply"`).
    """
    enforce_rate_limit(request)
    return service.handle(payload, session=session)
