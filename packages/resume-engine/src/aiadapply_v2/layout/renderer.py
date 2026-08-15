from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import TypedDict
from urllib.parse import quote

import fitz

from aiadapply_v2.schemas import LayoutResult, ResumeDocument

SECTION_ANCHORS = ("SKILLS", "EXPERIENCE", "PROJECTS", "EDUCATION", "CERTIFICATIONS")
MAX_ANCHOR_DRIFT_POINTS = 2.0
MAX_PROTECTED_HORIZONTAL_DRIFT_POINTS = 0.5
TOKEN = re.compile(r"[A-Za-z0-9]+(?:\+)?")


class ParagraphMetric(TypedDict):
    matched: bool
    line_count: int
    line_widths_points: list[float]
    max_width_points: float
    top_points: float
    bottom_points: float
    left_points: float
    right_points: float


class RenderingError(RuntimeError):
    pass


def find_libreoffice() -> Path | None:
    candidates = [
        shutil.which("soffice"),
        shutil.which("libreoffice"),
        r"C:\Program Files\LibreOffice\program\soffice.com",
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/usr/bin/libreoffice",
        "/usr/local/bin/libreoffice",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    return None


def render_docx_to_pdf(docx_path: str | Path, output_dir: str | Path) -> Path:
    source = Path(docx_path).resolve()
    destination = Path(output_dir).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    preferred = os.environ.get("AIADAPPLY_RENDERER", "").casefold()
    if os.name == "nt" and preferred != "libreoffice":
        word_output = _render_docx_with_word(source, destination)
        if word_output is not None:
            return word_output
        if preferred == "word":
            raise RenderingError("Microsoft Word PDF export failed.")

    executable = find_libreoffice()
    if not executable:
        raise RenderingError(
            "LibreOffice was not found. Install it to render and validate one-page output."
        )
    with tempfile.TemporaryDirectory(prefix="aiadapply-lo-profile-") as profile_name:
        profile_uri = _file_uri(Path(profile_name))
        command = [
            str(executable),
            "--headless",
            "--nologo",
            "--nodefault",
            "--norestore",
            f"-env:UserInstallation={profile_uri}",
            "--convert-to",
            "pdf:writer_pdf_Export",
            "--outdir",
            str(destination),
            str(source),
        ]
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
            check=False,
        )
    output = destination / f"{source.stem}.pdf"
    if result.returncode != 0 or not output.exists():
        details = (result.stderr or result.stdout)[-3000:]
        raise RenderingError(f"LibreOffice PDF conversion failed: {details}")
    return output


def _render_docx_with_word(source: Path, destination: Path) -> Path | None:
    script = Path(__file__).with_name("export_word_pdf.ps1")
    output = destination / f"{source.stem}.pdf"
    command = [
        "powershell",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(script),
        "-InputDocx",
        str(source),
        "-OutputPdf",
        str(output),
    ]
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
            check=False,
            creationflags=creationflags,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0 or not output.exists():
        output.unlink(missing_ok=True)
        return None
    return output


