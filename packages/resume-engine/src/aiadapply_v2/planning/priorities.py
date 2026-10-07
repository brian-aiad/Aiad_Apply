from __future__ import annotations

import re
from typing import TypedDict

from aiadapply_v2.schemas import (
    EvidenceStrength,
    JobKeyword,
    ResumeDocument,
    ResumeEvidenceGraph,
    TransferabilityMap,
)
from aiadapply_v2.semantic.matcher import _direct_match, _strength, _transferable_match
from aiadapply_v2.text import contains_term


class ParagraphPriority(TypedDict):
    paragraph_id: str
    missing_supported_terms: list[str]
    expected_benefit: float
    rewrite_risk: float
    priority: float
    preserve_original: bool
    guidance: str


def paragraph_priorities(
    document: ResumeDocument,
    keywords: list[JobKeyword],
    graph: ResumeEvidenceGraph,
    matches: TransferabilityMap,
) -> list[ParagraphPriority]:
    evidence = {item.paragraph_id: item for item in graph.evidence}
    keyword_kinds = {item.term.casefold(): item.kind for item in keywords}
    important = {
        item.term.casefold(): item.hiring_importance
        for item in keywords
        if item.accepted and item.hiring_importance >= 25
    }
    result: list[ParagraphPriority] = []
    for paragraph in document.paragraphs:
        if not paragraph.editable:
            continue
        missing: dict[str, float] = {}
        source = evidence.get(paragraph.paragraph_id)
        for match in matches.matches:
            importance = important.get(match.target_term.casefold(), 0)
            if (
                not source
                or match.strength
                not in {EvidenceStrength.direct, EvidenceStrength.strongly_transferable}
                or not importance
                or contains_term(paragraph.text, match.target_term)
            ):
                continue
            # A term can have several defensible placements. The single best
            # semantic retrieval result must not freeze every other paragraph.
            scoped_confirmation = any(
                item.section == "candidate_profile"
                and item.claim_scope == "source_specific"
                and item.source_reference in {paragraph.section, paragraph.paragraph_id}
                and _direct_match(match.target_term, item)
                for item in graph.evidence
            )
            direct = _direct_match(match.target_term, source) or scoped_confirmation
            transferable = _transferable_match(match.target_term, source)
            if not (direct or transferable or match.evidence_id == source.evidence_id):
                continue
            # A global Skills/general-exposure confirmation cannot upgrade a weak
            # local bridge into an employer claim (documentation != knowledge base).
            local_strength = _strength(
                match.target_term,
                keyword_kinds[match.target_term.casefold()],
                direct,
                transferable,
                match.semantic_score if match.evidence_id == source.evidence_id else 0.0,
            )
            if local_strength not in {EvidenceStrength.direct, EvidenceStrength.strongly_transferable}:
                continue
            strength = 1.0 if direct else 0.7
            missing[match.target_term] = importance * strength
        visibility = 1.25 if paragraph.kind.value == "summary" else 1.0
        # Layout slack changes priority only; it never grants permission to overflow.
        slack = max(0, paragraph.character_budget - len(paragraph.text))
        flexibility = 1 + min(0.25, slack / max(1, len(paragraph.text)))
        expected_benefit = sum(missing.values()) * visibility * flexibility
        paragraph_evidence = next(
            (item for item in graph.evidence if item.paragraph_id == paragraph.paragraph_id),
            None,
        )
        metric_count = len(re.findall(r"(?<![A-Za-z0-9])\d+(?:\.\d+)?%?\+?", paragraph.text))
        concrete_systems = len(paragraph_evidence.systems) if paragraph_evidence else 0
        transferable_value = sum(
            importance * 0.15
            for term, importance in missing.items()
            if any(
                match.target_term == term
                and match.strength == EvidenceStrength.strongly_transferable
                for match in matches.matches
            )
        )
        layout_pressure = 8.0 if slack < max(10, len(paragraph.text) * 0.05) else 0.0
        rewrite_risk = (
            metric_count * 12.0
            + min(12.0, concrete_systems * 3.0)
            + transferable_value
            + layout_pressure
        )
        priority = max(0.0, expected_benefit - rewrite_risk)
        preserve_original = not missing or priority <= 0
        result.append(
            {
                "paragraph_id": paragraph.paragraph_id,
                "missing_supported_terms": sorted(missing, key=lambda term: -missing[term]),
                "expected_benefit": round(expected_benefit, 2),
                "rewrite_risk": round(rewrite_risk, 2),
                "priority": round(priority, 2),
                "preserve_original": preserve_original,
                "guidance": (
                    "Preserve the original: its metrics, concrete systems, or tight line budget "
                    "make the expected rewrite risk at least as high as the alignment benefit."
                    if preserve_original and missing
                    else "Rewrite around the most relevant supported requirements, preserving "
                    "the concrete action, systems, context, and result. Integrate one or two "
                    "terms naturally; do not append a keyword list."
                    if missing
                    else "Keep the original unless a specific readability improvement is justified."
                ),
            }
        )
    return sorted(result, key=lambda item: -item["priority"])
