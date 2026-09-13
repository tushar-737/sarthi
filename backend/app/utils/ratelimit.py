"""A small in-memory sliding-window rate limiter.

Good enough for a prototype and for protecting a single-process deployment.
For multi-worker production use, swap the store for Redis while keeping the
same `RateLimiter` interface.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import dataclass


@dataclass
class RateLimitResult:
    allowed: bool
    remaining: int
    retry_after_seconds: int


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> RateLimitResult:
        now = time.time()
        window_start = now - self.window_seconds
        bucket = self._hits[key]

        while bucket and bucket[0] < window_start:
            bucket.popleft()

        if len(bucket) >= self.max_requests:
            retry_after = int(self.window_seconds - (now - bucket[0])) + 1
            return RateLimitResult(False, 0, max(retry_after, 1))

        bucket.append(now)
        return RateLimitResult(True, self.max_requests - len(bucket), 0)

    def reset(self, key: str | None = None) -> None:
        if key is None:
            self._hits.clear()
        else:
            self._hits.pop(key, None)


# One shared limiter for the whole process.
rate_limiter = RateLimiter(max_requests=20, window_seconds=60)


def configure(max_requests: int, window_seconds: int) -> RateLimiter:
    """Reconfigure the shared limiter from settings."""
    global rate_limiter
    rate_limiter = RateLimiter(max_requests=max_requests, window_seconds=window_seconds)
    return rate_limiter
