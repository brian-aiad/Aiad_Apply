from __future__ import annotations

import json
import re
import shutil
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Literal, Protocol

from aiadapply_v2.auditing import write_character_audit
from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.documents.optimizer import write_ats_optimized_docx
from aiadapply_v2.documents.writer import write_resume_candidate
from aiadapply_v2.evidence.candidate_profile import (
    add_candidate_profile_evidence,
    apply_candidate_profile_to_keywords,
    load_candidate_profile,
)
from aiadapply_v2.evidence.loaders import (
    AUTOMATIC_CONTEXT_TERMS,
    SYSTEM_TERMS,
    TRANSFER_BRIDGES,
    build_evidence_graph,
    supports_automatic_context,
)
from aiadapply_v2.evidence.technical_policy import apply_technology_assessments
from aiadapply_v2.grading.keywords import (
    NON_PROSE_QUALIFICATIONS,
    grade_job_keywords,
    important_keywords,
)
from aiadapply_v2.layout.renderer import (
    apply_pdf_layout_budgets,
    inspect_pdf,
    render_docx_to_pdf,
)
from aiadapply_v2.naming import resume_basename
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify
from aiadapply_v2.planning.coverage import (
    build_keyword_coverage,
    candidate_technologies,
    coverage_feedback,
    is_coverage_target,
)
from aiadapply_v2.planning.draft import (
    allow_draft_technology_risks,
    draft_distribution_feedback,
    select_draft_technologies,
)
from aiadapply_v2.planning.quality import (
    SOFT_TERMS,
    demonstrates_ordinary_capability,
    substantive_reframe,
    tailoring_breadth,
    tailoring_feedback,
)
from aiadapply_v2.planning.rewrite_plan import all_proposed_text, collect_claim_risks
from aiadapply_v2.planning.stretch_lab import build_stretch_lab
from aiadapply_v2.profiling.role_profile import build_target_role_profile
from aiadapply_v2.reporting.writer import write_transformation_report
from aiadapply_v2.schemas import (
    ClaimRisk,
    DraftTechnology,
    EvidenceStrength,
    JobKeyword,
    KeywordDecisionRecord,
    LayoutResult,
    ProposedSkillLine,
    ReasoningResult,
    ResumeChangeRecord,
    ResumeDocument,
    ResumeEvidenceGraph,
    ResumeParagraph,
    RewritePlan,
    RiskLevel,
    TailoringSummary,
    TargetRoleProfile,
    TransferabilityMap,
    TransformationReport,
    ValidationIssue,
    ValidationResult,
)
from aiadapply_v2.semantic.matcher import (
    ALWAYS_WEAK_TRANSFER_TERMS,
    SemanticEncoder,
    SentenceTransformerEncoder,
    build_transferability_map,
)
from aiadapply_v2.text import (
    contains_term,
    normalized_term,
    preserves_source_term,
    split_skill_values,
)
from aiadapply_v2.validation.resume import (
    validate_candidate_docx,
    validate_rewrite_plan,
)

PIPELINE_VERSION = "0.7.0"
MAX_DOCUMENT_CANDIDATES = 24
SUMMARY_STRENGTH_TERMS = {
    "critical thinking",
    "cross-functional collaboration",
    "customer service",
    "organizational skills",
    "problem-solving",
    "task prioritization",
    "verbal communication",
    "written and verbal communication skills",
}
SOURCE_CONTEXT_TERMS = (
    "carrier",
    "campus operations",
    "classroom AV incidents",
    "license management",
    "live environments",
    "independently",
    "operational system disruptions",
    "room scheduling conflicts",
    "staff and volunteers",
    "triaging failures",
    "Wednesday and Saturday",
)
TRANSFERABLE_REVIEW_TERMS = {
    "business analysis",
    "change management",
    "customer needs",
    "help desk",
    "knowledge base",
    "release analysis",
    "system maintenance",
    "system testing",
    "vendor interfaces",
    "workflow documentation",
}


class TransformationError(RuntimeError):
    pass


class TailoringQualityError(TransformationError):
    def __init__(self, feedback: list[str], model_calls: int) -> None:
        super().__init__("Final tailoring needs revision: " + "; ".join(feedback))
        self.feedback = feedback
        self.model_calls = model_calls


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
    candidate_profile: str | Path | None = None,
    progress: Callable[[str], None] | None = None,
    aggressive_draft: bool = False,
) -> TransformationReport:
    feedback: list[str] = []
    previous_calls = 0
    usage_start = len(getattr(reasoner, "usage", []))
    for quality_attempt in range(3):
        try:
            report = _transform_resume_attempt(
                raw_paste=raw_paste,
                base_resume=base_resume,
                output_dir=output_dir,
                reasoner=reasoner,
                semantic_encoder=semantic_encoder,
                candidate_profile=candidate_profile,
                progress=progress,
                quality_feedback=feedback,
                aggressive_draft=aggressive_draft,
                allow_partial_draft=quality_attempt == 2,
            )
            report.model_calls += previous_calls
            report.model_usage = list(getattr(reasoner, "usage", [])[usage_start:])
            write_transformation_report(report, Path(output_dir).resolve())
            return report
        except TailoringQualityError as error:
            if quality_attempt == 2:
                raise
            previous_calls += error.model_calls
            feedback = error.feedback
            _emit_progress(
                progress, "Revising after final tailoring review: " + "; ".join(feedback)
            )
    raise AssertionError("Unreachable quality retry state")


