from __future__ import annotations

import re

from aiadapply_v2.schemas import ParsedJob

LINKEDIN_MARKERS = (
    "Home",
    "My Network",
    "Jobs",
    "Messaging",
    "About the job",
    "Easy Apply",
    "Apply",
    "Save",
)

SIMPLIFY_SCORE_RE = re.compile(r"(\d+)\s+(?:out\s+of|of)\s+(\d+).*?keywords?", re.IGNORECASE)
URL_RE = re.compile(r"https?://(?:www\.)?linkedin\.com/jobs/[^\s]+", re.IGNORECASE)
LOCATION_RE = re.compile(r"^([A-Za-z][A-Za-z .'-]+,\s*[A-Z]{2})\s*(?:·|•|\?)", re.MULTILINE)
JD_START_RE = re.compile(r"^(?:About the job|Job Description|About This Role)\s*$", re.IGNORECASE | re.MULTILINE)
JD_END_RE = re.compile(r"Set alert for similar jobs|Benefits found in job post|Show Premium Insights", re.IGNORECASE)

SECTION_END_RE = re.compile(
    r"^(?:Low Priority Keywords|Update Job Description|About the job|Profile|Resume|Autofill)$",
    re.IGNORECASE | re.MULTILINE,
)

NOISE_RE = re.compile(
    r"^(?:Simplify|V\d+|Keywords Score|Profile|Resume|Tailor Resume|Autofill|"
    r"High Priority Keywords|Low Priority Keywords|Try to get|Your resume has|"
    r"\d+/\d+|Report)$",
    re.IGNORECASE,
)


def parse_linkedin_simplify(raw: str) -> ParsedJob:
    if len(raw) < 500:
        raise ValueError("Paste is too short; copy the full LinkedIn job page.")
    marker_hits = sum(1 for marker in LINKEDIN_MARKERS if marker.lower() in raw.lower())
    if marker_hits < 2:
        raise ValueError("Paste does not look like LinkedIn job page text.")

    title, company = _extract_title_company(raw)
    location = _extract_location(raw)
    jd = _extract_job_description(raw)
    high = _extract_keyword_section(raw, "High Priority Keywords")
    low = _extract_keyword_section(raw, "Low Priority Keywords")
    score = _extract_score(raw)
    keywords = _dedupe(high + low)

    return ParsedJob(
        company=company,
        title=title,
        location=location,
        linkedin_url=_extract_url(raw),
        job_description=jd,
        simplify_keywords=keywords,
        high_priority_keywords=high,
        low_priority_keywords=low,
        simplify_score=score,
        keyword_source="simplify" if keywords else "fallback_jd",
        raw_paste=raw,
    )


def _extract_title_company(raw: str) -> tuple[str, str]:
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    for index, line in enumerate(lines):
        match = re.match(r"^Company logo for,\s*(.+?)\.?$", line, re.IGNORECASE)
        if match:
            company = match.group(1).strip().rstrip(".")
            for candidate in lines[index + 1 : index + 8]:
                if candidate.lower() == company.lower():
                    continue
                if 5 <= len(candidate) <= 120 and not _looks_like_nav(candidate):
                    return candidate, company
        match = re.match(r"^Company,\s*(.+?)\.?$", line, re.IGNORECASE)
        if match:
            company = match.group(1).strip().rstrip(".")
            for candidate in lines[index + 1 : index + 8]:
                if 5 <= len(candidate) <= 120 and not _looks_like_nav(candidate):
                    return candidate, company
    return "", ""


def _looks_like_nav(value: str) -> bool:
    lowered = value.lower()
    return lowered in {"home", "jobs", "messaging", "notifications", "apply", "save"}


def _extract_location(raw: str) -> str:
    match = LOCATION_RE.search(raw)
    return match.group(1).strip() if match else ""


def _extract_url(raw: str) -> str | None:
    match = URL_RE.search(raw)
    return match.group(0) if match else None


def _extract_job_description(raw: str) -> str:
    start = JD_START_RE.search(raw)
    if not start:
        return raw.strip()
    end = JD_END_RE.search(raw, start.end())
    return raw[start.end() : end.start() if end else len(raw)].strip()


def _extract_score(raw: str) -> tuple[int, int]:
    match = SIMPLIFY_SCORE_RE.search(raw)
    if not match:
        return (0, 0)
    return (int(match.group(1)), int(match.group(2)))


def _extract_keyword_section(raw: str, heading: str) -> list[str]:
    matches = list(re.finditer(rf"^{re.escape(heading)}\s*$", raw, re.IGNORECASE | re.MULTILINE))
    if not matches:
        return []
    start = matches[-1].end()
    end_match = SECTION_END_RE.search(raw, start)
    chunk = raw[start : end_match.start() if end_match else len(raw)]
    keywords: list[str] = []
    for line in chunk.splitlines():
        cleaned = _clean_keyword(line)
        if cleaned:
            keywords.append(cleaned)
    return _dedupe(keywords)


def _clean_keyword(value: str) -> str:
    cleaned = value.strip().strip(".,;:[]{}()\"'")
    if not cleaned:
        return ""
    if NOISE_RE.match(cleaned):
        return ""
    if len(cleaned) > 60:
        return ""
    if cleaned.endswith(("&", "/")):
        return ""
    if len(cleaned) == 1 and cleaned.isalpha():
        return ""
    if not any(ch.isalnum() for ch in cleaned):
        return ""
    return cleaned


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        key = value.lower()
        if key not in seen:
            out.append(value)
            seen.add(key)
    return out
