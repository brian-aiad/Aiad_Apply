from aiadapply_v2.evidence.technical_policy import (
    apply_technology_assessments,
    pending_technology_assessments,
)
from aiadapply_v2.planning.coverage import build_keyword_coverage, coverage_feedback
from aiadapply_v2.schemas import CandidateProfile, TechnologyAssessment

from .test_everyday_tools import scenario

PID = "experience.original_insurance.bullet.2"


def assessment(term, classification="common_development", pids=None):
    return TechnologyAssessment(
        term=term, classification=classification,
        duty_paragraph_ids=pids if pids is not None else [PID],
        reasoning="Ordinary HTTP client used during existing API troubleshooting.",
        usage_boundary="Validate existing API requests; no new platform, integration or metric.",
    )


def test_unlisted_tools_are_judged_per_posting_and_must_enter_a_real_bullet():
    # Neither name is in the built-in examples nor the profile's confirmed list.
    profile = CandidateProfile(candidate_name="Brian", automatic_technical_policy=True)
    base, keywords, graph, texts = scenario(["HTTPie", "Paw"], profile)
    assert pending_technology_assessments(base, keywords, graph) == ["HTTPie", "Paw"]
    assert not apply_technology_assessments(base, keywords, graph, [assessment("HTTPie"), assessment("Paw")])
    rows = build_keyword_coverage(base, keywords, graph, texts)
    assert all(r.automatic_technical_use and r.status == "missing_supported" for r in rows)
    assert len(coverage_feedback(base, keywords, graph, texts)) == 2
    texts[PID] += " Validated API requests with HTTPie and Paw."
    assert not coverage_feedback(base, keywords, graph, texts)
    assert all(r.status == "in_context" for r in build_keyword_coverage(base, keywords, graph, texts))
    assert profile.confirmed_skills == []  # generated assessment never changes historical profile facts


def test_missing_classification_repairs_instead_of_asking_user_or_silently_omitting():
    base, keywords, graph, texts = scenario(["HTTPie"], CandidateProfile(candidate_name="Brian", automatic_technical_policy=True))
    errors = apply_technology_assessments(base, keywords, graph, [])
    assert any("Assess HTTPie exactly once" in e for e in errors)
    assert not any(e.established_technical_context for e in graph.evidence)


def test_advanced_judgment_does_not_authorize_new_employer_claims():
    base, keywords, graph, texts = scenario(["Terraform"], CandidateProfile(candidate_name="Brian", automatic_technical_policy=True))
    assert apply_technology_assessments(base, keywords, graph, [assessment("Terraform")])
    assert not apply_technology_assessments(base, keywords, graph, [assessment("Terraform", "specialized_or_advanced", [])])
    assert not any(e.established_technical_context for e in graph.evidence)
    texts[PID] += " Used Terraform."
    assert coverage_feedback(base, keywords, graph, texts)


def test_no_policy_no_inference_and_rejections_cannot_be_overridden():
    for profile in [CandidateProfile(candidate_name="Other"),
                    CandidateProfile(candidate_name="Brian", automatic_technical_policy=True, rejected_terms=["HTTPie"])]:
        base, keywords, graph, texts = scenario(["HTTPie"], profile)
        assert not pending_technology_assessments(base, keywords, graph)
        apply_technology_assessments(base, keywords, graph, [assessment("HTTPie")])
        assert not any(e.established_technical_context for e in graph.evidence)


def test_retry_replaces_assessments_and_invalid_or_protected_duties_fail():
    base, keywords, graph, texts = scenario(["HTTPie"], CandidateProfile(candidate_name="Brian", automatic_technical_policy=True))
    assert not apply_technology_assessments(base, keywords, graph, [assessment("HTTPie")])
    assert any(e.established_technical_context for e in graph.evidence)
    assert apply_technology_assessments(base, keywords, graph, [assessment("HTTPie", pids=["skills.tools"])])
    assert not any(e.established_technical_context for e in graph.evidence)
    assert not apply_technology_assessments(base, keywords, graph, [assessment("HTTPie", "unrelated", [])])
    assert not any(e.established_technical_context for e in graph.evidence)


def test_unlisted_tool_survives_real_pipeline_and_render_without_profile_mutation(tmp_path):
    import fitz
    from aiadapply_v2 import pipeline
    from aiadapply_v2.documents.model import parse_resume_docx
    from aiadapply_v2.semantic.matcher import LexicalSemanticEncoder

    from .helpers import IdentityReasoner

    class NewToolReasoner(IdentityReasoner):
        def reason(self, **kwargs):
            result = super().reason(**kwargs)
            result.technology_assessments = [assessment("HTTPie")]
            bullet = next(b for b in result.rewrite_plan.bullets if b.paragraph_id == PID)
            bullet.text = bullet.text.replace("with Postman", "with Postman and HTTPie")
            bullet.shorter_text = bullet.text
            bullet.target_terms = ["HTTPie"]
            return result

    source = CandidateProfile(candidate_name="Brian", automatic_technical_policy=True).model_dump_json()
    profile_path = tmp_path / "profile.json"
    profile_path.write_text(source)
    report = pipeline.transform_resume(
        raw_paste=("Example\nApplication Support Engineer\nRemote\nAbout the job\n"
                   "Responsibilities\nDebug application API requests.\nRequired Qualifications\n"
                   "Tools: HTTPie.\n" + "Support production applications and investigate incidents. " * 12),
        base_resume="data/resumes/Brian_Aiad_BASE.docx", output_dir=tmp_path / "result",
        candidate_profile=profile_path, reasoner=NewToolReasoner(),
        semantic_encoder=LexicalSemanticEncoder(),
    )
    row = next(r for r in report.keyword_coverage if r.term == "HTTPie")
    assert row.automatic_technical_use and row.status == "in_context"
    assert PID in row.placements
    assert report.technology_assessments[0].classification == "common_development"
    assert report.validation.passed and report.layout.page_count == 1
    assert "HTTPie" in next(p.text for p in parse_resume_docx(report.output_docx).paragraphs if p.paragraph_id == PID)
    with fitz.open(report.output_pdf) as pdf:
        assert "Postman and HTTPie" in " ".join(pdf[0].get_text().split())
    assert profile_path.read_text() == source


def test_ordinary_operations_verb_counts_for_newly_assessed_methods():
    from aiadapply_v2.evidence.established_technologies import technical_usage_in_context
    assert technical_usage_in_context("DevOps", "Use DevOps practices to run production operations.")
    assert not technical_usage_in_context("DevOps", "Tools: DevOps.")