def _transform_resume_attempt(
    *,
    raw_paste: str,
    base_resume: str | Path,
    output_dir: str | Path,
    reasoner: Reasoner,
    semantic_encoder: SemanticEncoder | None,
    candidate_profile: str | Path | None,
    progress: Callable[[str], None] | None,
    quality_feedback: list[str],
    aggressive_draft: bool,
    allow_partial_draft: bool,
) -> TransformationReport:
    _emit_progress(progress, "Parsing and grading the job posting")
    destination = Path(output_dir).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    job = parse_linkedin_simplify(raw_paste)
    output_basename = resume_basename(job.company, job.title)
    loaded_candidate_profile = load_candidate_profile(candidate_profile)
    base = parse_resume_docx(base_resume)
    keywords = grade_job_keywords(
        job, additional_technologies=candidate_technologies(base, loaded_candidate_profile)
    )
    apply_candidate_profile_to_keywords(
        keywords, loaded_candidate_profile, aggressive_draft=aggressive_draft
    )

    with tempfile.TemporaryDirectory(prefix="aiadapply-transform-") as temp_name:
        _emit_progress(progress, "Rendering and measuring the protected base resume")
        temp = Path(temp_name)
        baseline_docx = temp / "baseline.docx"
        shutil.copy2(base.source_path, baseline_docx)
        baseline_pdf = render_docx_to_pdf(
            baseline_docx,
            temp / "baseline-render",
            font_source_docx=baseline_docx,
        )
        apply_pdf_layout_budgets(base, baseline_pdf)
        baseline_layout = inspect_pdf(baseline_pdf, document=base)
        base.baseline_page_count = baseline_layout.page_count
        base.baseline_rendered_lines = baseline_layout.rendered_lines
        if not baseline_layout.passed:
            if baseline_layout.collapsed_tab_items:
                raise TransformationError(
                    "The PDF renderer collapsed a protected tab separator in the base resume "
                    f"({', '.join(baseline_layout.collapsed_tab_items)}). The application stopped "
                    "before tailoring so it cannot produce a visually joined employer/date line. "
                    "On Windows, leave AIADAPPLY_RENDERER unset so Microsoft Word can render the "
                    "document; otherwise verify that the template fonts and LibreOffice are current."
                )
            raise TransformationError(
                "The source resume did not establish a valid one-page paragraph baseline."
            )

        _emit_progress(progress, "Building candidate evidence and role transferability")
        graph = build_evidence_graph(base, keywords)
        add_candidate_profile_evidence(graph, loaded_candidate_profile, keywords)
        if aggressive_draft:
            graph.draft_technologies = select_draft_technologies(base, keywords, graph)
        draft_terms = {normalized_term(item.term) for item in graph.draft_technologies}
        profile = build_target_role_profile(job, keywords)
        encoder = semantic_encoder or SentenceTransformerEncoder()
        preliminary_map = build_transferability_map(profile, keywords, graph, encoder)
        revision_feedback: list[str] = list(quality_feedback)
        reasoning: ReasoningResult | None = None
        plan_validation: ValidationResult | None = None
        discovered_technologies: set[str] = set()
        for generation_attempt in range(1, 3):
            _emit_progress(
                progress,
                f"Generating the structured rewrite plan ({generation_attempt}/2)",
            )
            reasoning = reasoner.reason(
                job_description=job.job_description,
                preliminary_profile=profile,
                keywords=keywords,
                document=base,
                evidence_graph=graph,
                preliminary_map=preliminary_map,
                revision_feedback=revision_feedback,
            )
            raw_reasoning = reasoning.model_copy(deep=True)
            if graph.automatic_technical_policy:
                # A per-posting assessment can discover a tool absent from the
                # lexical catalog. Require literal posting presence, then grade
                # it using the same importance/context rules as every other term.
                discovered_technologies.update(
                    item.term.strip() for item in reasoning.technology_assessments
                    if 1 < len(item.term.strip()) <= 80
                    and contains_term(job.job_description, item.term.strip())
                )
                if discovered_technologies:
                    keywords = grade_job_keywords(job, additional_technologies=[
                        *candidate_technologies(base, loaded_candidate_profile),
                        *sorted(discovered_technologies),
                    ])
                    apply_candidate_profile_to_keywords(keywords, loaded_candidate_profile)
                    graph = build_evidence_graph(base, keywords)
                    add_candidate_profile_evidence(graph, loaded_candidate_profile, keywords)
                    profile = build_target_role_profile(job, keywords)
            assessment_feedback = apply_technology_assessments(
                base, keywords, graph, reasoning.technology_assessments,
            )
            if graph.automatic_technical_policy:
                # Previously unseen common tools now have candidate-authorized
                # contexts. Recompute before scope normalization and validation.
                preliminary_map = build_transferability_map(profile, keywords, graph, encoder)
            _normalize_reasoning_keyword_profile(reasoning, keywords)
            _merge_transferability_map(reasoning, preliminary_map, keywords)
            reasoning.stretch_lab = build_stretch_lab(
                reasoning.role_profile,
                keywords,
                reasoning.transferability_map,
                reasoning.stretch_lab,
            )
            _prune_direct_evidence_risks(reasoning, graph)
            _ensure_target_identity(reasoning)
            _normalize_skill_display(reasoning.rewrite_plan)
            non_exportable_terms = list(
                dict.fromkeys(
                    [
                        *reasoning.transferability_map.unsupported_terms,
                        *reasoning.transferability_map.weakly_transferable_terms,
                    ]
                )
            )
            supported_keywords = _supported_keywords(reasoning, keywords)
            non_exportable_terms = [
                term for term in non_exportable_terms if normalized_term(term) not in draft_terms
            ]
            supported_keywords = [
                keyword
                for keyword in keywords
                if keyword in supported_keywords or keyword.normalized in draft_terms
            ]
            skill_ineligible_terms = {
                *_certification_only_terms(preliminary_map),
                *NON_PROSE_QUALIFICATIONS,
            }
            skill_ineligible_terms -= draft_terms
            _order_rewrite_variants(reasoning.rewrite_plan)
            _remove_unproven_reproduction(reasoning.rewrite_plan, base)
            restoration_feedback = _restore_unjustified_shortening(
                reasoning.rewrite_plan, base, supported_keywords, draft_terms=draft_terms
            )
            _ensure_target_identity(reasoning)
            _fuse_skill_inventory(
                reasoning.rewrite_plan,
                base,
                keywords,
                non_exportable_terms,
                skill_ineligible_terms,
            )
            _ensure_important_keyword_placement(reasoning, supported_keywords, base)
            _normalize_acronym_redundancy(reasoning.rewrite_plan)
            _normalize_prose_collocations(reasoning.rewrite_plan)
            _normalize_claim_risk_placements(reasoning, supported_keywords)
            _prune_direct_evidence_risks(reasoning, graph)
            _ensure_transferable_review_risks(reasoning, keywords, base)
            _prune_absent_claim_risks(reasoning.rewrite_plan, keywords)
            _ensure_unsupported_risks(reasoning, keywords)
            allow_draft_technology_risks(reasoning.rewrite_plan, graph.draft_technologies)
            _enforce_export_boundaries(reasoning.rewrite_plan, base)
            # A non-exportable claim can reset an entire paragraph to its protected source.
            # Reapply only deterministic, evidence-supported identity and terminology after
            # that reset so a model-authored unsafe placement cannot erase safe requirements.
            _ensure_target_identity(reasoning)
            _ensure_important_keyword_placement(reasoning, supported_keywords, base)
            _repair_equal_length_fallbacks(reasoning.rewrite_plan, base, draft_terms=draft_terms)
            plan_validation = validate_rewrite_plan(
                base,
                reasoning.rewrite_plan,
                supported_keywords,
                reasoning.role_profile,
                forbidden_terms=non_exportable_terms,
                coverage_keywords=keywords,
                required_keywords=_direct_keywords(reasoning, supported_keywords),
            )
            proposal_texts = {p.paragraph_id: p.text for p in base.paragraphs}
            proposal_texts.update({b.paragraph_id: b.text for b in reasoning.rewrite_plan.bullets})
            proposal_texts.update(
                {
                    line.paragraph_id: ", ".join(line.skills)
                    for line in reasoning.rewrite_plan.skills.lines
                }
            )
            proposal_texts["summary"] = reasoning.rewrite_plan.summary.text
            shorter_texts = dict(proposal_texts)
            shorter_texts.update({b.paragraph_id: b.shorter_text for b in reasoning.rewrite_plan.bullets})
            shorter_texts.update({line.paragraph_id: ", ".join(line.shorter_skills)
                                  for line in reasoning.rewrite_plan.skills.lines})
            shorter_texts["summary"] = reasoning.rewrite_plan.summary.shorter_text
            for message in [
                *assessment_feedback,
                *coverage_feedback(base, keywords, graph, proposal_texts),
                *(f"Shorter variant: {message}" for message in
                  coverage_feedback(base, keywords, graph, shorter_texts)),
                *draft_distribution_feedback(graph.draft_technologies, proposal_texts),
                *tailoring_feedback(base, proposal_texts, keywords, graph, reasoning.transferability_map),
            ]:
                plan_validation.issues.append(
                    ValidationIssue(code="keyword_coverage_or_scope", message=message)
                )
            plan_validation.passed = not any(
                issue.severity == "error" for issue in plan_validation.issues
            )
            if plan_validation.passed:
                _prune_resolved_nonexportable_risks(reasoning.rewrite_plan, keywords)
                break
            # Preserve failed evidence and transformations for diagnosis. These
            # review-only JSON files are never application-ready resume artifacts.
            call_number = len(getattr(reasoner, "usage", [])) or generation_attempt
            (destination / f"rejected-plan-{call_number}.json").write_text(
                json.dumps({
                    "status": "rejected",
                    "raw_reasoning": raw_reasoning.model_dump(mode="json"),
                    "normalized_reasoning": reasoning.model_dump(mode="json"),
                    "validation": plan_validation.model_dump(mode="json"),
                    "restoration_feedback": restoration_feedback,
                }, indent=2), encoding="utf-8",
            )
            revision_feedback = [
                *quality_feedback,
                *restoration_feedback,
                *[
                    f"{issue.paragraph_id or 'plan'}: {issue.message}"
                    for issue in plan_validation.issues
                    if issue.severity == "error"
                ],
            ]
            _emit_progress(
                progress,
                "Rewrite plan needs correction: " + "; ".join(revision_feedback),
            )
        if reasoning is None or plan_validation is None or not plan_validation.passed:
            assert plan_validation is not None
            messages = "; ".join(issue.message for issue in plan_validation.issues)
            raise TransformationError(
                f"Codex rewrite plan failed deterministic validation: {messages}"
            )

        # Model fallbacks must satisfy the response schema first. Once the plan
        # is valid, replace over-compressed variants with evidence-safe source
        # wording before any layout candidate can select them.
        _sanitize_shorter_fallbacks(reasoning.rewrite_plan, base, draft_terms=draft_terms)
        _ensure_target_identity(reasoning)

        selected_docx: Path | None = None
        selected_pdf: Path | None = None
        selected_validation: ValidationResult | None = None
        selected_layout = None
        last_layout: LayoutResult | None = None
        last_skill_overflow: list[str] = []
        compressed_paragraph_ids: set[str] = set()
        reverted_paragraph_ids: set[str] = set()
        layout_repairs: list[str] = []
        relocated_skills: set[str] = set()
        document_candidates = 0
        for attempt in range(1, MAX_DOCUMENT_CANDIDATES + 1):
            document_candidates = attempt
            _emit_progress(progress, f"Writing and validating document candidate {attempt}")
            attempt_dir = temp / f"attempt-{attempt}"
            attempt_docx = attempt_dir / f"candidate-{attempt}.docx"
            write_resume_candidate(
                base,
                reasoning.rewrite_plan,
                attempt_docx,
                compressed_paragraph_ids=compressed_paragraph_ids,
                reverted_paragraph_ids=reverted_paragraph_ids,
            )
            candidate_validation = validate_candidate_docx(
                base,
                str(attempt_docx),
                supported_keywords,
                coverage_keywords=keywords,
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
            attempt_pdf = render_docx_to_pdf(
                attempt_docx,
                attempt_dir / "rendered",
                font_source_docx=attempt_docx,
            )
            _emit_progress(progress, f"Inspecting rendered PDF candidate {attempt}")
            layout = inspect_pdf(
                attempt_pdf,
                baseline_pdf=baseline_pdf,
                document=parse_resume_docx(attempt_docx),
                baseline_document=base,
                attempts=attempt,
                require_single_line_skills=True,
            )
            last_layout = layout
            skill_overflow = any(
                layout.paragraph_line_counts.get(line.paragraph_id, 1) > 1
                for line in reasoning.rewrite_plan.skills.lines
            )
            last_skill_overflow = [
                line.paragraph_id
                for line in reasoning.rewrite_plan.skills.lines
                if layout.paragraph_line_counts.get(line.paragraph_id, 1) > 1
            ]
            if layout.passed and not skill_overflow:
                selected_docx = attempt_docx
                selected_pdf = attempt_pdf
                selected_validation = candidate_validation
                selected_layout = layout
                break
            # Skills are fixed one-row slots. LibreOffice can wrap a row that is
            # technically within the source character budget (notably the long
            # APIs & Identity row), so repair that deterministic overflow before
            # considering experience compression or another model correction.
            if skill_overflow:
                # Repair the rows actually rendered, including any compressed
                # or restored variants. Otherwise the next write can ignore a
                # repair and reproduce the same overflow indefinitely.
                _use_rendered_skill_rows(reasoning.rewrite_plan, parse_resume_docx(attempt_docx))
                skill_ids = {line.paragraph_id for line in reasoning.rewrite_plan.skills.lines}
                compressed_paragraph_ids.difference_update(skill_ids)
                reverted_paragraph_ids.difference_update(skill_ids)
            if skill_overflow and _repair_skill_row_overflow(
                reasoning.rewrite_plan,
                base,
                keywords,
                layout.paragraph_line_counts,
                layout.baseline_paragraph_line_counts,
                relocated_skills=relocated_skills,
            ):
                changed_rows = [
                    line.paragraph_id
                    for line in reasoning.rewrite_plan.skills.lines
                    if layout.paragraph_line_counts.get(line.paragraph_id, 1) > 1
                ]
                layout_repairs.append(
                    "Trimmed or relocated the lowest-value supported skill in "
                    + ", ".join(changed_rows)
                    + " after rendered overflow."
                )
                continue
            if skill_overflow:
                base_text = {
                    paragraph.paragraph_id: paragraph.text for paragraph in base.paragraphs
                }
                skill_reversion = next(
                    (
                        paragraph_id
                        for paragraph_id in last_skill_overflow
                        if paragraph_id not in reverted_paragraph_ids
                        and _planned_text(reasoning.rewrite_plan, paragraph_id)
                        != base_text.get(paragraph_id, "")
                    ),
                    None,
                )
                if skill_reversion:
                    reverted_paragraph_ids.add(skill_reversion)
                    compressed_paragraph_ids.discard(skill_reversion)
                    layout_repairs.append(
                        f"Restored protected wording in {skill_reversion} after its skill row "
                        "could not fit as one line."
                    )
                    continue
            expansion = _select_expansion_candidate(
                base,
                reasoning.rewrite_plan,
                layout,
                reverted_paragraph_ids,
            )
            if expansion:
                reverted_paragraph_ids.add(expansion)
                compressed_paragraph_ids.discard(expansion)
                layout_repairs.append(
                    f"Restored protected wording in {expansion} to preserve vertical rhythm."
                )
                continue
            next_paragraph = _select_compression_candidate(
                base,
                reasoning.rewrite_plan,
                layout,
                compressed_paragraph_ids | reverted_paragraph_ids,
            )
            if next_paragraph:
                compressed_paragraph_ids.add(next_paragraph)
                layout_repairs.append(
                    f"Selected the validated shorter wording for {next_paragraph} after its "
                    "rendered geometry exceeded the protected budget."
                )
                continue
            reverted = _select_overflow_reversion_candidate(
                base,
                reasoning.rewrite_plan,
                layout,
                reverted_paragraph_ids,
            )
            if not reverted:
                break
            reverted_paragraph_ids.add(reverted)
            compressed_paragraph_ids.discard(reverted)
            layout_repairs.append(
                f"Restored protected wording in {reverted} after validated shorter wording "
                "still exceeded the one-page geometry."
            )

        if not selected_docx or not selected_pdf or not selected_validation or not selected_layout:
            details = (
                f" Last layout: pages={last_layout.page_count}, "
                f"overflow={last_layout.overflow_paragraph_ids}, "
                f"anchors={last_layout.section_anchor_deltas}, "
                f"skill_overflow={last_skill_overflow}, "
                f"bullet_alignment={last_layout.bullet_alignment_issues}, "
                f"boundaries={last_layout.boundary_issues}."
                if last_layout
                else ""
            )
            raise TailoringQualityError(
                [
                    "The rewrite did not fit the protected one-page layout after all "
                    f"{MAX_DOCUMENT_CANDIDATES} deterministic repair candidates.{details} "
                    "Keep every changed bullet within its source line budget. Shorten "
                    "non-project prose first, distribute the required draft technologies "
                    "across project bullets, and keep those terms in shorter variants.",
                    *layout_repairs,
                ],
                generation_attempt,
            )

        final_candidate = parse_resume_docx(selected_docx)
        partial_draft_warning: ValidationIssue | None = None
        final_feedback = tailoring_feedback(
            base,
            {paragraph.paragraph_id: paragraph.text for paragraph in final_candidate.paragraphs},
            keywords,
            graph,
            reasoning.transferability_map,
        )
        final_feedback.extend(
            coverage_feedback(
                base,
                keywords,
                graph,
                {
                    paragraph.paragraph_id: paragraph.text
                    for paragraph in final_candidate.paragraphs
                },
            )
        )
        final_feedback.extend(
            draft_distribution_feedback(
                graph.draft_technologies,
                {
                    paragraph.paragraph_id: paragraph.text
                    for paragraph in final_candidate.paragraphs
                },
            )
        )
        required_draft = [item for item in graph.draft_technologies if item.required]
        placed_draft = [
            item
            for item in required_draft
            if any(
                paragraph.paragraph_id in item.paragraph_ids
                and contains_term(paragraph.text, item.term)
                for paragraph in final_candidate.paragraphs
            )
        ]
        if (
            allow_partial_draft
            and final_feedback
            and all(message.startswith("Missing draft technology ") for message in final_feedback)
            and required_draft
            and len(placed_draft) >= (len(required_draft) + 1) // 2
        ):
            omitted = [item.term for item in required_draft if item not in placed_draft]
            partial_draft_warning = ValidationIssue(
                code="draft_technology_unplaced",
                message=(
                    "One-page layout limited the editable draft; add or revise these "
                    "posting technologies before applying: " + ", ".join(omitted)
                ),
                severity="warning",
            )
            layout_repairs.append(
                "Exported the best fitting draft after three rewrite attempts; "
                "remaining posting technologies need manual editing: " + ", ".join(omitted)
            )
            final_feedback = []
        if final_feedback:
            final_feedback.extend(layout_repairs)
            if graph.draft_technologies:
                final_feedback.append(
                    "Redistribute missing draft technologies across the allowed project bullets "
                    "instead of packing them into a single line. Preserve each required term in "
                    "both primary and shorter variants. Layout repair must not restore a source "
                    "bullet and silently erase its technology adaptations."
                )
                for paragraph in base.paragraphs:
                    if paragraph.paragraph_id in reverted_paragraph_ids:
                        final_feedback.append(
                            f"{paragraph.paragraph_id} was restored to source after overflow: "
                            f"fit {paragraph.line_budget} rendered line(s), approximately "
                            f"{len(paragraph.text)} source characters. Source: {paragraph.text}"
                        )
            raise TailoringQualityError(final_feedback, generation_attempt)

        output_docx = destination / f"{output_basename}.docx"
        output_pdf = destination / f"{output_basename}.pdf"
        write_ats_optimized_docx(selected_docx, output_docx)
        optimized_document = parse_resume_docx(output_docx)
        if [(p.paragraph_id, p.text) for p in optimized_document.paragraphs] != [
            (p.paragraph_id, p.text) for p in final_candidate.paragraphs
        ]:
            raise TransformationError(
                "ATS font optimization changed the validated resume text. "
                "The export cannot retain its coverage or draft review approval."
            )
        optimized_validation = validate_candidate_docx(
            base,
            str(output_docx),
            supported_keywords,
            coverage_keywords=keywords,
        )
        optimized_validation.issues = [
            *plan_validation.issues,
            *optimized_validation.issues,
        ]
        if partial_draft_warning is not None:
            optimized_validation.issues.append(partial_draft_warning)
        optimized_validation.passed = not any(
            issue.severity == "error" for issue in optimized_validation.issues
        )
        optimized_pdf = render_docx_to_pdf(
            output_docx,
            temp / "ats-output-render",
            font_source_docx=selected_docx,
        )
        optimized_layout = inspect_pdf(
            optimized_pdf,
            baseline_pdf=baseline_pdf,
            document=optimized_document,
            baseline_document=base,
            attempts=document_candidates,
            require_single_line_skills=True,
        )
        if not optimized_validation.passed or not optimized_layout.passed:
            validation_details = "; ".join(issue.message for issue in optimized_validation.issues)
            raise TransformationError(
                "ATS font optimization did not preserve the validated document and render. "
                f"Validation: {validation_details or 'passed'}. "
                f"Layout overflow: {optimized_layout.overflow_paragraph_ids}; "
                f"bullet alignment: {optimized_layout.bullet_alignment_issues}; "
                f"boundaries: {optimized_layout.boundary_issues}."
            )
        if output_docx.stat().st_size > 2_500_000:
            raise TransformationError("Final DOCX exceeds the 2.5 MB ATS parsing limit.")
        shutil.copy2(optimized_pdf, output_pdf)
        selected_validation = optimized_validation
        selected_layout = optimized_layout
        _emit_progress(progress, "Writing the transformation audit and final artifacts")
        selected_layout.pdf_path = output_pdf

    final_document = parse_resume_docx(output_docx)
    base_full_text = "\n".join(paragraph.text for paragraph in base.paragraphs)
    final_full_text = "\n".join(paragraph.text for paragraph in final_document.paragraphs)
    changes = _build_change_manifest(
        base, final_document, reasoning.rewrite_plan, compressed_paragraph_ids, keywords
    )
    for change in changes:
        draft_terms_in_change = [
            item.term
            for item in graph.draft_technologies
            if change.paragraph_id in item.paragraph_ids
            and contains_term(change.final_text, item.term)
        ]
        if draft_terms_in_change:
            change.risk_level = RiskLevel.high
            change.explanation = (
                "Editable draft adapts these posting technologies: "
                + ", ".join(draft_terms_in_change)
                + ". These placements are not confirmed experience; verify or edit before applying."
            )
    changed = [item for item in changes if item.change_type != "unchanged"]
    represented = [
        item
        for item in supported_keywords
        if item.accepted and contains_term(final_full_text, item.term)
    ]
    breadth = tailoring_breadth(base, {p.paragraph_id: p.text for p in final_document.paragraphs}, keywords, graph, preliminary_map)
    report = TransformationReport(
        job=job,
        keywords=keywords,
        keyword_decisions=_build_keyword_decisions(
            keywords,
            reasoning.transferability_map,
            final_document,
            base_document=base,
            draft_technologies=graph.draft_technologies,
        ),
        role_profile=reasoning.role_profile,
        transferability_map=reasoning.transferability_map,
        rewrite_plan=reasoning.rewrite_plan,
        stretch_lab=reasoning.stretch_lab,
        changes=changes,
        keyword_coverage=build_keyword_coverage(
            base, keywords, graph, {p.paragraph_id: p.text for p in final_document.paragraphs}
        ),
        technology_assessments=reasoning.technology_assessments,
        technology_summaries=reasoning.technology_summaries,
        tailoring_mode="aggressive_draft" if aggressive_draft else "evidence_only",
        draft_technologies=graph.draft_technologies,
        tailoring_summary=TailoringSummary(
            relevant_bullets=len(breadth["opportunities"]),
            substantive_bullets_rewritten=len(breadth["adapted"]),
            minimum_substantive_rewrites=breadth["minimum"],
            substantive_paragraph_ids=breadth["adapted"],
            experience_bullets_changed=sum(
                item.paragraph_kind.value == "bullet" and item.section.startswith("experience.")
                for item in changed
            ),
            project_bullets_changed=sum(
                item.paragraph_kind.value == "bullet" and item.section.startswith("projects.")
                for item in changed
            ),
            skills_rows_changed=sum(item.paragraph_kind.value == "skill_line" for item in changed),
            summary_changed=any(item.paragraph_id == "summary" for item in changed),
            newly_represented_terms=[
                item.term for item in represented if not contains_term(base_full_text, item.term)
            ],
            already_present_terms=[
                item.term for item in represented if contains_term(base_full_text, item.term)
            ],
        ),
        claim_risks=_final_claim_risks(reasoning.rewrite_plan, keywords, final_document),
        validation=selected_validation,
        layout=selected_layout,
        output_docx=output_docx,
        output_pdf=output_pdf,
        base_sha256=base.source_sha256,
        reasoner=reasoner.name,
        model_calls=generation_attempt,
        document_candidates=document_candidates,
        layout_repairs=layout_repairs,
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
    _emit_progress(progress, "Transformation complete")
    return report


def _emit_progress(progress: Callable[[str], None] | None, message: str) -> None:
    if progress is not None:
        progress(message)


def _build_keyword_decisions(
    keywords: list[JobKeyword],
    transferability: TransferabilityMap,
    final_document: ResumeDocument,
    *,
    draft_technologies: list[DraftTechnology] | None = None,
    base_document: ResumeDocument | None = None,
) -> list[KeywordDecisionRecord]:
    final_by_id = {
        paragraph.paragraph_id: paragraph.text for paragraph in final_document.paragraphs
    }
    match_by_term = {match.target_term.casefold(): match for match in transferability.matches}
    drafts = {normalized_term(item.term): item for item in draft_technologies or []}
    source_by_id = {paragraph.paragraph_id: paragraph.text for paragraph in base_document.paragraphs} if base_document else {}
    decisions: list[KeywordDecisionRecord] = []
    for keyword in keywords:
        placements = [
            paragraph_id
            for paragraph_id, text in final_by_id.items()
            if contains_term(text, keyword.term)
        ]
        demonstrated = [pid for pid, text in final_by_id.items() if ".bullet." in pid
                        and demonstrates_ordinary_capability(keyword.term, source_by_id.get(pid, ""), text)]
        match = match_by_term.get(keyword.normalized)
        evidence_level = match.strength if match is not None else EvidenceStrength.unsupported
        draft = drafts.get(keyword.normalized)
        draft_placements = [pid for pid in placements if draft and pid in draft.paragraph_ids]
        if draft_placements:
            explanation = (
                "Included as an unverified editable project adaptation in "
                + ", ".join(draft_placements)
                + ". Review this usage before applying; evidence for other placements is separate."
            )
        elif draft and draft.required:
            explanation = (
                "Required project adaptation is absent from the final draft; manual editing is needed."
                + (
                    " The term survives elsewhere, but that does not satisfy project coverage."
                    if placements
                    else ""
                )
            )
        elif placements:
            explanation = "Placed in the strongest natural resume location."
        elif not keyword.accepted:
            explanation = keyword.rejection_reason or "Rejected as low-value scanner noise."
        elif demonstrated:
            explanation = "Demonstrated by documented work in " + ", ".join(demonstrated) + "; exact phrase not added."
        elif evidence_level == EvidenceStrength.unsupported:
            explanation = "Not placed because candidate evidence does not substantiate it."
        elif (
            evidence_level == EvidenceStrength.direct
            and keyword.normalized in NON_PROSE_QUALIFICATIONS
        ):
            explanation = (
                "Satisfied by protected education or credential evidence; not repeated as a skill."
            )
        elif keyword.hiring_importance < 25:
            explanation = "Not placed because it is lower-priority or scanner-only language."
        else:
            explanation = "Supported by candidate evidence, but absent from the final resume. Review as an uncovered requirement."
        decisions.append(
            KeywordDecisionRecord(
                term=keyword.term,
                normalized=keyword.normalized,
                kind=keyword.kind,
                priority=keyword.priority,
                occurrences=keyword.occurrences,
                source_sections=keyword.source_sections,
                hiring_importance=keyword.hiring_importance,
                placement_utility=keyword.placement_utility,
                accepted=keyword.accepted,
                used=bool(placements),
                evidence_level=evidence_level,
                placements=placements,
                rejection_reason=keyword.rejection_reason,
                explanation=explanation,
                context=keyword.context,
                context_snippets=keyword.context_snippets,
            )
        )
    return decisions


def _build_change_manifest(
    base: ResumeDocument,
    final_document: ResumeDocument,
    plan: RewritePlan,
    compressed_paragraph_ids: set[str],
    keywords: list[JobKeyword] | None = None,
) -> list[ResumeChangeRecord]:
    base_by_id = {paragraph.paragraph_id: paragraph for paragraph in base.paragraphs}
    final_by_id = {paragraph.paragraph_id: paragraph for paragraph in final_document.paragraphs}
    proposed: dict[str, tuple[str, list[str], list[str], str, RiskLevel]] = {
        "summary": (
            plan.summary.text,
            plan.summary.target_terms,
            plan.summary.evidence_ids,
            "Reframed the professional summary for the target role.",
            RiskLevel.low,
        )
    }
    for line in plan.skills.lines:
        prefix = base_by_id[line.paragraph_id].text.split(":", 1)[0]
        original_skills = split_skill_values(base_by_id[line.paragraph_id].text.split(":", 1)[1])
        promoted = [
            skill
            for skill in line.skills
            if not any(_same_skill(skill, original) for original in original_skills)
        ]
        deprioritized = [
            skill
            for skill in original_skills
            if not any(_same_skill(skill, selected) for selected in line.skills)
        ]
        decision_parts = []
        if promoted:
            decision_parts.append("Promoted for this posting: " + ", ".join(promoted) + ".")
        if deprioritized:
            decision_parts.append(
                "Deprioritized in this tailored version: " + ", ".join(deprioritized) + "."
            )
        proposed[line.paragraph_id] = (
            f"{prefix}: {', '.join(line.skills)}",
            line.skills,
            [],
            " ".join(decision_parts) or "Updated supported skill wording.",
            RiskLevel.low,
        )
    risk_rank = {RiskLevel.low: 0, RiskLevel.medium: 1, RiskLevel.high: 2}
    for bullet in plan.bullets:
        bullet_risk = max(
            (risk.risk_level for risk in bullet.claim_risks),
            key=lambda item: risk_rank[item],
            default=RiskLevel.low,
        )
        proposed[bullet.paragraph_id] = (
            bullet.text,
            bullet.target_terms,
            bullet.evidence_ids,
            bullet.purpose,
            bullet_risk,
        )

    changes: list[ResumeChangeRecord] = []
    for paragraph_id in base.editable_paragraph_ids:
        before = base_by_id[paragraph_id]
        final = final_by_id[paragraph_id]
        proposed_text, terms, evidence, explanation, risk = proposed[paragraph_id]
        if before.text == final.text:
            change_type: Literal["added", "removed", "reframed", "unchanged"] = "unchanged"
            explanation = (
                "Kept the original skills and their order."
                if paragraph_id.startswith("skills.")
                else "Kept the original wording; no meaningful role-specific change was needed."
            )
            risk = RiskLevel.low
        elif not before.text and final.text:
            change_type = "added"
        elif before.text and not final.text:
            change_type = "removed"
        else:
            change_type = "reframed"
        changes.append(
            ResumeChangeRecord(
                paragraph_id=paragraph_id,
                section=before.section,
                paragraph_kind=before.kind,
                before_text=before.text,
                proposed_text=proposed_text,
                final_text=final.text,
                change_type=change_type,
                target_terms=[term for term in terms if contains_term(final.text, term)],
                added_terms=[
                    keyword.term
                    for keyword in (keywords or [])
                    if keyword.accepted
                    and contains_term(final.text, keyword.term)
                    and not contains_term(before.text, keyword.term)
                ],
                evidence_ids=evidence,
                risk_level=risk,
                compressed=paragraph_id in compressed_paragraph_ids,
                explanation=explanation,
            )
        )
    return changes


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


def _ensure_target_identity(reasoning: ReasoningResult) -> None:
    """Keep both summary variants aligned to the validated target role family."""
    identities = {
        "business_systems_functional": (
            "Business Systems Support Analyst",
            "Application Support Analyst",
            "Systems Support Analyst",
        ),
        "support_desk_engineering": (
            "Technical Support Engineer",
            "Support Desk Engineer",
            "IT Support Engineer",
        ),
        "platform_support_analysis": (
            "Application Support Analyst",
            "Platform Support Analyst",
            "Technical Support Analyst",
        ),
        "healthcare_application_support": (
            "Application Support Analyst",
            "Application Support Engineer",
            "Business Applications Analyst",
        ),
        "technical_support_integrations": (
            "Technical Support Engineer",
            "Integration Support Engineer",
        ),
        "product_operations": (
            "Application Support Specialist",
            "Application Support Engineer",
            "Product Operations",
            "Technical Operations Specialist",
        ),
        "technical_operations_support": (
            "Technical Operations Support Analyst",
            "Technical Operations Support",
            "Technical Operations Analyst",
            "Operations Support Analyst",
        ),
        "it_service_desk": (
            "Technical Analyst",
            "IT Support Analyst",
            "Service Desk Analyst",
            "Technical Support Analyst",
        ),
        "application_support_administration": (
            "Application Support Administrator",
            "Production Support Administrator",
            "Application Support Analyst",
        ),
        "application_systems_engineering": (
            "Application & Systems Engineer",
            "Application Systems Engineer",
            "Systems Integration Engineer",
        ),
        "erp_application_support": (
            "ERP Technical Analyst",
            "D365 Technical Analyst",
            "Application Support Analyst",
        ),
        "application_support_engineering": (
            "Application Support Engineer",
            "Production Support Engineer",
        ),
        "product_support_engineering": (
            "Product Support Engineer",
            "Technical Product Support Engineer",
        ),
    }.get(reasoning.role_profile.normalized_role_family)
    if not identities:
        return

    unsupported = {
        normalized_term(term) for term in reasoning.transferability_map.unsupported_terms
    }
    canonical = next(
        (
            identity
            for identity in identities
            if not any(contains_term(identity, term) for term in unsupported)
        ),
        identities[-1],
    )
    reasoning.role_profile.professional_identity = canonical
    reasoning.rewrite_plan.professional_identity = canonical
    summary = reasoning.rewrite_plan.summary
    summary.text = _summary_with_identity(summary.text, canonical, identities)
    summary.shorter_text = _summary_with_identity(summary.shorter_text, canonical, identities)


def _summary_with_identity(text: str, canonical: str, accepted: tuple[str, ...]) -> str:
    if any(contains_term(text, identity) for identity in accepted):
        return text
    with_match = re.search(r"\bwith\b", text, re.IGNORECASE)
    if with_match and with_match.start() <= 80:
        return f"{canonical} {text[with_match.start() :]}"
    return f"{canonical}. {text}"


def _merge_transferability_map(
    reasoning: ReasoningResult,
    preliminary: TransferabilityMap,
    keywords: list[JobKeyword],
) -> None:
    """Keep model refinements while preserving complete deterministic evidence coverage."""
    model_by_term = {
        normalized_term(match.target_term): match for match in reasoning.transferability_map.matches
    }
    preliminary_by_term = {
        normalized_term(match.target_term): match for match in preliminary.matches
    }
    merged = []
    for keyword in (item for item in keywords if item.accepted):
        model_match = model_by_term.get(keyword.normalized)
        preliminary_match = preliminary_by_term.get(keyword.normalized)
        if preliminary_match and (
            preliminary_match.strength == EvidenceStrength.direct
            or keyword.normalized in ALWAYS_WEAK_TRANSFER_TERMS
            or (
                preliminary_match.strength == EvidenceStrength.strongly_transferable
                and keyword.normalized in TRANSFER_BRIDGES
            )
            or (
                keyword.kind.value == "system"
                and preliminary_match.strength == EvidenceStrength.unsupported
            )
        ):
            merged.append(preliminary_match)
        elif model_match is not None:
            merged.append(model_match)
        elif preliminary_match is not None:
            merged.append(preliminary_match)

    transferability = reasoning.transferability_map
    transferability.matches = merged
    transferability.direct_terms = [
        match.target_term for match in merged if match.strength == EvidenceStrength.direct
    ]
    transferability.strongly_transferable_terms = [
        match.target_term
        for match in merged
        if match.strength == EvidenceStrength.strongly_transferable
    ]
    transferability.weakly_transferable_terms = [
        match.target_term
        for match in merged
        if match.strength == EvidenceStrength.weakly_transferable
    ]
    transferability.unsupported_terms = [
        match.target_term for match in merged if match.strength == EvidenceStrength.unsupported
    ]


def _supported_keywords(
    reasoning: ReasoningResult,
    keywords: list[JobKeyword],
    additional_unsupported: list[str] | None = None,
) -> list[JobKeyword]:
    excluded = {
        term.casefold()
        for term in [
            *reasoning.transferability_map.unsupported_terms,
            *reasoning.transferability_map.weakly_transferable_terms,
            *(additional_unsupported or []),
        ]
    }
    return [keyword for keyword in keywords if keyword.normalized not in excluded]


def _direct_keywords(
    reasoning: ReasoningResult,
    keywords: list[JobKeyword],
) -> list[JobKeyword]:
    """Return terms whose exact wording is substantiated and must survive tailoring."""
    direct = {
        normalized_term(match.target_term)
        for match in reasoning.transferability_map.matches
        if match.strength == EvidenceStrength.direct
    }
    return [
        keyword
        for keyword in keywords
        if keyword.normalized in direct and keyword.normalized not in SUMMARY_STRENGTH_TERMS | AUTOMATIC_CONTEXT_TERMS
    ]


def _certification_only_terms(transferability: TransferabilityMap) -> set[str]:
    return {
        normalized_term(match.target_term)
        for match in transferability.matches
        if match.strength == EvidenceStrength.direct
        and (match.evidence_id or "").startswith("evidence.certifications.")
    }


def _prune_direct_evidence_risks(
    reasoning: ReasoningResult, graph: ResumeEvidenceGraph | None = None,
) -> None:
    """Dismiss a caution only when evidence supports this exact claim's context."""
    direct = [match for match in reasoning.transferability_map.matches if match.strength == EvidenceStrength.direct]
    evidence = {item.evidence_id: item for item in graph.evidence} if graph else {}

    def substantiated(risk: ClaimRisk, paragraph_id: str = "") -> bool:
        placement_match = re.search(r"(?:summary|skills\.[\w.]+|(?:experience|projects)\.[\w.]+\.bullet\.\d+)", risk.selected_placement)
        placement = paragraph_id or (placement_match.group(0) if placement_match else "")
        if not placement:
            return False
        section = placement.rsplit(".bullet.", 1)[0]
        for match in reasoning.transferability_map.matches:
            term = match.target_term
            if not (contains_term(risk.claim, term) or normalized_term(risk.target_requirement) == normalized_term(term)):
                continue
            # Standard capabilities such as ticket case management can be inferred
            # from actual work, even when a model adds an unnecessary review risk.
            if graph and any(
                item.paragraph_id == placement
                and supports_automatic_context(term, item.source_text)
                for item in graph.evidence
            ):
                return True
            if match not in direct:
                continue
            item = evidence.get(match.evidence_id or "")
            if item is not None:
                if item.routine_tool_context or item.established_technical_context:
                    # Routine assistance does not substantiate arbitrary claims
                    # (e.g. a deployment or metric attributed to a known tool).
                    continue
                if item.claim_scope in {"skills_only", "general_exposure"}:
                    if placement.startswith("skills."):
                        return True
                    continue
                reference = item.source_reference or item.paragraph_id
                if placement == reference or section == reference or item.section == section:
                    return True
                continue
            source = (match.evidence_id or "").removeprefix("evidence.")
            if source.startswith("candidate_profile."):
                continue
            if source == placement or (".bullet." in source and source.rsplit(".bullet.", 1)[0] == section):
                return True
        return False

    reasoning.rewrite_plan.claim_risks = [risk for risk in reasoning.rewrite_plan.claim_risks if not substantiated(risk)]
    for bullet in reasoning.rewrite_plan.bullets:
        bullet.claim_risks = [risk for risk in bullet.claim_risks if not substantiated(risk, bullet.paragraph_id)]


def _ensure_important_keyword_placement(
    reasoning: ReasoningResult,
    keywords: list[JobKeyword],
    document: ResumeDocument,
) -> None:
    """Guarantee high-value, evidence-supported terms survive model/layout fallbacks."""
    placement_keywords = _supported_placement_keywords(keywords)
    for keyword in placement_keywords:
        if keyword.normalized in NON_PROSE_QUALIFICATIONS:
            continue
        resume_text = _effective_resume_text(document, reasoning.rewrite_plan)
        if contains_term(resume_text, keyword.term):
            continue
        _place_direct_category_keyword(reasoning.rewrite_plan, keyword)
        if contains_term(_effective_resume_text(document, reasoning.rewrite_plan), keyword.term):
            continue
        if keyword.kind.value not in {"system", "vocabulary"} and keyword.normalized != "ai":
            continue
        skill_line = _keyword_skill_line(reasoning.rewrite_plan, keyword)
        if not any(contains_term(skill, keyword.term) for skill in skill_line.skills):
            skill_line.skills.append(_display_skill(keyword.term))
    _rank_skill_lines(reasoning.rewrite_plan, document, placement_keywords)
    _trim_skill_lines_to_character_budgets(
        reasoning.rewrite_plan,
        document,
        placement_keywords,
    )
    # Ranking can displace Postman before a row ever reaches rendered overflow
    # repair. Preserve that established tool in the alternate row when it fits.
    base_apis = next(
        (p for p in document.paragraphs if p.paragraph_id == "skills.apis_identity"), None
    )
    if (
        base_apis
        and contains_term(base_apis.text, "Postman")
        and not any(
            contains_term(value, "Postman")
            for line in reasoning.rewrite_plan.skills.lines
            for value in line.skills
        )
    ):
        _relocate_overflow_skill(
            reasoning.rewrite_plan, document, "skills.apis_identity", "Postman"
        )


def _supported_placement_keywords(keywords: list[JobKeyword]) -> list[JobKeyword]:
    """Include Tier 1 terms plus defensible secondary terms with real placement value.

    The caller passes only direct or strongly transferable keywords, so lowering the
    placement threshold here cannot introduce unsupported domain claims. This matters
    for stretch roles where transferable actions and confirmed tools may be the only
    honest overlap.
    """
    selected: list[JobKeyword] = []
    seen: set[str] = set()
    for keyword in keywords:
        if not keyword.accepted or keyword.normalized in SOFT_TERMS:
            continue
        if not (
            is_coverage_target(keyword)
            or keyword.hiring_importance >= 35
            or (keyword.hiring_importance >= 15 and keyword.placement_utility >= 25)
        ):
            continue
        if keyword.normalized in seen:
            continue
        seen.add(keyword.normalized)
        selected.append(keyword)
    return selected


def _place_direct_category_keyword(plan: RewritePlan, keyword: JobKeyword) -> None:
    """Express exact category vocabulary through an established concrete technology."""
    if keyword.normalized == "end-user support":
        bullet = next(
            (item for item in plan.bullets if item.paragraph_id == "experience.csulb.bullet.1"),
            None,
        )
        if bullet and not contains_term(bullet.text, keyword.term):
            for field in ("text", "shorter_text"):
                value = getattr(bullet, field)
                setattr(
                    bullet,
                    field,
                    re.sub(
                        r"\bfirst-line application support\b",
                        "first-line end-user support",
                        value,
                        count=1,
                        flags=re.IGNORECASE,
                    ),
                )
            if keyword.term.casefold() not in {term.casefold() for term in bullet.target_terms}:
                bullet.target_terms.append(keyword.term)
        return
    if keyword.normalized == "customer service":
        bullet = next(
            (item for item in plan.bullets if item.paragraph_id == "experience.wehelp.bullet.2"),
            None,
        )
        if bullet and not contains_term(bullet.text, keyword.term):
            for field in ("text", "shorter_text"):
                value = getattr(bullet, field)
                setattr(
                    bullet,
                    field,
                    re.sub(
                        r"\bby managing user access\b",
                        "with customer service, user access management",
                        value,
                        count=1,
                        flags=re.IGNORECASE,
                    ),
                )
            if keyword.term.casefold() not in {term.casefold() for term in bullet.target_terms}:
                bullet.target_terms.append(keyword.term)
        return
    if keyword.normalized == "service desk":
        bullet = next(
            (
                item
                for item in plan.bullets
                if item.paragraph_id == "experience.original_insurance.bullet.1"
            ),
            None,
        )
        if bullet and not contains_term(bullet.text, keyword.term):
            for field in ("text", "shorter_text"):
                value = getattr(bullet, field)
                setattr(
                    bullet,
                    field,
                    re.sub(
                        r"\bproduction support tickets\b",
                        "service desk and production support tickets",
                        value,
                        count=1,
                        flags=re.IGNORECASE,
                    ),
                )
            if keyword.term.casefold() not in {term.casefold() for term in bullet.target_terms}:
                bullet.target_terms.append(keyword.term)
        return
    if keyword.normalized == "account management":
        bullet = next(
            (
                item
                for item in plan.bullets
                if item.paragraph_id == "experience.original_insurance.bullet.4"
            ),
            None,
        )
        if bullet and not contains_term(bullet.text, keyword.term):
            for field in ("text", "shorter_text"):
                value = getattr(bullet, field)
                value = re.sub(
                    r"\blicense management\b",
                    "account management",
                    value,
                    count=1,
                    flags=re.IGNORECASE,
                )
                if not contains_term(value, keyword.term):
                    value = re.sub(
                        r"\buser provisioning\b",
                        "user account management and provisioning",
                        value,
                        count=1,
                        flags=re.IGNORECASE,
                    )
                setattr(bullet, field, value)
            if contains_term(bullet.text, keyword.term) and keyword.term.casefold() not in {
                term.casefold() for term in bullet.target_terms
            }:
                bullet.target_terms.append(keyword.term)
        return
    if keyword.normalized == "root cause and corrective action":
        bullet = next(
            (
                item
                for item in plan.bullets
                if item.paragraph_id == "experience.original_insurance.bullet.2"
            ),
            None,
        )
        if bullet and not contains_term(bullet.text, keyword.term):
            for field in ("text", "shorter_text"):
                value = getattr(bullet, field)
                value = re.sub(
                    r"isolating root cause and validating fixes",
                    "applying root cause and corrective action methods to validate fixes",
                    value,
                    count=1,
                    flags=re.IGNORECASE,
                )
                setattr(bullet, field, value)
            if keyword.term.casefold() not in {term.casefold() for term in bullet.target_terms}:
                bullet.target_terms.append(keyword.term)
        return
    if keyword.normalized == "ticketing":
        bullet = next(
            (
                item
                for item in plan.bullets
                if item.paragraph_id == "experience.original_insurance.bullet.1"
            ),
            None,
        )
        if bullet and not contains_term(bullet.text, keyword.term):
            for field in ("text", "shorter_text"):
                value = getattr(bullet, field)
                value = re.sub(
                    r"\b(?:via|through|using) Jira\b",
                    "through Jira ticketing",
                    value,
                    count=1,
                    flags=re.IGNORECASE,
                )
                if not contains_term(value, keyword.term):
                    support_kind = "production support" if field == "text" else "support"
                    value = (
                        f"Resolved 200+ {support_kind} tickets through Jira ticketing across "
                        "agency management SaaS, internal integrations, and Microsoft 365, "
                        "maintaining sub-90-minute average resolution."
                    )
                setattr(bullet, field, value)
            if keyword.term.casefold() not in {term.casefold() for term in bullet.target_terms}:
                bullet.target_terms.append(keyword.term)
        return
    if keyword.normalized == "incident management":
        bullet = next(
            (item for item in plan.bullets if item.paragraph_id == "experience.csulb.bullet.3"),
            None,
        )
        if bullet and not contains_term(bullet.text, keyword.term):
            bullet.text = (
                "Supported incident management by maintaining documentation, escalation notes, "
                "and recurring issue tracking while coordinating with campus IT and third-party "
                "vendors."
            )
            bullet.shorter_text = (
                "Supported incident management by maintaining documentation, escalation notes, "
                "and issue tracking while coordinating with campus IT and third-party vendors."
            )
            if keyword.term.casefold() not in {term.casefold() for term in bullet.target_terms}:
                bullet.target_terms.append(keyword.term)
        return
    if keyword.normalized == "software implementation":
        bullet = next(
            (item for item in plan.bullets if item.paragraph_id == "experience.wehelp.bullet.1"),
            None,
        )
        if bullet and not contains_term(bullet.text, keyword.term):
            bullet.text = (
                "Led software implementation for Loavenly by independently building, testing, "
                "and deploying a centralized tracking system for staff and volunteers across "
                "three distribution locations."
            )
            bullet.shorter_text = (
                "Led software implementation for Loavenly by independently building, testing, "
                "and deploying a tracking system for staff and volunteers across three "
                "distribution locations."
            )
            if keyword.term.casefold() not in {term.casefold() for term in bullet.target_terms}:
                bullet.target_terms.append(keyword.term)
        return
    if keyword.normalized == "software adoption":
        bullet = next(
            (item for item in plan.bullets if item.paragraph_id == "experience.wehelp.bullet.2"),
            None,
        )
        if bullet and not contains_term(bullet.text, keyword.term):
            bullet.text = (
                "Support Loavenly during live Wednesday and Saturday distributions, managing "
                "access, troubleshooting production issues, validating updates, and training "
                "staff and volunteers to drive software adoption."
            )
            bullet.shorter_text = (
                "Support Loavenly during live Wednesday and Saturday distributions, managing "
                "access, troubleshooting issues, validating updates, and training staff and "
                "volunteers to drive software adoption."
            )
            if keyword.term.casefold() not in {term.casefold() for term in bullet.target_terms}:
                bullet.target_terms.append(keyword.term)
        return
    if keyword.normalized != "web services":
        return
    for bullet in plan.bullets:
        if contains_term(bullet.text, "web services") or not contains_term(
            bullet.text,
            "webhook",
        ):
            continue
        bullet.text = re.sub(
            r"\bwebhook\b",
            "webhook-based web services",
            bullet.text,
            count=1,
            flags=re.IGNORECASE,
        )
        bullet.shorter_text = re.sub(
            r"\bwebhook\b",
            "webhook-based web services",
            bullet.shorter_text,
            count=1,
            flags=re.IGNORECASE,
        )
        return


def _effective_resume_text(document: ResumeDocument, plan: RewritePlan) -> str:
    """Combine editable proposals with protected resume text for whole-document checks."""
    protected = [paragraph.text for paragraph in document.paragraphs if not paragraph.editable]
    return "\n".join([*protected, *all_proposed_text(plan)])


def _ensure_summary_strength_terms(
    plan: RewritePlan,
    keywords: list[JobKeyword],
    document: ResumeDocument,
) -> None:
    """Keep defensible Tier-1 soft skills exact without displacing verified base skills."""
    missing = [
        keyword.term.casefold()
        for keyword in important_keywords(keywords)
        if keyword.normalized in SUMMARY_STRENGTH_TERMS
        and not contains_term(_effective_resume_text(document, plan), keyword.term)
    ]
    if not missing:
        return
    missing = [term for term in missing if not _place_strength_term(plan, term)]
    if not missing:
        return
    for attribute in ("text", "shorter_text"):
        value = getattr(plan.summary, attribute).rstrip()
        missing_for_value = [term for term in missing if not contains_term(value, term)]
        if not missing_for_value:
            continue
        phrase = f"Strengths include {_natural_list(missing_for_value)}."
        setattr(plan.summary, attribute, f"{value} {phrase}")


def _place_strength_term(plan: RewritePlan, term: str) -> bool:
    """Place a soft skill in the concrete evidence that supports it when natural."""
    paragraph_id = {
        "critical thinking": "experience.original_insurance.bullet.2",
        "cross-functional collaboration": "experience.csulb.bullet.3",
        "customer service": "experience.wehelp.bullet.2",
        "organizational skills": "experience.csulb.bullet.3",
        "problem-solving": "experience.original_insurance.bullet.2",
        "task prioritization": "experience.original_insurance.bullet.1",
        "verbal communication": "experience.csulb.bullet.3",
    }.get(term)
    if paragraph_id is None:
        return False
    bullet = next((item for item in plan.bullets if item.paragraph_id == paragraph_id), None)
    if bullet is None or contains_term(bullet.text, term):
        return bullet is not None

    if term in {"cross-functional collaboration", "verbal communication"}:
        changed = False
        for field in ("text", "shorter_text"):
            value = getattr(bullet, field)
            if term == "cross-functional collaboration":
                rewritten_value = re.sub(
                    r"\bwhile coordinating with\b",
                    "while supporting cross-functional collaboration with",
                    value,
                    count=1,
                    flags=re.IGNORECASE,
                )
            elif contains_term(value, "cross-functional collaboration"):
                rewritten_value = re.sub(
                    r"\bwhile supporting cross-functional collaboration with\b",
                    "while using verbal communication to support cross-functional "
                    "collaboration with",
                    value,
                    count=1,
                    flags=re.IGNORECASE,
                )
            else:
                rewritten_value = re.sub(
                    r"\bwhile coordinating with\b",
                    "while using verbal communication to coordinate with",
                    value,
                    count=1,
                    flags=re.IGNORECASE,
                )
            setattr(bullet, field, rewritten_value)
            changed = changed or rewritten_value != value
        if not changed:
            return False
        if term not in [value.casefold() for value in bullet.target_terms]:
            bullet.target_terms.append(term)
        return True

    if term == "customer service":
        rewritten = re.sub(
            r"^Support Loavenly",
            "Provide customer service for Loavenly",
            bullet.text,
            count=1,
            flags=re.IGNORECASE,
        )
    elif term == "task prioritization":
        rewritten = re.sub(
            r"^(?:Prioritized and resolved|Resolved) 200\+",
            "Applied task prioritization while resolving 200+",
            bullet.text,
            count=1,
            flags=re.IGNORECASE,
        )
    elif term == "organizational skills":
        rewritten = re.sub(
            r"^Maintained ",
            "Applied organizational skills to maintain ",
            bullet.text,
            count=1,
            flags=re.IGNORECASE,
        )
    elif term == "critical thinking" and contains_term(bullet.text, "problem-solving"):
        rewritten = re.sub(
            r"\bproblem-solving\b",
            "critical thinking and problem-solving",
            bullet.text,
            count=1,
            flags=re.IGNORECASE,
        )
    elif term == "problem-solving" and contains_term(bullet.text, "critical thinking"):
        rewritten = re.sub(
            r"\bcritical thinking\b",
            "critical thinking and problem-solving",
            bullet.text,
            count=1,
            flags=re.IGNORECASE,
        )
    else:
        rewritten = re.sub(
            r"^Investigated ",
            f"Applied {term} while investigating ",
            bullet.text,
            count=1,
            flags=re.IGNORECASE,
        )
    if rewritten == bullet.text:
        return False
    bullet.text = rewritten
    if term not in [value.casefold() for value in bullet.target_terms]:
        bullet.target_terms.append(term)
    return True


def _natural_list(values: list[str]) -> str:
    if len(values) == 1:
        return values[0]
    if len(values) == 2:
        return f"{values[0]} and {values[1]}"
    return f"{', '.join(values[:-1])}, and {values[-1]}"


def _normalize_skill_display(plan: RewritePlan) -> None:
    for line in plan.skills.lines:
        line.skills = [_display_skill(skill) for skill in line.skills]
        line.shorter_skills = [_display_skill(skill) for skill in line.shorter_skills]


def _fuse_skill_inventory(
    plan: RewritePlan,
    document: ResumeDocument,
    keywords: list[JobKeyword],
    unsupported_terms: list[str] | None = None,
    skill_ineligible_terms: set[str] | None = None,
) -> None:
    """Rank factual skills into the template's limited, category-preserving slots."""
    base_lines = {
        paragraph.paragraph_id: split_skill_values(paragraph.text.split(":", 1)[1])
        for paragraph in document.paragraphs
        if paragraph.kind.value == "skill_line"
    }
    unsupported_normalized = {term.casefold() for term in (unsupported_terms or [])}
    ineligible_normalized = {
        *SOFT_TERMS,
        *(term.casefold() for term in (skill_ineligible_terms or set())),
    }
    credible_new = [
        keyword
        for keyword in keywords
        if keyword.accepted
        and keyword.hiring_importance >= 25
        and (keyword.kind.value in {"system", "action", "vocabulary"} or keyword.normalized == "ai")
        and keyword.normalized not in unsupported_normalized
        and keyword.normalized not in ineligible_normalized
    ]
    all_base_skills = [skill for values in base_lines.values() for skill in values]
    relocated: dict[str, list[str]] = {}
    for line in plan.skills.lines:
        original = base_lines.get(line.paragraph_id, [])
        for value in line.skills:
            if any(_same_skill(value, base_value) for base_value in original):
                continue
            # A model may repeat an established skill in another category to make a
            # keyword look newly targeted. Keep the protected category instead of
            # recording a cosmetic relocation as a resume improvement.
            if any(_same_skill(value, base_value) for base_value in all_base_skills):
                continue
            keyword = next(
                (item for item in credible_new if _matches_any_keyword(value, [item])
                 # Generic AI familiarity does not authorize a named-tool bundle.
                 and (item.normalized != "ai" or normalized_term(value) == "ai")),
                None,
            )
            if keyword is None:
                continue
            target_id = _keyword_skill_line(plan, keyword).paragraph_id
            relocated.setdefault(target_id, []).append(value)
    for line in plan.skills.lines:
        original = base_lines.get(line.paragraph_id, [])
        proposed = [
            value
            for value in line.skills
            if any(_same_skill(value, base_value) for base_value in original)
        ]
        retained = [
            next((value for value in proposed if _same_skill(value, base_value) and any(
                keyword.accepted and contains_term(value, keyword.term)
                and not contains_term(base_value, keyword.term) for keyword in keywords
            )), base_value)
            for base_value in original
        ]
        candidates = _dedupe_skills([*retained, *relocated.get(line.paragraph_id, [])])
        ranked = sorted(
            enumerate(candidates),
            key=lambda item: (
                -_skill_resume_value(item[1], keywords),
                item[0],
            ),
        )
        slot_count = max(1, len(original))
        selected_indices = {index for index, _ in ranked[:slot_count]}
        selected = [value for index, value in enumerate(candidates) if index in selected_indices]
        line.skills = selected
        line.shorter_skills = list(selected)


def _rank_skill_lines(
    plan: RewritePlan,
    document: ResumeDocument,
    keywords: list[JobKeyword],
) -> None:
    """Keep the highest-value supported terms within each base line's slot count."""
    base_lines = {
        paragraph.paragraph_id: split_skill_values(paragraph.text.split(":", 1)[1])
        for paragraph in document.paragraphs
        if paragraph.kind.value == "skill_line"
    }
    for line in plan.skills.lines:
        original = base_lines.get(line.paragraph_id, [])
        proposed = _dedupe_skills(line.skills)
        # Rank only for selection. Display retained skills in their protected order.
        values = [
            next(item for item in proposed if _same_skill(value, item))
            for value in original if any(_same_skill(value, item) for item in proposed)
        ]
        values.extend(value for value in proposed if not any(_same_skill(value, item) for item in original))
        ranked = sorted(
            enumerate(values),
            key=lambda item: (-_skill_resume_value(item[1], keywords), item[0]),
        )
        selected = {index for index, _ in ranked[: max(1, len(original) or len(values))]}
        line.skills = [value for index, value in enumerate(values) if index in selected]
        line.shorter_skills = list(line.skills)


def _skill_resume_value(value: str, keywords: list[JobKeyword]) -> float:
    """Deterministic value for one factual skill competing for visible resume space."""
    matches = [keyword for keyword in keywords if _matches_any_keyword(value, [keyword])]
    if not matches:
        return 5.0
    return (
        max(
            keyword.hiring_importance
            + (keyword.placement_utility * 0.35)
            + min(keyword.occurrences, 4) * 2.0
            + (8.0 if keyword.priority.value == "high" else 0.0)
            for keyword in matches
            if keyword.accepted
        )
        if any(keyword.accepted for keyword in matches)
        else 0.0
    )


def _matches_any_keyword(value: str, keywords: list[JobKeyword]) -> bool:
    return any(
        contains_term(value, keyword.term) or contains_term(keyword.term, value)
        for keyword in keywords
    )


def _dedupe_skills(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        if not any(_same_skill(value, existing) for existing in result):
            result.append(value)
    return result


def _same_skill(left: str, right: str) -> bool:
    aliases = {
        "service level agreements": "sla",
        "service level agreement": "sla",
        "sla management": "sla",
        "rest api": "rest apis",
    }
    normalized_left = aliases.get(left.strip().casefold(), left.strip().casefold())
    normalized_right = aliases.get(right.strip().casefold(), right.strip().casefold())
    return (
        normalized_left == normalized_right
        or contains_term(left, right)
        or contains_term(right, left)
    )


def _display_skill(value: str) -> str:
    canonical = {
        "ai": "AI",
        "api": "API",
        "apis": "APIs",
        "aws": "AWS",
        "bash": "Bash",
        "ci/cd": "CI/CD",
        "cli": "CLI",
        "excel": "Excel",
        "json": "JSON",
        "linux": "Linux",
        "mfa": "MFA",
        "outlook": "Outlook",
        "rbac": "RBAC",
        "react": "React",
        "sql": "SQL",
        "sso": "SSO",
        "unix": "Unix",
    }
    stripped = value.strip()
    if stripped != stripped.lower():
        return stripped
    return canonical.get(stripped.casefold(), stripped.title())


def _keyword_skill_line(
    plan: RewritePlan,
    keyword: JobKeyword,
) -> ProposedSkillLine:
    preferred_id = "skills.technical_support"
    normalized = keyword.normalized
    if normalized == "ai":
        preferred_id = "skills.tools"
    elif normalized == "information security":
        preferred_id = "skills.apis_identity"
    elif normalized in {
        "devops",
        "cloud computing",
        "d365 f&o",
        "dynamics 365",
        "erp",
    }:
        preferred_id = "skills.cloud_systems"
    elif keyword.kind.value == "vocabulary":
        preferred_id = "skills.tools"
    elif keyword.kind.value == "system":
        if normalized in {
            "java",
            "javascript",
            "c#",
            "c++",
            ".net",
            "node.js",
            "python",
            "react",
            "sql",
            "json",
            "xml",
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
            "aws eks",
            "aws rds",
            "aws s3",
            "cloudwatch",
            "cognito",
            "dynamodb",
            "elasticsearch",
            "kubernetes",
            "s3",
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
        full_budget = _measured_skill_character_budget(document, paragraph)
        # A model's long alias must not make an established skill disappear.
        # Reuse the protected shorter spelling before dropping any inventory.
        originals = split_skill_values(original_after_label)
        for values, budget in ((line.skills, full_budget), (line.shorter_skills, paragraph.character_budget)):
            if len(f"{fixed_prefix}{', '.join(values)}") <= budget:
                continue
            for index, value in enumerate(values):
                shorter = next((item for item in originals if _same_skill(item, value) and len(item) < len(value)), None)
                if shorter and not any(
                    contains_term(value, keyword.term) and not contains_term(shorter, keyword.term)
                    for keyword in required
                ):
                    values[index] = shorter
        _trim_skill_values(
            line.skills,
            fixed_prefix,
            full_budget,
            required,
            minimum_items=1,
        )
        _trim_skill_values(
            line.shorter_skills,
            fixed_prefix,
            paragraph.character_budget,
            required,
            minimum_items=1,
        )


def _measured_skill_character_budget(
    document: ResumeDocument,
    paragraph: ResumeParagraph,
) -> int:
    """Use measured spare horizontal space while retaining layout validation as the authority."""
    skill_widths = [
        item.rendered_max_width_points
        for item in document.paragraphs
        if item.kind.value == "skill_line" and item.rendered_max_width_points > 0
    ]
    if not skill_widths or paragraph.rendered_max_width_points <= 0:
        return paragraph.character_budget
    measured_capacity = max(skill_widths)
    scaled = round(
        paragraph.character_budget * measured_capacity / paragraph.rendered_max_width_points
    )
    return max(
        paragraph.character_budget,
        min(scaled, round(paragraph.character_budget * 1.5)),
    )


def _trim_skill_values(
    values: list[str],
    prefix: str,
    budget: int,
    required: list[JobKeyword],
    *,
    minimum_items: int = 0,
) -> None:
    while len(values) > minimum_items and len(f"{prefix}{', '.join(values)}") > budget:
        added_indexes = list(range(len(values) - 1, -1, -1))
        removable = next(
            (
                index
                for index in added_indexes
                if not any(
                    contains_term(values[index], keyword.term)
                    or contains_term(keyword.term, values[index])
                    for keyword in required
                )
            ),
            added_indexes[0] if added_indexes else None,
        )
        if removable is None:
            return
        values.pop(removable)


def _use_rendered_skill_rows(plan: RewritePlan, rendered: ResumeDocument) -> None:
    """Make subsequent repairs operate on the exact skill values that overflowed."""
    by_id = {paragraph.paragraph_id: paragraph for paragraph in rendered.paragraphs}
    for line in plan.skills.lines:
        paragraph = by_id.get(line.paragraph_id)
        if paragraph is not None:
            values = split_skill_values(paragraph.text.split(":", 1)[1])
            line.skills = values
            line.shorter_skills = list(values)


def _repair_skill_row_overflow(
    plan: RewritePlan,
    document: ResumeDocument,
    keywords: list[JobKeyword],
    line_counts: dict[str, int],
    baseline_line_counts: dict[str, int] | None = None,
    *,
    relocated_skills: set[str] | None = None,
) -> bool:
    """Relocate or trim one skill, without bouncing it between crowded rows."""
    base_by_id = {paragraph.paragraph_id: paragraph for paragraph in document.paragraphs}
    baseline_line_counts = baseline_line_counts or {}
    for line in plan.skills.lines:
        if line_counts.get(line.paragraph_id, 1) <= 1:
            continue
        source = base_by_id.get(line.paragraph_id)
        if source is None:
            continue
        # Preserve tools such as Postman before considering any content removal.
        # Never relocate into a row that is already overflowing.
        if len(line.skills) > 1:
            for value in list(line.skills):
                if _relocate_overflow_skill(
                    plan,
                    document,
                    line.paragraph_id,
                    value,
                    line_counts=line_counts,
                    relocated_skills=relocated_skills,
                ):
                    line.skills.remove(value)
                    line.shorter_skills = [
                        item for item in line.shorter_skills if not _same_skill(item, value)
                    ]
                    return True
        required = [
            keyword
            for keyword in keywords
            if keyword.accepted
            and contains_term(_planned_text(plan, line.paragraph_id), keyword.term)
        ]
        removable = [
            index
            for index, value in enumerate(line.skills)
            if not any(
                contains_term(value, keyword.term) or contains_term(keyword.term, value)
                for keyword in required
            )
        ]
        if not removable:
            removable = list(range(len(line.skills)))
        if len(line.skills) <= 1:
            continue
        drop = min(
            removable,
            key=lambda index: (_skill_resume_value(line.skills[index], keywords), -index),
        )
        dropped_value = line.skills[drop]
        if _relocate_overflow_skill(
            plan,
            document,
            line.paragraph_id,
            dropped_value,
            line_counts=line_counts,
            relocated_skills=relocated_skills,
        ):
            line.skills.pop(drop)
            line.shorter_skills = [
                item for item in line.shorter_skills if not _same_skill(item, dropped_value)
            ]
            return True
        line.skills.pop(drop)
        line.shorter_skills = [
            item for item in line.shorter_skills if not _same_skill(item, dropped_value)
        ]
        return True
    return False


def _relocate_overflow_skill(
    plan: RewritePlan,
    document: ResumeDocument,
    source_id: str,
    value: str,
    *,
    line_counts: dict[str, int] | None = None,
    relocated_skills: set[str] | None = None,
) -> bool:
    """Move only semantically flexible skills when the alternate rendered row has space."""
    normalized = normalized_term(value)
    if relocated_skills is not None and normalized in relocated_skills:
        return False
    alternates = {
        ("skills.apis_identity", "postman"): ("skills.tools",),
        ("skills.tools", "postman"): ("skills.apis_identity",),
        ("skills.languages_dbs", "json"): ("skills.apis_identity",),
        ("skills.apis_identity", "json"): ("skills.languages_dbs",),
    }.get((source_id, normalized), ())
    metadata = {paragraph.paragraph_id: paragraph for paragraph in document.paragraphs}
    for alternate_id in alternates:
        if line_counts and line_counts.get(alternate_id, 1) > 1:
            continue
        target = next(
            (line for line in plan.skills.lines if line.paragraph_id == alternate_id),
            None,
        )
        paragraph = metadata.get(alternate_id)
        if target is None or paragraph is None:
            continue
        if any(_same_skill(value, existing) for existing in target.skills):
            return True
        prefix = paragraph.text.split(":", 1)[0] + ": "
        proposed = f"{prefix}{', '.join([*target.skills, value])}"
        if len(proposed) > _measured_skill_character_budget(document, paragraph):
            continue
        target.skills.append(value)
        target.shorter_skills.append(value)
        if relocated_skills is not None:
            relocated_skills.add(normalized)
        return True
    return False


def _order_rewrite_variants(plan: RewritePlan) -> None:
    """Normalize reversed model variants before both undergo the factual checks."""
    if len(plan.summary.shorter_text) > len(plan.summary.text):
        plan.summary.text, plan.summary.shorter_text = plan.summary.shorter_text, plan.summary.text
    for proposal in plan.bullets:
        if len(proposal.shorter_text) > len(proposal.text):
            proposal.text, proposal.shorter_text = proposal.shorter_text, proposal.text


def _remove_unproven_reproduction(plan: RewritePlan, document: ResumeDocument) -> None:
    """Keep issue investigation when a role has no source evidence of reproduction."""
    source_by_section: dict[str, str] = {}
    for paragraph in document.paragraphs:
        source_by_section[paragraph.section] = (
            source_by_section.get(paragraph.section, "") + " " + paragraph.text
        )
    replacements = {
        "reproducing": "investigating",
        "reproduced": "investigated",
        "reproduce": "investigate",
        "reproduction": "investigation",
    }
    pattern = re.compile(r"\b(reproducing|reproduced|reproduce|reproduction)\b", re.I)

    def replace(match: re.Match[str]) -> str:
        replacement = replacements[match.group(0).casefold()]
        return replacement.capitalize() if match.group(0)[:1].isupper() else replacement

    for bullet in plan.bullets:
        section = bullet.paragraph_id.rsplit(".bullet.", 1)[0]
        if pattern.search(source_by_section.get(section, "")):
            continue
        for field in ("text", "shorter_text"):
            value = getattr(bullet, field)
            setattr(
                bullet,
                field,
                pattern.sub(replace, value),
            )


def _content_words(text: str) -> set[str]:
    """Conservative lexical screen, not a claim that word count measures quality."""
    filler = set(["a", "an", "the", "and", "or", "by", "to", "for", "of", "in", "on", "with", "from", "through", "while", "then", "as", "at", "during", "into", "across", "alongside", "hands", "own", "ready", "further", "technical", "production", "support", "supported", "enabled", "keep", "kept", "maintained", "maintaining", "built", "building", "operate", "operating", "deployed", "deploying", "resolved", "resolving", "investigated", "investigating", "isolated", "isolating", "performed", "performing", "provided", "providing", "used", "using", "work", "working"])
    return {word.rstrip("s") for word in re.findall(r"[a-z]+", text.casefold()) if word not in filler}


def _new_concrete_detail(before: str, after: str) -> set[str]:
    return _content_words(after) - _content_words(before)


def _same_role_concept(text: str, term: str) -> bool:
    """Recognize a narrow set of inflections, never adjacent technologies."""
    def normalize(value: str) -> str:
        value = re.sub(r"\bconfigur(?:ation|ations|e|ed|ing)\b", "configuration", value.casefold())
        return " ".join(word[:-1] if word.endswith("s") and not word.endswith("ss") else word
                        for word in re.findall(r"[a-z0-9+#]+", value))
    return contains_term(normalize(text), normalize(term))


def _minimal_inflection_alignment(source: str, terms: list[JobKeyword]) -> str:
    result = source
    for keyword in terms:
        # Same-part-of-speech plural to singular is safe; turning "Configured"
        # into "configuration" would break grammar and is deliberately excluded.
        if not keyword.term.endswith("s"):
            result = re.sub(r"(?<![\w])" + re.escape(keyword.term) + r"s(?![\w])",
                            keyword.term, result, flags=re.IGNORECASE)
    return result


def _soft_skill_appendix(source: str, candidate: str) -> bool:
    prefix = source.rstrip(" .;")
    if not candidate.startswith(prefix):
        return False
    suffix = candidate[len(prefix):]
    found = False
    for term in sorted(SOFT_TERMS, key=len, reverse=True):
        if contains_term(suffix, term):
            found = True
            suffix = re.sub(re.escape(term), "", suffix, flags=re.IGNORECASE)
    filler = {"demonstrating", "showing", "showcasing", "using", "with", "strong", "excellent", "and", "through", "applying", "leveraging", "skills", "abilities"}
    return found and set(re.findall(r"[a-z]+", suffix.casefold())) <= filler


def _restore_unjustified_shortening(
    plan: RewritePlan,
    document: ResumeDocument,
    keywords: list[JobKeyword],
    *,
    draft_terms: set[str] | None = None,
    _check_shorter: bool = True,
) -> list[str]:
    """Keep source evidence when a rewrite only makes a bullet smaller."""
    feedback: list[str] = []
    source_by_id = {paragraph.paragraph_id: paragraph.text for paragraph in document.paragraphs}
    summary_source = source_by_id.get("summary", "")
    if summary_source:
        summary_missing_systems = any(
            contains_term(summary_source, term) and not preserves_source_term(plan.summary.text, term)
            for term in SYSTEM_TERMS
        )
        if len(plan.summary.text) < (0.90 * len(summary_source)) or summary_missing_systems:
            plan.summary.text = summary_source
        if plan.summary.text == summary_source and len(plan.summary.shorter_text) >= len(
            summary_source
        ):
            plan.summary.shorter_text = summary_source
    for bullet in plan.bullets:
        source = source_by_id.get(bullet.source_paragraph_id, "")
        if not source:
            continue
        new_terms = [
            keyword
            for keyword in keywords
            if contains_term(bullet.text, keyword.term) and not contains_term(source, keyword.term)
        ]
        if _soft_skill_appendix(source, bullet.text):
            bullet.text = source
            new_terms = []
        accepted_new_terms = [keyword for keyword in new_terms if keyword.accepted]
        if accepted_new_terms and all(_same_role_concept(source, keyword.term) for keyword in accepted_new_terms):
            # Exact scanner spelling can justify a small wording correction, not
            # replacing the sentence with a rearranged version of the same work.
            bullet.text = _minimal_inflection_alignment(source, accepted_new_terms)
            bullet.shorter_text = bullet.text
            bullet.target_terms = [term for term in bullet.target_terms if contains_term(bullet.text, term)]
            new_terms = [keyword for keyword in accepted_new_terms if contains_term(bullet.text, keyword.term)]
        missing_systems = [
            term
            for term in SYSTEM_TERMS
            if contains_term(source, term) and not preserves_source_term(bullet.text, term)
        ]
        missing_context = [
            term
            for term in SOURCE_CONTEXT_TERMS
            if contains_term(source, term) and not contains_term(bullet.text, term)
        ]
        draft_project = bullet.paragraph_id.startswith("projects.") and any(
            contains_term(bullet.text, term) and not contains_term(source, term)
            for term in draft_terms or set()
        )
        severe_shortening = len(bullet.text) < ((0.75 if draft_project else 0.90) * len(source))
        # An existing target annotation is not evidence that a change helps.
        # Without new role coverage, accept only additional concrete detail that
        # is established elsewhere in this same employer/project's source text.
        section = bullet.source_paragraph_id.rsplit(".bullet.", 1)[0]
        added_detail = _new_concrete_detail(source, bullet.text)
        source_context = " ".join(
            text for pid, text in source_by_id.items() if pid.startswith(section + ".")
        )
        grounded_detail = len(added_detail) >= 2 and all(
            word in _content_words(source_context) for word in added_detail
        )
        existing_target_reframe = grounded_detail and substantive_reframe(source, bullet.text) and any(
            keyword.accepted and keyword.normalized not in SOFT_TERMS
            and contains_term(source, keyword.term) and contains_term(bullet.text, keyword.term)
            for keyword in keywords
        )
        new_terms = [keyword for keyword in new_terms if keyword.accepted]
        no_target_value = bullet.text != source and not new_terms and not existing_target_reframe and not draft_project
        if severe_shortening or no_target_value or missing_systems or missing_context:
            reasons = []
            if severe_shortening:
                reasons.append(f"retained only {len(bullet.text)} of {len(source)} source characters")
            if no_target_value:
                reasons.append("did not add or substantively reframe a relevant responsibility")
            if missing_systems or missing_context:
                reasons.append("dropped protected phrases: " + ", ".join(missing_systems + missing_context))
            feedback.append(f"{bullet.paragraph_id} was restored before validation because it "
                            + "; ".join(reasons)
                            + ". Rewrite the full source with these constraints preserved; merely repeating the rejected wording will be restored again.")
            bullet.text = source
            if no_target_value:
                bullet.shorter_text = source
                bullet.target_terms = [term for term in bullet.target_terms if contains_term(source, term)]
        if bullet.text == source and len(bullet.shorter_text) >= len(source):
            bullet.shorter_text = source
    if _check_shorter:
        fallback = plan.model_copy(deep=True)
        for bullet in fallback.bullets:
            bullet.text = bullet.shorter_text
        _restore_unjustified_shortening(fallback, document, keywords, draft_terms=draft_terms, _check_shorter=False)
        for primary, checked in zip(plan.bullets, fallback.bullets, strict=True):
            # Restoring a cosmetic fallback may recover a source longer than a
            # legitimate concise primary. Identical fallback is safe and avoids
            # rejecting the useful primary or manufacturing another rewrite.
            primary.shorter_text = checked.text if len(checked.text) <= len(primary.text) else primary.text
    return feedback


def _repair_equal_length_fallbacks(
    plan: RewritePlan,
    document: ResumeDocument,
    *,
    draft_terms: set[str] | None = None,
) -> None:
    """Use shorter source evidence when a model supplied an equal-length fallback."""
    source_by_id = {paragraph.paragraph_id: paragraph.text for paragraph in document.paragraphs}
    for bullet in plan.bullets:
        source = source_by_id.get(bullet.source_paragraph_id, "")
        if (
            source
            and len(bullet.shorter_text) == len(bullet.text)
            and bullet.shorter_text != bullet.text
            and len(source) < len(bullet.text)
            and not (
                bullet.paragraph_id.startswith("projects.")
                and any(contains_term(bullet.text, term) for term in draft_terms or set())
            )
        ):
            bullet.shorter_text = source


def _sanitize_shorter_fallbacks(
    plan: RewritePlan,
    document: ResumeDocument,
    *,
    draft_terms: set[str] | None = None,
) -> None:
    """Make every layout fallback preserve the base resume's evidence density."""
    source_by_id = {paragraph.paragraph_id: paragraph.text for paragraph in document.paragraphs}

    def unsafe(source: str, candidate: str, *, min_ratio: float = 0.90) -> bool:
        missing_system = any(
            contains_term(source, term) and not preserves_source_term(candidate, term)
            for term in SYSTEM_TERMS
        )
        missing_context = any(
            contains_term(source, term) and not contains_term(candidate, term)
            for term in SOURCE_CONTEXT_TERMS
        )
        return len(candidate) < (min_ratio * len(source)) or missing_system or missing_context

    summary_source = source_by_id.get("summary", "")
    if summary_source and unsafe(summary_source, plan.summary.shorter_text):
        plan.summary.shorter_text = summary_source

    for bullet in plan.bullets:
        source = source_by_id.get(bullet.source_paragraph_id, "")
        draft_project = bullet.paragraph_id.startswith("projects.") and any(
            contains_term(bullet.shorter_text, term) and not contains_term(source, term)
            for term in draft_terms or set()
        )
        if source and unsafe(
            source, bullet.shorter_text, min_ratio=0.75 if draft_project else 0.90
        ):
            bullet.shorter_text = source


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
            or match.strength
            not in {EvidenceStrength.unsupported, EvidenceStrength.weakly_transferable}
        ):
            continue
        placement = _find_placement(reasoning, keyword.term)
        if any(
            risk.selected_placement == placement
            and (contains_term(risk.claim, keyword.term) or contains_term(keyword.term, risk.claim))
            for risk in known_risks
        ):
            continue
        is_unsupported = match.strength == EvidenceStrength.unsupported
        new_risk = ClaimRisk(
            claim=keyword.term,
            target_requirement=match.target_requirement,
            evidence_ids=[match.evidence_id] if match.evidence_id else [],
            strength=match.strength,
            risk_level=RiskLevel.high if is_unsupported else RiskLevel.medium,
            explanation=(
                "Inserted despite insufficient export evidence; the protected fallback will "
                "remove it before the resume is written."
            ),
            selected_placement=placement,
            export_allowed=False,
        )
        reasoning.rewrite_plan.claim_risks.append(new_risk)
        known_risks.append(new_risk)


def _enforce_export_boundaries(plan: RewritePlan, base: ResumeDocument) -> None:
    """Remove model-authored claims that the same plan marks as unsafe to export."""
    base_by_id = {paragraph.paragraph_id: paragraph for paragraph in base.paragraphs}
    bullet_by_id = {bullet.paragraph_id: bullet for bullet in plan.bullets}
    skill_by_id = {line.paragraph_id: line for line in plan.skills.lines}

    for bullet in plan.bullets:
        if any(not risk.export_allowed for risk in bullet.claim_risks):
            source = base_by_id.get(bullet.paragraph_id)
            bullet.text = source.text if source is not None else bullet.shorter_text
            bullet.shorter_text = bullet.text

    for risk in plan.claim_risks:
        if risk.export_allowed:
            continue
        placement_match = re.search(
            r"(?:summary|skills\.[\w.]+|(?:experience|projects)\.[\w.]+\.bullet\.\d+)",
            risk.selected_placement,
            re.IGNORECASE,
        )
        if placement_match is None:
            continue
        paragraph_id = placement_match.group(0).casefold()
        if paragraph_id == "summary":
            source = base_by_id.get("summary")
            plan.summary.text = source.text if source is not None else plan.summary.shorter_text
            plan.summary.shorter_text = plan.summary.text
            continue
        placed_bullet = bullet_by_id.get(paragraph_id)
        if placed_bullet is not None:
            source = base_by_id.get(paragraph_id)
            placed_bullet.text = source.text if source is not None else placed_bullet.shorter_text
            placed_bullet.shorter_text = placed_bullet.text
            continue
        skill = skill_by_id.get(paragraph_id)
        source = base_by_id.get(paragraph_id)
        if skill is not None and source is not None:
            original = split_skill_values(source.text.split(":", 1)[-1])
            skill.skills = original
            skill.shorter_skills = list(original)


def _normalize_claim_risk_placements(
    reasoning: ReasoningResult,
    keywords: list[JobKeyword],
) -> None:
    """Make model-authored risk placements agree with the actual proposed resume."""
    risks = [*reasoning.rewrite_plan.claim_risks]
    for bullet in reasoning.rewrite_plan.bullets:
        risks.extend(bullet.claim_risks)
    for risk in risks:
        keyword = next(
            (item for item in keywords if item.normalized in {
                normalized_term(risk.claim), normalized_term(risk.target_requirement)
            }),
            None,
        ) or next(
            (item for item in keywords if contains_term(risk.claim, item.term)),
            None,
        ) or next(
            (item for item in keywords if contains_term(risk.target_requirement, item.term)),
            None,
        )
        if keyword is None:
            continue
        placement = _find_placement(reasoning, keyword.term)
        if placement == "unknown":
            continue
        risk.selected_placement = placement
        risk.explanation = (
            f"{keyword.term} is placed in {placement} using {risk.strength.value.replace('_', ' ')} "
            "evidence; verify this wording before applying."
        )


def _ensure_transferable_review_risks(
    reasoning: ReasoningResult,
    keywords: list[JobKeyword],
    document: ResumeDocument,
) -> None:
    """Audit newly inserted adjacent-duty claims that deserve a human wording check."""
    base_text = "\n".join(paragraph.text for paragraph in document.paragraphs)
    known = collect_claim_risks(reasoning.rewrite_plan)
    matches = {
        normalized_term(match.target_term): match for match in reasoning.transferability_map.matches
    }
    for keyword in keywords:
        match = matches.get(keyword.normalized)
        if (
            keyword.normalized not in TRANSFERABLE_REVIEW_TERMS
            or match is None
            or match.strength
            not in {EvidenceStrength.strongly_transferable, EvidenceStrength.weakly_transferable}
            or contains_term(base_text, keyword.term)
        ):
            continue
        placement = _find_placement(reasoning, keyword.term)
        if placement == "unknown" or any(
            contains_term(risk.claim, keyword.term)
            or contains_term(risk.target_requirement, keyword.term)
            for risk in known
        ):
            continue
        risk = ClaimRisk(
            claim=keyword.term,
            target_requirement=match.target_requirement,
            evidence_ids=[match.evidence_id] if match.evidence_id else [],
            strength=match.strength,
            risk_level=RiskLevel.medium,
            explanation=(
                f"{keyword.term} is supported by adjacent evidence in "
                f"{match.evidence_id or 'the base resume'}; verify the exact wording."
            ),
            selected_placement=placement,
            export_allowed=True,
        )
        reasoning.rewrite_plan.claim_risks.append(risk)
        known.append(risk)


def _normalize_acronym_redundancy(plan: RewritePlan) -> None:
    """Collapse awkward acronym/full-name duplication without dropping either ATS form."""

    def normalize(value: str) -> str:
        value = re.sub(
            r"\bsupport SLA(?:s)? and Service Level Agreements\b",
            "meet Service Level Agreements (SLA) targets",
            value,
            flags=re.IGNORECASE,
        )
        value = re.sub(
            r"^Resolved 200\+ (.*?) using task prioritization to maintain "
            r"(sub-\d+-minute average resolution)\.$",
            r"Applied task prioritization while resolving 200+ \1, maintaining \2.",
            value,
            flags=re.IGNORECASE,
        )
        return re.sub(
            r"\bSLA(?:s)? and Service Level Agreements\b",
            "Service Level Agreements (SLA)",
            value,
            flags=re.IGNORECASE,
        )

    plan.summary.text = normalize(plan.summary.text)
    plan.summary.shorter_text = normalize(plan.summary.shorter_text)
    for bullet in plan.bullets:
        bullet.text = normalize(bullet.text)
        bullet.shorter_text = normalize(bullet.shorter_text)


def _normalize_prose_collocations(plan: RewritePlan) -> None:
    """Repair recurring literal-keyword constructions while retaining the exact terms."""

    def normalize(value: str) -> str:
        value = re.sub(
            r"\bcoordinating cross-functional collaboration\b",
            "supporting cross-functional collaboration",
            value,
            flags=re.IGNORECASE,
        )
        value = re.sub(
            r"\bthrough user access management\b",
            "by managing user access",
            value,
            flags=re.IGNORECASE,
        )
        value = re.sub(
            r"\bupdate validation, customer service, and training for\b",
            "validating updates, and delivering customer service and training to",
            value,
            flags=re.IGNORECASE,
        )
        value = re.sub(
            r"\bMaintained (.*?), demonstrating organizational skills while coordinating\b",
            r"Applied organizational skills to maintain \1 while coordinating",
            value,
            flags=re.IGNORECASE,
        )
        value = re.sub(
            r"\bMaintained (.*?) while coordinating (.*?), demonstrating organizational skills\.",
            r"Applied organizational skills to maintain \1 while coordinating \2.",
            value,
            flags=re.IGNORECASE,
        )
        value = re.sub(
            r", and system maintenance(?=\s+across\b)",
            "",
            value,
            flags=re.IGNORECASE,
        )
        value = re.sub(
            r"\b(applying|using) (.*?), and Service Level Agreements\b",
            r"\1 \2 while meeting Service Level Agreements",
            value,
            flags=re.IGNORECASE,
        )
        value = re.sub(
            r"\b(applying|using) (.*?) within Service Level Agreements\b",
            r"\1 \2 while meeting Service Level Agreements",
            value,
            flags=re.IGNORECASE,
        )
        value = re.sub(
            r"\bSupport (.*?) through customer service, user-access management, "
            r"troubleshooting (.*?), validating (.*?), and training (.*?)\.",
            r"Provide customer service for \1 by managing user access, "
            r"troubleshooting \2, validating \3, and training \4.",
            value,
            flags=re.IGNORECASE,
        )
        value = re.sub(
            r"\bSupport (.*?) through customer service, user-access management, "
            r"production troubleshooting, update validation, and training for (.*?)\.",
            r"Provide customer service for \1 by managing user access, troubleshooting "
            r"production issues, validating updates, and training \2.",
            value,
            flags=re.IGNORECASE,
        )
        value = re.sub(
            r"\bSupport (.*?) through customer service, user-access management, "
            r"troubleshooting (.*?), update validation, and training for (.*?)\.",
            r"Provide customer service for \1 by managing user access, "
            r"troubleshooting \2, validating updates, and training \3.",
            value,
            flags=re.IGNORECASE,
        )
        value = re.sub(
            r"\bMaintained (.*?) while coordinating with (.*?), demonstrating "
            r"written and verbal communication skills\.",
            r"Applied written and verbal communication skills to maintain \1 while "
            r"coordinating with \2.",
            value,
            flags=re.IGNORECASE,
        )
        value = re.sub(
            r"\bSupported incident management through (.*?), using cross-functional "
            r"collaboration and written and verbal communication skills with (.*?)\.",
            r"Supported incident management by maintaining \1 while applying written and "
            r"verbal communication skills during cross-functional collaboration with \2.",
            value,
            flags=re.IGNORECASE,
        )
        return re.sub(r",\s*,", ",", value)

    plan.summary.text = normalize(plan.summary.text)
    plan.summary.shorter_text = normalize(plan.summary.shorter_text)
    for bullet in plan.bullets:
        bullet.text = normalize(bullet.text)
        bullet.shorter_text = normalize(bullet.shorter_text)


def _prune_absent_claim_risks(plan: RewritePlan, keywords: list[JobKeyword]) -> None:
    """Remove model review notes when the associated keyword is absent from the draft."""
    proposed_text = "\n".join(all_proposed_text(plan))

    def present(risk: ClaimRisk) -> bool:
        keyword = next(
            (
                item
                for item in keywords
                if contains_term(risk.claim, item.term)
                or contains_term(risk.target_requirement, item.term)
            ),
            None,
        )
        if keyword is not None:
            return contains_term(proposed_text, keyword.term)
        return contains_term(proposed_text, risk.claim)

    plan.claim_risks = [risk for risk in plan.claim_risks if present(risk)]
    for bullet in plan.bullets:
        bullet.claim_risks = [risk for risk in bullet.claim_risks if present(risk)]


def _final_claim_risks(
    plan: RewritePlan,
    keywords: list[JobKeyword],
    final_document: ResumeDocument,
) -> list[ClaimRisk]:
    """Report only review flags whose associated term survived into the final DOCX."""
    final_by_id = {p.paragraph_id: p.text for p in final_document.paragraphs}
    final_text = "\n".join(final_by_id.values())
    retained: list[ClaimRisk] = []
    indexes: dict[tuple[str, str], int] = {}
    risk_rank = {RiskLevel.low: 0, RiskLevel.medium: 1, RiskLevel.high: 2}
    for risk in collect_claim_risks(plan):
        keyword = next(
            (
                item
                for item in sorted(keywords, key=lambda item: len(item.term), reverse=True)
                if contains_term(risk.claim, item.term)
                or contains_term(risk.target_requirement, item.term)
            ),
            None,
        )
        # A term in Skills or another employer cannot preserve a warning about a
        # project placement that layout repair removed. Empty placement is the
        # legacy document-wide scope; unknown explicit placements are absent.
        placement_text = (
            final_by_id.get(risk.selected_placement, "") if risk.selected_placement else final_text
        )
        if keyword is not None and not contains_term(placement_text, keyword.term):
            continue
        key = (
            keyword.normalized if keyword is not None else normalized_term(risk.claim),
            risk.selected_placement.casefold(),
        )
        existing_index = indexes.get(key)
        if existing_index is None:
            indexes[key] = len(retained)
            retained.append(risk)
        elif risk_rank[risk.risk_level] > risk_rank[retained[existing_index].risk_level]:
            retained[existing_index] = risk
    return retained


def _prune_resolved_nonexportable_risks(
    plan: RewritePlan,
    keywords: list[JobKeyword],
) -> None:
    """Drop review flags for unsafe terms that no longer exist after boundary enforcement."""
    proposed_text = "\n".join(all_proposed_text(plan))

    def remains(risk: ClaimRisk) -> bool:
        if risk.export_allowed:
            return True
        keyword = next(
            (
                item
                for item in keywords
                if contains_term(risk.claim, item.term)
                or contains_term(risk.target_requirement, item.term)
            ),
            None,
        )
        if keyword is not None:
            return contains_term(proposed_text, keyword.term)
        return contains_term(proposed_text, risk.claim)

    plan.claim_risks = [risk for risk in plan.claim_risks if remains(risk)]
    for bullet in plan.bullets:
        bullet.claim_risks = [risk for risk in bullet.claim_risks if remains(risk)]


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


def _select_expansion_candidate(
    base: ResumeDocument,
    plan: RewritePlan,
    layout: LayoutResult,
    reverted: set[str],
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
    candidates: set[str] = set()
    for anchor in ("SKILLS", "EXPERIENCE", "PROJECTS", "EDUCATION", "CERTIFICATIONS"):
        if layout.section_anchor_deltas.get(anchor, 0.0) < -2.5:
            candidates = anchor_groups[anchor]
            break
    candidates -= reverted
    candidates = {
        paragraph_id
        for paragraph_id in candidates
        if _planned_text(plan, paragraph_id)
        != next(
            paragraph.text
            for paragraph in base.paragraphs
            if paragraph.paragraph_id == paragraph_id
        )
    }
    if not candidates:
        return None
    scored: list[tuple[float, str]] = []
    for paragraph_id in candidates:
        baseline_lines = layout.baseline_paragraph_line_counts.get(paragraph_id, 0)
        candidate_lines = layout.paragraph_line_counts.get(paragraph_id, 0)
        line_deficit = max(0, baseline_lines - candidate_lines)
        base_text = next(
            paragraph.text
            for paragraph in base.paragraphs
            if paragraph.paragraph_id == paragraph_id
        )
        planned_text = _planned_text(plan, paragraph_id)
        character_deficit = max(0, len(base_text) - len(planned_text))
        scored.append(((100 * line_deficit) + character_deficit, paragraph_id))
    return max(scored)[1] if scored else None


def _select_overflow_reversion_candidate(
    base: ResumeDocument,
    plan: RewritePlan,
    layout: LayoutResult,
    reverted: set[str],
) -> str | None:
    """Drop only the rewrite that still overflows after every safe compression."""
    base_text = {paragraph.paragraph_id: paragraph.text for paragraph in base.paragraphs}
    candidates = set(layout.overflow_paragraph_ids) & set(base.editable_paragraph_ids) - reverted
    if not candidates:
        section_candidates = {
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
        for anchor in ("SKILLS", "EXPERIENCE", "PROJECTS", "EDUCATION", "CERTIFICATIONS"):
            if layout.section_anchor_deltas.get(anchor, 0.0) > 2.5:
                candidates = section_candidates[anchor] - reverted
                break
    changed = [
        paragraph_id
        for paragraph_id in candidates
        if _planned_text(plan, paragraph_id) != base_text.get(paragraph_id, "")
    ]
    if not changed:
        return None
    return max(
        changed,
        key=lambda paragraph_id: (
            layout.paragraph_line_counts.get(paragraph_id, 0)
            - layout.baseline_paragraph_line_counts.get(paragraph_id, 0),
            len(_planned_text(plan, paragraph_id)) - len(base_text[paragraph_id]),
        ),
    )


def _planned_text(plan: RewritePlan, paragraph_id: str) -> str:
    if paragraph_id == "summary":
        return plan.summary.text
    skill = next(
        (item for item in plan.skills.lines if item.paragraph_id == paragraph_id),
        None,
    )
    if skill:
        return f"{skill.category}: {', '.join(skill.skills)}"
    bullet = next(
        (item for item in plan.bullets if item.paragraph_id == paragraph_id),
        None,
    )
    return bullet.text if bullet else ""


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
