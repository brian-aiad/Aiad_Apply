"""Extract discovery evidence only from the supplied verified base document."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "packages/resume-engine/src"))
from aiadapply_v2.documents.model import parse_resume_docx  # noqa: E402


def main() -> None:
    document = parse_resume_docx(Path(sys.argv[1]))
    paragraphs = [
        {"id": p.paragraph_id, "section": p.section, "kind": p.kind, "text": p.text}
        for p in document.paragraphs
        if (
            p.kind in {"summary", "skill_line", "bullet"}
            or p.section in {"education", "certifications"}
        )
        and p.text.strip()
    ]
    print(json.dumps({"sha256": document.source_sha256, "paragraphs": paragraphs}))


if __name__ == "__main__":
    main()
