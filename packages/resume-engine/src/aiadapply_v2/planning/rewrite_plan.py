from __future__ import annotations

from aiadapply_v2.planning.transferability import build_evidence_matches
from aiadapply_v2.schemas import (
    ResumeEvidenceGraph,
    RewriteAction,
    RewritePlan,
    RiskLevel,
    TailorMode,
    TargetRoleProfile,
)


def build_rewrite_plan(
    profile: TargetRoleProfile,
    graph: ResumeEvidenceGraph,
    mode: TailorMode = TailorMode.hybrid,
) -> RewritePlan:
    matches = build_evidence_matches(profile, graph)
    actions: list[RewriteAction] = []
    unsupported: list[str] = []

    for match in matches:
        if match.risk in {RiskLevel.unsupported, RiskLevel.human_confirm}:
            unsupported.append(match.target_keyword)
            if mode == TailorMode.transformation_draft:
                actions.append(
                    RewriteAction(
                        section="review_queue",
                        target=match.target_keyword,
                        intent="Optional draft insertion requires human confirmation.",
                        keywords=[match.target_keyword],
                        evidence_block_ids=[],
                        risk=match.risk,
                        note=match.semantic_bridge or "No grounded evidence found.",
                    )
                )
            continue
        actions.append(
            RewriteAction(
                section=match.suggested_destination,
                target=match.target_concept,
                intent=f"Use {match.target_keyword} where supported by existing evidence.",
                keywords=[match.target_keyword],
                evidence_block_ids=[match.evidence_block_id] if match.evidence_block_id else [],
                risk=match.risk,
                note=match.semantic_bridge,
            )
        )

    return RewritePlan(
        mode=mode,
        profile=profile,
        matches=matches,
        actions=actions,
        unsupported_keywords=unsupported,
    )

