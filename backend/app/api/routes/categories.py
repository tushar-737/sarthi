"""Service category endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from app.knowledge.base import get_knowledge_store
from app.knowledge.language import normalize_language
from app.schemas.service import CategoryOut
from app.services import serialization as ser

router = APIRouter(tags=["categories"])


@router.get("/categories", response_model=list[CategoryOut], summary="List service categories")
def list_categories(
    language: str = Query(default="hi"),
    include_services: bool = Query(default=True),
) -> list[CategoryOut]:
    store = get_knowledge_store()
    lang = normalize_language(language)
    categories = ser.all_categories(store, lang)
    if not include_services:
        categories = [c.model_copy(update={"services": []}) for c in categories]
    return categories


@router.get(
    "/categories/{category_id}",
    response_model=CategoryOut,
    summary="One category with its services",
)
def get_category(category_id: str, language: str = Query(default="hi")) -> CategoryOut:
    store = get_knowledge_store()
    category = ser.to_category(store, category_id, normalize_language(language))
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "category_not_found", "message": "That category is not available."},
        )
    return category
