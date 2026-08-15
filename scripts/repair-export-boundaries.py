from __future__ import annotations

import argparse
import shutil
import tempfile
from pathlib import Path

from aiadapply_v2.auditing import write_character_audit
from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.documents.writer import write_resume_candidate
from aiadapply_v2.layout.renderer import (
    apply_pdf_layout_budgets,
    inspect_pdf,
    render_docx_to_pdf,
)
from aiadapply_v2.pipeline import (
    _build_change_manifest,
    _enforce_export_boundaries,
    _supported_keywords,
)
from aiadapply_v2.planning.rewrite_plan import collect_claim_risks
from aiadapply_v2.reporting.writer import write_transformation_report
from aiadapply_v2.schemas import ReasoningResult, TransformationReport
from aiadapply_v2.tracking import submit_terminal_result, tracking_configuration
from aiadapply_v2.validation.resume import validate_candidate_docx, validate_rewrite_plan


def repair(
    *,
    report_path: Path,
    base_resume: Path,
    run_id: str | None,
    application_id: str | None,
    api_url: str,
) -> TransformationReport:
    output_dir = report_path.resolve().parent
    report = TransformationReport.model_validate_json(report_path.read_text(encoding="utf-8"))
    base = parse_resume_docx(base_resume)
    reasoning = ReasoningResult(
        role_profile=report.role_profile,
        transferability_map=report.transferability_map,
        rewrite_plan=report.rewrite_plan,
    )
    _enforce_export_boundaries(reasoning.rewrite_plan, base)
    supported = _supported_keywords(reasoning, report.keywords)
    plan_validation = validate_rewrite_plan(
        base,
        reasoning.rewrite_plan,
        supported,
        reasoning.role_profile,
        forbidden_terms=reasoning.transferability_map.unsupported_terms,
    )
    if not plan_validation.passed:
        messages = "; ".join(issue.message for issue in plan_validation.issues)
        raise RuntimeError(f"Repaired plan did not validate: {messages}")

    with tempfile.TemporaryDirectory(prefix="aiadapply-repair-") as temporary_name:
        temporary = Path(temporary_name)
        baseline_docx = temporary / "baseline.docx"
        shutil.copy2(base.source_path, baseline_docx)
        baseline_pdf = render_docx_to_pdf(baseline_docx, temporary / "baseline-render")
        apply_pdf_layout_budgets(base, baseline_pdf)

        candidate_docx = temporary / "Brian_Aiad_resume.docx"
        write_resume_candidate(base, reasoning.rewrite_plan, candidate_docx)
        validation = validate_candidate_docx(base, str(candidate_docx), supported)
        validation.issues = [*plan_validation.issues, *validation.issues]
        validation.passed = not any(issue.severity == "error" for issue in validation.issues)
        if not validation.passed:
            messages = "; ".join(issue.message for issue in validation.issues)
            raise RuntimeError(f"Repaired DOCX did not validate: {messages}")

        candidate_pdf = render_docx_to_pdf(candidate_docx, temporary / "candidate-render")
        final_document = parse_resume_docx(candidate_docx)
        layout = inspect_pdf(
            candidate_pdf,
            baseline_pdf=baseline_pdf,
            document=final_document,
            baseline_document=base,
            attempts=1,
        )
        if not layout.passed:
            raise RuntimeError(
                "Repaired PDF did not preserve the visual baseline: "
                f"pages={layout.page_count}, overflow={layout.overflow_paragraph_ids}"
            )

        output_docx = output_dir / "Brian_Aiad_resume.docx"
        output_pdf = output_dir / "Brian_Aiad_resume.pdf"
        shutil.copy2(candidate_docx, output_docx)
        shutil.copy2(candidate_pdf, output_pdf)
        layout.pdf_path = output_pdf

    report.rewrite_plan = reasoning.rewrite_plan
    report.changes = _build_change_manifest(
        base, parse_resume_docx(output_docx), report.rewrite_plan, set()
    )
    report.claim_risks = collect_claim_risks(report.rewrite_plan)
    report.validation = validation
    report.layout = layout
    report.output_docx = output_docx
    report.output_pdf = output_pdf
    write_transformation_report(report, output_dir)
    write_character_audit(
        base=base,
        candidate_docx=output_docx,
        candidate_pdf=output_pdf,
        layout=layout,
        output_dir=output_dir,
    )

    if run_id and application_id:
        resolved_url, secret = tracking_configuration(api_url)
        submit_terminal_result(
            api_url=resolved_url,
            secret=secret,
            run_id=run_id,
            report=report,
            output_folder=output_dir,
            application_id=application_id,
        )
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("report", type=Path)
    parser.add_argument(
        "--base-resume",
        type=Path,
        default=Path("data/resumes/Brian_Aiad_BASE.docx"),
    )
    parser.add_argument("--run-id")
    parser.add_argument("--application-id")
    parser.add_argument("--api-url", default="http://127.0.0.1:3000")
    args = parser.parse_args()
    if bool(args.run_id) != bool(args.application_id):
        parser.error("--run-id and --application-id must be supplied together")
    result = repair(
        report_path=args.report,
        base_resume=args.base_resume,
        run_id=args.run_id,
        application_id=args.application_id,
        api_url=args.api_url,
    )
    print(
        f"Repaired {result.output_pdf} | pages={result.layout.page_count} "
        f"| validation={result.validation.passed}"
    )


if __name__ == "__main__":
    main()
