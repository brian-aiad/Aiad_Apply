from __future__ import annotations

import json
from pathlib import Path

from aiadapply_v2.evidence.established_technologies import (
    established_technology,
    technical_duty_fits,
    technical_family,
)
from aiadapply_v2.evidence.everyday_tools import routine_tool_fits
from aiadapply_v2.schemas import (
    CandidateProfile,
    JobKeyword,
    ResumeEvidence,
    ResumeEvidenceGraph,
)
from aiadapply_v2.text import contains_term


def load_candidate_profile(path: str | Path | None) -> CandidateProfile | None:
    if path is None:
        return None
    profile_path = Path(path)
    if not profile_path.exists():
        return None
    return CandidateProfile.model_validate_json(profile_path.read_text(encoding="utf-8"))


def add_candidate_profile_evidence(
    graph: ResumeEvidenceGraph,
    profile: CandidateProfile | None,
    keywords: list[JobKeyword] | None = None,
) -> None:
    if profile is None:
        return
    graph.automatic_technical_policy = profile.automatic_technical_policy
    work_sources = [item for item in graph.evidence
                    if item.section.startswith(("experience.", "projects."))
                    and ".bullet." in item.paragraph_id]
    skills = ", ".join([*profile.confirmed_skills, *profile.established_technologies])
    exposure = ", ".join(profile.confirmed_exposure)
    graph.evidence.append(
        ResumeEvidence(
            evidence_id="evidence.candidate_profile.confirmed",
            paragraph_id="candidate_profile.confirmed",
            section="candidate_profile",
            source_text=(
                f"Candidate-confirmed skills and tools: {skills}. "
                f"Candidate-confirmed exposure: {exposure}."
            ).strip(),
            systems=[*profile.confirmed_skills, *profile.established_technologies],
            environment_signals=[*profile.confirmed_exposure],
            claim_scope="skills_only",
        )
    )
    for index, item in enumerate(profile.confirmed_evidence):
        graph.evidence.append(
            ResumeEvidence(
                evidence_id=f"evidence.candidate_profile.confirmed.{index}",
                paragraph_id=f"candidate_profile.confirmed.{index}",
                section="candidate_profile",
                source_text=(
                    f"Candidate-confirmed {item.category}: {item.term}. "
                    f"Claim scope: {item.scope}. Evidence reference: "
                    f"{item.evidence_reference or 'candidate confirmation only'}. "
                    f"{item.notes}"
                ).strip(),
                systems=[item.term] if item.category == "technology" else [],
                actions=[item.term] if item.category == "method" else [],
                environment_signals=[item.term]
                if item.category in {"domain", "qualification", "other"}
                else [],
                claim_scope=item.scope,
                source_reference=item.evidence_reference if item.scope == "source_specific" else "",
            )
        )
    # Requested basic technical skills must appear in one matching work bullet.
    # Keep this separate from optional productivity assistance and from historical
    # source-specific implementations; it is the candidate's standing permission.
    technical_terms = [k.term for k in keywords if k.accepted] if keywords is not None else profile.established_technologies
    for term in dict.fromkeys(technical_terms):
        if not established_technology(profile.established_technologies, term, profile.rejected_terms):
            continue
        for source in work_sources:
            if not technical_duty_fits(term, source.source_text):
                continue
            graph.evidence.append(ResumeEvidence(
                evidence_id=f"evidence.candidate_profile.technical.{term}.{source.paragraph_id}",
                paragraph_id=f"candidate_profile.technical.{term}.{source.paragraph_id}",
                section="candidate_profile",
                source_text=(f"Candidate-established basic technology: {term}. "
                             f"Authorized ordinary use in this existing duty: {source.source_text} "
                             "When the posting requests this technology, weave it into one best matching "
                             "work/project bullet. Skills-only coverage is insufficient. Do not ask again "
                             "or qualify it as classroom knowledge. Preserve the actual duty, systems, "
                             "metrics and outcomes. Do not invent specific services, infrastructure, "
                             "integrations, migrations or a different project language/hosting stack."),
                systems=[term], claim_scope="source_specific", source_reference=source.paragraph_id,
                established_technical_context=True,
            ))

    # Explicit profile authorization is required; no defaults for other candidates.
    for term in profile.everyday_tools:
        if keywords is not None and not any(
            keyword.accepted and contains_term(term, keyword.term) for keyword in keywords
        ):
            continue
        if term.casefold() in {value.casefold() for value in profile.rejected_terms}:
            continue
        if term.casefold() not in {value.casefold() for value in profile.confirmed_skills}:
            continue
        for source in work_sources:
            if not routine_tool_fits(term, source.source_text):
                continue
            graph.evidence.append(ResumeEvidence(
                evidence_id=f"evidence.candidate_profile.routine.{term}.{source.paragraph_id}",
                paragraph_id=f"candidate_profile.routine.{term}.{source.paragraph_id}",
                section="candidate_profile",
                source_text=(f"Candidate-authorized everyday knowledge: {term}. "
                             f"Routine assistance may be inferred for this documented duty: {source.source_text} "
                             "This is a routine-use inference, not confirmed historical tool attribution. "
                             "When requested by the posting, use natural professional wording in a "
                             "relevant bullet as needed, without classroom/familiarity qualifiers. "
                             "No mandatory placement or edit quota; preserve existing systems and outcomes. "
                             "No advanced features, integrations, deployments, invented deliverables, "
                             "or attribution of existing metrics to this tool."),
                systems=[term], claim_scope="source_specific",
                source_reference=source.paragraph_id, routine_tool_context=True,
            ))


def apply_candidate_profile_to_keywords(
    keywords: list[JobKeyword],
    profile: CandidateProfile | None,
    *,
    aggressive_draft: bool = False,
) -> None:
    if profile is None:
        return
    confirmed = [
        *profile.confirmed_skills,
        *profile.established_technologies,
        *profile.confirmed_exposure,
        *(item.term for item in profile.confirmed_evidence),
    ]
    for keyword in keywords:
        if not keyword.accepted:
            continue
        if any(contains_term(value, keyword.term)
               or (technical_family(keyword.term) is not None
                   and technical_family(value) == technical_family(keyword.term))
               for value in profile.rejected_terms):
            if aggressive_draft:
                from aiadapply_v2.planning.draft import _project_applicable

                if _project_applicable(keyword):
                    keyword.scoring_factors["unverified_project_draft"] = 0.0
                    continue
            keyword.accepted = False
            keyword.rejection_reason = (
                "Candidate previously confirmed they do not have this experience."
            )
            keyword.scoring_factors["candidate_rejected"] = -100.0
            continue
        if not any(
            contains_term(value, keyword.term) or contains_term(keyword.term, value)
            for value in confirmed
        ):
            continue
        keyword.hiring_importance = max(keyword.hiring_importance, 25.0)
        keyword.placement_utility = max(keyword.placement_utility, 35.0)
        keyword.scoring_factors["candidate_confirmed"] = 15.0


def write_candidate_profile(profile: CandidateProfile, path: str | Path) -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(profile.model_dump(mode="json"), indent=2) + "\n",
        encoding="utf-8",
    )
