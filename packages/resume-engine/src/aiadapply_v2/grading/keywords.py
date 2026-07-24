from __future__ import annotations

import re
from collections import Counter

from aiadapply_v2.schemas import (
    JobKeyword,
    KeywordKind,
    KeywordPriority,
    ParsedJob,
)
from aiadapply_v2.text import contains_term, count_term, dedupe, normalized_term

TERM_CATALOG: dict[str, KeywordKind] = {
    "Active Directory": KeywordKind.system,
    "AI": KeywordKind.environment,
    "API": KeywordKind.system,
    "APIs": KeywordKind.system,
    "AWS": KeywordKind.system,
    "Azure": KeywordKind.system,
    "B2B SaaS": KeywordKind.environment,
    "Bash": KeywordKind.system,
    "CAD": KeywordKind.system,
    "case management": KeywordKind.action,
    "change management": KeywordKind.action,
    "cloud computing": KeywordKind.environment,
    "command line": KeywordKind.system,
    "compliance": KeywordKind.environment,
    "Confluence": KeywordKind.system,
    "configuration": KeywordKind.action,
    "CRUD": KeywordKind.action,
    "customer case ownership": KeywordKind.action,
    "customer service": KeywordKind.action,
    "data integration": KeywordKind.action,
    "database": KeywordKind.system,
    "diagnostics": KeywordKind.action,
    "enterprise software": KeywordKind.environment,
    "failure analysis": KeywordKind.action,
    "fintech": KeywordKind.environment,
    "Google Cloud": KeywordKind.system,
    "Grafana": KeywordKind.system,
    "hosting environment": KeywordKind.environment,
    "incident management": KeywordKind.action,
    "incident response": KeywordKind.action,
    "incident triage": KeywordKind.action,
    "iOS": KeywordKind.system,
    "Jira": KeywordKind.system,
    "knowledge base": KeywordKind.action,
    "LAN/WAN": KeywordKind.system,
    "Linux": KeywordKind.system,
    "log analysis": KeywordKind.action,
    "macOS": KeywordKind.system,
    "Microsoft 365": KeywordKind.system,
    "OAuth": KeywordKind.system,
    "observability": KeywordKind.action,
    "operational availability": KeywordKind.outcome,
    "operating systems": KeywordKind.system,
    "PagerDuty": KeywordKind.system,
    "Palantir Foundry": KeywordKind.system,
    "Postman": KeywordKind.system,
    "PowerShell": KeywordKind.system,
    "process improvement": KeywordKind.action,
    "product operations": KeywordKind.environment,
    "Python": KeywordKind.system,
    "reliability": KeywordKind.outcome,
    "REST APIs": KeywordKind.system,
    "root cause analysis": KeywordKind.action,
    "SaaS": KeywordKind.environment,
    "Salesforce": KeywordKind.system,
    "SAML": KeywordKind.system,
    "service delivery": KeywordKind.action,
    "service desk": KeywordKind.environment,
    "ServiceNow": KeywordKind.system,
    "SFTP": KeywordKind.system,
    "Slack": KeywordKind.system,
    "SLA": KeywordKind.outcome,
    "SQL": KeywordKind.system,
    "SSO": KeywordKind.system,
    "technical support": KeywordKind.environment,
    "technical writing": KeywordKind.action,
    "ticketing": KeywordKind.action,
    "troubleshooting": KeywordKind.action,
    "UNIX": KeywordKind.system,
    "Zendesk": KeywordKind.system,
}
MALFORMED = re.compile(r"^[^A-Za-z0-9]*$|^[A-Za-z]$|[&/]$")
BOILERPLATE_ONLY = {"intellectual property", "equal opportunity", "artificial intelligence"}
GENERIC = {"ai", "business objectives", "customer needs", "product features", "gaming"}


def grade_job_keywords(job: ParsedJob) -> list[JobKeyword]:
    simplify_high = {normalized_term(value) for value in job.high_priority_keywords}
    simplify_low = {normalized_term(value) for value in job.low_priority_keywords}
    candidates = dedupe(
        [
            *job.high_priority_keywords,
            *job.low_priority_keywords,
            *(term for term in TERM_CATALOG if contains_term(job.job_description, term)),
        ]
    )

    graded = [
        _grade_one(job, term, simplify_high=simplify_high, simplify_low=simplify_low)
        for term in candidates
    ]
    return sorted(
        graded,
        key=lambda item: (item.accepted, item.hiring_importance, item.placement_utility),
        reverse=True,
    )


