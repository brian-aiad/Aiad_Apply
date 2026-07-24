from __future__ import annotations

import re

from aiadapply_v2.grading.keywords import accepted_keywords
from aiadapply_v2.schemas import JobKeyword, KeywordKind, ParsedJob, TargetRoleProfile
from aiadapply_v2.text import contains_term, dedupe

ROLE_FAMILIES: dict[str, tuple[str, ...]] = {
    "technical_support_integrations": (
        "technical support engineer",
        "integrations",
        "api troubleshooting",
        "customer cases",
    ),
    "product_operations": (
        "product operations",
        "operational availability",
        "fleet",
        "deployed capabilities",
        "failure data",
    ),
    "technical_operations_support": (
        "technical operations support",
        "operational support",
        "sla",
        "platform stability",
        "service availability",
    ),
    "it_service_desk": (
        "service desk",
        "tier 1",
        "lan/wan",
        "end user",
        "microsoft 365",
    ),
}


def build_target_role_profile(
    job: ParsedJob,
    keywords: list[JobKeyword],
) -> TargetRoleProfile:
    accepted = accepted_keywords(keywords)
    family = _role_family(job)
    systems = [item.term for item in accepted if item.kind == KeywordKind.system]
    actions = [item.term for item in accepted if item.kind == KeywordKind.action]
    environments = [item.term for item in accepted if item.kind == KeywordKind.environment]
    outcomes = [item.term for item in accepted if item.kind == KeywordKind.outcome]
    rejected = [item.term for item in keywords if not item.accepted]

    return TargetRoleProfile(
        company=job.company,
        title=job.title or "Unknown Role",
        normalized_role_family=family,
        professional_identity=_professional_identity(job, family),
        seniority=_seniority(job),
        industry=_industry(job.job_description),
        core_systems=systems[:16],
        core_actions=dedupe([*actions, *_action_phrases(job)])[:16],
        environment_signals=dedupe([*environments, *_environment_signals(job)])[:12],
        customer_or_stakeholder_type=_stakeholders(job.job_description),
        primary_responsibilities=job.responsibilities[:16],
        required_qualifications=job.required_qualifications[:16],
        preferred_qualifications=job.preferred_qualifications[:16],
        high_priority_keywords=[item.term for item in accepted if item.hiring_importance >= 35],
        secondary_keywords=[item.term for item in accepted if item.hiring_importance < 35],
        noisy_rejected_keywords=rejected,
        expected_outcome_language=dedupe([*outcomes, *_outcomes(job.job_description)])[:12],
        expected_metrics=_expected_metrics(job.job_description),
        role_specific_vocabulary=dedupe(
            [item.term for item in accepted if item.placement_utility >= 20]
        )[:24],
        role_specific_action_verbs=_action_verbs(job.job_description),
    )


def _role_family(job: ParsedJob) -> str:
    body = f"{job.title}\n{job.job_description}".lower()
    title = job.title.lower()
    scores: dict[str, int] = {}
    for family, signatures in ROLE_FAMILIES.items():
        scores[family] = sum(body.count(signature) for signature in signatures)
        scores[family] += 3 * sum(title.count(signature) for signature in signatures)
    return (
        max(scores, key=lambda family: scores[family])
        if max(scores.values(), default=0)
        else "technical_support"
    )


def _professional_identity(job: ParsedJob, family: str) -> str:
    if family == "technical_support_integrations":
        return "Technical Support Engineer focused on integrations and customer case resolution"
    if family == "product_operations":
        return (
            "Product Operations Technical Specialist focused on incident resolution "
            "and availability"
        )
    if family == "technical_operations_support":
        return (
            "Technical Operations Support Analyst focused on platform stability and SLA execution"
        )
    if family == "it_service_desk":
        return "Technical Analyst focused on service delivery and escalated infrastructure support"
    return f"{job.title} focused on technical problem resolution"


def _seniority(job: ParsedJob) -> str:
    ranges = re.findall(r"\b(\d+)\s*(?:-|–|to)\s*(\d+)\s+years", job.job_description, re.I)
    plus = re.findall(r"\b(\d+)\+\s+years", job.job_description, re.I)
    minimum = int(ranges[0][0]) if ranges else int(plus[0]) if plus else 0
    if minimum <= 1:
        return "entry"
    if minimum <= 3:
        return "entry_mid"
    if minimum <= 6:
        return "mid"
    return "senior"


def _industry(text: str) -> list[str]:
    catalog = {
        "fintech": ("fintech", "accounting", "finance platform"),
        "b2b_saas": ("b2b saas", "enterprise software", "cloud-based platform"),
        "defense_technology": ("defense technology", "military", "uas"),
        "cloud_gaming": ("cloud gaming", "streaming experiences", "playstation"),
        "managed_it_services": ("service desk", "managed it", "client infrastructure"),
    }
    return [
        name for name, terms in catalog.items() if any(contains_term(text, term) for term in terms)
    ]


def _action_phrases(job: ParsedJob) -> list[str]:
    catalog = (
        "troubleshooting",
        "incident triage",
        "root cause analysis",
        "configuration",
        "case management",
        "log analysis",
        "documentation",
        "process improvement",
        "failure analysis",
        "escalation",
    )
    return [term for term in catalog if contains_term(job.job_description, term)]


def _environment_signals(job: ParsedJob) -> list[str]:
    catalog = (
        "B2B SaaS",
        "production",
        "operational",
        "customer-facing",
        "cross-functional",
        "fast-paced",
        "on-call",
        "after-hours",
        "limited risk tolerance",
    )
    return [term for term in catalog if contains_term(job.job_description, term)]


def _stakeholders(text: str) -> list[str]:
    catalog = (
        "customers",
        "end users",
        "IT",
        "Engineering",
        "Product",
        "Customer Success",
        "technical stakeholders",
        "non-technical stakeholders",
        "global support teams",
        "client IT personnel",
    )
    return [term for term in catalog if contains_term(text, term)]


def _outcomes(text: str) -> list[str]:
    catalog = (
        "resolution",
        "availability",
        "reliability",
        "platform stability",
        "customer success",
        "operational efficiency",
        "SLA commitments",
        "timely response",
    )
    return [term for term in catalog if contains_term(text, term)]


def _expected_metrics(text: str) -> list[str]:
    catalog = (
        "resolution time",
        "SLA attainment",
        "availability",
        "incident volume",
        "response time",
    )
    return [term for term in catalog if contains_term(text, term)]


def _action_verbs(text: str) -> list[str]:
    verbs = (
        "own",
        "troubleshoot",
        "diagnose",
        "triage",
        "resolve",
        "configure",
        "analyze",
        "monitor",
        "document",
        "escalate",
        "coordinate",
        "improve",
        "sustain",
        "validate",
    )
    return [verb for verb in verbs if re.search(rf"\b{verb}\w*\b", text, re.I)]
