from __future__ import annotations

import re

from aiadapply_v2.schemas import ParsedJob
from aiadapply_v2.text import dedupe, normalize_text, sha256_text

JOB_START = re.compile(
    r"^(?:About the job|Job Description|About (?:This|The) Role|What You['\u2019]ll Do:?)\s*$",
    re.IGNORECASE | re.MULTILINE,
)
OFFICIAL_JOB_SIGNAL = re.compile(
    r"^(?:Date Posted:.*|What You Will Do|Qualifications You Must Have|"
    r"Qualifications We Prefer)\s*:?$",
    re.IGNORECASE | re.MULTILINE,
)
JOB_END = re.compile(
    r"^(?:Benefits found in job post|Set alert for similar jobs|"
    r"Put your best foot forward|Show Premium Insights|Privacy Policy and Terms:?|"
    r"Similar Jobs(?:\s*\(\d+\))?|Apply for this job)\s*$",
    re.IGNORECASE | re.MULTILINE,
)
SCORE = re.compile(r"(\d+)\s+(?:out\s+of|of)\s+(\d+).*?keywords?", re.IGNORECASE)
LINKEDIN_URL = re.compile(r"https?://(?:www\.)?linkedin\.com/jobs/[^\s]+", re.IGNORECASE)
OFFICIAL_URL = re.compile(r"^Official posting:\s*(https?://[^\s]+)", re.IGNORECASE | re.MULTILINE)
LOCATION = re.compile(
    r"^([A-Za-z][A-Za-z .'-]+,\s*[A-Z]{2})(?:\s*[|·]\s*|\s*$)",
    re.MULTILINE,
)
REMOTE_LOCATION = re.compile(
    r"^((?:United States|USA|US)\s*\(Remote\)|Remote(?:,\s*(?:US|USA|United States))?)"
    r"(?:\s*[|·]\s*|\s*$)",
    re.IGNORECASE | re.MULTILINE,
)
OFFICIAL_LOCATION = re.compile(
    r"^([A-Za-z][A-Za-z .'-]+,\s*[A-Z][A-Za-z ]+),\s*United States(?: of America)?\s*$",
    re.IGNORECASE | re.MULTILINE,
)
HEADINGS = {
    "responsibilities": (
        "what you'll do",
        "what you will do",
        "what you'll be doing",
        "you will",
        "your team will",
        "in this role, you will",
        "responsibilities",
        "core responsibilities",
        "job responsibilities",
        "your responsibilities",
        "technical support engineer key responsibilities",
        "essential functions & responsibilities",
        "essential job duties and responsibilities",
        "essential functions",
        "key responsibilities",
        "your key responsibilities include",
        "operational support",
        "required duties",
        "functions and duties of this role include, but not limited to",
        "accountabilities",
        "your impact",
        "key performance indicators",
    ),
    "required": (
        "what you'll bring",
        "required qualifications",
        "qualifications you must have",
        "required qualifications, capabilities and skills",
        "required technical experience (must)",
        "required education/credentials/qualifications",
        "qualifications",
        "minimum requirements",
        "basic requirements",
        "required experience",
        "necessary skills/abilities",
        "required skills, knowledge and abilities",
        "knowledge/skills/abilities",
        "knowledge, skills and abilities",
        "knowledge skills and abilities",
        "what we require",
        "what we're looking for",
        "what we are looking for",
        "requirements",
        "job qualifications/requirements",
        "what you bring",
        "what you have",
        "who you are",
        "who this role is for",
        "about you",
        "your profile",
        "qualifications & experience",
        "competencies",
        "education",
        "your education and experience",
        "technical knowledge",
        "additionally, it support analyst is expected to demonstrate",
    ),
    "preferred": (
        "preferred",
        "preferred qualifications",
        "qualifications we prefer",
        "preferred qualifications, capabilities and skills",
        "nice to haves/other",
        "nice to have",
        "nice-to-have requirements",
        "nice to have but not required",
        "bonus points if you have",
        "preferred technical experience",
        "what we prefer",
        "experience that would be helpful",
        "bonus traits",
        "preferred skills",
        "strongly preferred",
    ),
}
QUALIFICATION_SUBHEADINGS = {
    "education/credentials",
    "education and credentials",
    "prior experience",
    "technical skills",
    "experience",
    "minimum qualifications",
    "minimum required",
}
RESPONSIBILITY_SUBHEADINGS = {
    "operational support",
    "documentation & process management",
    "documentation, compliance & collaboration",
    "continuous improvement",
    "collaboration",
    "application & end user support",
    "system operations & maintenance",
    "application & platform support",
    "systems & data operations",
    "customer communication & experience",
    "integration & saas tool support",
    "tooling & operational excellence",
    "client support & issue resolution",
    "onboarding & implementation execution",
    "account maintenance & accuracy",
    "systems, tools & process improvement",
    "product & customer support",
    "field responsibilities",
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
    if not JOB_START.search(normalized) and len(OFFICIAL_JOB_SIGNAL.findall(normalized)) < 2:
        raise ValueError("Paste does not contain a recognizable job-description boundary.")

    title, company = _extract_title_company(normalized)
    job_description, rejected = _extract_job_region(normalized)
    section_map = _split_job_sections(job_description)
    high = _extract_keyword_panel(normalized, "High Priority Keywords")
    low = _extract_keyword_panel(normalized, "Low Priority Keywords")
    score_match = SCORE.search(normalized)
    url_match = LINKEDIN_URL.search(normalized)
    official_url_match = OFFICIAL_URL.search(normalized)

    return ParsedJob(
        company=company,
        title=title,
        location=_extract_location(normalized),
        work_arrangement=_extract_work_arrangement(normalized),
        compensation=_extract_compensation(normalized),
        source_url=(
            official_url_match.group(1)
            if official_url_match
            else url_match.group(0)
            if url_match
            else None
        ),
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
    location_title = ""
    for index, line in enumerate(lines):
        match = re.match(r"^Company\s*(?:logo for,|,)\s*(.+?)\.?$", line, re.IGNORECASE)
        if not match:
            continue
        company = match.group(1).strip()
        candidates = lines[index + 1 : index + 9]
        for candidate in candidates:
            if candidate.casefold().rstrip(".") == company.casefold().rstrip("."):
                company = candidate
                continue
            if _is_navigation(candidate):
                continue
            if 4 <= len(candidate) <= 140:
                return _strip_verified_suffix(candidate), company

    if len(OFFICIAL_JOB_SIGNAL.findall(raw)) >= 2:
        date_index = next(
            (index for index, line in enumerate(lines) if re.match(r"^Date Posted:", line, re.I)),
            min(len(lines), 20),
        )
        title = next(
            (
                line
                for line in lines[:date_index]
                if re.match(r"^(?:Raytheon\s+)?Full-time\s+.+", line, re.I)
                and not line.casefold().endswith("page is loaded")
            ),
            "",
        ) or next(
            (
                line
                for line in lines[:date_index]
                if not _looks_like_official_metadata(line)
                and not re.fullmatch(
                    r"(?:Raytheon|RTX|Collins Aerospace|Pratt & Whitney)", line, re.I
                )
                and 6 <= len(line) <= 180
            ),
            "",
        )
        company = next(
            (
                line
                for line in lines[:date_index]
                if re.fullmatch(r"(?:Raytheon|Collins Aerospace|Pratt & Whitney)", line, re.I)
            ),
            "",
        )
        if not company:
            company = next(
                (
                    match.group(1)
                    for line in lines[:date_index]
                    if (
                        match := re.match(
                            r"^(Raytheon|Collins Aerospace|Pratt & Whitney)\s+"
                            r"(?:Full-time|Part-time)\b",
                            line,
                            re.I,
                        )
                    )
                ),
                "",
            )
        if not company:
            rtx_business = next(
                (
                    match.group(1)
                    for line in lines
                    if (
                        match := re.search(
                            r"\bRTX\b.*\b(Raytheon|Collins Aerospace|Pratt & Whitney)\b",
                            line,
                            re.I,
                        )
                    )
                ),
                "",
            )
            company = rtx_business
        if title and company:
            return _strip_official_title(title), company

    start = JOB_START.search(raw)
    prefix = raw[: start.start()] if start else raw[:2000]
    prefix_lines = [line.strip() for line in prefix.splitlines() if line.strip()]
    for index, line in enumerate(prefix_lines):
        if not (LOCATION.match(line) or REMOTE_LOCATION.match(line)):
            continue
        candidates = [
            value
            for value in prefix_lines[max(0, index - 4) : index]
            if not _is_navigation(value)
            and not re.match(r"^Company\s*(?:logo for,|,)", value, re.IGNORECASE)
        ]
        if len(candidates) >= 2:
            return _strip_verified_suffix(candidates[-1]), candidates[-2]
        if candidates:
            location_title = _strip_verified_suffix(candidates[-1])
    for index, line in enumerate(prefix_lines):
        if re.search(r"\b(?:full-time|part-time|hybrid|remote|on-site)\b", line, re.I):
            previous = [
                value
                for value in prefix_lines[max(0, index - 5) : index]
                if not _is_navigation(value)
            ]
            if len(previous) >= 2:
                return _strip_verified_suffix(previous[-2]), previous[-1]
    about_company = next(
        (
            match.group(1).strip()
            for line in lines
            if (
                match := re.fullmatch(
                    r"About\s+(?!the job$|this role$|the role$)([A-Za-z0-9][A-Za-z0-9 .&'/-]{1,100})",
                    line,
                    re.I,
                )
            )
        ),
        "",
    )
    if location_title and about_company:
        return location_title, about_company
    return "", ""


def _strip_verified_suffix(value: str) -> str:
    return re.sub(r"\s*\(Verified job\).*?$", "", value, flags=re.IGNORECASE).strip()


def _strip_official_title(value: str) -> str:
    return re.sub(r"^(?:Raytheon\s+)?Full-time\s+", "", value, flags=re.IGNORECASE).strip()


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
        "banner",
        "back to jobs",
        "apply",
        "save",
    }


def _looks_like_official_metadata(value: str) -> bool:
    return bool(
        re.match(
            r"^(?:rtx_logo|-|\d+_[A-Za-z0-9_]+|Location\b|Category\b|Job Type\b|"
            r"Onsite\b|Relocation\b|Job ID\b|Saved\b|Back to search results\b)",
            value,
            re.I,
        )
    )


def _extract_job_region(raw: str) -> tuple[str, list[str]]:
    start = JOB_START.search(raw)
    if not start:
        if len(OFFICIAL_JOB_SIGNAL.findall(raw)) < 2:
            return raw.strip(), []
        official_start = re.search(r"^Date Posted:.*$", raw, re.IGNORECASE | re.MULTILINE)
        start_index = official_start.start() if official_start else 0
        end = JOB_END.search(raw, start_index)
        end_index = end.start() if end else len(raw)
        official_rejected = []
        if start_index > 0:
            official_rejected.append("employer_navigation_and_job_chrome")
        if end:
            official_rejected.append("employer_recommendations_legal_and_footer")
        return raw[start_index:end_index].strip(), official_rejected
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
    # Employer pages may put a title ending in a state abbreviation before the
    # full city/state/country location. Prefer that explicit official location.
    for pattern in (OFFICIAL_LOCATION, LOCATION, REMOTE_LOCATION):
        match = pattern.search(raw)
        if match:
            return match.group(1).strip()
    narrative = re.search(
        r"\blocated in\s+([A-Za-z][A-Za-z .'-]+,\s*[A-Z][A-Za-z ]+)(?:[.,]|$)",
        raw,
        re.IGNORECASE,
    )
    if narrative:
        return narrative.group(1).strip()
    return ""


def _extract_work_arrangement(raw: str) -> str:
    job_start = JOB_START.search(raw)
    prefix = raw[: job_start.start()] if job_start else raw[:2000]
    job_description = raw[job_start.end() :] if job_start else raw
    fallbacks = (
        (
            "Hybrid",
            r"\b(?:hybrid\s+(?:office|work(?:ing)?|environment|role)|work mode is hybrid)\b",
        ),
        ("Remote", r"\b(?:fully remote|remote (?:position|role|environment))\b"),
        ("On-site", r"\b(?:fully )?on[ -]?site\s+(?:position|role|environment)\b"),
    )
    for value, pattern in fallbacks:
        if re.search(pattern, job_description, re.IGNORECASE):
            return value
    for value in ("Hybrid", "Remote", "On-site"):
        pattern = r"On-?site" if value == "On-site" else re.escape(value)
        if re.search(rf"(?im)^{pattern}\s*$", prefix):
            return value
    return ""


def _extract_compensation(job_description: str) -> str:
    patterns = (
        r"\d[\d,]*(?:\.\d+)?\s*USD\s*(?:-|to|\u2013|\u2014)\s*"
        r"\d[\d,]*(?:\.\d+)?\s*USD",
        r"\$\s?\d[\d,]*(?:\.\d+)?[Kk]?(?:/(?:yr|year|hr|hour))?\s*"
        r"(?:-|to|\u2013|\u2014)\s*\$\s?\d[\d,]*(?:\.\d+)?[Kk]?"
        r"(?:/(?:yr|year|hr|hour))?",
        r"\$\s?\d[\d,]*(?:\.\d+)?[Kk]?/(?:yr|year|hr|hour)",
        r"\$\d[\d,]*(?:\.\d+)?[Kk]?(?:/(?:yr|year|hr|hour))?\s*[-—]\s*"
        r"\$\d[\d,]*(?:\.\d+)?[Kk]?(?:/(?:yr|year|hr|hour))?",
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
    qualifications_started = False
    all_headers = {header: group for group, values in HEADINGS.items() for header in values}
    for raw_line in job_description.splitlines():
        line = raw_line.strip(" \t-*•")
        line = re.sub(r"^//\s*", "", line)
        line = re.sub(r"^\d+[.)]\s*", "", line)
        if not line:
            continue
        normalized = line.rstrip(":").casefold().replace("\u2019", "'").replace("\u2018", "'")
        if normalized in all_headers:
            current = all_headers[normalized]
            if current in {"required", "preferred"}:
                qualifications_started = True
            continue
        if normalized in RESPONSIBILITY_SUBHEADINGS:
            current = "responsibilities"
            continue
        if normalized in QUALIFICATION_SUBHEADINGS:
            current = "required"
            qualifications_started = True
            continue
        if _ends_hiring_sections(normalized):
            current = ""
            continue
        if _looks_like_new_header(line):
            current = ""
            continue
        if _looks_malformed(line):
            continue
        if not current and not qualifications_started and _looks_like_unheaded_responsibility(line):
            result["responsibilities"].append(line)
            continue
        if current and 15 <= len(line) <= 500:
            destination = (
                "preferred"
                if current == "required"
                and (
                    re.match(r"^preferred(?: qualifications?)?\s*:", line, re.I)
                    or re.search(
                        r"\b(?:(?:is|are|would be)\s+an?\s+asset|"
                        r"(?:is|are)\s+preferred|is\s+a\s+plus|preferred|advantageous)\b",
                        line,
                        re.I,
                    )
                )
                else current
            )
            result[destination].append(line)
    return {key: dedupe(values) for key, values in result.items()}


def _looks_like_unheaded_responsibility(line: str) -> bool:
    return bool(
        re.match(
            r"^(?:administer|analy[sz]e|build|collaborate|configure|coordinate|"
            r"create|diagnose|document|ensure|implement|investigate|liaison|maintain|"
            r"manage|monitor|optimize|perform|provide|responsible\b|review|support|"
            r"test|troubleshoot|validate)\b",
            line,
            re.I,
        )
    )


def _looks_malformed(line: str) -> bool:
    return bool(re.search(r"\bsuchs\s*[.!]?$", line, re.IGNORECASE))


def _looks_like_new_header(line: str) -> bool:
    words = line.rstrip(":").split()
    return line.endswith(":") and len(words) <= 8


def _ends_hiring_sections(normalized: str) -> bool:
    prefixes = (
        "about ",
        "benefits",
        "additional information",
        "compensation",
        "equal opportunity",
        "protecting yourself",
        "salary",
        "the salary",
        "us salary range",
        "why join us",
        "why coreweave",
        "why work with us",
        "our offer",
        "what you won't be doing",
        "what this role is",
        "role basics",
        "attributes",
        "what we give",
        "what we offer",
        "what you will learn",
        "success in this role",
        "candidate profile",
        "data privacy",
        "work environment",
        "important application information",
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
