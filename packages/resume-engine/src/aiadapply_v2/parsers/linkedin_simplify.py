from __future__ import annotations

import re

from aiadapply_v2.schemas import ParsedJob
from aiadapply_v2.text import dedupe, normalize_text, sha256_text

JOB_START = re.compile(
    r"^(?:About the job|Job Description|About (?:This|The) Role)\s*$",
    re.IGNORECASE | re.MULTILINE,
)
JOB_END = re.compile(
    r"^(?:Benefits found in job post|Set alert for similar jobs|"
    r"Put your best foot forward|Show Premium Insights)\s*$",
    re.IGNORECASE | re.MULTILINE,
)
SCORE = re.compile(r"(\d+)\s+(?:out\s+of|of)\s+(\d+).*?keywords?", re.IGNORECASE)
LINKEDIN_URL = re.compile(r"https?://(?:www\.)?linkedin\.com/jobs/[^\s]+", re.IGNORECASE)
LOCATION = re.compile(
    r"^([A-Za-z][A-Za-z .'-]+,\s*[A-Z]{2})(?:\s*[|·]\s*|\s*$)",
    re.MULTILINE,
)
HEADINGS = {
    "responsibilities": (
        "what you'll do",
        "what you will do",
        "responsibilities",
        "key responsibilities",
        "operational support",
    ),
    "required": (
        "what you'll bring",
        "required qualifications",
        "required technical experience (must)",
        "required education/credentials/qualifications",
        "qualifications",
    ),
    "preferred": (
        "preferred qualifications",
        "nice to haves/other",
        "nice to have",
        "preferred technical experience",
    ),
}
RESPONSIBILITY_SUBHEADINGS = {
    "operational support",
    "documentation & process management",
    "continuous improvement",
    "collaboration",
}
NOISE_LINES = {
    "simplify",
    "v1",
    "v2",
    "keywords score",
    "profile",
    "resume",
    "tailor resume",
    "autofill",
    "report",
    "update job description",
}


def parse_linkedin_simplify(raw: str) -> ParsedJob:
    normalized = normalize_text(raw)
    if len(normalized) < 500:
        raise ValueError("Paste is too short; paste the complete LinkedIn or Simplify page.")
    if "about the job" not in normalized.lower() and "job description" not in normalized.lower():
        raise ValueError("Paste does not contain a recognizable job-description boundary.")

    title, company = _extract_title_company(normalized)
    job_description, rejected = _extract_job_region(normalized)
    section_map = _split_job_sections(job_description)
    high = _extract_keyword_panel(normalized, "High Priority Keywords")
    low = _extract_keyword_panel(normalized, "Low Priority Keywords")
    score_match = SCORE.search(normalized)
    url_match = LINKEDIN_URL.search(normalized)

    return ParsedJob(
        company=company,
        title=title,
        location=_extract_location(normalized),
        work_arrangement=_extract_work_arrangement(normalized),
        compensation=_extract_compensation(job_description),
        linkedin_url=url_match.group(0) if url_match else None,
        job_description=job_description,
        responsibilities=section_map["responsibilities"],
        required_qualifications=section_map["required"],
        preferred_qualifications=section_map["preferred"],
        high_priority_keywords=high,
        low_priority_keywords=low,
        simplify_score=(
            (int(score_match.group(1)), int(score_match.group(2))) if score_match else (0, 0)
        ),
        rejected_regions=rejected,
        raw_paste_sha256=sha256_text(normalized),
        raw_paste=normalized,
    )


def _extract_title_company(raw: str) -> tuple[str, str]:
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    for index, line in enumerate(lines):
        match = re.match(r"^Company (?:logo for,|,)\s*(.+?)\.?$", line, re.IGNORECASE)
        if not match:
            continue
        company = match.group(1).strip().rstrip(".")
        candidates = lines[index + 1 : index + 9]
        for candidate in candidates:
            if candidate.casefold() == company.casefold() or _is_navigation(candidate):
                continue
            if 4 <= len(candidate) <= 140:
                return _strip_verified_suffix(candidate), company

    start = JOB_START.search(raw)
    prefix = raw[: start.start()] if start else raw[:2000]
    lines = [line.strip() for line in prefix.splitlines() if line.strip()]
    for index, line in enumerate(lines):
        if re.search(r"\b(?:full-time|part-time|hybrid|remote|on-site)\b", line, re.I):
            previous = [
                value for value in lines[max(0, index - 5) : index] if not _is_navigation(value)
            ]
            if len(previous) >= 2:
                return _strip_verified_suffix(previous[-2]), previous[-1]
    return "", ""


