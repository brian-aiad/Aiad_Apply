from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import Protocol

from aiadapply_v2.auditing import write_character_audit
from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.documents.writer import write_resume_candidate
from aiadapply_v2.evidence.loaders import build_evidence_graph
from aiadapply_v2.grading.keywords import grade_job_keywords, important_keywords
from aiadapply_v2.layout.renderer import (
    apply_pdf_layout_budgets,
    inspect_pdf,
    render_docx_to_pdf,
)
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify
from aiadapply_v2.planning.rewrite_plan import all_proposed_text, collect_claim_risks
from aiadapply_v2.profiling.role_profile import build_target_role_profile
from aiadapply_v2.reporting.writer import write_transformation_report
from aiadapply_v2.schemas import (
    ClaimRisk,
    EvidenceStrength,
    JobKeyword,
    LayoutResult,
    ProposedSkillLine,
    ReasoningResult,
    ResumeDocument,
    ResumeEvidenceGraph,
    RewritePlan,
    RiskLevel,
    TargetRoleProfile,
    TransferabilityMap,
    TransformationReport,
    ValidationResult,
)
from aiadapply_v2.semantic.matcher import (
    SemanticEncoder,
    SentenceTransformerEncoder,
    build_transferability_map,
)
from aiadapply_v2.text import contains_term
from aiadapply_v2.validation.resume import (
    validate_candidate_docx,
    validate_rewrite_plan,
)

PIPELINE_VERSION = "0.3.0"
OUTPUT_BASENAME = "Brian_Aiad_resume"


class TransformationError(RuntimeError):
    pass


class Reasoner(Protocol):
    name: str

    def reason(
        self,
        *,
        job_description: str,
        preliminary_profile: TargetRoleProfile,
        keywords: list[JobKeyword],
        document: ResumeDocument,
        evidence_graph: ResumeEvidenceGraph,
        preliminary_map: TransferabilityMap,
        revision_feedback: list[str] | None = None,
    ) -> ReasoningResult: ...


