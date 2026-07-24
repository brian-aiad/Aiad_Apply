from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path
from typing import Annotated

import typer
from rich import print

from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.evidence.loaders import build_evidence_graph
from aiadapply_v2.grading.keywords import grade_job_keywords
from aiadapply_v2.layout.renderer import (
    apply_pdf_layout_budgets,
    find_libreoffice,
    inspect_pdf,
    render_docx_to_pdf,
)
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify
from aiadapply_v2.pipeline import transform_resume
from aiadapply_v2.profiling.role_profile import build_target_role_profile
from aiadapply_v2.reasoning.codex import CodexReasoner

app = typer.Typer(no_args_is_help=True, help="Reasoning-based resume transformation engine.")
REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_BASE = REPOSITORY_ROOT / "data" / "resumes" / "Brian_Aiad_BASE.docx"


@app.command()
def doctor() -> None:
    """Verify local prerequisites without transforming a resume."""
    checks = {
        "base_resume": str(DEFAULT_BASE) if DEFAULT_BASE.exists() else None,
        "codex": shutil.which("codex"),
        "libreoffice": str(find_libreoffice()) if find_libreoffice() else None,
    }
    print(json.dumps(checks, indent=2))
    if not all(checks.values()):
        raise typer.Exit(code=1)


@app.command("inspect-base")
def inspect_base(
    base_resume: Annotated[Path, typer.Option("--base-resume")] = DEFAULT_BASE,
) -> None:
    """Parse the final DOCX into the semantic document model."""
    document = parse_resume_docx(base_resume)
    print(json.dumps(document.model_dump(mode="json"), indent=2))


@app.command("inspect-format")
def inspect_format(
    base_resume: Annotated[Path, typer.Option("--base-resume")] = DEFAULT_BASE,
    output: Annotated[Path | None, typer.Option("--output")] = None,
) -> None:
    """Render and fingerprint every source paragraph, run, package part, and line."""
    document = parse_resume_docx(base_resume)
    with tempfile.TemporaryDirectory(prefix="aiadapply-format-") as temp_name:
        pdf = render_docx_to_pdf(base_resume, temp_name)
        apply_pdf_layout_budgets(document, pdf)
        layout = inspect_pdf(pdf, document=document)
    document_payload = document.model_dump(mode="json")
    try:
        document_payload["source_path"] = str(
            base_resume.resolve().relative_to(REPOSITORY_ROOT)
        ).replace("\\", "/")
    except ValueError:
        document_payload["source_path"] = base_resume.name
    layout.pdf_path = None
    payload = json.dumps(
        {
            "document": document_payload,
            "layout": layout.model_dump(mode="json"),
        },
        indent=2,
    )
    if output is not None:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(payload + "\n", encoding="utf-8")
    print(payload)


@app.command()
def parse(paste_file: Annotated[Path, typer.Option("--paste-file")]) -> None:
    """Parse a noisy LinkedIn/Simplify paste and grade its keywords."""
    job = parse_linkedin_simplify(paste_file.read_text(encoding="utf-8", errors="replace"))
    keywords = grade_job_keywords(job)
    print(
        json.dumps(
            {
                "job": job.model_dump(mode="json"),
                "keywords": [item.model_dump(mode="json") for item in keywords],
            },
            indent=2,
        )
    )


@app.command()
def profile(paste_file: Annotated[Path, typer.Option("--paste-file")]) -> None:
    """Build the deterministic target-role profile used to brief Codex."""
    job = parse_linkedin_simplify(paste_file.read_text(encoding="utf-8", errors="replace"))
    keywords = grade_job_keywords(job)
    target = build_target_role_profile(job, keywords)
    document = parse_resume_docx(DEFAULT_BASE)
    graph = build_evidence_graph(document, keywords)
    print(
        json.dumps(
            {
                "profile": target.model_dump(mode="json"),
                "evidence_graph": graph.model_dump(mode="json"),
            },
            indent=2,
        )
    )


@app.command()
def transform(
    paste_file: Annotated[Path, typer.Option("--paste-file")],
    output_dir: Annotated[Path, typer.Option("--output-dir")],
    base_resume: Annotated[Path, typer.Option("--base-resume")] = DEFAULT_BASE,
) -> None:
    """Run Codex review, validate, render, and export the one-page resume."""
    report = transform_resume(
        raw_paste=paste_file.read_text(encoding="utf-8", errors="replace"),
        base_resume=base_resume,
        output_dir=output_dir,
        reasoner=CodexReasoner(),
    )
    print(
        json.dumps(
            {
                "docx": str(report.output_docx),
                "pdf": str(report.output_pdf),
                "pages": report.layout.page_count,
                "keyword_coverage": report.validation.keyword_coverage,
                "claim_risks": len(report.claim_risks),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    app()