def inspect_pdf(
    pdf_path: str | Path,
    *,
    baseline_pdf: str | Path | None = None,
    document: ResumeDocument | None = None,
    baseline_document: ResumeDocument | None = None,
    attempts: int = 1,
) -> LayoutResult:
    path = Path(pdf_path).resolve()
    with fitz.open(path) as pdf_document:
        page_count = pdf_document.page_count
        rendered_lines = sum(_page_lines(page) for page in pdf_document)
        anchors = _anchors(pdf_document[0]) if page_count else {}
        fonts = _font_inventory(pdf_document)
        bounds_issues, overlap_issues = _geometry_issues(pdf_document)
    paragraph_metrics = (
        measure_pdf_paragraphs(path, document=document) if document is not None else {}
    )
    baseline_lines = rendered_lines
    baseline_anchors = anchors
    baseline_metrics = paragraph_metrics
    baseline_bounds: list[str] = []
    baseline_overlaps: list[str] = []
    if baseline_pdf:
        with fitz.open(baseline_pdf) as baseline:
            baseline_lines = sum(_page_lines(page) for page in baseline)
            baseline_anchors = _anchors(baseline[0]) if baseline.page_count else {}
            baseline_bounds, baseline_overlaps = _geometry_issues(baseline)
        if baseline_document is not None:
            baseline_metrics = measure_pdf_paragraphs(
                baseline_pdf,
                document=baseline_document,
            )
    deltas = {
        anchor: anchors[anchor] - baseline_anchors[anchor]
        for anchor in SECTION_ANCHORS
        if anchor in anchors and anchor in baseline_anchors
    }
    missing_anchors = [anchor for anchor in SECTION_ANCHORS if anchor not in anchors]
    drifted = [anchor for anchor, delta in deltas.items() if abs(delta) > MAX_ANCHOR_DRIFT_POINTS]
    paragraph_overflow = [
        paragraph_id
        for paragraph_id, metric in paragraph_metrics.items()
        if paragraph_id in baseline_metrics
        and int(metric["line_count"]) > int(baseline_metrics[paragraph_id]["line_count"])
    ]
    unmatched = [
        paragraph_id
        for paragraph_id, metric in paragraph_metrics.items()
        if not bool(metric["matched"])
    ]
    new_bounds_issues = sorted(set(bounds_issues) - set(baseline_bounds))
    new_overlap_issues = sorted(set(overlap_issues) - set(baseline_overlaps))
    protected_horizontal_deltas: dict[str, float] = {}
    if baseline_document is not None:
        for paragraph in baseline_document.paragraphs:
            if paragraph.editable:
                continue
            current_metric = paragraph_metrics.get(paragraph.paragraph_id)
            baseline_metric = baseline_metrics.get(paragraph.paragraph_id)
            if not current_metric or not baseline_metric:
                continue
            protected_horizontal_deltas[paragraph.paragraph_id] = max(
                abs(float(current_metric["left_points"]) - float(baseline_metric["left_points"])),
                abs(float(current_metric["right_points"]) - float(baseline_metric["right_points"])),
            )
    horizontally_drifted = [
        paragraph_id
        for paragraph_id, delta in protected_horizontal_deltas.items()
        if delta > MAX_PROTECTED_HORIZONTAL_DRIFT_POINTS
    ]
    passed = (
        page_count == 1
        and rendered_lines <= baseline_lines
        and not missing_anchors
        and not drifted
        and not paragraph_overflow
        and not unmatched
        and not new_bounds_issues
        and not new_overlap_issues
        and not horizontally_drifted
    )
    return LayoutResult(
        passed=passed,
        page_count=page_count,
        rendered_lines=rendered_lines,
        section_anchor_deltas=deltas,
        overflow_paragraph_ids=[
            *missing_anchors,
            *drifted,
            *paragraph_overflow,
            *unmatched,
            *(f"horizontal:{paragraph_id}" for paragraph_id in horizontally_drifted),
        ],
        paragraph_line_counts={
            paragraph_id: int(metric["line_count"])
            for paragraph_id, metric in paragraph_metrics.items()
        },
        baseline_paragraph_line_counts={
            paragraph_id: int(metric["line_count"])
            for paragraph_id, metric in baseline_metrics.items()
        },
        paragraph_max_width_points={
            paragraph_id: float(metric["max_width_points"])
            for paragraph_id, metric in paragraph_metrics.items()
        },
        protected_horizontal_deltas=protected_horizontal_deltas,
        font_inventory=fonts,
        out_of_bounds_items=new_bounds_issues,
        overlap_items=new_overlap_issues,
        pdf_path=path,
        attempts=attempts,
    )


def apply_pdf_layout_budgets(
    resume: ResumeDocument,
    pdf_path: str | Path,
) -> ResumeDocument:
    """Populate the semantic model with actual rendered line and width budgets."""
    metrics = measure_pdf_paragraphs(pdf_path, document=resume)
    missing: list[str] = []
    for paragraph in resume.paragraphs:
        metric = metrics.get(paragraph.paragraph_id)
        if not metric or not bool(metric["matched"]):
            if paragraph.text.strip():
                missing.append(paragraph.paragraph_id)
            continue
        paragraph.line_budget = int(metric["line_count"])
        paragraph.rendered_line_widths_points = [
            float(value) for value in metric["line_widths_points"]
        ]
        paragraph.rendered_max_width_points = float(metric["max_width_points"])
        paragraph.rendered_top_points = float(metric["top_points"])
        paragraph.rendered_bottom_points = float(metric["bottom_points"])
    if missing:
        raise RenderingError(
            "Could not map rendered PDF text to semantic paragraphs: " + ", ".join(missing)
        )
    by_id = {paragraph.paragraph_id: paragraph for paragraph in resume.paragraphs}
    for section in resume.sections:
        section.line_budget = sum(by_id[value].line_budget for value in section.paragraph_ids)
    return resume


def measure_pdf_paragraphs(
    pdf_path: str | Path,
    *,
    document: ResumeDocument,
) -> dict[str, ParagraphMetric]:
    """Map each DOCX paragraph to its exact rendered PDF lines and widths."""
    with fitz.open(pdf_path) as pdf:
        words = [
            word
            for page in pdf
            for word in page.get_text("words")
            if word[4].strip() not in {"", "●"}
        ]
    expanded: list[tuple[str, tuple[float, float, float, float]]] = []
    for word in words:
        parts = _tokens(str(word[4]))
        expanded.extend(
            (part, (float(word[0]), float(word[1]), float(word[2]), float(word[3])))
            for part in parts
        )

    cursor = 0
    result: dict[str, ParagraphMetric] = {}
    for paragraph in document.paragraphs:
        source_tokens = _tokens(paragraph.text)
        if not source_tokens:
            continue
        token_span = _find_token_span(expanded, source_tokens, cursor)
        if token_span is None:
            result[paragraph.paragraph_id] = {
                "matched": False,
                "line_count": 0,
                "line_widths_points": [],
                "max_width_points": 0.0,
                "top_points": 0.0,
                "bottom_points": 0.0,
                "left_points": 0.0,
                "right_points": 0.0,
            }
            continue
        start, end = token_span
        matched = expanded[start:end]
        cursor = end
        visual_lines: dict[float, list[tuple[float, float, float, float]]] = {}
        for _token, box in matched:
            visual_lines.setdefault(round(box[1], 1), []).append(box)
        ordered = [visual_lines[key] for key in sorted(visual_lines)]
        widths = [max(box[2] for box in line) - min(box[0] for box in line) for line in ordered]
        result[paragraph.paragraph_id] = {
            "matched": True,
            "line_count": len(ordered),
            "line_widths_points": widths,
            "max_width_points": max(widths, default=0.0),
            "top_points": min(box[1] for _token, box in matched),
            "bottom_points": max(box[3] for _token, box in matched),
            "left_points": min(box[0] for _token, box in matched),
            "right_points": max(box[2] for _token, box in matched),
        }
    return result


