from pathlib import Path

from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.documents.writer import write_resume_candidate
from aiadapply_v2.layout.renderer import inspect_pdf, render_docx_to_pdf
from aiadapply_v2.validation.resume import validate_candidate_docx

from .helpers import identity_plan

BASE = Path("data/resumes/Brian_Aiad_BASE.docx")


def test_base_docx_semantic_model_has_exact_structural_limits() -> None:
    document = parse_resume_docx(BASE)
    sections = {section.section_id: section for section in document.sections}

    assert (
        document.source_sha256 == "7cb556d81f20d884fa31e5fa5351847d6dec109da6e50736a164ca7a2770a07c"
    )
    assert len(document.paragraphs) == 41
    assert sections["experience.original_insurance"].bullet_count == 5
    assert sections["experience.csulb"].bullet_count == 3
    assert sections["experience.wehelp"].bullet_count == 2
    assert sections["projects.loavenly"].bullet_count == 3
    assert len([item for item in document.paragraphs if item.kind.value == "skill_line"]) == 5
    assert len(document.protected_hyperlinks) == 3


def test_no_edit_docx_round_trip_preserves_structure_metrics_and_hyperlinks(tmp_path: Path) -> None:
    document = parse_resume_docx(BASE)
    output = tmp_path / "roundtrip.docx"
    write_resume_candidate(document, identity_plan(document), output)
    validation = validate_candidate_docx(document, str(output), [])

    assert validation.passed, validation.issues
    assert validation.protected_fields_passed
    assert validation.metrics_passed
    assert validation.structure_passed


def test_libreoffice_baseline_is_one_page_with_stable_section_anchors(tmp_path: Path) -> None:
    pdf = render_docx_to_pdf(BASE, tmp_path)
    layout = inspect_pdf(pdf)

    assert layout.passed
    assert layout.page_count == 1
    assert layout.rendered_lines > 40
    assert set(layout.section_anchor_deltas) == {
        "SKILLS",
        "EXPERIENCE",
        "PROJECTS",
        "EDUCATION",
        "CERTIFICATIONS",
    }


def test_layout_rejects_excessive_upward_section_drift(tmp_path: Path) -> None:
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    plan.summary.shorter_text = "Technical Support Engineer."
    for line in plan.skills.lines:
        line.shorter_skills = [line.skills[0]]
    for bullet in plan.bullets:
        bullet.shorter_text = "Resolved technical issues."
    baseline_pdf = render_docx_to_pdf(BASE, tmp_path / "baseline")
    candidate = tmp_path / "compressed.docx"
    write_resume_candidate(
        document,
        plan,
        candidate,
        compressed_paragraph_ids=set(document.editable_paragraph_ids),
    )
    candidate_pdf = render_docx_to_pdf(candidate, tmp_path / "candidate")
    layout = inspect_pdf(candidate_pdf, baseline_pdf=baseline_pdf)

    assert not layout.passed
    assert any(delta < -14.5 for delta in layout.section_anchor_deltas.values())
