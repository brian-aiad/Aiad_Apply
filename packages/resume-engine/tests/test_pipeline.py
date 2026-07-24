from pathlib import Path

from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.grading.keywords import grade_job_keywords, important_keywords
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify
from aiadapply_v2.pipeline import (
    _ensure_important_keyword_placement,
    _select_compression_candidate,
    transform_resume,
)
from aiadapply_v2.profiling.role_profile import build_target_role_profile
from aiadapply_v2.schemas import LayoutResult, ReasoningResult, TransferabilityMap
from aiadapply_v2.semantic.matcher import LexicalSemanticEncoder
from aiadapply_v2.text import contains_term

from .helpers import IdentityReasoner, identity_plan

BASE = Path("data/resumes/Brian_Aiad_BASE.docx")


def test_end_to_end_pipeline_exports_fixed_names_after_validation(tmp_path: Path) -> None:
    raw = """
Home
Jobs
Company logo for, Example Systems.
Example Systems
Technical Support Engineer
Los Angeles, CA · Posted today
Hybrid
Full-time
About the job
Example Systems provides production software to business customers. This paragraph
adds realistic page noise and sufficient text for a complete paste parser fixture.
Responsibilities
Troubleshoot production incidents using SQL, Postman, Jira, log analysis, and API debugging.
Resolve technical support tickets and document root cause analysis for SaaS applications.
Required Qualifications
Experience with SQL, Postman, Jira, technical support, troubleshooting, and REST APIs.
Strong written communication and cross-functional support experience.
Preferred Qualifications
Experience with Microsoft 365, Python, PowerShell, Linux, and Confluence.
Set alert for similar jobs
Candidates who clicked apply
100 total
About
Accessibility
LinkedIn Corporation
""" + ("navigation noise " * 20)
    report = transform_resume(
        raw_paste=raw,
        base_resume=BASE,
        output_dir=tmp_path,
        reasoner=IdentityReasoner(),
        semantic_encoder=LexicalSemanticEncoder(),
    )

    assert report.output_docx.name == "Brian_Aiad_resume.docx"
    assert report.output_pdf.name == "Brian_Aiad_resume.pdf"
    assert report.output_docx.exists()
    assert report.output_pdf.exists()
    assert report.validation.passed
    assert report.layout.passed
    assert report.layout.page_count == 1
    assert (tmp_path / "transformation_report.json").exists()
    assert (tmp_path / "transformation_report.md").exists()
    audit = tmp_path / "character_audit.json"
    assert audit.exists()
    assert '"format_integrity_passed": true' in audit.read_text(encoding="utf-8")


def test_important_omitted_term_is_added_to_full_and_shorter_skill_lines() -> None:
    job = parse_linkedin_simplify(Path("data/fixtures/hanmi_full.txt").read_text(encoding="utf-8"))
    keywords = grade_job_keywords(job)
    document = parse_resume_docx(BASE)
    reasoning = ReasoningResult(
        role_profile=build_target_role_profile(job, keywords),
        transferability_map=TransferabilityMap(),
        rewrite_plan=identity_plan(document),
    )

    _ensure_important_keyword_placement(reasoning, keywords, document)

    cloud = next(
        line
        for line in reasoning.rewrite_plan.skills.lines
        if line.paragraph_id == "skills.cloud_systems"
    )
    assert "operating systems" in {skill.casefold() for skill in cloud.skills}
    assert "operating systems" in {skill.casefold() for skill in cloud.shorter_skills}


def test_compression_prioritizes_measured_overflow_paragraph() -> None:
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    overflow = "experience.original_insurance.bullet.3"
    layout = LayoutResult(
        passed=False,
        page_count=2,
        rendered_lines=62,
        overflow_paragraph_ids=[overflow, "PROJECTS"],
    )

    selected = _select_compression_candidate(document, plan, layout, set())

    assert selected == overflow


def test_dense_erp_keywords_are_balanced_across_fixed_skill_rows() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/liquid_iv_full.txt").read_text(encoding="utf-8")
    )
    keywords = grade_job_keywords(job)
    document = parse_resume_docx(BASE)
    reasoning = ReasoningResult(
        role_profile=build_target_role_profile(job, keywords),
        transferability_map=TransferabilityMap(),
        rewrite_plan=identity_plan(document),
    )

    _ensure_important_keyword_placement(reasoning, keywords, document)

    proposed = "\n".join(
        skill for line in reasoning.rewrite_plan.skills.lines for skill in line.skills
    )
    assert all(contains_term(proposed, keyword.term) for keyword in important_keywords(keywords))
    by_id = {paragraph.paragraph_id: paragraph for paragraph in document.paragraphs}
    for line in reasoning.rewrite_plan.skills.lines:
        paragraph = by_id[line.paragraph_id]
        label, values = paragraph.text.split(":", 1)
        alignment = values[: len(values) - len(values.lstrip())]
        rendered_text = f"{label}:{alignment}{', '.join(line.skills)}"
        assert len(rendered_text) <= paragraph.character_budget
