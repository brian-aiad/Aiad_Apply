from __future__ import annotations

import os
import sys
from collections.abc import Mapping
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[4]


def _output_root_from_web_environment() -> str:
    for candidate in (
        REPOSITORY_ROOT / "apps" / "web" / ".env.local",
        REPOSITORY_ROOT / "apps" / "web" / ".env",
    ):
        if not candidate.is_file():
            continue
        for raw_line in candidate.read_text(encoding="utf-8", errors="replace").splitlines():
            key, separator, value = raw_line.partition("=")
            if separator and key.strip() == "AIADAPPLY_OUTPUT_ROOT":
                return value.strip().strip("\"'")
    return ""


def default_output_root(
    *,
    home: Path | None = None,
    platform: str | None = None,
    environment: Mapping[str, str] | None = None,
) -> Path:
    """Return a portable output directory while honoring an explicit override."""
    values = os.environ if environment is None else environment
    configured = values.get("AIADAPPLY_OUTPUT_ROOT", "").strip()
    if not configured and environment is None:
        configured = _output_root_from_web_environment()
    if configured:
        return Path(configured).expanduser()

    user_home = Path.home() if home is None else home
    current_platform = sys.platform if platform is None else platform
    if current_platform == "win32":
        one_drive_downloads = user_home / "OneDrive" / "Downloads"
        if one_drive_downloads.is_dir():
            return one_drive_downloads / "Resume_Builder" / "OUTPUT_RESUMES"
    return user_home / "Downloads" / "Resume_Builder" / "OUTPUT_RESUMES"
