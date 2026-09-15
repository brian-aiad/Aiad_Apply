from pathlib import Path

from aiadapply_v2.config import default_output_root, default_used_resume_root


def test_output_root_is_portable_on_macos(tmp_path: Path) -> None:
    assert (
        default_output_root(
            home=tmp_path,
            platform="darwin",
            environment={},
        )
        == tmp_path / "Downloads" / "Resume_Builder" / "OUTPUT_RESUMES"
    )


def test_output_root_prefers_existing_windows_onedrive_downloads(tmp_path: Path) -> None:
    downloads = tmp_path / "OneDrive" / "Downloads"
    downloads.mkdir(parents=True)

    assert (
        default_output_root(
            home=tmp_path,
            platform="win32",
            environment={},
        )
        == downloads / "Resume_Builder" / "OUTPUT_RESUMES"
    )


def test_output_root_honors_environment_override(tmp_path: Path) -> None:
    configured = tmp_path / "custom-output"

    assert (
        default_output_root(
            home=tmp_path,
            platform="darwin",
            environment={"AIADAPPLY_OUTPUT_ROOT": str(configured)},
        )
        == configured
    )


def test_used_resume_root_is_sibling_of_portable_macos_output(tmp_path: Path) -> None:
    assert (
        default_used_resume_root(
            home=tmp_path,
            platform="darwin",
            environment={},
        )
        == tmp_path / "Downloads" / "Resume_Builder" / "USED_RESUME"
    )


def test_used_resume_root_is_sibling_of_windows_onedrive_output(tmp_path: Path) -> None:
    (tmp_path / "OneDrive" / "Downloads").mkdir(parents=True)

    assert (
        default_used_resume_root(
            home=tmp_path,
            platform="win32",
            environment={},
        )
        == tmp_path / "OneDrive" / "Downloads" / "Resume_Builder" / "USED_RESUME"
    )


def test_used_resume_root_follows_custom_output_parent(tmp_path: Path) -> None:
    output = tmp_path / "custom" / "OUTPUT_RESUMES"

    assert (
        default_used_resume_root(
            home=tmp_path,
            platform="darwin",
            environment={"AIADAPPLY_OUTPUT_ROOT": str(output)},
        )
        == output.parent / "USED_RESUME"
    )


def test_used_resume_root_honors_its_own_override(tmp_path: Path) -> None:
    configured = tmp_path / "pdf-library"

    assert (
        default_used_resume_root(
            home=tmp_path,
            platform="win32",
            environment={"AIADAPPLY_USED_RESUME_ROOT": str(configured)},
        )
        == configured
    )