def transform_resume(
    *,
    raw_paste: str,
    base_resume: str | Path,
    output_dir: str | Path,
    reasoner: Reasoner,
    semantic_encoder: SemanticEncoder | None = None,
) -> TransformationReport:
    destination = Path(output_dir).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    job = parse_linkedin_simplify(raw_paste)
    keywords = grade_job_keywords(job)
    base = parse_resume_docx(base_resume)

    with tempfile.TemporaryDirectory(prefix="aiadapply-transform-") as temp_name:
        temp = Path(temp_name)
        baseline_docx = temp / "baseline.docx"
        shutil.copy2(base.source_path, baseline_docx)
        baseline_pdf = render_docx_to_pdf(baseline_docx, temp / "baseline-render")
        apply_pdf_layout_budgets(base, baseline_pdf)
        baseline_layout = inspect_pdf(baseline_pdf, document=base)
        base.baseline_page_count = baseline_layout.page_count
        base.baseline_rendered_lines = baseline_layout.rendered_lines
        if not baseline_layout.passed:
            raise TransformationError(
                "The source resume did not establish a valid one-page paragraph baseline."
            )

        graph = build_evidence_graph(base, keywords)
        profile = build_target_role_profile(job, keywords)
        encoder = semantic_encoder or SentenceTransformerEncoder()
        preliminary_map = build_transferability_map(profile, keywords, graph, encoder)
        revision_feedback: list[str] = []
        reasoning: ReasoningResult | None = None
        plan_validation: ValidationResult | None = None
        for _generation_attempt in range(2):
            reasoning = reasoner.reason(
                job_description=job.job_description,
                preliminary_profile=profile,
                keywords=keywords,
                document=base,
                evidence_graph=graph,
                preliminary_map=preliminary_map,
                revision_feedback=revision_feedback,
            )
            _normalize_reasoning_keyword_profile(reasoning, keywords)
            _ensure_important_keyword_placement(reasoning, keywords, base)
            _ensure_unsupported_risks(reasoning, keywords)
            plan_validation = validate_rewrite_plan(
                base,
                reasoning.rewrite_plan,
                keywords,
                reasoning.role_profile,
            )
            if plan_validation.passed:
                break
            revision_feedback = [
                issue.message for issue in plan_validation.issues if issue.severity == "error"
            ]
        if reasoning is None or plan_validation is None or not plan_validation.passed:
            assert plan_validation is not None
            messages = "; ".join(issue.message for issue in plan_validation.issues)
            raise TransformationError(
                f"Codex rewrite plan failed deterministic validation: {messages}"
            )

        selected_docx: Path | None = None
        selected_pdf: Path | None = None
        selected_validation: ValidationResult | None = None
        selected_layout = None
        last_layout: LayoutResult | None = None
        compressed_paragraph_ids: set[str] = set()
        for attempt in range(1, len(base.editable_paragraph_ids) + 2):
            attempt_dir = temp / f"attempt-{attempt}"
            attempt_docx = attempt_dir / f"candidate-{attempt}.docx"
            write_resume_candidate(
                base,
                reasoning.rewrite_plan,
                attempt_docx,
                compressed_paragraph_ids=compressed_paragraph_ids,
            )
            candidate_validation = validate_candidate_docx(
                base,
                str(attempt_docx),
                keywords,
            )
            candidate_validation.issues = [
                *plan_validation.issues,
                *candidate_validation.issues,
            ]
            candidate_validation.passed = not any(
                issue.severity == "error" for issue in candidate_validation.issues
            )
            if not candidate_validation.passed:
                metrics_or_structure = any(
                    issue.code
                    in {
                        "protected_text_changed",
                        "hyperlink_changed",
                        "structure_changed",
                        "protected_metrics_changed",
                        "new_numeric_claim",
                        "package_parts_changed",
                        "immutable_package_part_changed",
                        "document_format_skeleton_changed",
                        "section_properties_changed",
                        "format_paragraph_count_changed",
                        "paragraph_format_changed",
                        "run_format_changed",
                    }
                    for issue in candidate_validation.issues
                )
                if metrics_or_structure:
                    messages = "; ".join(issue.message for issue in candidate_validation.issues)
                    raise TransformationError(
                        f"Candidate failed protected-content validation: {messages}"
                    )
                continue
            attempt_pdf = render_docx_to_pdf(attempt_docx, attempt_dir / "rendered")
            layout = inspect_pdf(
                attempt_pdf,
                baseline_pdf=baseline_pdf,
                document=parse_resume_docx(attempt_docx),
                baseline_document=base,
                attempts=attempt,
            )
            last_layout = layout
            if layout.passed:
                selected_docx = attempt_docx
                selected_pdf = attempt_pdf
                selected_validation = candidate_validation
                selected_layout = layout
                break
            next_paragraph = _select_compression_candidate(
                base,
                reasoning.rewrite_plan,
                layout,
                compressed_paragraph_ids,
            )
            if not next_paragraph:
                break
            compressed_paragraph_ids.add(next_paragraph)

        if not selected_docx or not selected_pdf or not selected_validation or not selected_layout:
            details = (
                f" Last layout: pages={last_layout.page_count}, "
                f"overflow={last_layout.overflow_paragraph_ids}, "
                f"anchors={last_layout.section_anchor_deltas}."
                if last_layout
                else ""
            )
            raise TransformationError(
                "No candidate preserved the one-page visual baseline after targeted "
                f"paragraph compression.{details}"
            )

        output_docx = destination / f"{OUTPUT_BASENAME}.docx"
        output_pdf = destination / f"{OUTPUT_BASENAME}.pdf"
        shutil.copy2(selected_docx, output_docx)
        shutil.copy2(selected_pdf, output_pdf)
        selected_layout.pdf_path = output_pdf

    report = TransformationReport(
        job=job,
        keywords=keywords,
        role_profile=reasoning.role_profile,
        transferability_map=reasoning.transferability_map,
        rewrite_plan=reasoning.rewrite_plan,
        claim_risks=collect_claim_risks(reasoning.rewrite_plan),
        validation=selected_validation,
        layout=selected_layout,
        output_docx=output_docx,
        output_pdf=output_pdf,
        base_sha256=base.source_sha256,
        reasoner=reasoner.name,
        pipeline_version=PIPELINE_VERSION,
    )
    write_transformation_report(report, destination)
    write_character_audit(
        base=base,
        candidate_docx=output_docx,
        candidate_pdf=output_pdf,
        layout=selected_layout,
        output_dir=destination,
    )
    return report


def _normalize_reasoning_keyword_profile(
    reasoning: ReasoningResult,
    keywords: list[JobKeyword],
) -> None:
    important = important_keywords(keywords)
    accepted = [keyword for keyword in keywords if keyword.accepted]
    reasoning.role_profile.high_priority_keywords = [keyword.term for keyword in important]
    reasoning.role_profile.secondary_keywords = [
        keyword.term for keyword in accepted if keyword not in important
    ]
    reasoning.role_profile.noisy_rejected_keywords = [
        keyword.term for keyword in keywords if not keyword.accepted
    ]


