from __future__ import annotations

import re
from typing import Literal

from aiadapply_v2.schemas import (
    EvidenceStrength,
    JobKeyword,
    KeywordKind,
    StretchGap,
    StretchLab,
    StretchOpportunity,
    StretchProject,
    TargetRoleProfile,
    TransferabilityMap,
)
from aiadapply_v2.text import contains_term, dedupe, normalized_term

DISCLAIMER = (
    "Review-only development ideas. These items are not verified resume claims and are "
    "never exported into the application-ready resume. Complete or confirm an item before "
    "promoting it into the protected candidate profile."
)
NON_PROJECTABLE_TERMS = {
    "abrigo",
    "atf access",
    "baker hill",
    "electrical engineering",
    "moody's",
    "ncino",
    "security clearance",
    "stem degree",
    "u.s. citizenship",
    "u.s. person",
}


def build_stretch_lab(
    profile: TargetRoleProfile,
    keywords: list[JobKeyword],
    transferability: TransferabilityMap,
    proposed: StretchLab | None = None,
) -> StretchLab:
    """Create review-only opportunities and gap-closing projects.

    The returned data never enters RewritePlan, which keeps hypothetical claims physically
    separated from the application-ready DOCX/PDF path.
    """
    accepted = {item.normalized: item for item in keywords if item.accepted}
    matches = {normalized_term(item.target_term): item for item in transferability.matches}
    proposed = proposed or StretchLab()
    proposed_opportunities = {
        normalized_term(item.target_term): item for item in proposed.transferable_opportunities
    }
    proposed_gaps = {normalized_term(item.target_term): item for item in proposed.gaps}

    opportunities: list[StretchOpportunity] = []
    for keyword in sorted(accepted.values(), key=lambda item: item.hiring_importance, reverse=True):
        match = matches.get(keyword.normalized)
        if not match or match.strength != EvidenceStrength.strongly_transferable:
            continue
        opportunity_model = proposed_opportunities.get(keyword.normalized)
        opportunities.append(
            StretchOpportunity(
                target_term=keyword.term,
                evidence_strength=match.strength,
                evidence_ids=[match.evidence_id] if match.evidence_id else [],
                rationale=(opportunity_model.rationale if opportunity_model else match.reasoning),
                review_question=(
                    opportunity_model.review_question
                    if opportunity_model
                    else (
                        f"Does your real work include a concrete example you can describe as "
                        f"{keyword.term}?"
                    )
                ),
                export_allowed=False,
            )
        )
        if len(opportunities) == 6:
            break

    gaps: list[StretchGap] = []
    for keyword in sorted(accepted.values(), key=lambda item: item.hiring_importance, reverse=True):
        match = matches.get(keyword.normalized)
        if not match or match.strength not in {
            EvidenceStrength.weakly_transferable,
            EvidenceStrength.unsupported,
        }:
            continue
        gap_model = proposed_gaps.get(keyword.normalized)
        category = _gap_category(keyword.kind)
        gaps.append(
            StretchGap(
                target_term=keyword.term,
                category=category,
                hiring_importance=keyword.hiring_importance,
                why_it_matters=(
                    gap_model.why_it_matters
                    if gap_model
                    else _gap_reason(keyword, match.target_requirement)
                ),
                proof_needed=(
                    gap_model.proof_needed
                    if gap_model and gap_model.proof_needed
                    else _proof_needed(keyword)
                ),
                language_after_confirmation=(
                    gap_model.language_after_confirmation
                    if gap_model
                    else (
                        f'After you confirm evidence, add "{keyword.term}" to the most relevant '
                        "Skills or Project entry and describe exactly how it was used."
                    )
                ),
                export_allowed=False,
            )
        )
        if len(gaps) == 18:
            break

    projectable = [
        gap.target_term
        for gap in gaps
        if normalized_term(gap.target_term) not in NON_PROJECTABLE_TERMS
        and gap.category != "qualification"
    ]
    projects = _validated_model_projects(proposed.proposed_projects, projectable)
    if not projects and projectable:
        projects = [_default_project(profile, projectable[:6])]

    return StretchLab(
        disclaimer=DISCLAIMER,
        transferable_opportunities=opportunities,
        gaps=gaps,
        proposed_projects=projects[:3],
    )


def _gap_category(
    kind: KeywordKind,
) -> Literal["technology", "method", "domain", "qualification", "other"]:
    if kind == KeywordKind.system:
        return "technology"
    if kind == KeywordKind.action:
        return "method"
    if kind == KeywordKind.environment:
        return "domain"
    if kind == KeywordKind.qualification:
        return "qualification"
    return "other"


def _gap_reason(keyword: JobKeyword, requirement: str) -> str:
    source = ", ".join(keyword.source_sections) or "the posting"
    return (
        f"{keyword.term} is requested in {source}, but the protected resume does not currently "
        f"substantiate it. Relevant posting context: {requirement}"
    )


def _proof_needed(keyword: JobKeyword) -> list[str]:
    if keyword.kind == KeywordKind.system:
        return [
            f"A completed hands-on example using {keyword.term}",
            "A work sample, repository, screenshot, or detailed implementation note",
            "A truthful explanation of what you personally configured, analyzed, or built",
        ]
    if keyword.kind == KeywordKind.qualification:
        return ["The actual credential, degree, status, or authorization requested by the employer"]
    return [
        f"A completed work, coursework, or project example demonstrating {keyword.term}",
        "The problem, your actions, the result, and any verifiable artifact",
    ]


