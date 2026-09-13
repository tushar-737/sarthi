"""Input safety: validation, PII redaction and prompt-injection guards.

SAARTHI handles public-service guidance for citizens, so the safety rules are
conservative on purpose:

* citizen queries are length-capped and control-character stripped
* anything that looks like an Aadhaar / PAN / bank / card number is redacted
  before it can reach a log line or an upstream AI provider
* obvious secret material (OTP-ish runs, long digit strings) is never echoed
* classic prompt-injection patterns are flagged so the AI layer can refuse
  to be steered away from the verified knowledge base
"""

from __future__ import annotations

import re

from app.config import settings

# 12-digit Aadhaar, optionally spaced or dashed.
_AADHAAR = re.compile(r"\b(?:\d[ -]?){11}\d\b")
# 10-char PAN: 5 letters, 4 digits, 1 letter.
_PAN = re.compile(r"\b[a-z]{5}\d{4}[a-z]\b", re.IGNORECASE)
# 13-19 digit card numbers.
_CARD = re.compile(r"\b(?:\d[ -]?){12,18}\d\b")
# 9-18 digit bank/IFSC-ish runs that are not Aadhaar.
_LONG_DIGITS = re.compile(r"\b\d{9,18}\b")
_IFSC = re.compile(r"\b[a-z]{4}0[a-z0-9]{6}\b", re.IGNORECASE)
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)",
    r"disregard\s+(all\s+)?(previous|above|prior)",
    r"you\s+are\s+now\s+(a|an)\s+",
    r"system\s*prompt",
    r"reveal\s+(your|the)\s+(instructions|prompt|rules)",
    r"pretend\s+to\s+be",
    r"jailbreak",
    r"developer\s+mode",
    r"(हटाना|भूल)\s+(जाओ|जाएँ)\s+(निर्देश|बातें)",
]
_INJECTION = [re.compile(p, re.IGNORECASE) for p in _INJECTION_PATTERNS]

# Words that indicate the user is being asked for something SAARTHI must never collect.
SECRET_HINTS = {
    "aadhaar number", "aadhar number", "password", "otp", "pin", "cvv",
    "card number", "bank account password", "आधार नंबर", "पासवर्ड", "ओटीपी", "पिन"
}


class UnsafeInputError(ValueError):
    """Raised when input must be rejected outright."""


def sanitize(text: str, max_length: int | None = None) -> str:
    """Normalise whitespace, strip control characters and cap length."""
    max_length = max_length or settings.max_query_length
    if not text:
        return ""
    text = _CONTROL.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_length:
        raise UnsafeInputError("query_too_long")
    return text


def redact_pii(text: str) -> str:
    """Replace anything that looks like a secret with a placeholder.

    Order matters: the longest patterns are applied first, otherwise the first
    12 digits of a 16-digit card number are swallowed by the Aadhaar rule and
    the card is only partially redacted.
    """
    redacted = _CARD.sub("[CARD-REDACTED]", text)
    redacted = _AADHAAR.sub("[AADHAAR-REDACTED]", redacted)
    redacted = _PAN.sub("[PAN-REDACTED]", redacted)
    redacted = _IFSC.sub("[IFSC-REDACTED]", redacted)
    redacted = _LONG_DIGITS.sub("[NUMBER-REDACTED]", redacted)
    return redacted


def looks_like_injection(text: str) -> bool:
    return any(p.search(text or "") for p in _INJECTION)


def mentions_secrets(text: str) -> bool:
    lowered = (text or "").lower()
    return any(hint in lowered for hint in SECRET_HINTS)


def contains_digits(text: str) -> bool:
    return any(ch.isdigit() for ch in text or "")


def safe_for_logging(text: str) -> str:
    """Query text safe to write to a log line."""
    if not settings.redact_pii_in_logs:
        return text
    return redact_pii(text)[:120]