def _ensure_important_keyword_placement(
    reasoning: ReasoningResult,
    keywords: list[JobKeyword],
    document: ResumeDocument,
) -> None:
    """Guarantee accepted Tier 1 terms survive the LLM and shorter skill fallbacks."""
    for keyword in important_keywords(keywords):
        proposed_text = "\n".join(all_proposed_text(reasoning.rewrite_plan))
        if contains_term(proposed_text, keyword.term):
            continue
        skill_line = _keyword_skill_line(reasoning.rewrite_plan, keyword)
        if not any(contains_term(skill, keyword.term) for skill in skill_line.skills):
            skill_line.skills.insert(0, keyword.term)
        if not any(contains_term(skill, keyword.term) for skill in skill_line.shorter_skills):
            skill_line.shorter_skills.insert(0, keyword.term)
    _trim_skill_lines_to_character_budgets(
        reasoning.rewrite_plan,
        document,
        important_keywords(keywords),
    )


def _keyword_skill_line(
    plan: RewritePlan,
    keyword: JobKeyword,
) -> ProposedSkillLine:
    preferred_id = "skills.technical_support"
    normalized = keyword.normalized
    if normalized in {
        "sox",
        "compliance",
        "internal controls",
        "information security",
    }:
        preferred_id = "skills.apis_identity"
    elif normalized in {
        "ticketing",
        "change management",
        "account management",
        "incident management",
    }:
        preferred_id = "skills.tools"
    elif normalized in {
        "devops",
        "cloud computing",
        "d365 f&o",
        "dynamics 365",
        "erp",
    }:
        preferred_id = "skills.cloud_systems"
    elif keyword.kind.value == "system":
        if normalized in {
            "python",
            "sql",
            "json",
            "bash",
            "powershell",
            "database",
        }:
            preferred_id = "skills.languages_dbs"
        elif normalized in {
            "linux",
            "unix",
            "operating systems",
            "azure",
            "aws",
            "google cloud",
            "firmware",
            "iot",
        }:
            preferred_id = "skills.cloud_systems"
        elif normalized in {
            "api",
            "apis",
            "rest apis",
            "oauth",
            "saml",
            "sso",
            "web services",
        }:
            preferred_id = "skills.apis_identity"
        else:
            preferred_id = "skills.tools"
    return next(
        (line for line in plan.skills.lines if line.paragraph_id == preferred_id),
        plan.skills.lines[0],
    )


def _trim_skill_lines_to_character_budgets(
    plan: RewritePlan,
    document: ResumeDocument,
    required: list[JobKeyword],
) -> None:
    metadata = {paragraph.paragraph_id: paragraph for paragraph in document.paragraphs}
    for line in plan.skills.lines:
        paragraph = metadata[line.paragraph_id]
        prefix = paragraph.text[: len(paragraph.text) - len(paragraph.text.lstrip())]
        prefix_match = paragraph.text.split(":", 1)[0] + ":"
        original_after_label = paragraph.text.split(":", 1)[1]
        alignment = original_after_label[
            : len(original_after_label) - len(original_after_label.lstrip())
        ]
        fixed_prefix = f"{prefix}{prefix_match}{alignment}"
        _trim_skill_values(line.skills, fixed_prefix, paragraph.character_budget, required)
        _trim_skill_values(
            line.shorter_skills,
            fixed_prefix,
            paragraph.character_budget,
            required,
        )


def _trim_skill_values(
    values: list[str],
    prefix: str,
    budget: int,
    required: list[JobKeyword],
) -> None:
    while len(f"{prefix}{', '.join(values)}") > budget:
        removable = next(
            (
                index
                for index in range(len(values) - 1, -1, -1)
                if not any(
                    contains_term(values[index], keyword.term)
                    or contains_term(keyword.term, values[index])
                    for keyword in required
                )
            ),
            None,
        )
        if removable is None:
            return
        values.pop(removable)


