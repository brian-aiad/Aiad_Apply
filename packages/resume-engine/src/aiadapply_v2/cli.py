from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated

import typer
from rich import print

from aiadapply_v2.evidence.loaders import load_resume_evidence
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify
from aiadapply_v2.planning.rewrite_plan import build_rewrite_plan
from aiadapply_v2.profiling.role_profile import build_target_role_profile
from aiadapply_v2.schemas import TailorMode

app = typer.Typer(help="aiadapplyV2 resume transformation CLI")


@app.command()
def parse(paste_file: Annotated[Path, typer.Option("--paste-file")]) -> None:
    """Parse a messy LinkedIn/Simplify paste into structured job JSON."""
    job = parse_linkedin_simplify(paste_file.read_text(encoding="utf-8", errors="replace"))
    print(json.dumps(job.model_dump(), indent=2))


@app.command()
def profile(paste_file: Annotated[Path, typer.Option("--paste-file")]) -> None:
    """Build a target role profile from a paste."""
    job = parse_linkedin_simplify(paste_file.read_text(encoding="utf-8", errors="replace"))
    target = build_target_role_profile(job)
    print(json.dumps(target.model_dump(), indent=2))


@app.command()
def plan(
    paste_file: Annotated[Path, typer.Option("--paste-file")],
    resume_file: Annotated[Path, typer.Option("--resume-file")],
    mode: TailorMode = TailorMode.hybrid,
) -> None:
    """Build a risk-labeled rewrite plan."""
    job = parse_linkedin_simplify(paste_file.read_text(encoding="utf-8", errors="replace"))
    target = build_target_role_profile(job)
    graph = load_resume_evidence(resume_file)
    rewrite_plan = build_rewrite_plan(target, graph, mode=mode)
    print(json.dumps(rewrite_plan.model_dump(), indent=2))


if __name__ == "__main__":
    app()
