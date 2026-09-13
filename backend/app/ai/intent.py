"""Intent analysis.

Turns a citizen's sentence into a structured understanding. This module is the
deterministic core that both AI providers use — the LLM provider may refine the
result, but it always has this as a floor, which is what keeps Demo Mode honest.

Design rule: when SAARTHI is not sure, it must *ask*, not guess. Three separate
signals can trigger a clarifying question:

* the query names a category but no single service dominates it
* nothing scores above the confidence floor
* the citizen explicitly says they are confused
"""

from __future__ import annotations

import re
from typing import Any

from app.config import settings
from app.knowledge.base import KnowledgeStore
from app.knowledge.language import (
    SUPPORTED_CODES,
    detect_language,
    detect_script_language,
    detect_state,
    normalize_language,
)
from app.knowledge.retriever import Retriever
from app.ai.base import Analysis, Candidate, Entities, IntentType

# --- conversational patterns -------------------------------------------------

GREETING_RE = re.compile(
    r"\b(hi|hello|hey|good\s+(morning|evening|afternoon)|namaste|namaskar)\b"
    r"|(नमस्ते|नमस्कार|हैलो|हाय)",
    re.IGNORECASE,
)
GRATITUDE_RE = re.compile(
    r"\b(thanks|thank\s+you|thx|great|helpful)\b|(धन्यवाद|शुक्रिया|धन्यवाद)",
    re.IGNORECASE,
)
CONFUSION_PATTERNS = [
    r"समझ\s*में?\s*नहीं", r"समझ\s*नहीं", r"नहीं\s*आ\s*रहा", r"पता\s*नहीं",
    r"नहीं\s*पता", r"कौन\s*सा", r"कौनसी", r"कौन\s*सी", r"भ्रम", r"confuse",
    r"दुविधा", r"समझ\s*नहीं\s*आ", r"तय\s*नहीं",
]
CONFUSION_EN = [
    r"not\s+sure", r"don'?t\s+know", r"dont\s+know", r"no\s+idea",
    r"confused", r"which\s+one", r"what\s+should\s+i", r"help\s+me\s+decide",
    r"can'?t\s+decide", r"unsure",
]
CONFUSION_RE = re.compile("|".join(CONFUSION_PATTERNS + CONFUSION_EN), re.IGNORECASE)

BROWSE_RE = re.compile(
    r"(कौन\s*सी\s*सेवा|क्या\s*सेवा|सेवाओं\s*की\s*सूची|सारी\s*सेवा|सभी\s*सेवा"
    r"|what\s+services|which\s+services|list\s+(of\s+)?services|all\s+services"
    r"|show\s+me\s+services|categories|what\s+can\s+you\s+do|help\s+me\s+with)",
    re.IGNORECASE,
)

PORTAL_RE = re.compile(r"(link|url|website|portal|साइट|वेबसाइट|पोर्टल|लिंक)", re.IGNORECASE)
DOCUMENTS_RE = re.compile(
    r"(document|documents|paper|papers|कागज|दस्तावेज|दस्तावेज़|प्रपत्र)", re.IGNORECASE
)
ELIGIBILITY_RE = re.compile(
    r"(eligib|qualify|पात्र|योग्य|पात्रता|hak|हकदार|can\s+i\s+(get|apply))", re.IGNORECASE
)
TIME_FEE_RE = re.compile(
    r"(how\s+long|how\s+much|time\s+take|fee|cost|charge|kitna\s+(time|paisa|samay)"
    r"|कितना\s*(समय|पैसा|शुल्क)|शुल्क|फीस|समय\s*लग|देर)",
    re.IGNORECASE,
)
STATUS_RE = re.compile(
    r"(status|track|progress|स्थिति|स्टेटस|कहाँ\s*तक|कहां\s*तक|pending|लंबित)", re.IGNORECASE
)

STUDY_LEVELS: dict[str, list[str]] = {
    "school": ["school", "class 10", "class 8", "स्कूल", "कक्षा 10", "कक्षा 8", "प्राइमरी", "primary", "10th", "tenth"],
    "higher_secondary": ["class 11", "class 12", "intermediate", "कक्षा 11", "कक्षा 12", "इंटर", "12th", "twelve", "higher secondary"],
    "college": ["college", "degree", "diploma", "undergraduate", "b.a", "b.sc", "b.com", "btech", "कॉलेज", "डिग्री", "डिप्लोमा", "स्नातक", "graduation"],
    "higher": ["phd", "post graduate", "pg", "masters", "professional", "medical college", "engineering", "पीएचडी", "स्नातकोत्तर", "मास्टर्स", "उच्च शिक्षा"],
}

