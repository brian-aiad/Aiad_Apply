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
    "Astra Schedule",
    "AWS",
    "Bash",
    "CI/CD",
    "Confluence",
    "EMS",
    "Entra ID",
    "Git",
    "GitHub",
    "Jira",
    "JSON",
    "Linux",
    "Microsoft 365",
    "Microsoft Graph API",
    "MFA",
    "MySQL",
    "OAuth 2.0",
    "PostgreSQL",
    "Postman",
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
    "case ownership": ("support tickets", "incident support", "live operations"),
    "customer case ownership": ("support tickets", "user support", "live operations"),
    "diagnostics": ("troubleshooting", "log analysis", "reproducing errors"),
    "failure analysis": ("root cause analysis", "triaging failures", "incident investigation"),
    "incident triage": ("incident response", "support tickets", "escalation"),
    "operational availability": ("production operations", "live operations", "platform support"),
    "product operations": ("production operations", "deployment", "workflow support"),
    "reliability": ("production support", "performance", "validation"),
    "service delivery": ("technical support", "SLA management", "user support"),
    "service desk": ("technical support", "support tickets", "escalation"),
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
