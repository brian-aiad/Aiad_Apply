"""Posting-wide technical coverage with explicit work/project attribution."""

from __future__ import annotations

from typing import Literal

from aiadapply_v2.evidence.established_technologies import technical_usage_in_context
from aiadapply_v2.evidence.everyday_tools import routine_usage_in_context
from aiadapply_v2.grading.keywords import TERM_CATALOG
from aiadapply_v2.schemas import (
    CandidateProfile,
    JobKeyword,
    KeywordCoverage,
    ResumeDocument,
    ResumeEvidence,
    ResumeEvidenceGraph,
)
from aiadapply_v2.semantic.matcher import _direct_match
from aiadapply_v2.text import contains_term, dedupe, preserves_source_term, split_skill_values

CONTEXT_METHODS = {"saas", "agile", "scrum", "kanban", "devops", "low-code"}


def is_coverage_target(keyword: JobKeyword) -> bool:
    return (
        keyword.kind.value == "system"
        or keyword.normalized in CONTEXT_METHODS
        or any(
            term.casefold() == keyword.normalized and kind.value == "system"
            for term, kind in TERM_CATALOG.items()
        )
    )


def candidate_technologies(base: ResumeDocument, profile: CandidateProfile | None) -> list[str]:
    """Recognize candidate-specific tools even when the built-in catalog lacks them."""
    values = [
        value.split("(", 1)[0].strip()
        for p in base.paragraphs
        if p.kind.value == "skill_line" and p.paragraph_id != "skills.technical_support"
        for value in split_skill_values(p.text.split(":", 1)[-1])
    ]
    if profile:
        values += profile.confirmed_skills
        values += profile.established_technologies
        values += [
            item.term for item in profile.confirmed_evidence if item.category == "technology"
        ]
    return dedupe(values)


def _bullet_scope(source: ResumeEvidence, base: ResumeDocument) -> list[str]:
    if source.claim_scope != "source_specific":
        return []
    reference = source.source_reference or source.paragraph_id
    reference = reference.removeprefix("evidence.")
    # A technology evidenced in one role can be described in that role's relevant
    # bullet, but a Skills list never establishes its use in every employer.
    if source.section != "candidate_profile":
        if not source.section.startswith(("projects.", "experience.")):
            return []
        reference = source.section
    return [
        p.paragraph_id
        for p in base.paragraphs
        if p.kind.value == "bullet" and (p.paragraph_id == reference or p.section == reference)
    ]


def build_keyword_coverage(
    base: ResumeDocument,
    keywords: list[JobKeyword],
    graph: ResumeEvidenceGraph,
    texts: dict[str, str],
) -> list[KeywordCoverage]:
    rows: list[KeywordCoverage] = []
    drafts = {item.term: item for item in graph.draft_technologies}
    for keyword in keywords:
        if not is_coverage_target(keyword):
            continue
        sources = [s for s in graph.evidence if _direct_match(keyword.term, s)]
        eligible = sorted({pid for source in sources for pid in _bullet_scope(source, base)})
        groups: dict[str, list[str]] = {}
        required = {pid for source in sources if not source.routine_tool_context and not source.established_technical_context
                    for pid in _bullet_scope(source, base)}
        for pid in sorted(required):
            group = pid.rsplit(".bullet.", 1)[0]
            groups.setdefault(group, []).append(pid)
        routine_ids = {pid for source in sources if source.routine_tool_context
                       for pid in _bullet_scope(source, base)}
        technical_ids = {pid for source in sources if source.established_technical_context
                         for pid in _bullet_scope(source, base)}
        if technical_ids:
            # One meaningful placement, not one per possible employer/project.
            groups["established_technical_use"] = sorted(technical_ids)
        # Routine knowledge authorizes useful placements; it is not an edit quota.
        # Only actual source-specific usage creates mandatory coverage groups.
        placements = [pid for pid, text in texts.items() if preserves_source_term(text, keyword.term)]
        contextual_placements = [pid for pid in placements
                                 if (pid not in routine_ids or routine_usage_in_context(keyword.term, texts[pid]))
                                 and (pid not in technical_ids or technical_usage_in_context(keyword.term, texts[pid]))]
        missing_groups = [ids for ids in groups.values() if not set(ids).intersection(contextual_placements)]
        credentials_only = bool(sources) and all(s.section == "certifications" for s in sources)
        if keyword.term in drafts:
            eligible = sorted(set(eligible + drafts[keyword.term].paragraph_ids))
        status: Literal[
            "in_context",
            "skills_only",
            "credential_only",
            "covered",
            "missing_supported",
            "needs_confirmation",
            "excluded",
            "draft_assumption",
            "missing_draft",
            "available",
        ]
        if not keyword.accepted:
            status = "excluded"
            explanation = keyword.rejection_reason or "Not requested in a relevant posting context."
        elif missing_groups:
            status = "missing_supported"
            explanation = ("Established basic technology needs one natural placement in a matching work/project duty."
                           if technical_ids and not technical_ids.intersection(contextual_placements)
                           else "Supported technology is missing from " + ", ".join(
                ids[0].rsplit(".bullet.", 1)[0] for ids in missing_groups
            ))
        elif keyword.term in drafts:
            draft = drafts[keyword.term]
            if placements and (
                not draft.required
                or not draft.paragraph_ids
                or set(draft.paragraph_ids).intersection(placements)
            ):
                has_new_project_use = any(
                    pid in draft.paragraph_ids
                    and not contains_term(
                        next((p.text for p in base.paragraphs if p.paragraph_id == pid), ""),
                        keyword.term,
                    )
                    for pid in placements
                )
                status = "draft_assumption" if has_new_project_use or not sources else "covered"
                explanation = (
                    draft.explanation
                    if status == "draft_assumption"
                    else "Represented in the existing resume; additional project adaptation is optional."
                )
            else:
                status = "missing_draft"
                explanation = "Include this posting technology in the editable draft" + (
                    " within the project bullets."
                    if draft.paragraph_ids
                    else " where space permits."
                )
            if draft.paragraph_ids and draft.required:
                groups["draft_project"] = draft.paragraph_ids
        elif not sources:
            status = "needs_confirmation"
            explanation = (
                "Confirm actual use and where it belongs before including this technology."
            )
        elif not placements and routine_ids:
            status = "available"
            explanation = (
                "Known everyday tool; use naturally in a relevant duty when it improves posting fit. "
                "No further confirmation or mandatory placement is needed."
            )
        elif not placements or missing_groups:
            status = "missing_supported"
            explanation = (
                "Supported technology is missing from "
                + ", ".join(ids[0].rsplit(".bullet.", 1)[0] for ids in missing_groups)
                if missing_groups
                else "Supported technology must survive in the final resume."
            )
        elif credentials_only:
            status = "credential_only"
            explanation = "Represented by the existing credential; this does not establish hands-on project use."
        elif set(eligible).intersection(contextual_placements):
            status = "in_context"
            explanation = ("Established technical skill applied to a matching documented duty."
                           if technical_ids else "Everyday tool knowledge applied to a relevant documented duty."
                           if any(s.routine_tool_context for s in sources)
                           else "Present in a relevant bullet for each evidenced employer or project.")
        elif all(pid.startswith("skills.") for pid in placements):
            status = "skills_only"
            explanation = (
                "Known tool; routine use may be included in a relevant documented duty without reconfirmation."
                if any(s.routine_tool_context for s in sources)
                else "Knowledge is confirmed. Specific employer or project implementations need their own evidence."
            )
        else:
            status = "covered"
            explanation = "Represented within the scope established by the base resume."
        rows.append(
            KeywordCoverage(
                term=keyword.term,
                category="technology" if keyword.kind.value == "system" else "method",
                accepted=keyword.accepted,
                automatic_technical_use=bool(technical_ids),
                evidence_ids=[s.evidence_id for s in sources],
                eligible_bullet_ids=eligible,
                required_bullet_groups=list(groups.values()),
                placements=placements,
                status=status,
                explanation=explanation,
            )
        )
    return rows


