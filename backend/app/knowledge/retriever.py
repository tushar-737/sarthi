"""Hybrid retrieval over the verified knowledge base.

SAARTHI does not rely on a single keyword match. For every query it computes:

1. **Alias phrase matching** — a citizen's exact phrase ("आय प्रमाण पत्र",
   "income certificate") found inside an alias string. Strongest signal.
2. **Weighted token matching** — tokens from names, aliases, keywords,
   description, steps, documents and FAQs, each carrying a different weight,
   multiplied by an inverse-document-frequency term so rare terms count more.
3. **Prefix/partial matching** — so "certificates" finds "certificate" and
   "प्रमाणपत्र" finds "प्रमाण पत्र".
4. **Category scoring** — computed separately, because a query can clearly
   name a category ("certificate") without naming a service. That gap is
   exactly when SAARTHI asks a clarifying question.

The whole thing is dependency-free and deterministic, which is what makes
Demo Mode reliable.
"""

from __future__ import annotations

import math
import re
from collections import defaultdict
from dataclasses import dataclass, field

from app.knowledge.base import KnowledgeStore
from app.knowledge.models import ServiceRecord
from app.utils.text import bigrams, content_tokens, normalize, tokenize

# Words that carry no service signal. They are ignored when deciding whether an
# alias phrase is "contained" in a query, otherwise an alias such as
# "income certificate apply" could never match "I want an income certificate".
_STOP = set(content_tokens.__globals__["_STOPWORDS"])

# Field weights: how strongly a token found in this field implies the service.
FIELD_WEIGHTS: dict[str, float] = {
    "names": 6.0,
    "aliases": 5.0,
    "keywords": 3.5,
    "tagline": 2.0,
    "category": 2.0,
    "documents": 1.3,
    "faq": 1.1,
    "description": 1.0,
    "steps": 0.8,
    "eligibility": 0.6,
    "notes": 0.5,
}

# Multi-word alias phrases are the decisive signal. Single-word "phrases" are
# deliberately excluded here — they are already covered by token matching, and
# rewarding them again is what made every query look equally confident.
PHRASE_MAX_BONUS = 14.0
CONTAINMENT_DISCOUNT = 0.8
CONFIDENCE_TAU = 14.0  # score at which confidence reaches ~63%

# Words that make a category clear without naming a service.
CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "certificates": [
        "certificate", "certificates", "praman patra", "pramanpatra", "cert",
        "प्रमाण", "पत्र", "प्रमाणपत्र", "सर्टिफिकेट", "प्रमाणपत्र",
    ],
    "identity": [
        "aadhaar", "aadhar", "pan", "voter", "id card", "identity", "epic",
        "आधार", "पैन", "पहचान", "मतदाता", "वोटर",
    ],
    "education": [
        "scholarship", "study", "studies", "college", "school", "education",
        "student", "fees", "छात्रवृत्ति", "स्कॉलरशिप", "पढ़ाई", "शिक्षा",
        "विद्यार्थी", "छात्र", "कॉलेज", "स्कूल", "फीस",
    ],
    "employment": [
        "job", "jobs", "work", "employment", "career", "vacancy", "naukri",
        "नौकरी", "रोज़गार", "रोजगार", "काम", "भर्ती", "करियर",
    ],
    "health": [
        "health", "hospital", "treatment", "medical", "doctor", "surgery",
        "इलाज", "स्वास्थ्य", "अस्पताल", "दवा", "चिकित्सा", "बिमारी", "बीमार",
    ],
    "social_welfare": [
        "pension", "widow", "disability", "senior", "elderly", "old age",
        "पेंशन", "विधवा", "दिव्यांग", "बुज़ुर्ग", "बुजुर्ग", "वृद्ध", "बुढ़ापा",
    ],
    "housing": [
        "house", "home", "housing", "shelter", "flat", "plot",
        "घर", "मकान", "आवास", "छत", "भूखंड",
    ],
}


def _stem(token: str) -> str:
    """Very light stemming for Latin tokens only."""
    if not re.fullmatch(r"[a-z]+", token):
        return token
    for suffix in ("ies", "es", "s"):
        if token.endswith(suffix) and len(token) - len(suffix) >= 3:
            return token[: -len(suffix)] if suffix != "ies" else token[:-3] + "y"
    return token


@dataclass
class RetrievalHit:
    service_id: str
    category_id: str
    score: float
    confidence: float
    matched_terms: list[str] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)

    @property
    def is_alias_match(self) -> bool:
        return any(r.startswith("alias:") for r in self.reasons)


@dataclass
class CategoryHit:
    category_id: str
    score: float
    confidence: float
    matched_terms: list[str] = field(default_factory=list)