def _strip_verified_suffix(value: str) -> str:
    return re.sub(r"\s*\(Verified job\).*?$", "", value, flags=re.IGNORECASE).strip()


def _is_navigation(value: str) -> bool:
    return value.casefold() in {
        "home",
        "my network",
        "jobs",
        "messaging",
        "notifications",
        "me",
        "for business",
        "learning",
        "apply",
        "save",
    }


def _extract_job_region(raw: str) -> tuple[str, list[str]]:
    start = JOB_START.search(raw)
    if not start:
        return raw.strip(), []
    end = JOB_END.search(raw, start.end())
    end_index = end.start() if end else len(raw)
    job = raw[start.end() : end_index].strip()
    rejected: list[str] = []
    if start.start() > 0:
        rejected.append("linkedin_navigation_and_job_chrome")
    if end:
        rejected.append("linkedin_insights_recommendations_and_footer")
    return job, rejected


def _extract_location(raw: str) -> str:
    match = LOCATION.search(raw)
    return match.group(1).strip() if match else ""


def _extract_work_arrangement(raw: str) -> str:
    job_start = JOB_START.search(raw)
    prefix = raw[: job_start.start()] if job_start else raw[:2000]
    for value in ("Hybrid", "Remote", "On-site"):
        if re.search(rf"(?im)^{re.escape(value)}\s*$", prefix):
            return value
    return ""


def _extract_compensation(job_description: str) -> str:
    patterns = (
        r"\$\d[\d,]*(?:\.\d+)?\s*[-–]\s*\$\d[\d,]*(?:\.\d+)?(?:\s*(?:USD|/yr|per year))?",
        r"\$\d[\d,]*(?:\.\d+)?\s*(?:—|-)\s*\$\d[\d,]*(?:\.\d+)?\s*USD",
    )
    for pattern in patterns:
        match = re.search(pattern, job_description, re.IGNORECASE)
        if match:
            return match.group(0)
    return ""


def _split_job_sections(job_description: str) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {"responsibilities": [], "required": [], "preferred": []}
    current = ""
    all_headers = {header: group for group, values in HEADINGS.items() for header in values}
    for raw_line in job_description.splitlines():
        line = raw_line.strip(" \t-*•")
        if not line:
            continue
        normalized = line.rstrip(":").casefold()
        if normalized in all_headers:
            current = all_headers[normalized]
            continue
        if normalized in RESPONSIBILITY_SUBHEADINGS:
            current = "responsibilities"
            continue
        if _ends_hiring_sections(normalized):
            current = ""
            continue
        if _looks_like_new_header(line):
            current = ""
            continue
        if current and 15 <= len(line) <= 500:
            destination = (
                "preferred"
                if current == "required"
                and re.search(r"\b(?:is|are|would be)\s+an?\s+asset\b", line, re.I)
                else current
            )
            result[destination].append(line)
    return {key: dedupe(values) for key, values in result.items()}


def _looks_like_new_header(line: str) -> bool:
    words = line.rstrip(":").split()
    return line.endswith(":") and len(words) <= 8


def _ends_hiring_sections(normalized: str) -> bool:
    prefixes = (
        "about ",
        "benefits",
        "compensation",
        "equal opportunity",
        "protecting yourself",
        "salary",
        "us salary range",
        "why join us",
        "success in this role",
        "candidate profile",
        "data privacy",
    )
    return normalized.startswith(prefixes)


def _extract_keyword_panel(raw: str, heading: str) -> list[str]:
    matches = list(re.finditer(rf"^{re.escape(heading)}\s*$", raw, re.I | re.M))
    if not matches:
        return []
    start = matches[-1].end()
    next_heading = re.search(
        r"^(?:Low Priority Keywords|Update Job Description|About the job)\s*$",
        raw[start:],
        re.I | re.M,
    )
    end = start + next_heading.start() if next_heading else len(raw)
    values: list[str] = []
    for line in raw[start:end].splitlines():
        cleaned = line.strip().strip(".,;:[]{}()\"'")
        lower = cleaned.casefold()
        if not cleaned or lower in NOISE_LINES:
            continue
        if re.fullmatch(r"\d+/\d+", cleaned) or "keywords are" in lower:
            continue
        if len(cleaned) > 60 or len(cleaned) == 1 or cleaned.endswith(("&", "/")):
            continue
        if not any(character.isalnum() for character in cleaned):
            continue
        values.append(cleaned)
    return dedupe(values)
