from __future__ import annotations

import re

from aiadapply_v2.schemas import (
    EvidenceConcept,
    JobKeyword,
    ParagraphKind,
    ResumeDocument,
    ResumeEvidence,
    ResumeEvidenceGraph,
)
from aiadapply_v2.text import contains_term, dedupe

SYSTEM_TERMS = (
    "agency management system",
    "Astra Schedule",
    "AWS",
    "Bash",
    "CI/CD",
    "Confluence",
    "EMS",
    "Entra ID",
    "ETL",
    "Git",
    "GitHub",
    "internal integrations",
    "Jira",
    "JSON",
    "Linux",
    "Loavenly",
    "Microsoft 365",
    "Microsoft Graph API",
    "MFA",
    "MySQL",
    "OAuth 2.0",
    "PostgreSQL",
    "Postman",
    "production database",
    "PowerShell",
    "Python",
    "RBAC",
    "REST APIs",
    "SAML",
    "Sentry",
    "SLA",
    "SQL",
    "SSO",
    "Supabase",
    "third-party vendors",
    "TypeScript",
    "Vercel",
    "Webhooks",
    "Windows",
)
ACTION_TERMS = (
    "API debugging",
    "configuration",
    "deployment",
    "documentation",
    "escalation",
    "incident response",
    "log analysis",
    "monitoring",
    "provisioning",
    "root cause analysis",
    "technical support",
    "training",
    "troubleshooting",
    "user access",
    "validation",
)
TRANSFER_BRIDGES: dict[str, tuple[str, ...]] = {
    "business analysis": (
        "operational need",
        "workflow support",
        "reporting",
    ),
    "business rules": ("configuration", "workflow support", "validation"),
    "case ownership": ("support tickets", "incident support", "live operations"),
    "customer case ownership": ("support tickets", "user support", "live operations"),
    "customer needs": ("operational need", "user support", "live operations"),
    "customer service": ("first-line support", "user support", "training"),
    "critical thinking": ("root cause analysis", "log analysis", "troubleshooting"),
    "cross-functional collaboration": (
        "coordinating",
        "campus IT",
        "third-party vendors",
    ),
    "diagnostics": ("troubleshooting", "log analysis", "reproducing errors"),
    "document management": ("documentation", "records", "reporting"),
    "failure analysis": ("root cause analysis", "triaging failures", "incident investigation"),
    "end-user support": ("first-line support", "user access", "training"),
    "incident triage": ("incident response", "support tickets", "escalation"),
    "interpersonal skills": ("training", "coordinating"),
    "knowledge base": ("documentation", "recurring issue tracking", "escalation notes"),
    "fast-paced environment": ("live operations", "after-hours", "support tickets"),
    "operational availability": ("production operations", "live operations", "platform support"),
    "product operations": ("production operations", "deployment", "workflow support"),
    "problem-solving": ("root cause analysis", "troubleshooting", "incident investigation"),
    "release analysis": ("validating updates", "deployment", "documentation"),
    "reliability": ("production support", "performance", "validation"),
    "regulatory compliance": ("Compliance",),
    "service delivery": ("technical support", "SLA management", "user support"),
    "service desk": ("technical support", "support tickets", "escalation"),
    "software adoption": ("training", "user support", "live operations"),
    "software implementation": ("built", "tested", "deployed", "deployment"),
    "system health": ("monitoring", "performance", "production operations"),
    "system testing": ("tested", "validating updates", "validation"),
    "system updates": ("validating updates", "deployment", "configuration"),
    "task prioritization": ("support tickets", "SLA management", "after-hours"),
    "ticketing": ("support tickets", "Jira", "incident support"),
    "vendor interfaces": ("vendor feeds", "carrier integration", "third-party vendors"),
    "workflow documentation": (
        "incident documentation",
        "recurring issue tracking",
        "documentation",
    ),
    "workflow management": ("workflow support", "production operations", "deployment"),
    "communication skills": ("documentation", "training", "coordinating"),
    "written and verbal communication skills": (
        "documentation",
        "training",
        "coordinating",
    ),
    "verbal communication": ("training", "coordinating"),
    "organizational skills": (
        "documentation",
        "recurring issue tracking",
        "SLA management",
    ),
}


def build_evidence_graph(
    document: ResumeDocument,
    keywords: list[JobKeyword],
) -> ResumeEvidenceGraph:
    evidence: list[ResumeEvidence] = []
    accepted_terms = [item for item in keywords if item.accepted]
    for paragraph in document.paragraphs:
        if paragraph.kind not in {
            ParagraphKind.summary,
            ParagraphKind.bullet,
            ParagraphKind.skill_line,
            ParagraphKind.protected_body,
        }:
            continue
        systems = [term for term in SYSTEM_TERMS if contains_term(paragraph.text, term)]
        actions = [term for term in ACTION_TERMS if contains_term(paragraph.text, term)]
        concepts: list[EvidenceConcept] = []
        for keyword in accepted_terms:
            direct = contains_term(paragraph.text, keyword.term)
            bridges = [
                term
                for term in TRANSFER_BRIDGES.get(keyword.normalized, ())
                if contains_term(paragraph.text, term)
            ]
            if direct or bridges:
                concepts.append(
                    EvidenceConcept(
                        concept=keyword.term,
                        kind=keyword.kind,
                        direct_terms=[keyword.term] if direct else [],
                        transferable_terms=bridges,
                    )
                )
        evidence.append(
            ResumeEvidence(
                evidence_id=f"evidence.{paragraph.paragraph_id}",
                paragraph_id=paragraph.paragraph_id,
                section=paragraph.section,
                source_text=paragraph.text,
                concepts=concepts,
                systems=systems,
                actions=actions,
                environment_signals=_environments(paragraph.text),
                outcomes=_outcomes(paragraph.text),
                metrics=_metrics(paragraph.text),
            )
        )
    return ResumeEvidenceGraph(
        candidate_name="Brian Aiad",
        document_sha256=document.source_sha256,
        evidence=evidence,
    )


def _environments(text: str) -> list[str]:
    terms = (
        "production",
        "SaaS",
        "live environments",
        "after-hours",
        "cross-functional",
        "multi-tenant",
        "IT operations",
    )
    return [term for term in terms if contains_term(text, term)]


def _outcomes(text: str) -> list[str]:
    terms = (
        "resolution",
        "root cause",
        "reduced",
        "performance",
        "response times",
        "streamline",
        "deployed",
    )
    return [term for term in terms if contains_term(text, term)]


def _metrics(text: str) -> list[str]:
    patterns = (
        r"\b\d+\+",
        r"\bsub-\d+(?:-minute|ms)\b",
        r"\b\d+\s+(?:hours?|minutes?|feeds|SaaS apps?)\b",
        r"\bthree\s+(?:distribution|food bank)\s+locations\b",
    )
    return dedupe(
        match.group(0) for pattern in patterns for match in re.finditer(pattern, text, re.I)
    )
