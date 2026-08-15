from __future__ import annotations

import json
from pathlib import Path

from aiadapply_v2.schemas import TransformationReport
from aiadapply_v2.text import contains_term


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
    placement_rows = [(item, _keyword_placements(report, item.term)) for item in accepted]
    used_count = sum(bool(placements) for _item, placements in placement_rows)
    match_by_term = {
        match.target_term.casefold(): match for match in report.transferability_map.matches
    }
    lines = [
        "# Resume Transformation Report",
        "",
        f"- Company: {report.job.company}",
        f"- Target role: {report.job.title}",
        f"- Professional identity: {report.role_profile.professional_identity}",
        f"- Evidence-backed job coverage: {report.validation.keyword_coverage:.2f}%",
        f"- Output pages: {report.layout.page_count}",
        f"- Structural validation: {'PASS' if report.validation.structure_passed else 'FAIL'}",
        f"- Protected content: {'PASS' if report.validation.protected_fields_passed else 'FAIL'}",
        f"- Metrics: {'PASS' if report.validation.metrics_passed else 'FAIL'}",
        f"- Accepted keywords used: {used_count} of {len(accepted)}",
        "",
        "## Keyword Placement Audit",
        "",
    ]
    lines.extend(
        f"- **{item.term}** — importance {item.hiring_importance:.0f}; "
        f"sources: {', '.join(item.source_sections) or 'inferred'}; "
        f"evidence: {_evidence_label(match_by_term.get(item.normalized))}; "
        f"used: {', '.join(placements) if placements else 'NO'}; "
        f"decision: {_placement_decision(item, placements, match_by_term.get(item.normalized))}"
        for item, placements in placement_rows
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
    lines.extend(["", "## Exact Resume Changes", ""])
    for change in report.changes:
        if change.change_type == "unchanged":
            continue
        lines.extend(
            [
                f"### {change.paragraph_id}",
                "",
                f"- Section: {change.section}",
                f"- Risk: {change.risk_level.value}",
                f"- Compressed after layout validation: {'yes' if change.compressed else 'no'}",
                f"- Target terms: {', '.join(change.target_terms) or 'none'}",
                f"- Before: {change.before_text}",
                f"- After: {change.final_text}",
                "",
            ]
        )
    lines.extend(["", "## Validation Issues", ""])
    lines.extend(
        f"- {issue.severity.upper()} `{issue.code}`: {issue.message}"
        for issue in report.validation.issues
    )
    if not report.validation.issues:
        lines.append("- None")
    return "\n".join(lines) + "\n"


def _keyword_placements(report: TransformationReport, term: str) -> list[str]:
    decision = next(
        (
            item
            for item in report.keyword_decisions
            if item.normalized == term.casefold() or item.term.casefold() == term.casefold()
        ),
        None,
    )
    if decision is not None:
        return list(decision.placements)
    placements: list[str] = []
    plan = report.rewrite_plan
    if contains_term(plan.summary.text, term):
        placements.append("summary")
    for line in plan.skills.lines:
        if any(contains_term(skill, term) for skill in line.skills):
            placements.append(line.paragraph_id)
    for bullet in plan.bullets:
        if contains_term(bullet.text, term):
            placements.append(bullet.paragraph_id)
    return placements


def _evidence_label(match: object | None) -> str:
    strength = getattr(match, "strength", None)
    return strength.value if strength is not None else "not evaluated"


def _placement_decision(item: object, placements: list[str], match: object | None) -> str:
    if placements:
        return "placed in the strongest natural locations"
    strength = getattr(match, "strength", None)
    if strength is not None and strength.value == "unsupported":
        return "omitted because candidate evidence does not substantiate it"
    importance = float(getattr(item, "hiring_importance", 0.0))
    if importance < 25:
        return "omitted as a lower-priority or scanner-only term"
    return "omitted to preserve stronger existing evidence and document space"
