import json
from pathlib import Path
from zipfile import ZipFile

import fitz
from aiadapply_v2.documents.formatting import (
    DOCUMENT_PART,
    NUMBERING_PART,
    compact_bullet_numbering,
    compare_format_integrity,
)
from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.documents.optimizer import (
    extract_embedded_fonts,
    font_deembedded_equivalent,
    write_ats_optimized_docx,
)
from aiadapply_v2.documents.writer import write_resume_candidate
from aiadapply_v2.layout.renderer import (
    _bullet_alignment_issues,
    _collapsed_tab_items,
    _libreoffice_safe_source,
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
            if member == DOCUMENT_PART:
                continue
            assert base_zip.read(member) == output_zip.read(member)


def test_writer_preserves_planned_postman_placement_without_changing_template(
    tmp_path: Path,
) -> None:
    document = parse_resume_docx(BASE)
    output = write_resume_candidate(document, identity_plan(document), tmp_path / "balanced.docx")
    rendered = parse_resume_docx(output)
    by_id = {paragraph.paragraph_id: paragraph.text for paragraph in rendered.paragraphs}

    assert "Postman" in by_id["skills.apis_identity"]
    assert "Postman" not in by_id["skills.tools"]
    assert compare_format_integrity(base_path=BASE, candidate_path=output) == []


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
    assert layout.collapsed_tab_items == []
    assert layout.bullet_alignment_issues == []
    assert layout.employer_heading_issues == []
    assert layout.employer_spacing_issues == []
    assert layout.section_geometry_issues == []
    assert layout.font_inventory_changed is False
    assert layout.boundary_issues == []
    assert layout.bottom_edge_clearance_points > 30
    assert set(layout.bullet_marker_x_points) == {
        paragraph.paragraph_id
        for paragraph in document.paragraphs
        if paragraph.kind.value == "bullet"
    }
    assert len(set(round(value, 1) for value in layout.bullet_marker_x_points.values())) == 1
    assert len(set(round(value, 1) for value in layout.bullet_first_line_x_points.values())) == 1
    assert len(set(round(value, 1) for value in layout.bullet_continuation_x_points.values())) == 1


def test_export_preserves_base_bullet_numbering_and_rendered_alignment(tmp_path: Path) -> None:
    document = parse_resume_docx(BASE)
    baseline_pdf = render_docx_to_pdf(BASE, tmp_path / "baseline-gap")
    candidate = write_resume_candidate(document, identity_plan(document), tmp_path / "exact.docx")
    with ZipFile(BASE) as source, ZipFile(candidate) as exported:
        assert exported.read(NUMBERING_PART) == source.read(NUMBERING_PART)
    candidate_pdf = render_docx_to_pdf(candidate, tmp_path / "candidate-gap")
    layout = inspect_pdf(
        candidate_pdf,
        baseline_pdf=baseline_pdf,
        document=parse_resume_docx(candidate),
        baseline_document=document,
    )
    assert layout.passed
    assert layout.bullet_alignment_issues == []
    for key, continuation in layout.bullet_continuation_x_points.items():
        assert abs(continuation - layout.bullet_first_line_x_points[key]) < 0.1


def test_format_validation_rejects_previously_allowed_numbering_change(tmp_path: Path) -> None:
    candidate = tmp_path / "changed.docx"
    with ZipFile(BASE) as source, ZipFile(candidate, "w") as exported:
        for member in source.infolist():
            raw = source.read(member)
            exported.writestr(
                member, compact_bullet_numbering(raw) if member.filename == NUMBERING_PART else raw
            )
    assert any(
        code == "immutable_package_part_changed"
        for code, _ in compare_format_integrity(base_path=BASE, candidate_path=candidate)
    )
    optimized = write_ats_optimized_docx(candidate, tmp_path / "optimized-changed.docx")
    assert compare_format_integrity(base_path=BASE, candidate_path=optimized)


def test_compact_marker_gap_does_not_excuse_drift_from_base() -> None:
    assert _bullet_alignment_issues(
        {"bullet": 31},
        {"bullet": 40},
        {"bullet": 40},
        {"bullet": 22},
        {"bullet": 40},
        {"bullet": 40},
    ) == ["bullet-marker:bullet"]


def test_matching_a_staggered_baseline_does_not_make_bullets_acceptable():
    issues = _bullet_alignment_issues(
        {"bullet": 30.7},
        {"bullet": 42.05},
        {"bullet": 39.7},
        {"bullet": 30.7},
        {"bullet": 42.05},
        {"bullet": 39.7},
    )
    assert "bullet-hanging:bullet" in issues


def test_renderer_does_not_treat_tab_stops_as_text_tabs(tmp_path: Path):
    from aiadapply_v2.documents.formatting import NS
    from lxml import etree

    safe = _libreoffice_safe_source(BASE, tmp_path)
    with ZipFile(safe) as archive:
        root = etree.fromstring(archive.read(DOCUMENT_PART))
    bullets = [
        p for p in root.findall(".//w:body/w:p", NS) if p.find("w:pPr/w:numPr", NS) is not None
    ]
    assert len(bullets) == 13
    assert all(not (p.find(".//w:t", NS).text or "").startswith(" ") for p in bullets)


def test_final_skills_cannot_wrap_even_when_the_source_wraps(tmp_path: Path):
    document = parse_resume_docx(BASE)
    baseline_pdf = render_docx_to_pdf(BASE, tmp_path / "source", font_source_docx=BASE)
    wrapped_plan = identity_plan(document)
    wrapped_apis = next(
        line for line in wrapped_plan.skills.lines if line.paragraph_id == "skills.apis_identity"
    )
    wrapped_apis.skills.extend(["Postman API testing and integration troubleshooting"] * 3)
    wrapped_docx = write_resume_candidate(document, wrapped_plan, tmp_path / "wrapped.docx")
    wrapped_pdf = render_docx_to_pdf(
        wrapped_docx, tmp_path / "wrapped", font_source_docx=wrapped_docx
    )
    wrapped_document = parse_resume_docx(wrapped_docx)
    bad = inspect_pdf(
        wrapped_pdf,
        document=wrapped_document,
        baseline_pdf=wrapped_pdf,
        baseline_document=wrapped_document,
        require_single_line_skills=True,
    )
    assert not bad.passed
    assert "skills.apis_identity" in bad.skill_wrap_issues

    plan = identity_plan(document)
    apis = next(line for line in plan.skills.lines if line.paragraph_id == "skills.apis_identity")
    tools = next(line for line in plan.skills.lines if line.paragraph_id == "skills.tools")
    from aiadapply_v2.pipeline import _repair_skill_row_overflow

    # A realistic expansion pushes the final tool onto a second line. Repair
    # must use actual rendered measurements and preserve all the skill values.
    apis.skills = [value.replace("Entra ID", "Microsoft Entra ID") for value in apis.skills]
    before_skills = set(apis.skills + tools.skills)
    crowded = write_resume_candidate(document, plan, tmp_path / "crowded.docx")
    crowded_pdf = render_docx_to_pdf(crowded, tmp_path / "crowded", font_source_docx=crowded)
    crowded_layout = inspect_pdf(
        crowded_pdf, document=parse_resume_docx(crowded), require_single_line_skills=True
    )
    assert "skills.apis_identity" in crowded_layout.skill_wrap_issues
    assert _repair_skill_row_overflow(plan, document, [], crowded_layout.paragraph_line_counts)
    assert "Postman" in tools.skills
    assert set(apis.skills + tools.skills) == before_skills
    candidate = write_resume_candidate(document, plan, tmp_path / "single-row.docx")
    optimized = write_ats_optimized_docx(candidate, tmp_path / "final.docx")
    assert compare_format_integrity(base_path=BASE, candidate_path=optimized) == []
    pdf = render_docx_to_pdf(optimized, tmp_path / "final", font_source_docx=candidate)
    layout = inspect_pdf(
        pdf,
        document=parse_resume_docx(optimized),
        baseline_pdf=baseline_pdf,
        baseline_document=document,
        require_single_line_skills=True,
    )
    assert layout.passed, layout.overflow_paragraph_ids
    assert layout.skill_wrap_issues == []
    assert layout.paragraph_line_counts["skills.apis_identity"] == 1
    assert layout.paragraph_line_counts["skills.tools"] == 1


def test_summary_and_bullet_rendered_line_budgets_are_hard_failures(tmp_path: Path) -> None:
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    plan.summary.text = " ".join([plan.summary.text] * 2)
    plan.summary.shorter_text = plan.summary.text
    bullet = plan.bullets[0]
    bullet.text = " ".join([bullet.text] * 2)
    bullet.shorter_text = bullet.text
    baseline_pdf = render_docx_to_pdf(BASE, tmp_path / "baseline")
    candidate = write_resume_candidate(document, plan, tmp_path / "overflow.docx")
    candidate_pdf = render_docx_to_pdf(candidate, tmp_path / "candidate")

    layout = inspect_pdf(
        candidate_pdf,
        baseline_pdf=baseline_pdf,
        document=parse_resume_docx(candidate),
        baseline_document=document,
    )

    assert not layout.passed
    assert "summary" in layout.overflow_paragraph_ids
    assert bullet.paragraph_id in layout.overflow_paragraph_ids


def test_layout_detects_a_renderer_joining_tab_delimited_fields(tmp_path: Path) -> None:
    document = parse_resume_docx(BASE)
    tabbed = next(paragraph for paragraph in document.paragraphs if "\t" in paragraph.text)
    left, right = tabbed.text.split("\t", 1)
    joined_boundary = f"{left.split()[-1]}{right.split()[0]}"
    pdf_path = tmp_path / "joined.pdf"
    pdf = fitz.open()
    page = pdf.new_page()
    page.insert_text((20, 40), joined_boundary)
    pdf.save(pdf_path)
    pdf.close()

    with fitz.open(pdf_path) as rendered:
        assert tabbed.paragraph_id in _collapsed_tab_items(rendered, document)


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


def test_final_docx_validation_recognizes_demonstrated_ordinary_work():
    from aiadapply_v2.schemas import JobKeyword, KeywordKind
    document = parse_resume_docx(BASE)
    keywords = [JobKeyword(term=term, normalized=term, kind=KeywordKind.action,
                           hiring_importance=50, placement_utility=50)
                for term in ("critical thinking", "cross-functional collaboration", "automation", "case management")]
    result = validate_candidate_docx(document, str(BASE), keywords)
    assert result.passed
    assert not result.issues


def test_missing_named_technology_warning_does_not_invent_compression_history():
    from aiadapply_v2.schemas import JobKeyword, KeywordKind
    document = parse_resume_docx(BASE)
    keyword = JobKeyword(term="Kubernetes", normalized="kubernetes", kind=KeywordKind.system,
                         hiring_importance=50, placement_utility=50)
    result = validate_candidate_docx(document, str(BASE), [keyword])
    warning = next(issue for issue in result.issues if issue.code == "important_keyword_not_represented")
    assert "Kubernetes" in warning.message
    assert "Compression" not in warning.message
