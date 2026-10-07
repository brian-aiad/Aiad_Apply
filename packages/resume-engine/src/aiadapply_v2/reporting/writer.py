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
    supported_rows = [
        (item, placements)
        for item, placements in placement_rows
        if (match := match_by_term.get(item.normalized)) is not None
        and match.strength.value in {"direct", "strongly_transferable"}
    ]
    critical_supported = [row for row in supported_rows if row[0].hiring_importance >= 60]
    important_supported = [row for row in supported_rows if 25 <= row[0].hiring_importance < 60]
    useful_supported = [row for row in supported_rows if row[0].hiring_importance < 25]
    unsupported = [
        item
        for item in accepted
        if (match := match_by_term.get(item.normalized)) is not None
        and match.strength.value == "unsupported"
    ]
    lines = [
        "# Resume Transformation Report",
        "",
        f"- Company: {report.job.company}",
        f"- Target role: {report.job.title}",
        f"- Professional identity: {report.role_profile.professional_identity}",
        f"- Exact job keyword coverage: {report.validation.keyword_coverage:.2f}%",
        f"- Tailoring mode: {report.tailoring_mode}",
        "- Draft technology assumptions (review before applying): "
        + (", ".join(item.term for item in report.draft_technologies) or "None"),
        f"- Output pages: {report.layout.page_count}",
        f"- Structural validation: {'PASS' if report.validation.structure_passed else 'FAIL'}",
        f"- Protected content: {'PASS' if report.validation.protected_fields_passed else 'FAIL'}",
        f"- Metrics: {'PASS' if report.validation.metrics_passed else 'FAIL'}",
        f"- Accepted keywords used: {used_count} of {len(accepted)}",
        f"- Codex model calls: {report.model_calls}",
        f"- Model input tokens: {_usage_total(report, 'input_tokens')}",
        f"- Cached input tokens (included above): {_usage_total(report, 'cached_input_tokens')}",
        f"- Model output tokens: {_usage_total(report, 'output_tokens')}",
        f"- Model elapsed seconds: {sum(call.duration_seconds for call in report.model_usage):.1f}",
        f"- Document candidates: {report.document_candidates}",
        f"- Substantive bullet rewrites: {report.tailoring_summary.substantive_bullets_rewritten} "
        f"of {report.tailoring_summary.relevant_bullets} relevant opportunities "
        f"(minimum {report.tailoring_summary.minimum_substantive_rewrites})",
        f"- Experience bullets changed: {report.tailoring_summary.experience_bullets_changed}",
        f"- Project bullets changed: {report.tailoring_summary.project_bullets_changed}",
        f"- Skills rows changed: {report.tailoring_summary.skills_rows_changed}",
        f"- Newly represented terms: {', '.join(report.tailoring_summary.newly_represented_terms) or 'None'}",
        f"- Supported terms already in base: {', '.join(report.tailoring_summary.already_present_terms) or 'None'}",
        f"- Critical supported represented: {sum(bool(row[1]) for row in critical_supported)} of {len(critical_supported)}",
        f"- Important supported represented: {sum(bool(row[1]) for row in important_supported)} of {len(important_supported)}",
        f"- Useful supported represented: {sum(bool(row[1]) for row in useful_supported)} of {len(useful_supported)}",
        f"- Unsupported requirements excluded: {sum(not _keyword_placements(report, item.term) for item in unsupported)} of {len(unsupported)}",
        "",
        "## Layout Acceptance",
        "",
        f"- Visual layout: {'PASS' if report.layout.passed else 'FAIL'}",
        f"- Skills rows: {'PASS' if not any(item.startswith('skills.') for item in report.layout.overflow_paragraph_ids) else 'FAIL'}",
        f"- Summary line budget: {'PASS' if 'summary' not in report.layout.overflow_paragraph_ids else 'FAIL'}",
        f"- Bullet geometry: {'PASS' if not report.layout.bullet_alignment_issues else 'FAIL'}",
        f"- Employer and section geometry: {'PASS' if not report.layout.employer_heading_issues and not report.layout.section_geometry_issues else 'FAIL'}",
        f"- Page boundaries and density: {'PASS' if not report.layout.boundary_issues else 'FAIL'}",
        f"- Font inventory: {'PASS' if not report.layout.font_inventory_changed else 'FAIL'}",
        "- Layout repair trace:",
        *(f"  - {item}" for item in report.layout_repairs),
        *([] if report.layout_repairs else ["  - None"]),
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
        f"- {item.term} [{item.context.value}]: "
        f"{item.rejection_reason or 'insufficient hiring signal'}"
        + (f" Context: {' | '.join(item.context_snippets)}" if item.context_snippets else "")
        for item in rejected
    )
    lines.extend(["", "## Claim Risks", ""])
    lines.extend(
        f"- **{risk.risk_level.value.upper()}** {risk.claim} "
        f"({risk.selected_placement}): {risk.explanation}"
        for risk in report.claim_risks
    )
    if report.keyword_coverage:
        lines.extend(
            [
                "## Technology and method coverage",
                "",
                "| Term | Status | Final placement |",
                "| --- | --- | --- |",
            ]
        )
        for row in report.keyword_coverage:
            lines.append(
                f"| {row.term} | {row.status} | {', '.join(row.placements) or row.explanation} |"
            )
        lines.append("")
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
                f"- Exact keywords added to this paragraph: {', '.join(change.added_terms) or 'none'}",
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
    lines.extend(["", "## Stretch Lab — Review Only", "", report.stretch_lab.disclaimer, ""])
    lines.extend(["### Transferable Opportunities", ""])
    lines.extend(
        f"- **{item.target_term}**: {item.rationale} Review: {item.review_question}"
        for item in report.stretch_lab.transferable_opportunities
    )
    if not report.stretch_lab.transferable_opportunities:
        lines.append("- None")
    lines.extend(["", "### Evidence Gaps", ""])
    for gap in report.stretch_lab.gaps:
        lines.extend(
            [
                f"- **{gap.target_term}** ({gap.category}, importance "
                f"{gap.hiring_importance:.0f}): {gap.why_it_matters}",
                f"  - Proof needed: {'; '.join(gap.proof_needed)}",
                f"  - After confirmation: {gap.language_after_confirmation}",
            ]
        )
    if not report.stretch_lab.gaps:
        lines.append("- None")
    lines.extend(["", "### Proposed Gap-Closing Projects", ""])
    for project in report.stretch_lab.proposed_projects:
        lines.extend(
            [
                f"#### {project.title}",
                "",
                "- Status: PROPOSED — NOT COMPLETED — NOT EXPORTABLE",
                f"- Target terms: {', '.join(project.target_terms)}",
                f"- Objective: {project.objective}",
                "- Build steps:",
                *(f"  - {step}" for step in project.build_steps),
                "- Evidence to collect:",
                *(f"  - {item}" for item in project.evidence_to_collect),
                f"- Resume use: {project.resume_language_after_completion}",
                "",
            ]
        )
    if not report.stretch_lab.proposed_projects:
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


def _usage_total(report: TransformationReport, field: str) -> str:
    if not report.model_usage or any(getattr(call, field) is None for call in report.model_usage):
        return "Not available for all calls"
    return str(sum(getattr(call, field) for call in report.model_usage))
