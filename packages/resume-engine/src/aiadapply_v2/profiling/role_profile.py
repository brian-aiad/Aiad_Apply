from __future__ import annotations

import re

from aiadapply_v2.grading.keywords import accepted_keywords, important_keywords
from aiadapply_v2.schemas import JobKeyword, KeywordKind, ParsedJob, TargetRoleProfile
from aiadapply_v2.text import contains_term, dedupe

ROLE_FAMILIES: dict[str, tuple[str, ...]] = {
    "semiconductor_manufacturing_engineering": (
        "semiconductor manufacturing engineer",
        "semiconductor processing",
        "cleanroom",
        "focal plane arrays",
        "wet etch",
    ),
    "rf_antenna_engineering": (
        "rf/microwave antenna",
        "antenna theory",
        "phased array antennas",
        "circulators",
        "radiators",
    ),
    "product_quality_engineering": (
        "product quality engineer",
        "material review board",
        "nonconforming material",
        "quality management system",
        "quality engineering",
    ),
    "manufacturing_engineering": (
        "manufacturing engineer",
        "manufacturing processes",
        "manufacturing plans",
        "bills of material",
        "production environment",
    ),
    "business_systems_functional": (
        "it systems functional",
        "business analysis",
        "supply chain applications",
        "use cases",
        "business requirements",
    ),
    "support_desk_engineering": (
        "support desk engineer",
        "first and second-line",
        "gpu cloud",
        "support tickets",
        "customer-first",
    ),
    "platform_support_analysis": (
        "platform support analyst",
        "platform issues",
        "trading platform",
        "client-facing",
        "knowledge base",
    ),
    "healthcare_application_support": (
        "epic application",
        "professional billing",
        "claims",
        "healthcare application",
    ),
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
        "technology support ii",
        "technical operations support",
        "operational support",
        "transaction processing",
        "operational agreements",
        "monitoring signals",
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
    "application_support_administration": (
        "application support administrator",
        "enterprise application support",
        "loan origination system",
        "encompass",
        "business rules",
        "system updates",
        "production support",
        "batch processing",
        "incident management",
        "core banking",
    ),
    "application_systems_engineering": (
        "application & systems engineer",
        "application systems engineering",
        "system validation",
        "test automation",
        "partner integrations",
        "firmware",
        "sdk",
    ),
    "erp_application_support": (
        "d365 technical analyst",
        "d365 f&o",
        "dynamics 365",
        "erp systems",
        "sox",
        "internal controls",
        "master data",
    ),
    "application_support_engineering": (
        "application support engineer",
        "application logs",
        "data synchronization",
        "platform reliability",
        "full stack",
    ),
    "product_support_engineering": (
        "product support engineer",
        "product functionality",
        "technical partner",
        "customer inquiries",
        "support enablement",
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
        high_priority_keywords=[item.term for item in important_keywords(keywords)],
        secondary_keywords=[
            item.term for item in accepted if item not in important_keywords(keywords)
        ],
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
    if family == "semiconductor_manufacturing_engineering":
        return (
            "Technical operations professional aligned to semiconductor manufacturing, "
            "data-driven troubleshooting, and production support"
        )
    if family == "rf_antenna_engineering":
        return (
            "Systems-oriented technical professional aligned to RF test, "
            "analysis, automation, and cross-functional troubleshooting"
        )
    if family == "product_quality_engineering":
        return (
            "Technical operations professional aligned to product quality, "
            "root-cause investigation, and documented corrective action"
        )
    if family == "manufacturing_engineering":
        return (
            "Technical operations professional aligned to manufacturing support, "
            "process improvement, and documented troubleshooting"
        )
    if family == "business_systems_functional":
        return (
            "Business Systems Support Analyst focused on requirements, "
            "application configuration, and process improvement"
        )
    if family == "support_desk_engineering":
        return (
            "Technical Support Engineer focused on ticket resolution, "
            "cloud operations, and customer communication"
        )
    if family == "platform_support_analysis":
        return (
            "Application Support Analyst focused on platform incidents, "
            "SQL investigation, and client resolution"
        )
    if family == "healthcare_application_support":
        return (
            "Application Support Analyst focused on configuration, testing, "
            "documentation, and end-user support"
        )
    if family == "technical_support_integrations":
        return "Technical Support Engineer focused on integrations and customer case resolution"
    if family == "product_operations":
        return (
            "Application Support Specialist aligned to product operations, "
            "incident resolution, and availability"
        )
    if family == "technical_operations_support":
        return (
            "Technical Operations Support Analyst focused on platform stability and SLA execution"
        )
    if family == "it_service_desk":
        return "Technical Analyst focused on service delivery and escalated infrastructure support"
    if family == "application_support_administration":
        return (
            "Application Support Administrator focused on production stability, "
            "incident resolution, and enterprise systems"
        )
    if family == "application_systems_engineering":
        return (
            "Application & Systems Engineer focused on integration validation, "
            "test automation, and interoperability"
        )
    if family == "erp_application_support":
        return (
            "ERP Technical Analyst focused on D365 operations, incident management, "
            "and controlled system change"
        )
    if family == "application_support_engineering":
        return (
            "Application Support Engineer focused on production diagnosis, "
            "data integrity, and platform reliability"
        )
    if family == "product_support_engineering":
        return (
            "Product Support Engineer focused on API troubleshooting, "
            "customer resolution, and product reliability"
        )
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
        "banking_financial_services": (
            "core banking",
            "financial services",
            "banking applications",
            "mortgage lending",
            "residential lending",
            "loan origination",
        ),
        "access_control": ("access control", "credential management", "osdp", "wiegand"),
        "erp_business_systems": ("d365 f&o", "dynamics 365", "erp systems", "sox"),
        "ai_platform": ("ai platform", "ai tooling", "agentic systems"),
        "ai_cloud_infrastructure": (
            "gpu cloud",
            "gpu infrastructure",
            "hpc systems",
            "ai/ml platforms",
        ),
        "advertising_technology": (
            "adtech",
            "media buying",
            "trading platform",
            "ad exchanges",
        ),
        "healthcare_information_systems": (
            "healthcare information systems",
            "epic module",
            "professional billing",
            "claims",
        ),
        "manufacturing_supply_chain": (
            "manufacturing environment",
            "supply chain",
            "distribution",
            "production",
        ),
        "aerospace_defense": (
            "aerospace",
            "raytheon",
            "collins aerospace",
            "flight-based",
            "defense industry",
        ),
        "media_publishing": ("media", "publishing", "broadcasting", "subscription"),
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
        "production support",
        "system validation",
        "test automation",
        "regression testing",
        "change management",
        "batch monitoring",
        "data investigation",
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
        "regulated",
        "SOX-controlled",
        "enterprise applications",
        "cloud-based",
        "mission-critical",
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
        "business stakeholders",
        "integration partners",
        "developers",
        "vendors",
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
        "system stability",
        "data integrity",
        "operational continuity",
        "interoperability",
    )
    return [term for term in catalog if contains_term(text, term)]


def _expected_metrics(text: str) -> list[str]:
    catalog = (
        "resolution time",
        "SLA attainment",
        "availability",
        "incident volume",
        "response time",
        "system uptime",
        "batch success rate",
        "regression coverage",
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
        "test",
        "administer",
        "investigate",
        "reproduce",
        "deploy",
    )
    return [verb for verb in verbs if re.search(rf"\b{verb}\w*\b", text, re.I)]