def _validated_model_projects(
    projects: list[StretchProject], projectable_terms: list[str]
) -> list[StretchProject]:
    allowed = {normalized_term(term): term for term in projectable_terms}
    result: list[StretchProject] = []
    for project in projects:
        project_text = " ".join(
            [
                project.title,
                project.objective,
                *project.build_steps,
                *project.evidence_to_collect,
                project.resume_language_after_completion,
            ]
        )
        target_terms = dedupe(
            [
                *(
                    allowed[normalized_term(term)]
                    for term in project.target_terms
                    if normalized_term(term) in allowed
                ),
                *(term for term in projectable_terms if _project_mentions_term(project_text, term)),
            ]
        )
        if not target_terms or not project.build_steps or not project.evidence_to_collect:
            continue
        result.append(
            project.model_copy(
                update={
                    "target_terms": target_terms,
                    "status": "proposed_not_completed",
                    "export_allowed": False,
                }
            )
        )
    return result


def _project_mentions_term(project_text: str, term: str) -> bool:
    if contains_term(project_text, term):
        return True
    if normalized_term(term) == "loan origination system":
        return bool(re.search(r"\bloan[- ](?:application|origination)\b", project_text, re.I))
    return False


def _default_project(profile: TargetRoleProfile, target_terms: list[str]) -> StretchProject:
    family = profile.normalized_role_family.casefold()
    if "manufacturing" in family or "quality" in family:
        return StretchProject(
            title="Manufacturing Process Improvement and Quality Analytics Lab",
            target_terms=target_terms,
            objective=(
                "Use a synthetic production dataset to practice process analysis, quality "
                "documentation, and corrective-action decision making without claiming prior "
                "factory experience."
            ),
            build_steps=[
                "Create or source a clearly labeled synthetic manufacturing-process dataset.",
                "Analyze defects, yield, cycle time, and process variation with Python or Excel.",
                "Build the role-relevant control chart, risk analysis, or process document.",
                "Document a root-cause hypothesis, corrective action, and validation approach.",
                "Publish the code, analysis, screenshots, and a concise engineering report.",
            ],
            evidence_to_collect=[
                "Repository containing the analysis and source data",
                "Rendered charts or dashboard screenshots",
                "Risk-analysis, work-instruction, or corrective-action document",
                "README explaining which target terms the project genuinely demonstrates",
            ],
            resume_language_after_completion=(
                "After completing and validating the work, describe it as a personal "
                "manufacturing quality analytics project with only the tools and methods used."
            ),
            export_allowed=False,
        )
    if "rf" in family or "antenna" in family:
        return StretchProject(
            title="RF Component Analysis Practice Lab",
            target_terms=target_terms,
            objective=(
                "Build a documented simulation or analysis exercise around the target RF concepts "
                "without representing it as professional hardware experience."
            ),
            build_steps=[
                "Choose an accessible simulation or public dataset aligned to the posting.",
                "Define requirements, assumptions, inputs, and expected behavior.",
                "Run the analysis and document verification checks and limitations.",
                "Publish plots, source files, and a technical summary.",
            ],
            evidence_to_collect=[
                "Simulation or analysis source files",
                "Plots and verification notes",
                "README distinguishing simulated work from laboratory experience",
            ],
            resume_language_after_completion=(
                "After completion, list it as an academic-style RF analysis project and identify "
                "the exact simulated tools and concepts used."
            ),
            export_allowed=False,
        )
    if any(token in family for token in ("support", "application", "operations", "client")):
        return StretchProject(
            title="Client SaaS Implementation and Adoption Lab",
            target_terms=target_terms,
            objective=(
                "Create a small client-facing implementation exercise that demonstrates onboarding, "
                "technical troubleshooting, training, and adoption analysis."
            ),
            build_steps=[
                "Configure a small SaaS-style application and a representative client workflow.",
                "Write an onboarding checklist, data-import validation, and troubleshooting guide.",
                "Record a short training walkthrough using non-sensitive demonstration data.",
                "Define usage signals and recommend improvements for an underused workflow.",
                "Publish the implementation notes and sanitized support scenarios.",
            ],
            evidence_to_collect=[
                "Repository or configuration notes",
                "Onboarding and troubleshooting documentation",
                "Training artifact and adoption analysis",
            ],
            resume_language_after_completion=(
                "After completion, describe the implementation, training, troubleshooting, and "
                "adoption work as a personal project rather than client employment."
            ),
            export_allowed=False,
        )
    return StretchProject(
        title=f"{profile.professional_identity} Skills Validation Lab",
        target_terms=target_terms,
        objective=(
            "Turn the highest-value evidence gaps into a small, reviewable project with concrete "
            "artifacts before adding any of them to the resume."
        ),
        build_steps=[
            "Define a realistic problem and acceptance criteria aligned to the target role.",
            "Build the smallest implementation that exercises the selected target terms.",
            "Test the result and document failures, decisions, and limitations.",
            "Publish a sanitized work sample and a truthful project summary.",
        ],
        evidence_to_collect=[
            "Repository or work sample",
            "Test results and screenshots",
            "README mapping each claimed skill to completed work",
        ],
        resume_language_after_completion=(
            "After completion, add a personal project using only the verified tools, methods, and "
            "results demonstrated by the saved artifacts."
        ),
        export_allowed=False,
    )