PURPOSES: dict[str, list[str]] = {
    "scholarship": ["scholarship", "study", "studies", "education", "छात्रवृत्ति", "पढ़ाई", "शिक्षा", "स्कॉलरशिप"],
    "job": ["job", "employment", "naukri", "नौकरी", "रोज़गार", "रोजगार", "भर्ती"],
    "bank": ["bank", "loan", "account", "बैंक", "ऋण", "खाता", "कर्ज"],
    "medical": ["hospital", "treatment", "surgery", "अस्पताल", "इलाज", "ऑपरेशन"],
    "housing": ["house", "home", "घर", "मकान", "आवास"],
    "pension": ["pension", "पेंशन"],
}

# Ordered most-specific first: a widow who is also elderly should be read as a
# widow-pension query, not an old-age one. Relation words (father/mother) are
# deliberately absent — they belong to `relation`, not to the pension type.
PENSION_TYPES: dict[str, list[str]] = {
    "widow": ["widow", "widower", "विधवा", "पति की मृत्यु", "husband died", "पति नहीं"],
    "disability": ["disab", "दिव्यांग", "विकलांग", "handicap", "अंगविहीन"],
    "old_age": [
        "old age", "oldage", "senior citizen", "senior", "elderly", "60", "65", "70",
        "75", "80", "बुढ़ापा", "बुढ़ापे", "बुज़ुर्ग", "बुजुर्ग", "वृद्ध", "वृद्धावस्था",
        "दादा", "दादी", "नाना", "नानी",
    ],
}

RELATIONS = {
    "father": ["father", "dad", "पिता", "पापा", "बाबूजी", "बाप"],
    "mother": ["mother", "mom", "माता", "माँ", "मां", "अम्मा"],
    "son": ["son", "बेटा", "पुत्र"],
    "daughter": ["daughter", "बेटी", "पुत्री"],
    "husband": ["husband", "पति"],
    "wife": ["wife", "पत्नी"],
    "self": ["myself", "मेरे लिए", "खुद"],
}

AGE_RE = re.compile(r"\b(\d{1,3})\s*(?:years?|sal|साल|वर्ष|year)\b", re.IGNORECASE)
BARE_AGE_RE = re.compile(r"\b(\d{2})\b")


