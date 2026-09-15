from datetime import date
from pathlib import Path

from aiadapply_v2.used_resumes import archive_tailored_pdf


def test_archives_pdf_in_dated_folder_with_original_name(tmp_path: Path) -> None:
    source = tmp_path / "output" / "Brian_Aiad_Resume_Banner_Technology_Operations_Engineer.pdf"
    source.parent.mkdir()
    source.write_bytes(b"first tailored PDF")

    archived = archive_tailored_pdf(
        source,
        tmp_path / "USED_RESUME",
        tailored_on=date(2026, 9, 14),
    )

    assert archived == (
        tmp_path
        / "USED_RESUME"
        / "2026-09-14"
        / "Brian_Aiad_Resume_Banner_Technology_Operations_Engineer.pdf"
    )
    assert archived.read_bytes() == source.read_bytes()


def test_archive_is_idempotent_for_identical_retry(tmp_path: Path) -> None:
    source = tmp_path / "resume.pdf"
    source.write_bytes(b"same PDF")

    first = archive_tailored_pdf(source, tmp_path / "used", tailored_on=date(2026, 9, 14))
    second = archive_tailored_pdf(source, tmp_path / "used", tailored_on=date(2026, 9, 14))

    assert second == first
    assert list(first.parent.glob("*.pdf")) == [first]


def test_archive_preserves_different_repeat_tailors(tmp_path: Path) -> None:
    source = tmp_path / "resume.pdf"
    source.write_bytes(b"first PDF")
    first = archive_tailored_pdf(source, tmp_path / "used", tailored_on=date(2026, 9, 14))
    source.write_bytes(b"second PDF")

    second = archive_tailored_pdf(source, tmp_path / "used", tailored_on=date(2026, 9, 14))

    assert second == first.with_name("resume_2.pdf")
    assert first.read_bytes() == b"first PDF"
    assert second.read_bytes() == b"second PDF"
