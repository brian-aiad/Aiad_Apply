from __future__ import annotations

import ctypes
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import TypedDict
from urllib.parse import quote
from zipfile import ZIP_DEFLATED, ZipFile

import fitz
from lxml import etree

from aiadapply_v2.documents.optimizer import extract_embedded_fonts
from aiadapply_v2.schemas import LayoutResult, ResumeDocument

SECTION_ANCHORS = ("SKILLS", "EXPERIENCE", "PROJECTS", "EDUCATION", "CERTIFICATIONS")
MAX_ANCHOR_DRIFT_POINTS = 14.0
MAX_PROTECTED_HORIZONTAL_DRIFT_POINTS = 0.5
MAX_BULLET_ALIGNMENT_DRIFT_POINTS = 0.75
MAX_EMPLOYER_SPACING_DRIFT_POINTS = 3.0
MAX_EDGE_INTRUSION_POINTS = 1.0
MAX_DENSITY_BAND_INCREASE = 2
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
    line_left_points: list[float]
    line_right_points: list[float]


class RenderingError(RuntimeError):
    pass


def find_libreoffice() -> Path | None:
    for candidate in libreoffice_candidates():
        if candidate.is_file():
            return candidate
    return None


def libreoffice_candidates() -> list[Path]:
    """Return the executable locations checked by local diagnostics and rendering."""
    candidates = [shutil.which("soffice"), shutil.which("libreoffice")]
    candidates.extend(
        [
            r"C:\Program Files\LibreOffice\program\soffice.com",
            r"C:\Program Files\LibreOffice\program\soffice.exe",
        ]
        if os.name == "nt"
        else [
            "/Applications/LibreOffice.app/Contents/MacOS/soffice",
            "/usr/bin/libreoffice",
            "/usr/local/bin/libreoffice",
        ]
    )
    return list(dict.fromkeys(Path(candidate) for candidate in candidates if candidate))


def render_docx_to_pdf(
    docx_path: str | Path,
    output_dir: str | Path,
    *,
    font_source_docx: str | Path | None = None,
) -> Path:
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
        render_source = _libreoffice_safe_source(source, Path(profile_name))
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
            str(render_source),
        ]
        with (
            _macos_render_lock(),
            _registered_macos_document_fonts(font_source_docx, Path(profile_name)),
        ):
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


@contextmanager
def _macos_render_lock() -> Iterator[None]:
    """CoreText session font registration is shared by concurrent renderer processes."""
    if sys.platform != "darwin":
        yield
        return
    import fcntl

    lock_path = Path(tempfile.gettempdir()) / f"aiadapply-render-{os.getuid()}.lock"
    with lock_path.open("a") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def _libreoffice_safe_source(source: Path, temporary_root: Path) -> Path:
    """Keep a searchable boundary when LibreOffice cannot honor a crowded tab stop."""
    safe_source = temporary_root / source.name
    word_namespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    tab_tag = f"{{{word_namespace}}}tab"
    xml_space = "{http://www.w3.org/XML/1998/namespace}space"
    with (
        ZipFile(source) as source_archive,
        ZipFile(safe_source, "w", compression=ZIP_DEFLATED) as safe_archive,
    ):
        for info in source_archive.infolist():
            content = source_archive.read(info.filename)
            if info.filename == "word/document.xml":
                root = etree.fromstring(content)
                for tab in root.iter(tab_tag):
                    # w:tab also names tab-stop definitions inside paragraph
                    # properties. Those are not text separators: adding a space
                    # after them indents every first bullet line by a space.
                    parent = tab.getparent()
                    if parent is None or parent.tag != f"{{{word_namespace}}}r":
                        continue
                    following_results = tab.xpath(
                        "following::w:t[1]", namespaces={"w": word_namespace}
                    )
                    following_text = (
                        next(
                            (
                                item
                                for item in following_results
                                if isinstance(item, etree._Element)
                            ),
                            None,
                        )
                        if isinstance(following_results, list)
                        else None
                    )
                    if following_text is not None and not (following_text.text or "").startswith(
                        " "
                    ):
                        following_text.text = f" {following_text.text or ''}"
                        following_text.set(xml_space, "preserve")
                content = etree.tostring(
                    root, xml_declaration=True, encoding="UTF-8", standalone=True
                )
            elif info.filename == "word/numbering.xml":
                root = etree.fromstring(content)
                _add_explicit_bullet_tabs(root, word_namespace)
                content = etree.tostring(
                    root, xml_declaration=True, encoding="UTF-8", standalone=True
                )
            safe_archive.writestr(info, content)
    return safe_source


