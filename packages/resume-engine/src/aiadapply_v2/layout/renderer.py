from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import quote

import fitz

from aiadapply_v2.schemas import LayoutResult

SECTION_ANCHORS = ("SKILLS", "EXPERIENCE", "PROJECTS", "EDUCATION", "CERTIFICATIONS")


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
    executable = find_libreoffice()
    if not executable:
        raise RenderingError(
            "LibreOffice was not found. Install it to render and validate one-page output."
        )
    source = Path(docx_path).resolve()
    destination = Path(output_dir).resolve()
    destination.mkdir(parents=True, exist_ok=True)
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


def inspect_pdf(
    pdf_path: str | Path,
    *,
    baseline_pdf: str | Path | None = None,
    attempts: int = 1,
) -> LayoutResult:
    path = Path(pdf_path).resolve()
    with fitz.open(path) as document:
        page_count = document.page_count
        rendered_lines = sum(_page_lines(page) for page in document)
        anchors = _anchors(document[0]) if page_count else {}
    baseline_lines = rendered_lines
    baseline_anchors = anchors
    if baseline_pdf:
        with fitz.open(baseline_pdf) as baseline:
            baseline_lines = sum(_page_lines(page) for page in baseline)
            baseline_anchors = _anchors(baseline[0]) if baseline.page_count else {}
    deltas = {
        anchor: anchors[anchor] - baseline_anchors[anchor]
        for anchor in SECTION_ANCHORS
        if anchor in anchors and anchor in baseline_anchors
    }
    missing_anchors = [anchor for anchor in SECTION_ANCHORS if anchor not in anchors]
    drifted = [anchor for anchor, delta in deltas.items() if abs(delta) > 14.5]
    passed = (
        page_count == 1 and rendered_lines <= baseline_lines and not missing_anchors and not drifted
    )
    return LayoutResult(
        passed=passed,
        page_count=page_count,
        rendered_lines=rendered_lines,
        section_anchor_deltas=deltas,
        overflow_paragraph_ids=[*missing_anchors, *drifted],
        pdf_path=path,
        attempts=attempts,
    )


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
