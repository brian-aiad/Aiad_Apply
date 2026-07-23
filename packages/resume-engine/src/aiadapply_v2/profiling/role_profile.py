from __future__ import annotations

import re

from aiadapply_v2.schemas import ParsedJob, TargetRoleProfile

TOOL_TERMS = {
    "Postman",
    "Jira",
    "OAuth",
    "REST APIs",
    "SQL",
    "Salesforce",
    "Slack",
    "SSO",
    "Zendesk",
    "SAML",
    "API",
    "SaaS",
    "database",
}

RESPONSIBILITY_PATTERNS = {
    "case ownership": r"\bown support cases\b|\bcase management\b",
    "root cause analysis": r"\broot causes?\b|\bdiagnose\b|\btroubleshoot\b",
    "technical configuration": r"\btechnical configuration\b|\bconfigure\b",
    "knowledge base": r"\bknowledge base\b|\bdocumentation\b|\btechnical writing\b",
    "cross-functional collaboration": r"\bcross-functional\b|\bstakeholder\b",
    "integration support": r"\bintegrations?\b|\bAPI\b|\bSSO\b|\bERP\b",
}


def build_target_role_profile(job: ParsedJob) -> TargetRoleProfile:
    text = f"{job.title}\n{job.job_description}"
    lowered = text.lower()
    hard_tools = [term for term in TOOL_TERMS if _contains_term(lowered, term)]
    responsibilities = [
        label for label, pattern in RESPONSIBILITY_PATTERNS.items() if re.search(pattern, text, re.IGNORECASE)
    ]
    role_family = _role_family(job.title, lowered)
    industry = _industry_context(lowered)

    return TargetRoleProfile(
        target_title=job.title or "Unknown Role",
        company=job.company,
        role_family=role_family,
        seniority=_seniority(lowered),
        industry_context=industry,
        hard_tools=sorted(hard_tools, key=str.lower),
        methodologies=[],
        responsibilities=responsibilities,
        action_verbs=["troubleshoot", "diagnose", "configure", "document", "prioritize"],
        must_have_keywords=job.high_priority_keywords,
        nice_to_have_keywords=job.low_priority_keywords,
    )


def _contains_term(lowered_text: str, term: str) -> bool:
    return re.search(r"\b" + re.escape(term.lower()) + r"\b", lowered_text) is not None


def _role_family(title: str, lowered_text: str) -> str:
    title_lower = title.lower()
    if "integration" in title_lower or "integrations" in lowered_text:
        return "technical_support_integrations"
    if "support" in title_lower:
        return "technical_support"
    if "business analyst" in title_lower:
        return "business_analysis"
    return "unknown"


def _seniority(lowered_text: str) -> str:
    match = re.search(r"(\d+)\+?\s+years", lowered_text)
    if not match:
        return "unknown"
    years = int(match.group(1))
    if years <= 2:
        return "entry_mid"
    if years <= 5:
        return "mid"
    return "senior"


def _industry_context(lowered_text: str) -> list[str]:
    contexts: list[str] = []
    for label, terms in {
        "fintech": ["fintech", "finance", "accounting", "audit", "compliance"],
        "b2b_saas": ["b2b", "saas", "enterprise software", "cloud-based"],
        "ai_support": ["ai", "ai-powered", "automation", "chatbot"],
    }.items():
        if any(term in lowered_text for term in terms):
            contexts.append(label)
    return contexts

