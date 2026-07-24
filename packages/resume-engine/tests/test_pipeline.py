from pathlib import Path

from aiadapply_v2.pipeline import transform_resume
from aiadapply_v2.semantic.matcher import LexicalSemanticEncoder

from .helpers import IdentityReasoner

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