def _file_uri(path: Path) -> str:
    resolved = path.resolve().as_posix()
    if os.name == "nt":
        return f"file:///{quote(resolved, safe='/:')}"
    return f"file://{quote(resolved, safe='/')}"


def _page_lines(page: fitz.Page) -> int:
    data = page.get_text("dict")
    return sum(len(block.get("lines", [])) for block in data.get("blocks", []) if "lines" in block)


def _anchors(page: fitz.Page) -> dict[str, float]:
    words = page.get_text("words")
    anchors: dict[str, float] = {}
    for anchor in SECTION_ANCHORS:
        match = next((word for word in words if word[4].strip() == anchor), None)
        if match:
            anchors[anchor] = float(match[1])
    return anchors


def _tokens(value: str) -> list[str]:
    return [match.group(0).casefold() for match in TOKEN.finditer(value)]


def _find_token_span(
    expanded: list[tuple[str, tuple[float, float, float, float]]],
    wanted: list[str],
    cursor: int,
) -> tuple[int, int] | None:
    for start in range(cursor, len(expanded)):
        pdf_index = start
        wanted_index = 0
        pdf_buffer = ""
        wanted_buffer = ""
        while pdf_index < len(expanded) and wanted_index < len(wanted):
            if pdf_buffer == wanted_buffer:
                pdf_buffer = expanded[pdf_index][0]
                wanted_buffer = wanted[wanted_index]
                pdf_index += 1
                wanted_index += 1
            elif pdf_buffer.startswith(wanted_buffer):
                wanted_buffer += wanted[wanted_index]
                wanted_index += 1
            elif wanted_buffer.startswith(pdf_buffer):
                pdf_buffer += expanded[pdf_index][0]
                pdf_index += 1
            else:
                break
        while (
            wanted_index < len(wanted)
            and pdf_buffer != wanted_buffer
            and pdf_buffer.startswith(wanted_buffer)
        ):
            wanted_buffer += wanted[wanted_index]
            wanted_index += 1
        while (
            pdf_index < len(expanded)
            and pdf_buffer != wanted_buffer
            and wanted_buffer.startswith(pdf_buffer)
        ):
            pdf_buffer += expanded[pdf_index][0]
            pdf_index += 1
        if wanted_index == len(wanted) and pdf_buffer == wanted_buffer:
            return start, pdf_index
    return None


def _font_inventory(document: fitz.Document) -> dict[str, list[float]]:
    inventory: dict[str, set[float]] = {}
    for page in document:
        for block in page.get_text("dict").get("blocks", []):
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    inventory.setdefault(str(span["font"]), set()).add(
                        round(float(span["size"]), 2)
                    )
    return {font: sorted(sizes) for font, sizes in sorted(inventory.items())}


def _geometry_issues(document: fitz.Document) -> tuple[list[str], list[str]]:
    out_of_bounds: list[str] = []
    overlaps: list[str] = []
    for page_number, page in enumerate(document):
        words = page.get_text("words")
        for word in words:
            if (
                float(word[0]) < -0.5
                or float(word[1]) < -0.5
                or float(word[2]) > page.rect.width + 0.5
                or float(word[3]) > page.rect.height + 0.5
            ):
                out_of_bounds.append(
                    f"page={page_number + 1},x={float(word[0]):.1f},y={float(word[1]):.1f}"
                )
        visual_lines: dict[float, list[tuple[float, float]]] = {}
        for word in words:
            if str(word[4]).strip() == "●":
                continue
            visual_lines.setdefault(round(float(word[1]), 1), []).append(
                (float(word[0]), float(word[2]))
            )
        for y_position, boxes in visual_lines.items():
            ordered = sorted(boxes)
            for left, right in zip(ordered, ordered[1:], strict=False):
                overlap = left[1] - right[0]
                if overlap > 0.5:
                    overlaps.append(
                        f"page={page_number + 1},y={y_position:.1f},"
                        f"x={right[0]:.1f},overlap={overlap:.1f}"
                    )
    return sorted(set(out_of_bounds)), sorted(set(overlaps))
