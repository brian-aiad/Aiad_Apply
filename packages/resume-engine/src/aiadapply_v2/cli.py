from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import date, datetime
from pathlib import Path
from typing import Annotated

import typer
from rich import print

from aiadapply_v2.config import default_output_root
from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.evidence.candidate_profile import (
    add_candidate_profile_evidence,
    apply_candidate_profile_to_keywords,
    load_candidate_profile,
)
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
from aiadapply_v2.tracking import (
    register_terminal_run,
    run_worker,
    submit_terminal_failure,
    submit_terminal_result,
    submit_worker_progress,
)

app = typer.Typer(no_args_is_help=True, help="Reasoning-based resume transformation engine.")
REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_BASE = REPOSITORY_ROOT / "data" / "resumes" / "Brian_Aiad_BASE.docx"
DEFAULT_PROFILE = REPOSITORY_ROOT / "data" / "profile" / "Brian_Aiad_PROFILE.json"
DEFAULT_OUTPUT_ROOT = default_output_root()


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
    loaded_profile = load_candidate_profile(DEFAULT_PROFILE)
    apply_candidate_profile_to_keywords(keywords, loaded_profile)
    target = build_target_role_profile(job, keywords)
    document = parse_resume_docx(DEFAULT_BASE)
    graph = build_evidence_graph(document, keywords)
    add_candidate_profile_evidence(graph, loaded_profile)
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
    candidate_profile: Annotated[Path, typer.Option("--candidate-profile")] = DEFAULT_PROFILE,
) -> None:
    """Run Codex review, validate, render, and export the one-page resume."""
    report = transform_resume(
        raw_paste=paste_file.read_text(encoding="utf-8", errors="replace"),
        base_resume=base_resume,
        output_dir=output_dir,
        reasoner=CodexReasoner(),
        candidate_profile=candidate_profile,
        progress=_print_progress,
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


@app.command()
def draft(
    paste_file: Annotated[Path | None, typer.Option("--paste-file")] = None,
    clipboard: Annotated[bool, typer.Option("--clipboard")] = False,
    output_root: Annotated[Path, typer.Option("--output-root")] = DEFAULT_OUTPUT_ROOT,
    api_url: Annotated[str | None, typer.Option("--api-url")] = None,
    base_resume: Annotated[Path, typer.Option("--base-resume")] = DEFAULT_BASE,
    candidate_profile: Annotated[Path, typer.Option("--candidate-profile")] = DEFAULT_PROFILE,
) -> None:
    """Paste a job and immediately produce a job-specific draft resume packet."""
    raw_paste = _read_job_paste(paste_file=paste_file, clipboard=clipboard)
    job = parse_linkedin_simplify(raw_paste)
    folder = output_root / (f"{date.today().isoformat()}_{_slug(job.company)}_{_slug(job.title)}")
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "job-description.txt").write_text(raw_paste.rstrip() + "\n", encoding="utf-8")
    print(f"[bold]Drafting:[/bold] {job.company} — {job.title}\n[bold]Output:[/bold] {folder}")
    tracking: tuple[str, str, str, str, str] | None = None
    try:
        tracking = register_terminal_run(raw_paste=raw_paste, api_url=api_url)
    except Exception as error:
        print(f"[yellow]Tracking unavailable; resume generation will continue:[/yellow] {error}")
    progress_sync_available = True

    def report_progress(message: str) -> None:
        nonlocal progress_sync_available
        _print_progress(message)
        if tracking is None or not progress_sync_available:
            return
        api_url, secret, _, run_id, worker_id = tracking
        try:
            submit_worker_progress(
                api_url=api_url,
                secret=secret,
                run_id=run_id,
                stage=message,
                worker_id=worker_id,
            )
        except Exception as error:
            progress_sync_available = False
            print(f"[yellow]Progress sync unavailable; continuing locally:[/yellow] {error}")

    try:
        report = transform_resume(
            raw_paste=raw_paste,
            base_resume=base_resume,
            output_dir=folder,
            reasoner=CodexReasoner(),
            candidate_profile=candidate_profile,
            progress=report_progress,
        )
    except Exception as error:
        if tracking is not None:
            api_url, secret, _, run_id, worker_id = tracking
            try:
                submit_terminal_failure(
                    api_url=api_url,
                    secret=secret,
                    run_id=run_id,
                    error=error,
                    output_folder=folder,
                    worker_id=worker_id,
                )
            except Exception as tracking_error:
                print(f"[yellow]Tracking failure sync failed:[/yellow] {tracking_error}")
        raise
    if tracking is not None:
        api_url, secret, application_id, run_id, worker_id = tracking
        try:
            submit_terminal_result(
                api_url=api_url,
                secret=secret,
                run_id=run_id,
                report=report,
                output_folder=folder,
                application_id=application_id,
                worker_id=worker_id,
            )
        except Exception as error:
            print(f"[yellow]Resume generated, but tracking sync failed:[/yellow] {error}")
    print(
        json.dumps(
            {
                "company": report.job.company,
                "title": report.job.title,
                "docx": str(report.output_docx),
                "pdf": str(report.output_pdf),
                "pages": report.layout.page_count,
                "keyword_coverage": report.validation.keyword_coverage,
                "review_flags": len(report.claim_risks),
            },
            indent=2,
        )
    )