def coverage_feedback(
    base: ResumeDocument,
    keywords: list[JobKeyword],
    graph: ResumeEvidenceGraph,
    texts: dict[str, str],
    *,
    require_coverage: bool = True,
) -> list[str]:
    feedback: list[str] = []
    originals = {p.paragraph_id: p.text for p in base.paragraphs}
    drafts = {item.term: item for item in graph.draft_technologies}
    rejected_experience = {
        item.term for item in keywords if "candidate_rejected" in item.scoring_factors
    }
    for row in build_keyword_coverage(base, keywords, graph, texts):
        if not row.accepted:
            if row.term in rejected_experience:
                for pid in row.placements:
                    if not contains_term(originals.get(pid, ""), row.term):
                        feedback.append(
                            f"{pid}: {row.term} was explicitly rejected as candidate experience; "
                            "remove this new claim. A posting requirement does not override that rejection."
                        )
            continue
        for pid in row.placements:
            if contains_term(originals.get(pid, ""), row.term):
                continue
            if ".bullet." in pid and pid not in row.eligible_bullet_ids:
                feedback.append(
                    f"{pid}: {row.term} has no evidence for this employer/project. "
                    "Keep Skills-only knowledge in Skills; do not transfer another role's stack."
                )
            elif row.status == "needs_confirmation" and pid in base.editable_paragraph_ids:
                feedback.append(f"{pid}: {row.term} is unconfirmed; remove the claim.")
            elif pid == "summary" and (row.term in drafts or not row.eligible_bullet_ids):
                feedback.append(
                    f"summary: keep {row.term} in its allowed Skills or project placements; "
                    "do not imply unverified professional experience in the summary."
                )
            elif pid.startswith("skills.") and row.status == "credential_only":
                feedback.append(
                    f"{pid}: {row.term} is supported only by a credential, not hands-on knowledge."
                )
        if require_coverage and row.status == "missing_supported":
            places = "; ".join(" or ".join(ids) for ids in row.required_bullet_groups)
            feedback.append(
                f"Missing supported keyword {row.term}: {row.explanation} "
                f"Use its exact wording naturally and retain it in shorter variants. "
                f"Eligible bullets: {places or 'Skills only; no evidenced employer/project'}."
            )
        if require_coverage and row.status == "missing_draft" and drafts[row.term].required:
            feedback.append(
                f"Missing draft technology {row.term}: automatically adapt a relevant project bullet "
                f"using the exact term; this is an editable job-derived draft, not confirmed experience. "
                f"Allowed project bullets: {', '.join(drafts[row.term].paragraph_ids) or 'Skills only'}. "
                "Keep the term in shorter variants. Do not wait for candidate confirmation."
            )
    return feedback
