from __future__ import annotations

import hashlib
import json
from pathlib import Path

import fitz

from aiadapply_v2.documents.formatting import compare_format_integrity
from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.schemas import LayoutResult, ResumeDocument


def write_character_audit(
    *,
    base: ResumeDocument,
    candidate_docx: str | Path,
    candidate_pdf: str | Path,
    layout: LayoutResult,
    output_dir: str | Path,
) -> Path:
    """Record every output paragraph verbatim with hashes and rendered line counts."""
    docx_path = Path(candidate_docx)
    pdf_path = Path(candidate_pdf)
    candidate = parse_resume_docx(docx_path)
    format_issues = compare_format_integrity(
        base_path=base.source_path,
        candidate_path=docx_path,
    )
    with fitz.open(pdf_path) as pdf:
        pdf_text = "".join(page.get_text() for page in pdf)
    payload = {
        "base_docx_sha256": base.source_sha256,
        "candidate_docx_sha256": _file_sha256(docx_path),
        "candidate_pdf_sha256": _file_sha256(pdf_path),
        "pdf_text_sha256": _text_sha256(pdf_text),
        "page_count": layout.page_count,
        "format_integrity_passed": not format_issues,
        "format_issues": [{"code": code, "message": message} for code, message in format_issues],
        "section_anchor_deltas": layout.section_anchor_deltas,
        "font_inventory": layout.font_inventory,
        "out_of_bounds_items": layout.out_of_bounds_items,
        "overlap_items": layout.overlap_items,
        "paragraphs": [
            {
                "paragraph_id": paragraph.paragraph_id,
                "text": paragraph.text,
                "character_count": len(paragraph.text),
                "utf8_byte_count": len(paragraph.text.encode("utf-8")),
                "text_sha256": _text_sha256(paragraph.text),
                "rendered_line_count": layout.paragraph_line_counts.get(
                    paragraph.paragraph_id,
                    0,
                ),
                "baseline_line_count": layout.baseline_paragraph_line_counts.get(
                    paragraph.paragraph_id,
                    0,
                ),
            }
            for paragraph in candidate.paragraphs
        ],
    }
    output = Path(output_dir) / "character_audit.json"
    output.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    return output


def _file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _text_sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