@app.command()
def worker(
    once: Annotated[bool, typer.Option("--once")] = False,
    api_url: Annotated[str | None, typer.Option("--api-url")] = None,
    output_root: Annotated[Path, typer.Option("--output-root")] = DEFAULT_OUTPUT_ROOT,
    base_resume: Annotated[Path, typer.Option("--base-resume")] = DEFAULT_BASE,
    candidate_profile: Annotated[Path, typer.Option("--candidate-profile")] = DEFAULT_PROFILE,
) -> None:
    """Process durable tailoring jobs created by the local or hosted dashboard."""
    run_worker(
        reasoner=CodexReasoner(),
        base_resume=base_resume,
        candidate_profile=candidate_profile,
        output_root=output_root,
        api_url=api_url,
        once=once,
    )


def _print_progress(message: str) -> None:
    print(f"[dim]{datetime.now().strftime('%H:%M:%S')}[/dim] {message}")


def _read_job_paste(*, paste_file: Path | None, clipboard: bool) -> str:
    if paste_file is not None and clipboard:
        raise typer.BadParameter("Use either --paste-file or --clipboard, not both.")
    if paste_file is not None:
        raw = paste_file.read_text(encoding="utf-8", errors="replace")
    elif clipboard:
        raw = _read_clipboard()
    elif not sys.stdin.isatty():
        raw = sys.stdin.read()
    else:
        print(
            "[bold]Paste the complete LinkedIn/Simplify page.[/bold]\n"
            "On a new line, type [cyan]::done[/cyan] and press Enter."
        )
        lines: list[str] = []
        while True:
            try:
                line = input()
            except EOFError:
                break
            if line.strip().casefold() == "::done":
                break
            lines.append(line)
        raw = "\n".join(lines)
    if len(raw.strip()) < 100:
        raise typer.BadParameter("The pasted job description is empty or too short.")
    return raw


def _read_clipboard() -> str:
    if sys.platform == "win32":
        command = [
            "powershell",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-Clipboard -Raw",
        ]
    elif sys.platform == "darwin":
        command = ["pbpaste"]
    elif shutil.which("wl-paste"):
        command = ["wl-paste", "--no-newline"]
    elif shutil.which("xclip"):
        command = ["xclip", "-selection", "clipboard", "-o"]
    else:
        raise typer.BadParameter(
            "Clipboard access is unavailable; paste interactively or use --paste-file."
        )
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return result.stdout


def _slug(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_")[:80]


if __name__ == "__main__":
    app()
