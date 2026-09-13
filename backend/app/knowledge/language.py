"""Language detection and localisation helpers.

Supports Hindi (Devanagari + romanised "Hinglish") and English today. The
`Language` records in `languages.json` mark additional languages as
`planned`, so the selector can show the roadmap without pretending they work.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache

from app.config import KNOWLEDGE_DATA_DIR
from app.knowledge.models import Language
from app.utils.text import has_devanagari, looks_like_hinglish, normalize

SUPPORTED_CODES = ("hi", "en")

# Script ranges for languages that will be added later. Used only to give a
# helpful "coming soon" message instead of a wrong-language answer.
_SCRIPT_RANGES: tuple[tuple[str, tuple[int, int]], ...] = (
    ("bn", (0x0980, 0x09FF)),  # Bengali
    ("gu", (0x0A80, 0x0AFF)),  # Gujarati
    ("pa", (0x0A00, 0x0A7F)),  # Gurmukhi
    ("or", (0x0B00, 0x0B7F)),  # Odia
    ("ta", (0x0B80, 0x0BFF)),  # Tamil
    ("te", (0x0C00, 0x0C7F)),  # Telugu
    ("kn", (0x0C80, 0x0CFF)),  # Kannada
    ("ml", (0x0D00, 0x0D7F)),  # Malayalam
    ("mr", (0x0900, 0x097F)),  # Devanagari (shared with Hindi)
)

_URDU = (0x0600, 0x06FF)  # Arabic script


@lru_cache
def load_languages() -> tuple[Language, ...]:
    payload = json.loads((KNOWLEDGE_DATA_DIR / "languages.json").read_text(encoding="utf-8"))
    return tuple(Language(**item) for item in payload["languages"])


def get_language(code: str) -> Language | None:
    for language in load_languages():
        if language.code == code:
            return language
    return None


def available_languages() -> list[Language]:
    return [lang for lang in load_languages() if lang.status == "available"]


def is_supported(code: str | None) -> bool:
    return bool(code) and code in SUPPORTED_CODES


def normalize_language(code: str | None, default: str = "hi") -> str:
    """Map any incoming language hint to a code SAARTHI can serve."""
    if not code:
        return default
    code = normalize(code).replace("_", "-").split("-")[0]
    return code if code in SUPPORTED_CODES else default


def detect_script_language(text: str) -> str | None:
    """Return a language code if the script clearly is not Hindi/English."""
    if not text:
        return None
    if _URDU[0] <= ord(text[0]) <= _URDU[1] or any(_URDU[0] <= ord(c) <= _URDU[1] for c in text):
        return "ur"
    for code, (low, high) in _SCRIPT_RANGES:
        if code in {"mr"}:  # Devanagari is served as Hindi
            continue
        if any(low <= ord(ch) <= high for ch in text):
            return code
    return None


_LATIN_LETTER = re.compile(r"[a-z]", re.IGNORECASE)


def detect_language(text: str, hint: str | None = None) -> str:
    """Best-effort language detection for a citizen query.

    Order of precedence:
    1. An unsupported script (Bengali, Tamil, …) is reported as-is so the
       caller can explain it is coming soon.
    2. Devanagari → Hindi.
    3. Romanised-Hindi markers → Hindi.
    4. Latin letters → English. The citizen's own typing beats the UI setting,
       so someone with a Hindi interface who types English is answered in
       English rather than getting a translation they did not ask for.
    5. No language signal at all (digits, punctuation, empty) → the UI hint.
    """
    unsupported = detect_script_language(text)
    if unsupported and unsupported not in SUPPORTED_CODES:
        return unsupported

    if has_devanagari(text):
        return "hi"
    if looks_like_hinglish(text):
        return "hi"
    if _LATIN_LETTER.search(text or ""):
        return "en"

    if hint and normalize_language(hint, "") in SUPPORTED_CODES:
        return normalize_language(hint)

    return "en"


def resolve_language(text: str, hint: str | None = None) -> str:
    """Language SAARTHI will actually answer in (always supported)."""
    detected = detect_language(text, hint)
    return detected if detected in SUPPORTED_CODES else normalize_language(hint)


# --- States, used for entity extraction -----------------------------------

STATES: dict[str, dict[str, str]] = {
    "up": {"en": "uttar pradesh", "hi": "उत्तर प्रदेश"},
    "dl": {"en": "delhi", "hi": "दिल्ली"},
    "br": {"en": "bihar", "hi": "बिहार"},
    "mp": {"en": "madhya pradesh", "hi": "मध्य प्रदेश"},
    "mh": {"en": "maharashtra", "hi": "महाराष्ट्र"},
    "wb": {"en": "west bengal", "hi": "पश्चिम बंगाल"},
    "tn": {"en": "tamil nadu", "hi": "तमिलनाडु"},
    "rj": {"en": "rajasthan", "hi": "राजस्थान"},
    "gj": {"en": "gujarat", "hi": "गुजरात"},
    "kt": {"en": "karnataka", "hi": "कर्नाटक"},
    "kl": {"en": "kerala", "hi": "केरल"},
    "ap": {"en": "andhra pradesh", "hi": "आंध्र प्रदेश"},
    "tg": {"en": "telangana", "hi": "तेलंगाना"},
    "pb": {"en": "punjab", "hi": "पंजाब"},
    "hr": {"en": "haryana", "hi": "हरियाणा"},
    "jh": {"en": "jharkhand", "hi": "झारखंड"},
    "cg": {"en": "chhattisgarh", "hi": "छत्तीसगढ़"},
    "as": {"en": "assam", "hi": "असम"},
    "od": {"en": "odisha", "hi": "ओडिशा"},
    "uk": {"en": "uttarakhand", "hi": "उत्तराखंड"},
    "hp": {"en": "himachal pradesh", "hi": "हिमाचल प्रदेश"},
    "goa": {"en": "goa", "hi": "गोवा"},
}


def detect_state(text: str) -> str | None:
    """Find a state mentioned in the query (English or Hindi)."""
    normalized = f" {normalize(text)} "
    for state_id, names in STATES.items():
        for value in names.values():
            if value and f" {value} " in normalized:
                return state_id
    return None