def accepted_keywords(keywords: list[JobKeyword]) -> list[JobKeyword]:
    return [keyword for keyword in keywords if keyword.accepted]


def _grade_one(
    job: ParsedJob,
    term: str,
    *,
    simplify_high: set[str],
    simplify_low: set[str],
) -> JobKeyword:
    normalized = normalized_term(term)
    factors: Counter[str] = Counter()
    sections: list[str] = []
    priority = KeywordPriority.inferred

    if normalized in simplify_high:
        priority = KeywordPriority.high
        factors["simplify_high"] += 12
        sections.append("simplify_high")
    elif normalized in simplify_low:
        priority = KeywordPriority.low
        factors["simplify_low"] += 4
        sections.append("simplify_low")

    required_occurrences = _count_in_lines(job.required_qualifications, term)
    responsibility_occurrences = _count_in_lines(job.responsibilities, term)
    preferred_occurrences = _count_in_lines(job.preferred_qualifications, term)
    title_occurrences = count_term(job.title, term)
    total_occurrences = count_term(job.job_description, term)

    if required_occurrences:
        factors["required_qualification"] += 25
        sections.append("required")
    if responsibility_occurrences:
        factors["responsibility"] += 18
        factors["responsibility_repetition"] += min(8, 2 * (responsibility_occurrences - 1))
        sections.append("responsibilities")
    if preferred_occurrences:
        factors["preferred_qualification"] += 6
        sections.append("preferred")
    if title_occurrences:
        factors["title"] += 15
        sections.append("title")
    if TERM_CATALOG.get(term, TERM_CATALOG.get(_catalog_key(normalized))) == KeywordKind.system:
        factors["specific_system"] += 10
    if total_occurrences >= 2:
        factors["posting_repetition"] += min(8, total_occurrences * 2)

    rejection = ""
    if MALFORMED.search(term.strip()) or len(normalized) < 2:
        factors["malformed"] -= 50
        rejection = "Malformed or truncated keyword."
    if normalized in BOILERPLATE_ONLY:
        factors["legal_or_company_boilerplate"] -= 50
        rejection = "Legal or company boilerplate, not a hiring requirement."
    if normalized in GENERIC and not (
        required_occurrences or responsibility_occurrences or preferred_occurrences
    ):
        factors["generic_outside_requirements"] -= 30
        rejection = "Generic term appears outside the role requirements."
    if normalized == "fusion" and not (
        required_occurrences or responsibility_occurrences or preferred_occurrences
    ):
        factors["company_marketing_only"] -= 40
        rejection = "Term appears in company/product marketing rather than candidate requirements."

    score = min(100.0, max(0.0, float(sum(factors.values()))))
    accepted = score >= 6 and not rejection
    placement = min(
        100.0,
        max(
            0.0,
            score
            + (10 if _kind_for(term) in {KeywordKind.system, KeywordKind.action} else 0)
            - (8 if normalized in GENERIC else 0),
        ),
    )
    return JobKeyword(
        term=term,
        normalized=normalized,
        priority=priority,
        kind=_kind_for(term) if accepted else KeywordKind.noise,
        occurrences=total_occurrences,
        source_sections=dedupe(sections),
        scoring_factors=dict(factors),
        hiring_importance=score,
        placement_utility=placement,
        accepted=accepted,
        rejection_reason=rejection,
    )


def _count_in_lines(lines: list[str], term: str) -> int:
    return sum(count_term(line, term) for line in lines)


def _catalog_key(normalized: str) -> str:
    return next(
        (term for term in TERM_CATALOG if normalized_term(term) == normalized),
        "",
    )


def _kind_for(term: str) -> KeywordKind:
    return TERM_CATALOG.get(
        term, TERM_CATALOG.get(_catalog_key(normalized_term(term)), KeywordKind.vocabulary)
    )
