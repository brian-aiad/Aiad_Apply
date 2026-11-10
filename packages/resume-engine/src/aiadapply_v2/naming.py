from __future__ import annotations

import re
import unicodedata
from pathlib import Path

DEFAULT_CANDIDATE_NAME = "Brian Aiad"
MAX_RESUME_BASENAME_LENGTH = 120


def run_directory_basename(company: str, title: str, run_id: str, run_date: str) -> str:
    """Bound the human label while retaining the unique run identity."""
    label = re.sub(r"[^A-Za-z0-9]+", "_", f"{company}_{title}").strip("_")
    return f"{run_date}_{label[:72].rstrip('_') or 'unknown'}_run_{run_id[:8]}"


def resume_basename(
    company: str,
    title: str,
    *,
    candidate_name: str = DEFAULT_CANDIDATE_NAME,
    output_directory: str | Path | None = None,
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
    maximum = MAX_RESUME_BASENAME_LENGTH
    if output_directory is not None:
        # Word and Windows ZIP/file APIs can fail below an otherwise valid
        # component limit when the enclosing job/run folder is already long.
        maximum = min(maximum, 240 - len(str(output_directory)) - len(".docx") - 1)
        if maximum < 24:
            raise ValueError("Resume output directory is too long; choose a shorter output folder.")
    shortened = safe[:maximum].rstrip("_")
    return shortened or "Brian_Aiad_Resume"