def _ensure_unsupported_risks(
    reasoning: ReasoningResult,
    keywords: list[JobKeyword],
) -> None:
    proposed_text = "\n".join(all_proposed_text(reasoning.rewrite_plan))
    known_risks = collect_claim_risks(reasoning.rewrite_plan)
    match_by_term = {
        match.target_term.casefold(): match for match in reasoning.transferability_map.matches
    }
    for keyword in keywords:
        match = match_by_term.get(keyword.normalized)
        if (
            not keyword.accepted
            or not contains_term(proposed_text, keyword.term)
            or not match
            or match.strength != EvidenceStrength.unsupported
        ):
            continue
        placement = _find_placement(reasoning, keyword.term)
        if any(
            risk.selected_placement == placement
            and (contains_term(risk.claim, keyword.term) or contains_term(keyword.term, risk.claim))
            for risk in known_risks
        ):
            continue
        new_risk = ClaimRisk(
            claim=keyword.term,
            target_requirement=match.target_requirement,
            evidence_ids=[match.evidence_id] if match.evidence_id else [],
            strength=EvidenceStrength.unsupported,
            risk_level=RiskLevel.high,
            explanation=(
                "Inserted because the target posting treats this term as important; "
                "the base resume does not directly substantiate it."
            ),
            selected_placement=placement,
            export_allowed=True,
        )
        reasoning.rewrite_plan.claim_risks.append(new_risk)
        known_risks.append(new_risk)


def _find_placement(reasoning: ReasoningResult, term: str) -> str:
    plan = reasoning.rewrite_plan
    if contains_term(plan.summary.text, term):
        return "summary"
    for line in plan.skills.lines:
        if any(contains_term(skill, term) for skill in line.skills):
            return line.paragraph_id
    for bullet in plan.bullets:
        if contains_term(bullet.text, term):
            return bullet.paragraph_id
    return "unknown"


def _select_compression_candidate(
    base: ResumeDocument,
    plan: RewritePlan,
    layout: LayoutResult,
    compressed: set[str],
) -> str | None:
    anchor_groups = {
        "SKILLS": {"summary"},
        "EXPERIENCE": {
            "summary",
            *(
                paragraph.paragraph_id
                for paragraph in base.paragraphs
                if paragraph.section == "skills"
            ),
        },
        "PROJECTS": {
            paragraph.paragraph_id
            for paragraph in base.paragraphs
            if paragraph.section.startswith("experience.") and paragraph.editable
        },
        "EDUCATION": {
            paragraph.paragraph_id
            for paragraph in base.paragraphs
            if paragraph.section.startswith("projects.") and paragraph.editable
        },
        "CERTIFICATIONS": {
            paragraph.paragraph_id
            for paragraph in base.paragraphs
            if paragraph.section.startswith("projects.") and paragraph.editable
        },
    }
    editable = set(base.editable_paragraph_ids)
    candidates = set(layout.overflow_paragraph_ids) & editable
    candidates -= compressed
    if candidates:
        scored = [
            (_compression_priority(base, plan, paragraph_id), paragraph_id)
            for paragraph_id in candidates
            if _has_shorter_candidate(plan, paragraph_id)
        ]
        if scored:
            return max(scored)[1]

    candidates = set()
    for anchor in ("SKILLS", "EXPERIENCE", "PROJECTS", "EDUCATION", "CERTIFICATIONS"):
        if layout.section_anchor_deltas.get(anchor, 0.0) > 2.5:
            candidates = anchor_groups[anchor]
            break
    if not candidates:
        candidates = set(base.editable_paragraph_ids)
    candidates -= compressed
    scored = [
        (_compression_priority(base, plan, paragraph_id), paragraph_id)
        for paragraph_id in candidates
        if _has_shorter_candidate(plan, paragraph_id)
    ]
    return max(scored)[1] if scored else None


def _compression_priority(
    base: ResumeDocument,
    plan: RewritePlan,
    paragraph_id: str,
) -> float:
    meta = next(item for item in base.paragraphs if item.paragraph_id == paragraph_id)
    if paragraph_id == "summary":
        full = plan.summary.text
    else:
        skill = next(
            (item for item in plan.skills.lines if item.paragraph_id == paragraph_id),
            None,
        )
        bullet = next(
            (item for item in plan.bullets if item.paragraph_id == paragraph_id),
            None,
        )
        full = (
            f"{skill.category}: {', '.join(skill.skills)}"
            if skill
            else bullet.text
            if bullet
            else ""
        )
    return len(full) / max(meta.character_budget, 1)


def _has_shorter_candidate(plan: RewritePlan, paragraph_id: str) -> bool:
    if paragraph_id == "summary":
        return len(plan.summary.shorter_text) < len(plan.summary.text)
    skill = next(
        (item for item in plan.skills.lines if item.paragraph_id == paragraph_id),
        None,
    )
    if skill:
        return len(", ".join(skill.shorter_skills)) < len(", ".join(skill.skills))
    bullet = next(
        (item for item in plan.bullets if item.paragraph_id == paragraph_id),
        None,
    )
    return bool(bullet and len(bullet.shorter_text) < len(bullet.text))