@dataclass
class RetrievalResult:
    query: str
    language: str
    hits: list[RetrievalHit]
    categories: list[CategoryHit]
    top_category: CategoryHit | None = None

    @property
    def top(self) -> RetrievalHit | None:
        return self.hits[0] if self.hits else None

    @property
    def top_confidence(self) -> float:
        return self.hits[0].confidence if self.hits else 0.0

    @property
    def is_category_only(self) -> bool:
        """A category is clear but no single service dominates."""
        if not self.top_category or self.top_category.confidence < 0.35:
            return False
        if not self.hits:
            return True
        if len(self.hits) >= 2:
            gap = self.hits[0].confidence - self.hits[1].confidence
            return self.top_confidence < 0.72 and gap < 0.14
        return self.top_confidence < 0.55


class Retriever:
    """Indexed search over the knowledge store."""

    def __init__(self, store: KnowledgeStore) -> None:
        self.store = store
        # service_id -> {token: weight}
        self._token_weights: dict[str, dict[str, float]] = defaultdict(dict)
        # normalized alias phrase -> [(service_id, weight, significant_words)]
        self._phrases: dict[str, list[tuple[str, float, tuple[str, ...]]]] = defaultdict(list)
        # service_id -> one combined lowercase blob (both languages, indexed once)
        self._blob: dict[str, str] = {}
        # token -> document frequency
        self._df: dict[str, int] = defaultdict(int)
        self._num_docs = 0
        self._build()

    # --- index construction ---------------------------------------------
    def _add_tokens(self, service_id: str, text: str, weight: float) -> None:
        for token in content_tokens(text):
            for form in {token, _stem(token)}:
                if not form:
                    continue
                current = self._token_weights[service_id].get(form, 0.0)
                self._token_weights[service_id][form] = max(current, weight)

    def _add_phrase(self, service_id: str, phrase: str, weight: float) -> None:
        normalized = normalize(phrase)
        # A phrase must carry at least two *meaningful* words to earn the
        # phrase bonus; "आय प्रमाण पत्र कैसे बनाएं" reduces to its nouns.
        significant = tuple(w for w in normalized.split() if w not in _STOP)
        if len(significant) < 2:
            return
        self._phrases[normalized].append((service_id, weight, significant))

    def _build(self) -> None:
        services = self.store.all_services()
        self._num_docs = max(len(services), 1)

        for service in services:
            sid = service.id
            category = self.store.get_category(service.category_id)

            self._add_tokens(sid, " ".join(service.names.values()), FIELD_WEIGHTS["names"])
            self._add_tokens(sid, " ".join(service.tagline.values()), FIELD_WEIGHTS["tagline"])
            self._add_tokens(
                sid, " ".join(service.description.values()), FIELD_WEIGHTS["description"]
            )

            for values in service.aliases.values():
                self._add_tokens(sid, " ".join(values), FIELD_WEIGHTS["aliases"])
                for alias in values:
                    self._add_phrase(sid, alias, FIELD_WEIGHTS["aliases"])

            for values in service.keywords.values():
                joined = " ".join(values)
                self._add_tokens(sid, joined, FIELD_WEIGHTS["keywords"])
                for keyword in values:
                    self._add_phrase(sid, keyword, FIELD_WEIGHTS["keywords"] * 0.8)

            if category:
                self._add_tokens(sid, " ".join(category.names.values()), FIELD_WEIGHTS["category"])

            for doc in service.documents:
                self._add_tokens(
                    sid,
                    f"{doc.name.get('en','')} {doc.name.get('hi','')} {doc.id.replace('_',' ')}",
                    FIELD_WEIGHTS["documents"],
                )
            for step in service.steps:
                self._add_tokens(
                    sid,
                    f"{step.title.get('en','')} {step.title.get('hi','')}",
                    FIELD_WEIGHTS["steps"],
                )
            for item in service.eligibility:
                self._add_tokens(sid, " ".join(item.values()), FIELD_WEIGHTS["eligibility"])
            for item in service.important_notes:
                self._add_tokens(sid, " ".join(item.values()), FIELD_WEIGHTS["notes"])
            for item in service.faq:
                self._add_tokens(sid, " ".join(item.q.values()), FIELD_WEIGHTS["faq"])

            # Names are the highest-value phrases.
            for name in service.names.values():
                self._add_phrase(sid, name, FIELD_WEIGHTS["names"])

        for service in services:
            self._blob[service.id] = normalize(service.searchable_text("en")) + " " + normalize(
                service.searchable_text("hi")
            )

        for weights in self._token_weights.values():
            for token in weights:
                self._df[token] += 1

    # --- scoring ---------------------------------------------------------
    def _idf(self, token: str) -> float:
        df = self._df.get(token, 0)
        if df == 0:
            return 1.6  # unknown token: neutral, slightly above average
        return 1.0 + math.log(self._num_docs / df)

    def _partial_match(self, token: str, weights: dict[str, float]) -> float:
        """Prefix/partial credit so plurals and compound spellings still match."""
        if len(token) < 4:
            return 0.0
        best = 0.0
        stem = _stem(token)
        for indexed, weight in weights.items():
            if len(indexed) < 4:
                continue
            if indexed.startswith(stem) or stem.startswith(indexed):
                best = max(best, weight * 0.6)
        return best

    def _phrase_score(
        self, service_id: str, query: str, query_tokens: set[str]
    ) -> tuple[float, list[str]]:
        """Reward multi-word aliases, either verbatim or as a word set.

        Word-set matching matters because citizens reorder words constantly:
        "income certificate apply" must still match "I want to apply for an
        income certificate".
        """
        bonus = 0.0
        matched: list[str] = []
        for phrase, entries in self._phrases.items():
            if not any(sid == service_id for sid, _, _ in entries):
                continue
            exact = phrase in query
            significant: tuple[str, ...] = ()
            contained = False
            if not exact:
                significant = next(sig for sid, _, sig in entries if sid == service_id)
                contained = all(w in query_tokens for w in significant)
            if not (exact or contained):
                continue
            for sid, weight, sig in entries:
                if sid != service_id:
                    continue
                words = len(sig) if not exact else len(phrase.split())
                # Longer phrases are far more decisive than shorter ones.
                scale = min(1.0 + 0.45 * (words - 1), 2.0)
                if not exact:
                    scale *= CONTAINMENT_DISCOUNT
                bonus += weight * scale
                matched.append(phrase)
                break
        return min(bonus, PHRASE_MAX_BONUS), matched

    def search(self, query: str, language: str = "hi", top_k: int = 5) -> RetrievalResult:
        normalized_query = f" {normalize(query)} "
        raw_tokens = content_tokens(query)
        query_token_set = set(raw_tokens) | {_stem(t) for t in raw_tokens}
        query_bigrams = set(bigrams(tokenize(query)))

        hits: list[RetrievalHit] = []
        for service in self.store.all_services():
            hits.append(self._score_service(service, normalized_query, query_token_set, query_bigrams))

        hits.sort(key=lambda h: (-h.score, -self.store.services[h.service_id].priority))
        hits = [h for h in hits if h.score > 0][:top_k]

        categories = self._score_categories(normalized_query, query_token_set)

        return RetrievalResult(
            query=query,
            language=language,
            hits=hits,
            categories=categories,
            top_category=categories[0] if categories else None,
        )

    def _score_service(
        self,
        service: ServiceRecord,
        normalized_query: str,
        query_tokens: set[str],
        query_bigrams: set[str],
    ) -> RetrievalHit:
        weights = self._token_weights.get(service.id, {})
        reasons: list[str] = []
        matched: list[str] = []
        score = 0.0

        # 1. Exact alias / name phrases.
        phrase_bonus, phrase_terms = self._phrase_score(
            service.id, normalized_query, query_tokens
        )
        if phrase_bonus > 0:
            score += phrase_bonus
            reasons.append(f"alias:{phrase_terms[0]}")
            matched.extend(phrase_terms[:3])

        # 2. Weighted token matches.
        token_score = 0.0
        for token in query_tokens:
            weight = weights.get(token, 0.0)
            if weight == 0.0:
                weight = self._partial_match(token, weights)
            if weight > 0:
                token_score += weight * self._idf(token)
                matched.append(token)
        score += token_score
        if token_score > 0:
            reasons.append(f"tokens:{len(matched)}")

        # 3. Bigram phrase agreement (word order preserved).
        blob = self._blob.get(service.id, "")
        bigram_hits = sum(1 for bigram in query_bigrams if bigram in blob)
        if bigram_hits:
            score += 0.8 * bigram_hits
            reasons.append(f"bigram:{bigram_hits}")

        # 4. Priority tiebreak (only nudges, never dominates).
        score += service.priority / 1000.0

        confidence = 1.0 - math.exp(-score / CONFIDENCE_TAU) if score > 0 else 0.0
        return RetrievalHit(
            service_id=service.id,
            category_id=service.category_id,
            score=round(score, 4),
            confidence=round(min(confidence, 0.99), 4),
            matched_terms=list(dict.fromkeys(matched))[:8],
            reasons=reasons,
        )

    def _score_categories(self, normalized_query: str, query_tokens: set[str]) -> list[CategoryHit]:
        hits: list[CategoryHit] = []
        for category_id, keywords in CATEGORY_KEYWORDS.items():
            if category_id not in self.store.categories:
                continue
            matched: list[str] = []
            score = 0.0
            for keyword in keywords:
                if " " in keyword:
                    if keyword in normalized_query:
                        score += 2.0
                        matched.append(keyword)
                else:
                    if keyword in query_tokens or _stem(keyword) in query_tokens:
                        score += 1.0
                        matched.append(keyword)
                    elif keyword in normalized_query:
                        score += 0.7
                        matched.append(keyword)
            if score > 0:
                confidence = 1.0 - math.exp(-score / 2.5)
                hits.append(
                    CategoryHit(
                        category_id=category_id,
                        score=round(score, 4),
                        confidence=round(min(confidence, 0.99), 4),
                        matched_terms=list(dict.fromkeys(matched))[:6],
                    )
                )
        hits.sort(key=lambda h: -h.score)
        return hits
