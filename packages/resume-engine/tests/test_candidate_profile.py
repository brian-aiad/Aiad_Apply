from pathlib import Path

from aiadapply_v2.evidence.candidate_profile import (
    add_candidate_profile_evidence,
    apply_candidate_profile_to_keywords,
    load_candidate_profile,
)
from aiadapply_v2.grading.keywords import grade_job_keywords
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify
from aiadapply_v2.schemas import CandidateProfile, ResumeEvidenceGraph


def test_confirmed_candidate_skills_become_durable_evidence() -> None:
    profile = load_candidate_profile(Path("data/profile/Brian_Aiad_PROFILE.json"))
    graph = ResumeEvidenceGraph(
        candidate_name="Brian Aiad",
        document_sha256="test",
        evidence=[],
    )

    add_candidate_profile_evidence(graph, profile)

    evidence = graph.evidence[-1]
    assert evidence.evidence_id == "evidence.candidate_profile.confirmed"
    assert {"React", "R", "Excel", "Outlook"} <= set(evidence.systems)
    assert "Compliance" in evidence.environment_signals


def test_confirmed_profile_does_not_override_boilerplate_rejection() -> None:
    profile = load_candidate_profile(Path("data/profile/Brian_Aiad_PROFILE.json"))
    job = parse_linkedin_simplify(
        Path("data/fixtures/anduril_rotation_full.txt").read_text(encoding="utf-8")
    )
    keywords = grade_job_keywords(job)
    compliance = next(item for item in keywords if item.normalized == "compliance")
    assert not compliance.accepted

    apply_candidate_profile_to_keywords(keywords, profile)

    assert not compliance.accepted
    assert "candidate_confirmed" not in compliance.scoring_factors


def test_candidate_rejection_prevents_future_resume_placement() -> None:
    job = parse_linkedin_simplify(
        "Product Support Specialist\nCompany\nAbout the job\nResponsibilities\n"
        "Use CNC equipment and document results.\nQualifications\nCNC experience required.\n"
        + ("Complete posting context and role information. " * 15)
    )
    keywords = grade_job_keywords(job)
    profile = CandidateProfile(candidate_name="Brian", rejected_terms=["CNC"])

    apply_candidate_profile_to_keywords(keywords, profile)

    cnc = next(item for item in keywords if item.normalized == "cnc")
    assert not cnc.accepted
    assert "previously confirmed" in cnc.rejection_reason
