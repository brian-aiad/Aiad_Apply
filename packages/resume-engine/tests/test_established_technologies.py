import pytest
from aiadapply_v2.evidence.established_technologies import (
    established_technology,
    technical_usage_in_context,
)
from aiadapply_v2.planning.coverage import build_keyword_coverage, coverage_feedback
from aiadapply_v2.schemas import CandidateProfile

from .test_everyday_tools import scenario


def profile(*terms, rejected=()):
    return CandidateProfile(candidate_name="Brian", established_technologies=list(terms),
                            rejected_terms=list(rejected))


@pytest.mark.parametrize("term", ["AWS", "CI/CD", "REST APIs", "APIs"])
def test_requested_established_skill_cannot_stay_only_in_skills(term):
    base, keywords, graph, texts = scenario([term], profile(term))
    row = build_keyword_coverage(base, keywords, graph, texts)[0]
    assert row.eligible_bullet_ids
    assert row.required_bullet_groups
    assert row.status == "missing_supported"
    assert any(term in issue for issue in coverage_feedback(base, keywords, graph, texts))


@pytest.mark.parametrize(("term", "pid", "addition"), [
    ("AWS", "experience.wehelp.bullet.1", " Checked deployments using AWS."),
    ("CI/CD", "experience.wehelp.bullet.1", " Used CI/CD to test and deploy updates."),
    ("REST APIs", "experience.original_insurance.bullet.2", " Debugged REST APIs with Postman."),
])
def test_one_matching_duty_satisfies_basic_technical_use_and_loss_is_detected(term, pid, addition):
    base, keywords, graph, texts = scenario([term], profile(term))
    original = texts[pid]
    texts[pid] += addition
    row = build_keyword_coverage(base, keywords, graph, texts)[0]
    assert row.status == "in_context"
    assert not coverage_feedback(base, keywords, graph, texts)
    texts[pid] = original
    assert coverage_feedback(base, keywords, graph, texts)


def test_technical_permission_does_not_rewrite_unrelated_employers_or_languages():
    base, keywords, graph, texts = scenario(["AWS", "Go", "Rust", "Salesforce"], profile("AWS"))
    texts["experience.csulb.bullet.3"] += " Used AWS for incident notes."
    errors = coverage_feedback(base, keywords, graph, texts)
    assert any("experience.csulb.bullet.3" in e and "no evidence" in e for e in errors)
    rows = build_keyword_coverage(base, keywords, graph, texts)
    assert all(r.status == "needs_confirmation" and not r.eligible_bullet_ids
               for r in rows if r.term in {"Go", "Rust", "Salesforce"})


def test_no_degree_based_default_and_rejection_overrides_alias():
    assert not established_technology([], "AWS", [])
    assert established_technology(["AWS"], "Amazon Web Services", [])
    assert not established_technology(["AWS"], "Amazon Web Services", ["AWS"])
    assert established_technology(["Rust"], "Rust", [])
    assert not established_technology(["Terraform"], "Terraform", [])
    base, keywords, graph, texts = scenario(["AWS"], profile("AWS", rejected=["AWS"]))
    assert build_keyword_coverage(base, keywords, graph, texts)[0].status == "excluded"
    assert not any(e.established_technical_context for e in graph.evidence)


def test_detached_lists_or_classroom_qualifiers_do_not_count_as_work_coverage():
    assert technical_usage_in_context("REST APIs", "Debugged REST APIs and validated fixes.")
    assert not technical_usage_in_context("REST APIs", "Tools: REST APIs, debugging.")
    assert not technical_usage_in_context("CI/CD", "Classroom CI/CD deployment knowledge.")
    assert not technical_usage_in_context("AWS", "Familiar with AWS deployment.")


@pytest.mark.parametrize("lose_during_render", [False, True])
def test_real_export_preserves_required_technical_bullet_or_fails(tmp_path, monkeypatch, lose_during_render):
    import fitz
    from aiadapply_v2 import pipeline
    from aiadapply_v2.documents.model import parse_resume_docx

    from .helpers import IdentityReasoner

    pid = "experience.wehelp.bullet.1"

    class TechnicalReasoner(IdentityReasoner):
        def reason(self, **kwargs):
            result = super().reason(**kwargs)
            bullet = next(b for b in result.rewrite_plan.bullets if b.paragraph_id == pid)
            bullet.text = (
                "Identified food-distribution tracking needs, then independently built, tested, "
                "and deployed Loavenly using CI/CD for staff and volunteers across three distribution locations."
            )
            bullet.shorter_text = bullet.text
            bullet.target_terms = ["CI/CD"]
            return result

    if lose_during_render:
        writer = pipeline.write_resume_candidate

        def lose(base, plan, output_path, **kwargs):
            kwargs["reverted_paragraph_ids"] = {*(kwargs.get("reverted_paragraph_ids") or set()), pid}
            return writer(base, plan, output_path, **kwargs)

        monkeypatch.setattr(pipeline, "write_resume_candidate", lose)

    profile_path = tmp_path / "profile.json"
    profile_path.write_text(profile("CI/CD").model_dump_json())
    raw = ("Example Systems\nApplication Support Engineer\nRemote\nAbout the job\n"
           "Responsibilities\nUse CI/CD to test and deploy application updates.\n"
           "Required Qualifications\nExperience with CI/CD.\n"
           + "Support production applications and investigate incidents. " * 12)
    args = dict(raw_paste=raw, base_resume="data/resumes/Brian_Aiad_BASE.docx",
                output_dir=tmp_path / "result", reasoner=TechnicalReasoner(),
                candidate_profile=profile_path)
    from aiadapply_v2.semantic.matcher import LexicalSemanticEncoder
    args["semantic_encoder"] = LexicalSemanticEncoder()
    if lose_during_render:
        with pytest.raises(pipeline.TransformationError, match="CI/CD"):
            pipeline.transform_resume(**args)
        assert not list((tmp_path / "result").glob("*Resume*.pdf"))
    else:
        report = pipeline.transform_resume(**args)
        assert report.validation.passed and report.layout.passed and report.layout.page_count == 1
        doc = parse_resume_docx(report.output_docx)
        assert "CI/CD" in next(p.text for p in doc.paragraphs if p.paragraph_id == pid)
        with fitz.open(report.output_pdf) as pdf:
            assert "using CI/CD" in " ".join(pdf[0].get_text().split())


@pytest.mark.parametrize("term", ["Go", "Rust", "SQL", "Git", "Docker", "React", "Linux", "JSON"])
def test_expanded_common_development_skills_have_real_matching_duties(term):
    base, keywords, graph, texts = scenario([term], profile(term))
    row = build_keyword_coverage(base, keywords, graph, texts)[0]
    assert row.eligible_bullet_ids
    assert row.required_bullet_groups
    assert row.status != "needs_confirmation"


@pytest.mark.parametrize("term", ["CAD", "Salesforce", "Kubernetes", "Terraform", "Kafka"])
def test_specialized_or_advanced_products_do_not_become_basic_from_profile_name_alone(term):
    base, keywords, graph, texts = scenario([term], profile(term))
    assert not any(e.established_technical_context for e in graph.evidence)
    assert not build_keyword_coverage(base, keywords, graph, texts)[0].eligible_bullet_ids


def test_aws_support_wording_preserves_the_work_without_exact_duty_phrase():
    assert technical_usage_in_context("AWS", "Resolved production tickets across AWS and Microsoft 365.")
    assert not technical_usage_in_context("AWS", "Tools: AWS, Microsoft 365.")
