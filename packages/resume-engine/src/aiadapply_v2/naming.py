from __future__ import annotations

import re
import unicodedata

DEFAULT_CANDIDATE_NAME = "Brian Aiad"
MAX_RESUME_BASENAME_LENGTH = 120


def resume_basename(
    company: str,
    title: str,
    *,
    candidate_name: str = DEFAULT_CANDIDATE_NAME,
) -> str:
    """Return a readable, cross-platform-safe basename for a tailored resume."""
    pieces = [candidate_name, "Resume", company or "Unknown Company", title or "Unknown Role"]
    normalized = (
        unicodedata.normalize("NFKD", "_".join(pieces))
        .encode("ascii", errors="ignore")
        .decode("ascii")
    )
    normalized = normalized.replace("&", " and ")
    safe = re.sub(r"[^A-Za-z0-9]+", "_", normalized).strip("_")
    safe = re.sub(r"_+", "_", safe)
    shortened = safe[:MAX_RESUME_BASENAME_LENGTH].rstrip("_")
    return shortened or "Brian_Aiad_Resume"
