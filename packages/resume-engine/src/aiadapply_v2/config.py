from __future__ import annotations

import os
import sys
from collections.abc import Mapping
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[4]


def _value_from_web_environment(name: str) -> str:
    for candidate in (
        REPOSITORY_ROOT / "apps" / "web" / ".env.local",
        REPOSITORY_ROOT / "apps" / "web" / ".env",
    ):
        if not candidate.is_file():
            continue
        for raw_line in candidate.read_text(encoding="utf-8", errors="replace").splitlines():
            key, separator, value = raw_line.partition("=")
            if separator and key.strip() == name:
                return value.strip().strip("\"'")
    return ""


def _configured_path(
    name: str,
    *,
    environment: Mapping[str, str] | None,
) -> str:
    values = os.environ if environment is None else environment
    configured = values.get(name, "").strip()
    if not configured and environment is None:
        configured = _value_from_web_environment(name)
    return configured


def default_output_root(
    *,
    home: Path | None = None,
    platform: str | None = None,
    environment: Mapping[str, str] | None = None,
) -> Path:
    """Return a portable output directory while honoring an explicit override."""
    configured = _configured_path("AIADAPPLY_OUTPUT_ROOT", environment=environment)
    if configured:
        return Path(configured).expanduser()

    user_home = Path.home() if home is None else home
    current_platform = sys.platform if platform is None else platform
    if current_platform == "darwin":
        one_drive = user_home / "Library" / "CloudStorage" / "OneDrive-Personal"
        if one_drive.is_dir():
            return one_drive / "Downloads" / "Resume_Builder" / "OUTPUT_RESUMES"
    if current_platform == "win32":
        one_drive_downloads = user_home / "OneDrive" / "Downloads"
        if one_drive_downloads.is_dir():
            return one_drive_downloads / "Resume_Builder" / "OUTPUT_RESUMES"
    return user_home / "Downloads" / "Resume_Builder" / "OUTPUT_RESUMES"


def default_used_resume_root(
    *,
    home: Path | None = None,
    platform: str | None = None,
    environment: Mapping[str, str] | None = None,
) -> Path:
    """Return the date-organized PDF library beside the normal output root."""
    configured = _configured_path("AIADAPPLY_USED_RESUME_ROOT", environment=environment)
    if configured:
        return Path(configured).expanduser()

    output_root = default_output_root(
        home=home,
        platform=platform,
        environment=environment,
    )
    return output_root.parent / "USED_RESUME"


def default_base_resume() -> Path:
    configured = _configured_path("AIADAPPLY_BASE_RESUME", environment=None)
    if configured:
        return Path(configured).expanduser()
    synced = default_output_root().parent / "Brian_Aiad_BASE.docx"
    if synced.is_file():
        return synced
    return REPOSITORY_ROOT / "data" / "resumes" / "Brian_Aiad_BASE.docx"
