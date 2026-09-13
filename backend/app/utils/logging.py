"""Logging setup.

SAARTHI deliberately never logs free-text citizen queries at INFO level —
they can contain personal details. Only structural facts (service ids,
language, confidence, latency) are logged. See `app/utils/safety.py` for
the redaction helpers used when a query really must be recorded.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

_CONFIGURED = False


def setup_logging(level: int = logging.INFO) -> logging.Logger:
    global _CONFIGURED
    root = logging.getLogger("sarthi")
    if _CONFIGURED:
        return root

    root.setLevel(level)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
            datefmt="%H:%M:%S",
        )
    )
    root.addHandler(handler)
    root.propagate = False
    _CONFIGURED = True
    return root


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"sarthi.{name}")


def ensure_data_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path
