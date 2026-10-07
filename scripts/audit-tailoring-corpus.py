from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.planning.draft import draft_distribution_feedback
from aiadapply_v2.schemas import DraftTechnology
from aiadapply_v2.text import contains_term, split_skill_values

BASE_RESUME = Path("data/resumes/Brian_Aiad_BASE.docx")
MAX_ATS_DOCX_BYTES = 2_500_000
AWKWARD_PATTERNS = {
    "duplicate comma": re.compile(r",\s*,"),
    "duplicate SLA wording": re.compile(
        r"\bSLA(?:s)?\s+and\s+Service Level Agreements\b", re.IGNORECASE
    ),
    "literal collaboration construction": re.compile(
        r"\bcoordinating cross-functional collaboration\b", re.IGNORECASE
    ),
    "literal customer-service list": re.compile(
        r"\bthrough customer service, user-access management\b", re.IGNORECASE
    ),
}


def audit_run(run_dir: Path) -> dict[str, object]:
    report_path = run_dir / "transformation_report.json"
    errors: list[str] = []
    if not report_path.is_file():
        return {"run": str(run_dir), "passed": False, "errors": ["missing output artifact"]}

    report = json.loads(report_path.read_text(encoding="utf-8"))
    docx_path = (
        run_dir
        / str(report.get("output_docx", "Brian_Aiad_resume.docx"))
        .replace("\\", "/")
        .rsplit("/", 1)[-1]
    )
    pdf_path = (
        run_dir
        / str(report.get("output_pdf", "Brian_Aiad_resume.pdf"))
        .replace("\\", "/")
        .rsplit("/", 1)[-1]
    )
    if not docx_path.is_file() or not pdf_path.is_file():
        return {"run": str(run_dir), "passed": False, "errors": ["missing output artifact"]}
    draft_mode = report.get("tailoring_mode") == "aggressive_draft"
    drafts = (
        [DraftTechnology.model_validate(t) for t in report.get("draft_technologies", [])]
        if draft_mode
        else []
    )
    validation = report["validation"]
    layout = report["layout"]
    if not validation["passed"]:
        errors.append("deterministic validation failed")
    if not layout["passed"] or layout["page_count"] != 1:
        errors.append(f"layout is not a passing one-page result ({layout['page_count']} pages)")
    if docx_path.stat().st_size > MAX_ATS_DOCX_BYTES:
        errors.append(f"DOCX exceeds ATS size gate ({docx_path.stat().st_size} bytes)")

    base = parse_resume_docx(BASE_RESUME)
    final = parse_resume_docx(docx_path)
    base_by_id = {item.paragraph_id: item for item in base.paragraphs}
    final_by_id = {item.paragraph_id: item for item in final.paragraphs}
    base_editable_chars = sum(len(base_by_id[item].text) for item in base.editable_paragraph_ids)
    final_editable_chars = sum(len(final_by_id[item].text) for item in base.editable_paragraph_ids)
    retention = final_editable_chars / max(base_editable_chars, 1)
    if retention < 0.90:
        errors.append(f"editable information density fell below 90% ({retention:.1%})")

    for paragraph_id in (
        "skills.technical_support",
        "skills.apis_identity",
        "skills.languages_dbs",
        "skills.cloud_systems",
        "skills.tools",
    ):
        original = split_skill_values(base_by_id[paragraph_id].text.split(":", 1)[1])
        candidate = split_skill_values(final_by_id[paragraph_id].text.split(":", 1)[1])
        missing = [
            skill for skill in original if skill.casefold() not in {x.casefold() for x in candidate}
        ]
        if missing and not draft_mode:
            errors.append(f"{paragraph_id} removed base skills: {', '.join(missing)}")

    final_text = "\n".join(item.text for item in final.paragraphs)
    base_text = "\n".join(item.text for item in base.paragraphs)
    matches = {
        item["target_term"].casefold(): item for item in report["transferability_map"]["matches"]
    }
    for keyword in report["keywords"]:
        match = matches.get(keyword["normalized"])
        if not match or match["strength"] not in {"unsupported", "weakly_transferable"}:
            continue
        term = keyword["term"]
        permitted = next((t for t in drafts if t.term.casefold() == term.casefold()), None)
        if permitted:
            placements = [p for p in final.paragraphs if contains_term(p.text, term)]
            for p in placements:
                if contains_term(base_by_id[p.paragraph_id].text, term):
                    continue
                if p.paragraph_id not in permitted.paragraph_ids and not p.paragraph_id.startswith(
                    "skills."
                ):
                    errors.append(
                        f"draft technology outside allowed scope: {term} in {p.paragraph_id}"
                    )
                elif not any(
                    risk["claim"].casefold() == term.casefold()
                    and risk["selected_placement"] == p.paragraph_id
                    and risk["export_allowed"]
                    for risk in report["claim_risks"]
                ):
                    errors.append(
                        f"draft technology missing review flag: {term} in {p.paragraph_id}"
                    )
            continue
        if contains_term(final_text, term) and not contains_term(base_text, term):
            errors.append(f"non-exportable term leaked into final resume: {term}")

    texts = {p.paragraph_id: p.text for p in final.paragraphs}
    errors.extend(draft_distribution_feedback(drafts, texts))
    for target in drafts:
        if target.required and not any(
            contains_term(texts.get(pid, ""), target.term) for pid in target.paragraph_ids
        ):
            errors.append(f"required project technology missing: {target.term}")

    for label, pattern in AWKWARD_PATTERNS.items():
        if pattern.search(final_text):
            errors.append(label)

    return {
        "run": str(run_dir),
        "company": report["job"]["company"],
        "role": report["job"]["title"],
        "coverage": validation["keyword_coverage"],
        "retention": round(100 * retention, 2),
        "docx_bytes": docx_path.stat().st_size,
        "review_flags": len(report["claim_risks"]),
        "passed": not errors,
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit completed tailoring benchmark runs.")
    parser.add_argument("run_dirs", nargs="+", type=Path)
    parser.add_argument("--json-out", type=Path)
    args = parser.parse_args()

    results = [audit_run(path) for path in args.run_dirs]
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(results, indent=2), encoding="utf-8")

    for result in results:
        marker = "PASS" if result["passed"] else "FAIL"
        print(
            f"{marker:4} | {result.get('company', '?'):22} | "
            f"coverage {result.get('coverage', 0):6.2f}% | "
            f"retention {result.get('retention', 0):6.2f}% | "
            f"DOCX {result.get('docx_bytes', 0):7} B | {result['run']}"
        )
        for error in result["errors"]:
            print(f"       - {error}")
    return 0 if all(result["passed"] for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
