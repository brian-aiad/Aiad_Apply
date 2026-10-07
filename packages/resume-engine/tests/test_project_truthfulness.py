from pathlib import Path

import pytest
from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.evidence.loaders import build_evidence_graph
from aiadapply_v2.grading.keywords import grade_job_keywords
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify
from aiadapply_v2.pipeline import transform_resume
from aiadapply_v2.planning.coverage import coverage_feedback
from aiadapply_v2.semantic.matcher import LexicalSemanticEncoder

from .helpers import IdentityReasoner

BASE = Path("data/resumes/Brian_Aiad_BASE.docx")


def posting(tools):
    return "Example\nCustomer Systems Specialist\nRemote\nAbout the job\nRequired Qualifications\nTools: " + tools + "\n" + "Manage customer accounts and maintain accurate customer records. " * 12


@pytest.mark.parametrize("tool", ["Salesforce", "Zendesk", "Qualtrics", "C++", "Power BI"])
def test_posting_tool_cannot_be_claimed_as_project_implementation_without_evidence(tool):
    base = parse_resume_docx(BASE)
    keywords = grade_job_keywords(parse_linkedin_simplify(posting(tool)))
    graph = build_evidence_graph(base, keywords)
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    pid = "projects.loavenly.bullet.1"
    texts[pid] += f" Built {tool} workflows for intake."
    feedback = coverage_feedback(base, keywords, graph, texts)
    assert any(pid in message and tool in message and "no evidence" in message for message in feedback)


def test_default_pipeline_does_not_authorize_hypothetical_project_stack(tmp_path):
    class InspectDefault(IdentityReasoner):
        def reason(self, **kwargs):
            assert kwargs["evidence_graph"].draft_technologies == []
            from aiadapply_v2.schemas import TechnologyAssessment
            result = super().reason(**kwargs)
            result.technology_assessments = [TechnologyAssessment(
                term="Qualtrics", classification="specialized_or_advanced",
                reasoning="Specialist survey platform; no completed use in the source duties.",
                usage_boundary="Leave out without matching evidence.",
            )]
            return result

    report = transform_resume(
        raw_paste=posting("Salesforce, Qualtrics, Zendesk"),
        base_resume=BASE,
        output_dir=tmp_path,
        reasoner=InspectDefault(),
        semantic_encoder=LexicalSemanticEncoder(),
        candidate_profile=Path("data/profile/Brian_Aiad_PROFILE.json"),
    )
    assert report.tailoring_mode == "evidence_only"
    assert report.draft_technologies == []
    final = parse_resume_docx(report.output_docx)
    project = "\n".join(p.text for p in final.paragraphs if p.section.startswith("projects."))
    assert not any(term in project for term in ["Salesforce", "Qualtrics", "Zendesk"])
    all_text = "\n".join(p.text for p in final.paragraphs)
    assert not any(term in all_text for term in ["Salesforce", "Qualtrics", "Zendesk"])
    assert not any(row.status in {"draft_assumption", "missing_draft"} for row in report.keyword_coverage)
    assert report.validation.passed and report.layout.page_count == 1


def test_rejected_tool_cannot_bypass_validation_by_being_excluded_from_scoring():
    from aiadapply_v2.evidence.candidate_profile import (
        apply_candidate_profile_to_keywords,
        load_candidate_profile,
    )
    base = parse_resume_docx(BASE)
    keywords = grade_job_keywords(parse_linkedin_simplify(posting("Zendesk")))
    apply_candidate_profile_to_keywords(keywords, load_candidate_profile(Path("data/profile/Brian_Aiad_PROFILE.json")))
    assert next(k for k in keywords if k.term == "Zendesk").accepted is False
    graph = build_evidence_graph(base, keywords)
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    texts["projects.loavenly.bullet.2"] += " Managed Zendesk support workflows."
    texts["skills.tools"] += ", Zendesk"
    feedback = coverage_feedback(base, keywords, graph, texts)
    assert any("projects.loavenly.bullet.2" in message and "explicitly rejected" in message for message in feedback)
    assert any("skills.tools" in message and "explicitly rejected" in message for message in feedback)


def test_light_project_tailoring_uses_existing_api_work_without_new_stack():
    from aiadapply_v2.planning.quality import tailoring_feedback, tailoring_opportunities
    from aiadapply_v2.profiling.role_profile import build_target_role_profile
    from aiadapply_v2.semantic.matcher import build_transferability_map

    base = parse_resume_docx(BASE)
    job = parse_linkedin_simplify(Path("data/fixtures/floqast_full.txt").read_text())
    keywords = grade_job_keywords(job)
    graph = build_evidence_graph(base, keywords)
    matches = build_transferability_map(build_target_role_profile(job, keywords), keywords, graph, LexicalSemanticEncoder())
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    opportunities = tailoring_opportunities(base, keywords, graph, matches)
    pid = "projects.loavenly.bullet.2"
    assert pid in opportunities
    assert not any("Lightly tailor" in item for item in tailoring_feedback(base, texts, keywords, graph, matches))
    texts[pid] = "Resolved production API, authentication, synchronization, and permission issues while configuring RBAC to support live operations."
    feedback = tailoring_feedback(base, texts, keywords, graph, matches)
    assert not any("Lightly tailor" in item for item in feedback)
    assert not any("no evidence" in item for item in coverage_feedback(base, keywords, graph, texts))


def test_project_overlap_does_not_force_all_project_bullets_to_change(monkeypatch):
    from aiadapply_v2.planning import quality
    from aiadapply_v2.schemas import TransferabilityMap
    base = parse_resume_docx(BASE)
    graph = build_evidence_graph(base, [])
    opportunities = {**{f"experience.original_insurance.bullet.{i}": ["API", "support"] for i in range(1, 6)}, **{f"projects.loavenly.bullet.{i}": ["API", "database"] for i in range(1, 4)}}
    monkeypatch.setattr(quality, "tailoring_opportunities", lambda *args: opportunities)
    breadth = quality.tailoring_breadth(base, {p.paragraph_id:p.text for p in base.paragraphs}, [], graph, TransferabilityMap())
    assert breadth["minimum"] == 0  # Project overlap does not impose a rewrite quota.
