import json
from pathlib import Path
from zipfile import ZipFile

from aiadapply_v2.documents.formatting import DOCUMENT_PART, compare_format_integrity
from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.documents.optimizer import (
    extract_embedded_fonts,
    font_deembedded_equivalent,
    write_ats_optimized_docx,
)
from aiadapply_v2.documents.writer import write_resume_candidate
from aiadapply_v2.layout.renderer import (
    apply_pdf_layout_budgets,
    inspect_pdf,
    render_docx_to_pdf,
)
from aiadapply_v2.validation.resume import validate_candidate_docx

from .helpers import identity_plan

BASE = Path("data/resumes/Brian_Aiad_BASE.docx")
FORMAT_BASELINE = Path("data/resumes/Brian_Aiad_BASE.format.json")


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


def test_committed_format_baseline_matches_source_package() -> None:
    document = parse_resume_docx(BASE)
    baseline = json.loads(FORMAT_BASELINE.read_text(encoding="utf-8"))
    expected = baseline["document"]

    assert expected["source_sha256"] == document.source_sha256
    assert expected["package_parts"] == document.package_parts
    assert expected["immutable_package_part_sha256"] == document.immutable_package_part_sha256
    assert expected["document_format_skeleton_sha256"] == document.document_format_skeleton_sha256
    assert expected["section_properties_sha256"] == document.section_properties_sha256


def test_no_edit_docx_round_trip_preserves_structure_metrics_and_hyperlinks(tmp_path: Path) -> None:
    document = parse_resume_docx(BASE)
    output = tmp_path / "roundtrip.docx"
    write_resume_candidate(document, identity_plan(document), output)
    validation = validate_candidate_docx(document, str(output), [])

    assert validation.passed, validation.issues
    assert validation.protected_fields_passed
    assert validation.metrics_passed
    assert validation.structure_passed
    assert compare_format_integrity(base_path=BASE, candidate_path=output) == []
    with ZipFile(BASE) as base_zip, ZipFile(output) as output_zip:
        assert base_zip.namelist() == output_zip.namelist()
        for member in base_zip.namelist():
            if member != DOCUMENT_PART:
                assert base_zip.read(member) == output_zip.read(member)


def test_ats_optimizer_removes_only_embedded_fonts(tmp_path: Path) -> None:
    optimized = write_ats_optimized_docx(BASE, tmp_path / "optimized.docx")

    assert optimized.stat().st_size < 2_500_000
    assert optimized.stat().st_size < BASE.stat().st_size / 10
    assert font_deembedded_equivalent(BASE, optimized)
    assert compare_format_integrity(base_path=BASE, candidate_path=optimized) == []


def test_embedded_fonts_can_be_extracted_for_temporary_rendering(tmp_path: Path) -> None:
    fonts = extract_embedded_fonts(BASE, tmp_path / "fonts")

    assert len(fonts) == 10
    assert all(font.read_bytes()[:4] in {b"\x00\x01\x00\x00", b"OTTO"} for font in fonts)


def test_native_baseline_is_one_page_with_stable_section_anchors(tmp_path: Path) -> None:
    pdf = render_docx_to_pdf(BASE, tmp_path)
    document = parse_resume_docx(BASE)
    apply_pdf_layout_budgets(document, pdf)
    layout = inspect_pdf(
        pdf,
        baseline_pdf=pdf,
        document=document,
        baseline_document=document,
    )

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
    assert document.paragraphs[3].line_budget == 3
    assert document.paragraphs[5].line_budget == 1
    assert document.paragraphs[14].line_budget == 2
    assert document.paragraphs[32].line_budget == 1
    assert any(abs(size - 10.5) < 0.1 for size in layout.font_inventory["Calibri"])
    assert any(abs(size - 11.0) < 0.1 for size in layout.font_inventory["Calibri"])
    assert any(abs(size - 14.0) < 0.1 for size in layout.font_inventory["Calibri-Bold"])
    assert any(abs(size - 18.0) < 0.1 for size in layout.font_inventory["Calibri-Bold"])
    assert layout.protected_horizontal_deltas
    assert max(layout.protected_horizontal_deltas.values()) == 0.0


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