class IntentAnalyzer:
    """Deterministic intent detection over the knowledge base."""

    def __init__(self, store: KnowledgeStore, retriever: Retriever | None = None) -> None:
        self.store = store
        self.retriever = retriever or Retriever(store)

    # --- helpers ---------------------------------------------------------
    @staticmethod
    def _any(patterns: dict[str, list[str]], text: str) -> str | None:
        lowered = text.lower()
        for key, needles in patterns.items():
            if any(needle in lowered for needle in needles):
                return key
        return None

    def _extract_entities(self, query: str) -> Entities:
        entities = Entities()
        entities.state = detect_state(query)
        entities.study_level = self._any(STUDY_LEVELS, query)
        entities.purpose = self._any(PURPOSES, query)
        entities.pension_type = self._any(PENSION_TYPES, query)
        entities.relation = self._any(RELATIONS, query)

        match = AGE_RE.search(query)
        if match:
            entities.age = int(match.group(1))
        else:
            for bare in BARE_AGE_RE.findall(query):
                value = int(bare)
                if 15 <= value <= 100:
                    entities.age = value
                    break

        entities.is_confused = bool(CONFUSION_RE.search(query))
        entities.wants_portal = bool(PORTAL_RE.search(query))
        entities.wants_documents = bool(DOCUMENTS_RE.search(query))
        entities.wants_eligibility = bool(ELIGIBILITY_RE.search(query))
        entities.wants_time_or_fee = bool(TIME_FEE_RE.search(query))
        return entities

    def _is_greeting_only(self, query: str) -> bool:
        stripped = re.sub(r"[^\w\u0900-\u097F\s]", " ", query).strip()
        if not GREETING_RE.search(stripped):
            return False
        # "hello, I need an income certificate" is not just a greeting.
        without_greeting = GREETING_RE.sub(" ", stripped, count=1)
        return len(without_greeting.split()) <= 2

    # --- main entry ------------------------------------------------------
    def analyze(
        self,
        query: str,
        *,
        language_hint: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> Analysis:
        context = context or {}
        query = (query or "").strip()

        # 1. Unsupported script (Bengali, Tamil, …) — say so instead of guessing.
        script = detect_script_language(query)
        if script and script not in SUPPORTED_CODES:
            return Analysis(
                intent_type="unsupported_language",
                language=script,
                unsupported_language=script,
                reasoning="query_script_not_supported",
                entities=self._extract_entities(query),
            )

        detected = detect_language(query, language_hint)
        language = normalize_language(detected, language_hint or settings.default_language)

        entities = self._extract_entities(query)

        # 2. Conversational shortcuts.
        if self._is_greeting_only(query):
            return Analysis(
                intent_type="greeting",
                language=language,
                entities=entities,
                reasoning="greeting",
                confidence=0.9,
            )
        if GRATITUDE_RE.search(query) and len(query.split()) <= 4:
            return Analysis(
                intent_type="gratitude",
                language=language,
                entities=entities,
                reasoning="gratitude",
                confidence=0.9,
            )
        if BROWSE_RE.search(query) and not entities.purpose:
            return Analysis(
                intent_type="browse",
                language=language,
                entities=entities,
                reasoning="browse_request",
                confidence=0.8,
            )

        # 3. Retrieval.
        result = self.retriever.search(query, language=language)
        candidates = [
            Candidate(
                service_id=hit.service_id,
                score=hit.score,
                confidence=hit.confidence,
                matched_terms=hit.matched_terms,
            )
            for hit in result.hits
        ]
        top = result.top

        # 4. Follow-up on the service already being discussed.
        active_service_id = context.get("active_service_id")
        if active_service_id and self.store.get_service(active_service_id):
            aspect = self._followup_aspect(entities, query)
            strong_new_service = top is not None and top.confidence >= 0.80 and top.service_id != active_service_id
            if aspect and not strong_new_service:
                return Analysis(
                    intent_type="followup",
                    language=language,
                    service_id=active_service_id,
                    category_id=self.store.get_service(active_service_id).category_id,
                    confidence=0.86,
                    entities=entities,
                    candidates=candidates,
                    followup_aspect=aspect,
                    reasoning=f"followup:{aspect}",
                )

        # 5. Nothing matched → out of scope. SAARTHI must not guess.
        if top is None or top.confidence < settings.retrieval_min_confidence:
            intent_type: IntentType = "out_of_scope"
            if entities.is_confused:
                intent_type = "clarify"
            return Analysis(
                intent_type=intent_type,
                language=language,
                confidence=top.confidence if top else 0.0,
                category_id=result.top_category.category_id if result.top_category else None,
                entities=entities,
                candidates=candidates,
                needs_clarification=True,
                clarification_kind="confused" if entities.is_confused else "low_confidence",
                reasoning="below_confidence_floor",
            )

        # 6. Category clear, service not → ask which service.
        if result.is_category_only or entities.is_confused:
            category_id = (result.top_category.category_id if result.top_category else top.category_id)
            return Analysis(
                intent_type="clarify",
                language=language,
                confidence=top.confidence,
                category_id=category_id,
                entities=entities,
                candidates=candidates,
                needs_clarification=True,
                clarification_kind="confused" if entities.is_confused else "category_only",
                reasoning="category_identified_service_ambiguous",
            )

        # 7. Two services nearly tied → let the citizen choose.
        if len(result.hits) >= 2:
            first, second = result.hits[0], result.hits[1]
            if (
                first.confidence < 0.80
                and (first.confidence - second.confidence) < 0.06
                and first.category_id != second.category_id
            ):
                return Analysis(
                    intent_type="clarify",
                    language=language,
                    confidence=first.confidence,
                    category_id=result.top_category.category_id if result.top_category else None,
                    entities=entities,
                    candidates=candidates,
                    needs_clarification=True,
                    clarification_kind="ambiguous_choice",
                    reasoning="two_categories_tied",
                )

        service = self.store.get_service(top.service_id)
        return Analysis(
            intent_type="service_query",
            language=language,
            confidence=top.confidence,
            service_id=top.service_id,
            category_id=service.category_id if service else None,
            entities=entities,
            candidates=candidates,
            reasoning=";".join(top.reasons) or "token_match",
        )

    @staticmethod
    def _followup_aspect(entities: Entities, query: str) -> str | None:
        """Which part of the already-active service is being asked about?"""
        if entities.wants_documents:
            return "documents"
        if entities.wants_eligibility:
            return "eligibility"
        if entities.wants_portal:
            return "portal"
        if entities.wants_time_or_fee:
            return "time_fee"
        if STATUS_RE.search(query):
            return "status"
        if re.search(r"(how|kaise|कैसे|steps|प्रक्रिया|process|आवेदन)", query, re.IGNORECASE):
            return "steps"
        if re.search(r"(faq|question|सवाल|पूछ)", query, re.IGNORECASE):
            return "faq"
        return None
