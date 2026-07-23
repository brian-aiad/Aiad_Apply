from __future__ import annotations

import json
from pathlib import Path

from aiadapply_v2.schemas import ResumeEvidenceGraph


def load_resume_evidence(path: str | Path) -> ResumeEvidenceGraph:
    return ResumeEvidenceGraph.model_validate_json(Path(path).read_text(encoding="utf-8"))


def save_resume_evidence(graph: ResumeEvidenceGraph, path: str | Path) -> None:
    Path(path).write_text(json.dumps(graph.model_dump(), indent=2), encoding="utf-8")

