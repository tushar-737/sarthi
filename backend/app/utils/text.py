"""Text normalisation helpers shared by language detection, intent analysis
and knowledge retrieval.

These are deliberately dependency-free so SAARTHI keeps working offline.
"""

from __future__ import annotations

import re
import unicodedata

# Devanagari block: U+0900 - U+097F
_DEVANAGARI = re.compile(r"[\u0900-\u097F]")

# Romanised-Hindi (Hinglish) written in Latin script. Maps the most common
# spellings used by citizens typing on a phone keyboard.
HINGLISH_TO_TOKENS: dict[str, str] = {
    # Romanised Hindi -> the English concept used in the knowledge base.
    # Only *domain* words are mapped; generic verbs and question words are
    # handled as stopwords instead (see `_STOPWORDS`).
    "aay": "income",
    "aaye": "income",
    "ay": "income",
    "aamdani": "income",
    "income": "income",
    "praman": "certificate",
    "pramanpatra": "certificate",
    "patra": "certificate",
    "certificate": "certificate",
    "padhai": "education",
    "padhaai": "education",
    "shiksha": "education",
    "scholarship": "scholarship",
    "skolarship": "scholarship",
    "jaati": "caste",
    "jati": "caste",
    "niwas": "domicile",
    "nivasi": "domicile",
    "adhaar": "aadhaar",
    "aadhar": "aadhaar",
    "pan": "pan",
    "pension": "pension",
    "budhapa": "old_age",
    "naukri": "job",
    "rozgar": "employment",
    "rojgar": "employment",
    "ghar": "housing",
    "awas": "housing",
    "ilaj": "health",
    "dawai": "health",
    "aspatal": "hospital",
    "sarkari": "government",
    "govt": "government",
    "gareeb": "poor",
    "garib": "poor",
    "vidyarthi": "student",
    "chhatravritti": "scholarship",
}

# Romanised-Hindi words that are unambiguously Hindi. Language detection uses
# ONLY this set — never `HINGLISH_TO_TOKENS`, because that map also contains
# words shared with English ("pension", "income", "certificate", "scholarship").
# Using it for detection made plain English queries look Hindi.
HINGLISH_MARKERS: frozenset[str] = frozenset(
    {
        # question words / generic verbs
        "kaise", "kaisa", "kaisi", "kya", "kab", "kahan", "kyu", "kyon", "kitna",
        "kitne", "kitni", "kaun", "kaunsa", "kaunsi", "chahiye", "chahta", "chahti",
        "banana", "banwana", "banwaana", "banwaye", "banwaya", "banao", "banaen",
        "karna", "karu", "kare", "karo", "milega", "milegi", "batao", "bataye",
        "batayiye", "jankari", "tarika", "prakriya", "naya", "nayi", "sakta",
        "sakti", "hoga", "hogi", "hai", "hain", "aap", "aapka", "aapki", "liye",
        "mujhe", "muje", "mera", "meri", "mere", "apna", "apni", "hum",
        # domain words
        "aay", "aamdani", "praman", "pramanpatra", "patra", "padhai", "padhaai",
        "shiksha", "jaati", "jati", "niwas", "nivasi", "adhaar", "aadhar",
        "budhapa", "naukri", "rozgar", "rojgar", "ghar", "awas", "ilaj", "dawai",
        "aspatal", "sarkari", "gareeb", "garib", "vidyarthi", "chhatravritti",
        "vyavsay", "anudan", "yojana", "labh", "patra",
    }
)

