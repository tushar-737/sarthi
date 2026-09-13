"""Service catalogue, search and guided-journey endpoints."""

from __future__ import annotations

from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.config import settings
from app.knowledge.base import get_knowledge_store
from app.knowledge.language import detect_language, normalize_language
from app.knowledge.retriever import Retriever
from app.schemas.service import (
    JourneyOut,
    JourneyProgressOut,
    JourneyProgressRequest,
    ServiceDetail,
    ServiceListOut,
    ServiceSearchMatch,
    ServiceSearchOut,
    ServiceSearchRequest,
    ServiceSummary,
)
from app.services import serialization as ser
from app.services.navigator_service import get_navigator_service

router = APIRouter(tags=["services"])


@lru_cache
def _retriever() -> Retriever:
    """Cached index — small, immutable at runtime, expensive to rebuild."""
    return Retriever(get_knowledge_store())


def reset_retriever_cache() -> None:
    _retriever.cache_clear()


@router.get("/services", response_model=ServiceListOut, summary="List verified services")
def list_services(
    language: str = Query(default="hi"),
    category_id: str | None = Query(default=None),
) -> ServiceListOut:
    store = get_knowledge_store()
    lang = normalize_language(language)
    services = store.all_services()
    if category_id:
        services = [s for s in services if s.category_id == category_id]
    return ServiceListOut(
        total=len(services),
        language=lang,
        services=[ser.to_service_summary(store, s, lang) for s in services],
    )


@router.get(
    "/services/{service_id}",
    response_model=ServiceDetail,
    summary="Full guidance for one service",
)
def get_service(service_id: str, language: str = Query(default="hi")) -> ServiceDetail:
    store = get_knowledge_store()
    record = store.get_service(service_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "service_not_found",
                "message": "I could not find that service in my verified knowledge base.",
            },
        )
    return ser.to_service_detail(store, record, normalize_language(language))


@router.post(
    "/service/search",
    response_model=ServiceSearchOut,
    summary="Search for relevant services",
)
def search_services(payload: ServiceSearchRequest) -> ServiceSearchOut:
    store = get_knowledge_store()
    detected = detect_language(payload.query, payload.language)
    language = normalize_language(payload.language or detected)
    results = _retriever().search(payload.query, language=language, top_k=payload.limit)

    matches = [
        ServiceSearchMatch(
            service=ser.to_service_summary(store, record, language, confidence=hit.confidence),
            confidence=hit.confidence,
            matched_terms=hit.matched_terms,
        )
        for hit in results.hits
        if (record := store.get_service(hit.service_id))
        and (not payload.category_id or record.category_id == payload.category_id)
        and hit.confidence >= settings.retrieval_min_confidence * 0.5
    ]

    categories = [
        out
        for out in (
            ser.to_category(store, hit.category_id, language, with_services=True)
            for hit in results.categories
        )
        if out
    ]

    return ServiceSearchOut(
        query=payload.query,
        language=language,
        detected_language=detected,
        matches=matches,
        categories=categories,
    )


@router.get(
    "/services/{service_id}/journey",
    response_model=JourneyOut,
    summary="Guided journey for a service",
)
def get_journey(service_id: str, language: str = Query(default="hi")) -> JourneyOut:
    journey = get_navigator_service().journey_for(service_id, language)
    if journey is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "service_not_found", "message": "That service is not available."},
        )
    return journey


@router.post(
    "/services/{service_id}/journey/progress",
    response_model=JourneyProgressOut,
    summary="Save guided-journey progress",
)
def save_journey_progress(
    service_id: str,
    payload: JourneyProgressRequest,
    session: Session = Depends(get_db),
) -> JourneyProgressOut:
    if payload.service_id != service_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "service_mismatch", "message": "The service id does not match."},
        )
    result = get_navigator_service().progress(
        session,
        service_id=service_id,
        language=payload.language,
        completed_steps=payload.completed_steps,
        current_step=payload.current_step,
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "service_not_found", "message": "That service is not available."},
        )
    return result
