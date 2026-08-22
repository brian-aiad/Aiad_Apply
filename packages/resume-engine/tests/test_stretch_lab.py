from pathlib import Path

from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.evidence.loaders import build_evidence_graph
from aiadapply_v2.grading.keywords import grade_job_keywords
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify
from aiadapply_v2.planning.stretch_lab import build_stretch_lab
from aiadapply_v2.profiling.role_profile import build_target_role_profile
from aiadapply_v2.schemas import EvidenceStrength, StretchLab, StretchProject
from aiadapply_v2.semantic.matcher import LexicalSemanticEncoder, build_transferability_map

FIXTURES = Path("data/fixtures")
BASE = Path("data/resumes/Brian_Aiad_BASE.docx")


def _role_intelligence(filename: str):
    job = parse_linkedin_simplify((FIXTURES / filename).read_text(encoding="utf-8"))
    keywords = grade_job_keywords(job)
    profile = build_target_role_profile(job, keywords)
    graph = build_evidence_graph(parse_resume_docx(BASE), keywords)
    transferability = build_transferability_map(
        profile,
        keywords,
        graph,
        LexicalSemanticEncoder(),
    )
    return profile, keywords, transferability


def test_positive_help_desk_is_strongly_transferable_from_real_support_evidence() -> None:
    profile, keywords, transferability = _role_intelligence(
        "pds_health_epic_analyst_full_2026_08_06.txt"
    )
    del profile, keywords

    help_desk = next(
        item for item in transferability.matches if item.target_term.casefold() == "help desk"
    )

    assert help_desk.strength == EvidenceStrength.strongly_transferable
    assert any(
        term in help_desk.source_text.casefold()
        for term in ("support tickets", "technical support", "incident", "escalation")
    )


def test_manufacturing_stretch_lab_is_review_only_and_proposes_real_gap_work() -> None:
    profile, keywords, transferability = _role_intelligence(
        "rtx_collins_manufacturing_engineer_riverside_01865676.txt"
    )

    lab = build_stretch_lab(profile, keywords, transferability)

    assert lab.gaps
    assert {gap.target_term.casefold() for gap in lab.gaps} & {
        "catia",
        "composite fabrication",
        "pfmea",
        "spc",
    }
    assert lab.proposed_projects
    project = lab.proposed_projects[0]
    assert project.status == "proposed_not_completed"
    assert "Manufacturing" in project.title
    assert project.build_steps
    assert project.evidence_to_collect
    assert not project.export_allowed
    assert all(not gap.export_allowed for gap in lab.gaps)
    assert all(not opportunity.export_allowed for opportunity in lab.transferable_opportunities)


def test_project_target_terms_include_gap_terms_named_in_build_steps() -> None:
    profile, keywords, transferability = _role_intelligence(
        "rtx_collins_manufacturing_engineer_riverside_01865676.txt"
    )
    proposed = StretchLab(
        proposed_projects=[
            StretchProject(
                title="Process Quality Lab",
                target_terms=["control plans"],
                objective="Practice manufacturing quality analysis.",
                build_steps=["Create a PFMEA and an SPC chart from synthetic data."],
                evidence_to_collect=["Analysis repository"],
                resume_language_after_completion="List only the completed analysis.",
            )
        ]
    )

    lab = build_stretch_lab(profile, keywords, transferability, proposed)
    terms = {term.casefold() for term in lab.proposed_projects[0].target_terms}

    assert "pfmea" in terms
    assert "spc" in terms
    assert "control plans" in terms


def test_stretch_lab_never_turns_status_requirements_into_project_ideas() -> None:
    profile, keywords, transferability = _role_intelligence(
        "rtx_raytheon_rf_microwave_antenna_engineer_i_01864246.txt"
    )

    lab = build_stretch_lab(profile, keywords, transferability)
    project_terms = {
        term.casefold() for project in lab.proposed_projects for term in project.target_terms
    }

    assert "security clearance" not in project_terms
    assert "u.s. citizenship" not in project_terms
    assert "stem degree" not in project_terms


def test_stretch_lab_does_not_claim_proprietary_banking_platform_access() -> None:
    profile, keywords, transferability = _role_intelligence(
        "nesco_resource_technical_client_operations_specialist_aliso_viejo.txt"
    )

    lab = build_stretch_lab(profile, keywords, transferability)
    project_terms = {
        term.casefold() for project in lab.proposed_projects for term in project.target_terms
    }

    assert not {"abrigo", "baker hill", "moody's", "ncino"} & project_terms
    assert {"abrigo", "baker hill", "moody's", "ncino"} <= {
        gap.target_term.casefold() for gap in lab.gaps
    }


def test_loan_workflow_project_can_close_the_generic_los_gap_without_vendor_claims() -> None:
    profile, keywords, transferability = _role_intelligence(
        "nesco_resource_technical_client_operations_specialist_aliso_viejo.txt"
    )
    proposed = StretchLab(
        proposed_projects=[
            StretchProject(
                title="Loan Application Sandbox",
                target_terms=["fintech", "Abrigo"],
                objective="Build a small loan-application workflow with synthetic data.",
                build_steps=["Implement intake, review, and approval states."],
                evidence_to_collect=["Repository and workflow documentation"],
                resume_language_after_completion="List the completed personal project only.",
            )
        ]
    )

    lab = build_stretch_lab(profile, keywords, transferability, proposed)
    terms = {term.casefold() for term in lab.proposed_projects[0].target_terms}

    assert "loan origination system" in terms
    assert "fintech" in terms
    assert "abrigo" not in terms
