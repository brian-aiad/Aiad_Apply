from __future__ import annotations

import re

from aiadapply_v2.schemas import (
    EvidenceMatch,
    ResumeEvidenceBlock,
    ResumeEvidenceGraph,
    RiskLevel,
    TargetRoleProfile,
)


def build_evidence_matches(
    profile: TargetRoleProfile,
    graph: ResumeEvidenceGraph,
) -> list[EvidenceMatch]:
    keywords = _dedupe(profile.must_have_keywords + profile.nice_to_have_keywords + profile.hard_tools)
    matches: list[EvidenceMatch] = []
    for keyword in keywords:
        block, confidence, bridge = _best_block(keyword, graph.blocks)
        risk = _risk_for(keyword, block, confidence)
        matches.append(
            EvidenceMatch(
                target_keyword=keyword,
                target_concept=_concept_for(keyword),
                evidence_block_id=block.block_id if block else None,
                evidence_text=block.source_text if block else "",
                semantic_bridge=bridge,
                confidence=confidence,
                risk=risk,
                suggested_destination=_destination_for(keyword, risk),
            )
        )
    return matches


def _best_block(
    keyword: str,
    blocks: list[ResumeEvidenceBlock],
) -> tuple[ResumeEvidenceBlock | None, float, str]:
    key = keyword.lower()
    best: tuple[ResumeEvidenceBlock | None, float, str] = (None, 0.0, "")
    for block in blocks:
        haystack = " ".join(
            [
                block.source_text,
                " ".join(block.tools),
                " ".join(block.competencies),
                " ".join(block.transferable_to),
            ]
        ).lower()
        score = 0.0
        bridge = ""
        if _contains_phrase(haystack, key):
            score = 0.95
            bridge = f"{keyword} appears directly in this evidence."
        else:
            for transferable in block.transferable_to:
                if _related(keyword, transferable):
                    score = max(score, 0.72)
                    bridge = f"{block.block_id} supports {keyword} via {transferable}."
            for competency in block.competencies:
                if _related(keyword, competency):
                    score = max(score, 0.65)
                    bridge = f"{block.block_id} supports {keyword} via {competency}."
        if score > best[1]:
            best = (block, score, bridge)
    return best


def _related(keyword: str, concept: str) -> bool:
    keyword_lower = keyword.lower()
    concept_lower = concept.lower()
    bridges = {
        "technical writing": ["documentation", "knowledge base", "escalation notes"],
        "ticketing": ["jira", "support tickets", "case ownership"],
        "fintech": ["insurance", "finance-adjacent", "compliance"],
        "enterprise software": ["saas", "business applications", "production platform"],
        "product features": ["release validation", "workflow validation", "feature testing"],
        "compliance": ["compliance reporting", "rbac", "access control"],
        "api": ["api debugging", "webhooks", "integrations"],
        "database": ["sql", "etl", "production database"],
    }
    return concept_lower in bridges.get(keyword_lower, []) or _contains_phrase(concept_lower, keyword_lower)


def _contains_phrase(haystack: str, phrase: str) -> bool:
    """Whole-token phrase match.

    This prevents short Simplify keywords such as "ai" from matching inside
    unrelated words like "maintaining" or "Aiad".
    """
    escaped = re.escape(phrase)
    return re.search(rf"(?<![a-z0-9]){escaped}(?![a-z0-9])", haystack, re.IGNORECASE) is not None


def _risk_for(keyword: str, block: ResumeEvidenceBlock | None, confidence: float) -> RiskLevel:
    unsupported_hard_tools = {"zendesk", "salesforce", "slack"}
    if keyword.lower() in unsupported_hard_tools and confidence < 0.9:
        return RiskLevel.human_confirm
    if not block:
        return RiskLevel.unsupported
    if confidence >= 0.9:
        return RiskLevel.grounded
    if confidence >= 0.65:
        return RiskLevel.transferable
    return RiskLevel.stretched


def _destination_for(keyword: str, risk: RiskLevel) -> str:
    if risk in {RiskLevel.unsupported, RiskLevel.human_confirm}:
        return "review_queue"
    lowered = keyword.lower()
    if lowered in {"postman", "jira", "oauth", "rest apis", "sql", "sso", "api", "saas"}:
        return "skills_or_matching_bullet"
    if lowered in {"technical writing", "product features", "compliance"}:
        return "experience_bullet"
    return "summary_or_experience"


def _concept_for(keyword: str) -> str:
    lowered = keyword.lower()
    if lowered in {"postman", "oauth", "rest apis", "api", "sso"}:
        return "integration troubleshooting"
    if lowered in {"jira", "zendesk", "salesforce", "ticketing"}:
        return "support case management"
    if lowered in {"sql", "database"}:
        return "data troubleshooting"
    return lowered


def _dedupe(values: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        key = value.lower()
        if key not in seen:
            out.append(value)
            seen.add(key)
    return out
