from __future__ import annotations

import json
from pathlib import Path

from aiadapply_v2.schemas import TransformationReport


def write_transformation_report(
    report: TransformationReport,
    output_dir: str | Path,
) -> tuple[Path, Path]:
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    json_path = destination / "transformation_report.json"
    markdown_path = destination / "transformation_report.md"
    json_path.write_text(
        json.dumps(report.model_dump(mode="json"), indent=2),
        encoding="utf-8",
    )
    markdown_path.write_text(_markdown(report), encoding="utf-8")
    return json_path, markdown_path


def _markdown(report: TransformationReport) -> str:
    accepted = [item for item in report.keywords if item.accepted]
    rejected = [item for item in report.keywords if not item.accepted]
    lines = [
        "# Resume Transformation Report",
        "",
        f"- Company: {report.job.company}",
        f"- Target role: {report.job.title}",
        f"- Professional identity: {report.role_profile.professional_identity}",
        f"- Weighted keyword coverage: {report.validation.keyword_coverage:.2f}%",
        f"- Output pages: {report.layout.page_count}",
        f"- Structural validation: {'PASS' if report.validation.structure_passed else 'FAIL'}",
        f"- Protected content: {'PASS' if report.validation.protected_fields_passed else 'FAIL'}",
        f"- Metrics: {'PASS' if report.validation.metrics_passed else 'FAIL'}",
        "",
        "## Accepted Keywords",
        "",
    ]
    lines.extend(
        f"- {item.term}: importance {item.hiring_importance:.0f}, "
        f"placement {item.placement_utility:.0f}"
        for item in accepted
    )
    lines.extend(["", "## Rejected Keywords", ""])
    lines.extend(
        f"- {item.term}: {item.rejection_reason or 'insufficient hiring signal'}"
        for item in rejected
    )
    lines.extend(["", "## Claim Risks", ""])
    lines.extend(
        f"- **{risk.risk_level.value.upper()}** {risk.claim} "
        f"({risk.selected_placement}): {risk.explanation}"
        for risk in report.claim_risks
    )
    lines.extend(["", "## Validation Issues", ""])
    lines.extend(
        f"- {issue.severity.upper()} `{issue.code}`: {issue.message}"
        for issue in report.validation.issues
    )
    if not report.validation.issues:
        lines.append("- None")
    return "\n".join(lines) + "\n"
