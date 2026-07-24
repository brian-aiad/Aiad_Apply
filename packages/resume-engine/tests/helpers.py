from __future__ import annotations

from aiadapply_v2.schemas import (
    ProposedBullet,
    ProposedSkillLine,
    ProposedSkills,
    ProposedSummary,
    ReasoningResult,
    ResumeDocument,
    RewritePlan,
    TargetRoleProfile,
    TransferabilityMap,
)


def identity_plan(document: ResumeDocument) -> RewritePlan:
    summary = next(
        paragraph for paragraph in document.paragraphs if paragraph.paragraph_id == "summary"
    )
    skills: list[ProposedSkillLine] = []
    bullets: list[ProposedBullet] = []
    for paragraph in document.paragraphs:
        if paragraph.kind.value == "skill_line":
            category, values = paragraph.text.split(":", 1)
            items = [item.strip() for item in values.split(",") if item.strip()]
            skills.append(
                ProposedSkillLine(
                    paragraph_id=paragraph.paragraph_id,
                    category=category.strip(),
                    skills=items,
                    shorter_skills=items[:-1],
                )
            )
        elif paragraph.kind.value == "bullet" and paragraph.editable:
            bullets.append(
                ProposedBullet(
                    paragraph_id=paragraph.paragraph_id,
                    source_paragraph_id=paragraph.paragraph_id,
                    text=paragraph.text,
                    shorter_text=paragraph.text[:-1],
                    purpose="Preserve the base evidence for a round-trip test.",
                )
            )
    return RewritePlan(
        professional_identity="Technical Support Engineer",
        summary=ProposedSummary(
            text=summary.text,
            shorter_text=summary.text.replace(" production multi-tenant", ""),
        ),
        skills=ProposedSkills(lines=skills),
        bullets=bullets,
    )


class IdentityReasoner:
    name = "test-identity-reasoner"

    def reason(
        self,
        *,
        job_description: str,
        preliminary_profile: TargetRoleProfile,
        keywords: list[object],
        document: ResumeDocument,
        evidence_graph: object,
        preliminary_map: TransferabilityMap,
        revision_feedback: list[str] | None = None,
    ) -> ReasoningResult:
        del job_description, keywords, evidence_graph, revision_feedback
        plan = identity_plan(document)
        plan.summary.text = plan.summary.text.replace(
            "Application Support Engineer",
            "Technical Support Engineer",
            1,
        )
        plan.summary.shorter_text = plan.summary.shorter_text.replace(
            "Application Support Engineer",
            "Technical Support Engineer",
            1,
        )
        return ReasoningResult(
            role_profile=preliminary_profile,
            transferability_map=preliminary_map,
            rewrite_plan=plan,
        )
