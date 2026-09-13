"""Language endpoints.

Returns every language SAARTHI knows about, marking the ones that are not live
yet as `planned`. The UI can therefore show the roadmap honestly instead of
offering a selector that silently does nothing.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.knowledge.language import SUPPORTED_CODES, available_languages, load_languages
from app.schemas.service import LanguageOut

router = APIRouter(tags=["languages"])


@router.get("/languages", response_model=list[LanguageOut], summary="Supported languages")
def list_languages(available_only: bool = Query(default=False)) -> list[LanguageOut]:
    languages = available_languages() if available_only else list(load_languages())
    languages.sort(key=lambda lang: lang.order)
    return [LanguageOut(**lang.model_dump()) for lang in languages]


@router.get("/languages/default", response_model=dict, summary="Default language")
def default_language() -> dict:
    return {"code": SUPPORTED_CODES[0], "supported": list(SUPPORTED_CODES)}
