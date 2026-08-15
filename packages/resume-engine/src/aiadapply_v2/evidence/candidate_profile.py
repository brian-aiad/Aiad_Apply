from __future__ import annotations

import json
from pathlib import Path

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
) -> None:
    if profile is None:
        return
    skills = ", ".join(profile.confirmed_skills)
    exposure = ", ".join(profile.confirmed_exposure)
    notes = " ".join(profile.drafting_notes)
    graph.evidence.append(
        ResumeEvidence(
            evidence_id="evidence.candidate_profile.confirmed",
            paragraph_id="candidate_profile.confirmed",
            section="candidate_profile",
            source_text=(
                f"Candidate-confirmed skills and tools: {skills}. "
                f"Candidate-confirmed exposure: {exposure}. {notes}"
            ).strip(),
            systems=[*profile.confirmed_skills],
            environment_signals=[*profile.confirmed_exposure],
        )
    )


def apply_candidate_profile_to_keywords(
    keywords: list[JobKeyword],
    profile: CandidateProfile | None,
) -> None:
    if profile is None:
        return
    confirmed = [*profile.confirmed_skills, *profile.confirmed_exposure]
    for keyword in keywords:
        if not keyword.accepted:
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
