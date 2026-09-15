from __future__ import annotations

import filecmp
import shutil
from datetime import date
from pathlib import Path


def archive_tailored_pdf(
    pdf_path: str | Path,
    used_resume_root: str | Path,
    *,
    tailored_on: date | None = None,
) -> Path:
    """Copy a completed PDF into USED_RESUME/YYYY-MM-DD without overwriting a run."""
    source = Path(pdf_path).resolve()
    if not source.is_file():
        raise FileNotFoundError(f"Tailored PDF does not exist: {source}")
    if source.suffix.casefold() != ".pdf":
        raise ValueError(f"Only tailored PDF files can be archived: {source}")

    day_folder = (
        Path(used_resume_root).expanduser().resolve() / (tailored_on or date.today()).isoformat()
    )
    day_folder.mkdir(parents=True, exist_ok=True)

    candidate = day_folder / source.name
    sequence = 2
    while candidate.exists():
        if candidate.is_file() and filecmp.cmp(source, candidate, shallow=False):
            return candidate
        candidate = day_folder / f"{source.stem}_{sequence}{source.suffix}"
        sequence += 1

    shutil.copy2(source, candidate)
    return candidate