_WORD_SPLIT = re.compile(r"[^\w\u0900-\u097F]+", re.UNICODE)
_STOPWORDS = {
    # --- English function words ---
    "the", "a", "an", "is", "are", "am", "was", "were", "be", "been", "being",
    "i", "me", "my", "mine", "we", "us", "our", "you", "your", "he", "she",
    "they", "them", "their", "it", "its", "this", "that", "these", "those",
    "for", "to", "of", "in", "on", "at", "by", "with", "from", "as", "into",
    "and", "or", "but", "if", "then", "so", "not", "no", "yes",
    "do", "does", "did", "have", "has", "had", "will", "would", "shall",
    "can", "could", "may", "might", "must", "should",
    "how", "what", "which", "when", "where", "why", "who", "whom",
    "please", "thanks", "thank", "sir", "madam",
    # --- English generic verbs / fillers that carry no service signal ---
    "apply", "applying", "applied", "application", "applications",
    "get", "gets", "getting", "got", "make", "makes", "made", "making",
    "obtain", "need", "needs", "needed", "want", "wants", "wanted",
    "require", "requires", "required", "requirement", "requirements",
    "find", "finds", "finding", "found", "search", "searching", "check",
    "checking", "use", "uses", "using", "used", "take", "takes", "taken",
    "go", "going", "gone", "come", "comes", "coming", "give", "gives",
    "know", "tell", "tells", "show", "shows", "shown", "see", "help",
    "start", "starts", "started", "continue", "open", "opens", "submit",
    "fill", "upload", "download", "pay", "visit",
    "online", "offline", "new", "old", "process", "procedure", "way",
    "ways", "steps", "step", "details", "detail", "information", "info",
    "about", "regarding", "through", "during", "before", "after",
    "there", "here", "also", "just", "only", "very", "really", "many",
    "much", "more", "most", "some", "any", "all", "each", "every",
    "one", "two", "three", "first", "second", "third", "time", "times",
    "year", "years", "month", "months", "day", "days", "number", "form",
    "forms", "type", "kind", "lot", "bit", "well", "still", "already",
    # --- Hindi function words ---
    "है", "हैं", "था", "थी", "थे", "और", "या", "में", "से", "का", "की", "के",
    "को", "पर", "ही", "भी", "तो", "जो", "वह", "यह", "एक", "इस", "उस", "इसे",
    "उसे", "कर", "करना", "करता", "करती", "लिए", "द्वारा", "साथ", "बाद",
    "पहले", "अभी", "यहाँ", "वहाँ", "कोई", "कुछ", "सब", "सभी", "बहुत",
    "हो", "होगा", "होगी", "होंगे", "मैं", "मुझे", "मेरा", "मेरी", "मेरे",
    "आप", "आपका", "आपकी", "आपके", "हम", "वे", "उनका", "इसका", "उसका",
    # --- Hindi question words / generic verbs (no service signal) ---
    "कैसे", "कैसा", "कैसी", "क्या", "कब", "कहाँ", "कहां", "क्यों", "कितना",
    "कितने", "कितनी", "कौन", "कौनसा", "बनाएं", "बनाना", "बनवाना", "बनवाएं",
    "बनवाने", "बनवाई", "चाहिए", "चाहता", "चाहती", "मिलेगा", "मिलेगी",
    "मिलना", "मिल", "मिलता", "मिलती", "पाना", "पा", "प्राप्त", "बताएं",
    "बताइए", "बताओ", "जानना", "जानकारी", "तरीका", "प्रक्रिया", "ऑनलाइन",
    "ऑफलाइन", "नया", "नई", "बारे", "में", "सकता", "सकती", "सकते", "ज़रूरत",
    "जरूरत", "रूप", "अधिक", "कम", "ज्यादा", "ज़्यादा", "आवेदन", "आवेदक",
    # --- Romanised Hindi fillers ---
    "kaise", "kaisa", "kya", "kab", "kahan", "kyu", "kyon", "kitna", "kitne",
    "banana", "banwana", "banwaana", "banwaye", "banaen", "chahiye", "chahta",
    "karna", "karu", "kare", "karo", "mil", "milega", "milegi", "batao",
    "bataye", "jankari", "tarika", "prakriya", "naya", "nayi", "sakta",
    "sakti", "hoga", "hogi", "hai", "hain", "ho", "aap", "mera", "meri",
    "mere", "mujhe", "muje", "hum", "liye", "ka", "ki", "ke", "ko", "me",
    "se", "par", "aur", "ya", "bhi", "toh", "jo", "wah", "yah", "ek",
}



def has_devanagari(text: str) -> bool:
    return bool(_DEVANAGARI.search(text))


def unicode_nfc(text: str) -> str:
    return unicodedata.normalize("NFC", text)


def normalize(text: str) -> str:
    """Lowercase, NFC-normalise and collapse whitespace/punctuation."""
    text = unicode_nfc(text or "").strip().lower()
    # Devanagari danda / double danda act as sentence punctuation.
    text = text.replace("।", " ").replace("॥", " ")
    text = re.sub(r"\s+", " ", text)
    return text


def tokenize(text: str) -> list[str]:
    """Split into word tokens, expanding romanised Hindi to English concepts."""
    normalized = normalize(text)
    raw_tokens = [t for t in _WORD_SPLIT.split(normalized) if t and len(t) > 1]
    tokens: list[str] = []
    for token in raw_tokens:
        tokens.append(token)
        mapped = HINGLISH_TO_TOKENS.get(token)
        if mapped and mapped != token:
            tokens.append(mapped)
    return tokens


def content_tokens(text: str) -> list[str]:
    """Tokens with stopwords removed — used for scoring.

    Note that `tokenize` already expands romanised Hindi into the English
    concept used by the knowledge base, so "aay" contributes "income" here.
    """
    return [t for t in tokenize(text) if t not in _STOPWORDS]


def bigrams(tokens: list[str]) -> list[str]:
    return [f"{a} {b}" for a, b in zip(tokens, tokens[1:])]


def dedupe(seq: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in seq:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def looks_like_hinglish(text: str) -> bool:
    """True when Latin-script input contains romanised Hindi words.

    Requires an unambiguous marker so that "my mother is a widow, can she get a
    pension" stays English while "pension kaise milta hai" becomes Hindi.
    """
    if has_devanagari(text):
        return False
    tokens = {t for t in _WORD_SPLIT.split(normalize(text)) if len(t) >= 3}
    return bool(tokens & HINGLISH_MARKERS)


def truncate(text: str, limit: int) -> str:
    text = text or ""
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"