def _add_explicit_bullet_tabs(root: etree._Element, word_namespace: str) -> None:
    """Prevent LibreOffice from offsetting first bullet lines from continuation lines."""
    namespaces = {"w": word_namespace}

    def qualified(name: str) -> str:
        return f"{{{word_namespace}}}{name}"

    for level in root.findall(".//w:lvl", namespaces):
        number_format = level.find("w:numFmt", namespaces)
        properties = level.find("w:pPr", namespaces)
        indent = properties.find("w:ind", namespaces) if properties is not None else None
        if (
            number_format is None
            or number_format.get(qualified("val")) != "bullet"
            or properties is None
            or indent is None
            or properties.find("w:tabs", namespaces) is not None
        ):
            continue
        position = indent.get(qualified("left"))
        if not position:
            continue
        tabs = etree.Element(qualified("tabs"))
        tab = etree.SubElement(tabs, qualified("tab"))
        tab.set(qualified("val"), "num")
        tab.set(qualified("pos"), position)
        properties.insert(0, tabs)


@contextmanager
def _registered_macos_document_fonts(
    source_docx: str | Path | None,
    temporary_root: Path,
) -> Iterator[None]:
    """Temporarily expose editable embedded fonts to a macOS LibreOffice child process."""
    if sys.platform != "darwin" or source_docx is None:
        yield
        return
    font_paths = extract_embedded_fonts(source_docx, temporary_root / "document-fonts")
    if not font_paths:
        yield
        return

    core_foundation = ctypes.CDLL(
        "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation"
    )
    core_text = ctypes.CDLL("/System/Library/Frameworks/CoreText.framework/CoreText")
    core_foundation.CFURLCreateFromFileSystemRepresentation.argtypes = [
        ctypes.c_void_p,
        ctypes.c_char_p,
        ctypes.c_long,
        ctypes.c_bool,
    ]
    core_foundation.CFURLCreateFromFileSystemRepresentation.restype = ctypes.c_void_p
    core_foundation.CFRelease.argtypes = [ctypes.c_void_p]
    core_text.CTFontManagerRegisterFontsForURL.argtypes = [
        ctypes.c_void_p,
        ctypes.c_uint32,
        ctypes.POINTER(ctypes.c_void_p),
    ]
    core_text.CTFontManagerRegisterFontsForURL.restype = ctypes.c_bool
    core_text.CTFontManagerUnregisterFontsForURL.argtypes = [
        ctypes.c_void_p,
        ctypes.c_uint32,
        ctypes.POINTER(ctypes.c_void_p),
    ]
    core_text.CTFontManagerUnregisterFontsForURL.restype = ctypes.c_bool

    session_scope = 3
    registered_urls: list[int] = []
    created_urls: list[int] = []
    try:
        for font_path in font_paths:
            encoded_path = os.fsencode(font_path.resolve())
            url = core_foundation.CFURLCreateFromFileSystemRepresentation(
                None,
                encoded_path,
                len(encoded_path),
                False,
            )
            if not url:
                continue
            created_urls.append(url)
            error = ctypes.c_void_p()
            if core_text.CTFontManagerRegisterFontsForURL(
                url,
                session_scope,
                ctypes.byref(error),
            ):
                registered_urls.append(url)
            if error.value:
                core_foundation.CFRelease(error.value)
        yield
    finally:
        for url in reversed(registered_urls):
            error = ctypes.c_void_p()
            core_text.CTFontManagerUnregisterFontsForURL(
                url,
                session_scope,
                ctypes.byref(error),
            )
            if error.value:
                core_foundation.CFRelease(error.value)
        for url in created_urls:
            core_foundation.CFRelease(url)


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
    require_single_line_skills: bool = False,
) -> LayoutResult:
    path = Path(pdf_path).resolve()
    with fitz.open(path) as pdf_document:
        page_count = pdf_document.page_count
        rendered_lines = sum(_page_lines(page) for page in pdf_document)
        anchors = _anchors(pdf_document[0]) if page_count else {}
        fonts = _font_inventory(pdf_document)
        bounds_issues, overlap_issues = _geometry_issues(pdf_document)
        right_clearance, bottom_clearance = _page_clearance(pdf_document)
        density_bands = _density_bands(pdf_document)
        collapsed_tab_items = (
            _collapsed_tab_items(pdf_document, document) if document is not None else []
        )
    paragraph_metrics = (
        measure_pdf_paragraphs(path, document=document) if document is not None else {}
    )
    baseline_lines = rendered_lines
    baseline_anchors = anchors
    baseline_metrics = paragraph_metrics
    baseline_bounds: list[str] = []
    baseline_overlaps: list[str] = []
    baseline_fonts = fonts
    baseline_right_clearance = right_clearance
    baseline_bottom_clearance = bottom_clearance
    baseline_density_bands = density_bands
    if baseline_pdf:
        with fitz.open(baseline_pdf) as baseline:
            baseline_lines = sum(_page_lines(page) for page in baseline)
            baseline_anchors = _anchors(baseline[0]) if baseline.page_count else {}
            baseline_bounds, baseline_overlaps = _geometry_issues(baseline)
            baseline_fonts = _font_inventory(baseline)
            baseline_right_clearance, baseline_bottom_clearance = _page_clearance(baseline)
            baseline_density_bands = _density_bands(baseline)
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
    skill_wrap_issues = (
        [
            paragraph.paragraph_id
            for paragraph in document.paragraphs
            if paragraph.kind.value == "skill_line"
            and (
                paragraph.paragraph_id not in paragraph_metrics
                or paragraph_metrics[paragraph.paragraph_id]["line_count"] != 1
            )
        ]
        if document is not None and require_single_line_skills
        else []
    )
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
    bullet_marker_x, bullet_first_x, bullet_continuation_x = _bullet_geometry(
        path, document, paragraph_metrics
    )
    baseline_bullet_marker_x: dict[str, float] = {}
    baseline_bullet_first_x: dict[str, float] = {}
    baseline_bullet_continuation_x: dict[str, float] = {}
    if baseline_pdf and baseline_document is not None:
        (
            baseline_bullet_marker_x,
            baseline_bullet_first_x,
            baseline_bullet_continuation_x,
        ) = _bullet_geometry(baseline_pdf, baseline_document, baseline_metrics)
    bullet_alignment_issues = _bullet_alignment_issues(
        bullet_marker_x,
        bullet_first_x,
        bullet_continuation_x,
        baseline_bullet_marker_x,
        baseline_bullet_first_x,
        baseline_bullet_continuation_x,
    )
    employer_heading_issues, section_geometry_issues = _protected_geometry_issues(
        document, baseline_document, paragraph_metrics, baseline_metrics
    )
    employer_spacing_issues = _employer_spacing_issues(
        document, baseline_document, paragraph_metrics, baseline_metrics
    )
    font_inventory_changed = bool(baseline_pdf and fonts != baseline_fonts)
    boundary_issues: list[str] = []
    if right_clearance < baseline_right_clearance - MAX_EDGE_INTRUSION_POINTS:
        boundary_issues.append("right-edge")
    if bottom_clearance < baseline_bottom_clearance - MAX_EDGE_INTRUSION_POINTS:
        boundary_issues.append("bottom-edge")
    density_band_deltas = [
        current - baseline
        for current, baseline in zip(density_bands, baseline_density_bands, strict=True)
    ]
    if any(delta > MAX_DENSITY_BAND_INCREASE for delta in density_band_deltas):
        boundary_issues.append("page-density")
    passed = (
        page_count == 1
        and rendered_lines <= baseline_lines
        and not missing_anchors
        and not drifted
        and not paragraph_overflow
        and not skill_wrap_issues
        and not unmatched
        and not new_bounds_issues
        and not new_overlap_issues
        and not collapsed_tab_items
        and not horizontally_drifted
        and not bullet_alignment_issues
        and not employer_heading_issues
        and not employer_spacing_issues
        and not section_geometry_issues
        and not font_inventory_changed
        and not boundary_issues
    )
    return LayoutResult(
        passed=passed,
        page_count=page_count,
        rendered_lines=rendered_lines,
        section_anchor_deltas=deltas,
        overflow_paragraph_ids=[
            *skill_wrap_issues,
            *missing_anchors,
            *drifted,
            *paragraph_overflow,
            *unmatched,
            *(f"horizontal:{paragraph_id}" for paragraph_id in horizontally_drifted),
            *(f"collapsed-tab:{paragraph_id}" for paragraph_id in collapsed_tab_items),
            *bullet_alignment_issues,
            *employer_heading_issues,
            *employer_spacing_issues,
            *section_geometry_issues,
            *boundary_issues,
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
        paragraph_left_points={
            paragraph_id: float(metric["left_points"])
            for paragraph_id, metric in paragraph_metrics.items()
        },
        paragraph_right_points={
            paragraph_id: float(metric["right_points"])
            for paragraph_id, metric in paragraph_metrics.items()
        },
        bullet_marker_x_points=bullet_marker_x,
        bullet_first_line_x_points=bullet_first_x,
        bullet_continuation_x_points=bullet_continuation_x,
        bullet_alignment_issues=bullet_alignment_issues,
        skill_wrap_issues=skill_wrap_issues,
        employer_heading_issues=employer_heading_issues,
        employer_spacing_issues=employer_spacing_issues,
        section_geometry_issues=section_geometry_issues,
        protected_horizontal_deltas=protected_horizontal_deltas,
        font_inventory=fonts,
        font_inventory_changed=font_inventory_changed,
        right_edge_clearance_points=right_clearance,
        bottom_edge_clearance_points=bottom_clearance,
        density_band_deltas=density_band_deltas,
        boundary_issues=boundary_issues,
        out_of_bounds_items=new_bounds_issues,
        overlap_items=new_overlap_issues,
        collapsed_tab_items=collapsed_tab_items,
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
            for word in page.get_text("words", delimiters="●")
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
                "line_left_points": [],
                "line_right_points": [],
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
        line_lefts = [min(box[0] for box in line) for line in ordered]
        line_rights = [max(box[2] for box in line) for line in ordered]
        result[paragraph.paragraph_id] = {
            "matched": True,
            "line_count": len(ordered),
            "line_widths_points": widths,
            "max_width_points": max(widths, default=0.0),
            "top_points": min(box[1] for _token, box in matched),
            "bottom_points": max(box[3] for _token, box in matched),
            "left_points": min(box[0] for _token, box in matched),
            "right_points": max(box[2] for _token, box in matched),
            "line_left_points": line_lefts,
            "line_right_points": line_rights,
        }
    return result


def _bullet_geometry(
    pdf_path: str | Path,
    document: ResumeDocument | None,
    metrics: dict[str, ParagraphMetric],
) -> tuple[dict[str, float], dict[str, float], dict[str, float]]:
    if document is None:
        return {}, {}, {}
    with fitz.open(pdf_path) as pdf:
        markers = [
            (float(char["bbox"][0]), float(char["bbox"][1]), float(char["bbox"][3]))
            for page in pdf
            for block in page.get_text("rawdict").get("blocks", [])
            for line in block.get("lines", [])
            for span in line.get("spans", [])
            for char in span.get("chars", [])
            if char["c"] == "●"
        ]
    marker_x: dict[str, float] = {}
    first_x: dict[str, float] = {}
    continuation_x: dict[str, float] = {}
    for paragraph in document.paragraphs:
        if paragraph.kind.value != "bullet":
            continue
        metric = metrics.get(paragraph.paragraph_id)
        if not metric or not metric["matched"]:
            continue
        line_lefts = metric["line_left_points"]
        if line_lefts:
            first_x[paragraph.paragraph_id] = line_lefts[0]
        if len(line_lefts) > 1:
            continuation_x[paragraph.paragraph_id] = max(
                line_lefts[1:], key=lambda left: abs(left - line_lefts[0])
            )
        top = float(metric["top_points"])
        nearby = [item for item in markers if item[1] - 4.0 <= top <= item[2] + 4.0]
        if nearby:
            marker_x[paragraph.paragraph_id] = min(nearby, key=lambda item: abs(item[1] - top))[0]
    return marker_x, first_x, continuation_x


def _bullet_alignment_issues(
    marker_x: dict[str, float],
    first_x: dict[str, float],
    continuation_x: dict[str, float],
    baseline_marker_x: dict[str, float],
    baseline_first_x: dict[str, float],
    baseline_continuation_x: dict[str, float],
) -> list[str]:
    issues: list[str] = []
    for paragraph_id, baseline in baseline_first_x.items():
        current = first_x.get(paragraph_id)
        if current is None or abs(current - baseline) > MAX_BULLET_ALIGNMENT_DRIFT_POINTS:
            issues.append(f"bullet-first:{paragraph_id}")
    for paragraph_id, baseline in baseline_marker_x.items():
        current = marker_x.get(paragraph_id)
        if current is None or abs(current - baseline) > MAX_BULLET_ALIGNMENT_DRIFT_POINTS:
            issues.append(f"bullet-marker:{paragraph_id}")
    for paragraph_id, current in continuation_x.items():
        first = first_x.get(paragraph_id)
        if first is not None and abs(current - first) > MAX_BULLET_ALIGNMENT_DRIFT_POINTS:
            issues.append(f"bullet-hanging:{paragraph_id}")
        baseline_continuation = baseline_continuation_x.get(paragraph_id)
        if (
            baseline_continuation is not None
            and abs(current - baseline_continuation) > MAX_BULLET_ALIGNMENT_DRIFT_POINTS
        ):
            issues.append(f"bullet-continuation:{paragraph_id}")
    return sorted(set(issues))


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


def _collapsed_tab_items(
    pdf: fitz.Document,
    document: ResumeDocument,
) -> list[str]:
    """Find tab-delimited fields that the PDF renderer joined into one visible word."""
    rendered_words = [
        "".join(_tokens(str(word[4]))) for page in pdf for word in page.get_text("words")
    ]
    joined = set(rendered_words)
    issues: list[str] = []
    for paragraph in document.paragraphs:
        if "\t" not in paragraph.text:
            continue
        fields = paragraph.text.split("\t")
        for left, right in zip(fields, fields[1:], strict=False):
            left_tokens = _tokens(left)
            right_tokens = _tokens(right)
            if left_tokens and right_tokens and left_tokens[-1] + right_tokens[0] in joined:
                issues.append(paragraph.paragraph_id)
                break
    return issues


def _protected_geometry_issues(
    document: ResumeDocument | None,
    baseline_document: ResumeDocument | None,
    metrics: dict[str, ParagraphMetric],
    baseline_metrics: dict[str, ParagraphMetric],
) -> tuple[list[str], list[str]]:
    if document is None or baseline_document is None:
        return [], []
    employer: list[str] = []
    sections: list[str] = []
    for paragraph in baseline_document.paragraphs:
        if paragraph.kind.value not in {"entry_heading", "section_heading"}:
            continue
        current = metrics.get(paragraph.paragraph_id)
        baseline = baseline_metrics.get(paragraph.paragraph_id)
        if not current or not baseline or not current["matched"] or not baseline["matched"]:
            issue = f"heading-unmatched:{paragraph.paragraph_id}"
        else:
            horizontal = max(
                abs(float(current["left_points"]) - float(baseline["left_points"])),
                abs(float(current["right_points"]) - float(baseline["right_points"])),
            )
            issue = (
                f"heading-geometry:{paragraph.paragraph_id}"
                if horizontal > MAX_PROTECTED_HORIZONTAL_DRIFT_POINTS
                else ""
            )
        if issue and paragraph.kind.value == "entry_heading":
            employer.append(issue)
        elif issue:
            sections.append(issue)
    return employer, sections


def _employer_spacing_issues(
    document: ResumeDocument | None,
    baseline_document: ResumeDocument | None,
    metrics: dict[str, ParagraphMetric],
    baseline_metrics: dict[str, ParagraphMetric],
) -> list[str]:
    if document is None or baseline_document is None:
        return []
    paragraphs = baseline_document.paragraphs
    issues: list[str] = []
    for index, paragraph in enumerate(paragraphs):
        if paragraph.kind.value != "entry_heading" or not paragraph.section.startswith(
            "experience."
        ):
            continue
        previous = next(
            (
                candidate
                for candidate in reversed(paragraphs[:index])
                if candidate.kind.value == "bullet" and candidate.section.startswith("experience.")
            ),
            None,
        )
        if previous is None:
            continue
        current_heading = metrics.get(paragraph.paragraph_id)
        current_previous = metrics.get(previous.paragraph_id)
        baseline_heading = baseline_metrics.get(paragraph.paragraph_id)
        baseline_previous = baseline_metrics.get(previous.paragraph_id)
        if (
            current_heading is None
            or current_previous is None
            or baseline_heading is None
            or baseline_previous is None
        ):
            continue
        current_gap = float(current_heading["top_points"]) - float(
            current_previous["bottom_points"]
        )
        baseline_gap = float(baseline_heading["top_points"]) - float(
            baseline_previous["bottom_points"]
        )
        if abs(current_gap - baseline_gap) > MAX_EMPLOYER_SPACING_DRIFT_POINTS:
            issues.append(f"employer-spacing:{paragraph.paragraph_id}")
    return issues


def _page_clearance(document: fitz.Document) -> tuple[float, float]:
    if not document.page_count:
        return 0.0, 0.0
    right_clearance = min(
        (
            float(page.rect.width) - float(word[2])
            for page in document
            for word in page.get_text("words")
        ),
        default=0.0,
    )
    last_page = document[-1]
    bottom_clearance = min(
        (float(last_page.rect.height) - float(word[3]) for word in last_page.get_text("words")),
        default=0.0,
    )
    return right_clearance, bottom_clearance


def _density_bands(document: fitz.Document) -> list[int]:
    if not document.page_count:
        return [0, 0, 0]
    page = document[0]
    bands = [0, 0, 0]
    seen: set[tuple[int, float]] = set()
    for block in page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            y_position = float(line["bbox"][1])
            key = (0, round(y_position, 1))
            if key in seen:
                continue
            seen.add(key)
            band = min(2, int(3 * y_position / max(float(page.rect.height), 1.0)))
            bands[band] += 1
    return bands


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
