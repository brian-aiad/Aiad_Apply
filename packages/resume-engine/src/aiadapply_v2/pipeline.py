from __future__ import annotations

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
from aiadapply_v2.evidence.loaders import SYSTEM_TERMS, TRANSFER_BRIDGES, build_evidence_graph
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
from aiadapply_v2.planning.rewrite_plan import all_proposed_text, collect_claim_risks
from aiadapply_v2.planning.stretch_lab import build_stretch_lab
from aiadapply_v2.profiling.role_profile import build_target_role_profile
from aiadapply_v2.reporting.writer import write_transformation_report
from aiadapply_v2.schemas import (
    ClaimRisk,
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
from aiadapply_v2.text import contains_term, normalized_term, split_skill_values
from aiadapply_v2.validation.resume import (
    validate_candidate_docx,
    validate_rewrite_plan,
)

PIPELINE_VERSION = "0.4.0"
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
) -> TransformationReport:
    _emit_progress(progress, "Parsing and grading the job posting")
    destination = Path(output_dir).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    job = parse_linkedin_simplify(raw_paste)
    output_basename = resume_basename(job.company, job.title)
    keywords = grade_job_keywords(job)
    loaded_candidate_profile = load_candidate_profile(candidate_profile)
    apply_candidate_profile_to_keywords(keywords, loaded_candidate_profile)
    base = parse_resume_docx(base_resume)

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
        add_candidate_profile_evidence(graph, loaded_candidate_profile)
        profile = build_target_role_profile(job, keywords)
        encoder = semantic_encoder or SentenceTransformerEncoder()
        preliminary_map = build_transferability_map(profile, keywords, graph, encoder)
        revision_feedback: list[str] = []
        reasoning: ReasoningResult | None = None
        plan_validation: ValidationResult | None = None
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
            _normalize_reasoning_keyword_profile(reasoning, keywords)
            _merge_transferability_map(reasoning, preliminary_map, keywords)
            reasoning.stretch_lab = build_stretch_lab(
                reasoning.role_profile,
                keywords,
                reasoning.transferability_map,
                reasoning.stretch_lab,
            )
            _prune_direct_evidence_risks(reasoning)
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
            skill_ineligible_terms = {
                *_certification_only_terms(preliminary_map),
                *NON_PROSE_QUALIFICATIONS,
            }
            _restore_unjustified_shortening(reasoning.rewrite_plan, base, supported_keywords)
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
            _ensure_transferable_review_risks(reasoning, keywords, base)
            _prune_absent_claim_risks(reasoning.rewrite_plan, keywords)
            _ensure_unsupported_risks(reasoning, keywords)
            _enforce_export_boundaries(reasoning.rewrite_plan, base)
            # A non-exportable claim can reset an entire paragraph to its protected source.
            # Reapply only deterministic, evidence-supported identity and terminology after
            # that reset so a model-authored unsafe placement cannot erase safe requirements.
            _ensure_target_identity(reasoning)
            _ensure_important_keyword_placement(reasoning, supported_keywords, base)
            _prune_resolved_nonexportable_risks(reasoning.rewrite_plan, keywords)
            plan_validation = validate_rewrite_plan(
                base,
                reasoning.rewrite_plan,
                supported_keywords,
                reasoning.role_profile,
                forbidden_terms=non_exportable_terms,
                coverage_keywords=keywords,
            )
            if plan_validation.passed:
                break
            revision_feedback = [
                issue.message for issue in plan_validation.issues if issue.severity == "error"
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
        _sanitize_shorter_fallbacks(reasoning.rewrite_plan, base)
        _ensure_target_identity(reasoning)

        selected_docx: Path | None = None
        selected_pdf: Path | None = None
        selected_validation: ValidationResult | None = None
        selected_layout = None
        last_layout: LayoutResult | None = None
        compressed_paragraph_ids: set[str] = set()
        reverted_paragraph_ids: set[str] = set()
        for attempt in range(1, (2 * len(base.editable_paragraph_ids)) + 3):
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
            )
            last_layout = layout
            if layout.passed:
                selected_docx = attempt_docx
                selected_pdf = attempt_pdf
                selected_validation = candidate_validation
                selected_layout = layout
                break
            expansion = _select_expansion_candidate(
                base,
                reasoning.rewrite_plan,
                layout,
                reverted_paragraph_ids,
            )
            if expansion:
                reverted_paragraph_ids.add(expansion)
                compressed_paragraph_ids.discard(expansion)
                continue
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

        output_docx = destination / f"{output_basename}.docx"
        output_pdf = destination / f"{output_basename}.pdf"
        write_ats_optimized_docx(selected_docx, output_docx)
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
            baseline_pdf=selected_pdf,
            document=parse_resume_docx(output_docx),
            baseline_document=parse_resume_docx(selected_docx),
        )
        if not optimized_validation.passed or not optimized_layout.passed:
            raise TransformationError(
                "ATS font optimization did not preserve the validated document and render."
            )
        if output_docx.stat().st_size > 2_500_000:
            raise TransformationError("Final DOCX exceeds the 2.5 MB ATS parsing limit.")
        shutil.copy2(optimized_pdf, output_pdf)
        selected_validation = optimized_validation
        _emit_progress(progress, "Writing the transformation audit and final artifacts")
        selected_layout.pdf_path = output_pdf

    final_document = parse_resume_docx(output_docx)
    report = TransformationReport(
        job=job,
        keywords=keywords,
        keyword_decisions=_build_keyword_decisions(
            keywords,
            reasoning.transferability_map,
            final_document,
        ),
        role_profile=reasoning.role_profile,
        transferability_map=reasoning.transferability_map,
        rewrite_plan=reasoning.rewrite_plan,
        stretch_lab=reasoning.stretch_lab,
        changes=_build_change_manifest(
            base,
            final_document,
            reasoning.rewrite_plan,
            compressed_paragraph_ids,
        ),
        claim_risks=_final_claim_risks(reasoning.rewrite_plan, keywords, final_document),
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
    _emit_progress(progress, "Transformation complete")
    return report


def _emit_progress(progress: Callable[[str], None] | None, message: str) -> None:
    if progress is not None:
        progress(message)


def _build_keyword_decisions(
    keywords: list[JobKeyword],
    transferability: TransferabilityMap,
    final_document: ResumeDocument,
) -> list[KeywordDecisionRecord]:
    final_by_id = {
        paragraph.paragraph_id: paragraph.text for paragraph in final_document.paragraphs
    }
    match_by_term = {match.target_term.casefold(): match for match in transferability.matches}
    decisions: list[KeywordDecisionRecord] = []
    for keyword in keywords:
        placements = [
            paragraph_id
            for paragraph_id, text in final_by_id.items()
            if contains_term(text, keyword.term)
        ]
        match = match_by_term.get(keyword.normalized)
        evidence_level = match.strength if match is not None else EvidenceStrength.unsupported
        if placements:
            explanation = "Placed in the strongest natural resume location."
        elif not keyword.accepted:
            explanation = keyword.rejection_reason or "Rejected as low-value scanner noise."
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
            explanation = "Not placed to preserve stronger evidence and the one-page layout."
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
        proposed[line.paragraph_id] = (
            f"{prefix}: {', '.join(line.skills)}",
            line.skills,
            [],
            "Fused the existing skill inventory with role-relevant terms.",
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


def _certification_only_terms(transferability: TransferabilityMap) -> set[str]:
    return {
        normalized_term(match.target_term)
        for match in transferability.matches
        if match.strength == EvidenceStrength.direct
        and (match.evidence_id or "").startswith("evidence.certifications.")
    }


def _prune_direct_evidence_risks(reasoning: ReasoningResult) -> None:
    """Remove model cautions that conflict with exact deterministic resume evidence."""
    direct_terms = [
        match.target_term
        for match in reasoning.transferability_map.matches
        if match.strength == EvidenceStrength.direct
    ]

    def substantiated(risk: ClaimRisk) -> bool:
        return any(
            contains_term(risk.claim, term) or contains_term(risk.target_requirement, term)
            for term in direct_terms
        )

    reasoning.rewrite_plan.claim_risks = [
        risk for risk in reasoning.rewrite_plan.claim_risks if not substantiated(risk)
    ]
    for bullet in reasoning.rewrite_plan.bullets:
        bullet.claim_risks = [risk for risk in bullet.claim_risks if not substantiated(risk)]


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
        _place_direct_category_keyword(reasoning.rewrite_plan, keyword)
        resume_text = _effective_resume_text(document, reasoning.rewrite_plan)
        if contains_term(resume_text, keyword.term):
            continue
        skill_line = _keyword_skill_line(reasoning.rewrite_plan, keyword)
        if not any(contains_term(skill, keyword.term) for skill in skill_line.skills):
            skill_line.skills.append(_display_skill(keyword.term))
    _trim_skill_lines_to_character_budgets(
        reasoning.rewrite_plan,
        document,
        placement_keywords,
    )
    _ensure_summary_strength_terms(reasoning.rewrite_plan, keywords, document)


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
        if not keyword.accepted:
            continue
        if not (
            keyword.hiring_importance >= 35
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
    if keyword.normalized == "problem-solving":
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
                    r"^Investigated production incidents",
                    "Applied problem-solving to production incidents",
                    value,
                    count=1,
                    flags=re.IGNORECASE,
                )
                setattr(bullet, field, value)
            if keyword.term.casefold() not in {term.casefold() for term in bullet.target_terms}:
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
    if keyword.normalized == "business analysis":
        bullet = next(
            (item for item in plan.bullets if item.paragraph_id == "experience.wehelp.bullet.1"),
            None,
        )
        if bullet and not contains_term(bullet.text, keyword.term):
            bullet.text = re.sub(
                r"^Identified the need",
                "Applied business analysis to identify the need",
                bullet.text,
                count=1,
                flags=re.IGNORECASE,
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
    """Retain a useful base-skill floor and add only credible job vocabulary."""
    base_lines = {
        paragraph.paragraph_id: split_skill_values(paragraph.text.split(":", 1)[1])
        for paragraph in document.paragraphs
        if paragraph.kind.value == "skill_line"
    }
    unsupported_normalized = {term.casefold() for term in (unsupported_terms or [])}
    ineligible_normalized = {term.casefold() for term in (skill_ineligible_terms or set())}
    credible_new = [
        keyword
        for keyword in keywords
        if keyword.accepted
        and keyword.hiring_importance >= 25
        and keyword.normalized not in unsupported_normalized
        and keyword.normalized not in ineligible_normalized
    ]
    relocated: dict[str, list[str]] = {}
    for line in plan.skills.lines:
        original = base_lines.get(line.paragraph_id, [])
        for value in line.skills:
            if any(_same_skill(value, base_value) for base_value in original):
                continue
            keyword = next(
                (item for item in credible_new if _matches_any_keyword(value, [item])),
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
        line.skills = _dedupe_skills([*original, *proposed, *relocated.get(line.paragraph_id, [])])
        line.shorter_skills = list(original)


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
    return contains_term(left, right) or contains_term(right, left)


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
    if normalized == "information security":
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
        original = split_skill_values(paragraph.text.split(":", 1)[1])
        _trim_skill_values(
            line.skills,
            fixed_prefix,
            full_budget,
            required,
            minimum_items=len(original),
            protected_values=original,
        )
        _trim_skill_values(
            line.shorter_skills,
            fixed_prefix,
            paragraph.character_budget,
            required,
            minimum_items=len(original),
            protected_values=original,
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
    protected_values: list[str] | None = None,
) -> None:
    while len(values) > minimum_items and len(f"{prefix}{', '.join(values)}") > budget:
        added_indexes = [
            index
            for index in range(len(values) - 1, -1, -1)
            if not any(_same_skill(values[index], item) for item in (protected_values or []))
        ]
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


def _restore_unjustified_shortening(
    plan: RewritePlan,
    document: ResumeDocument,
    keywords: list[JobKeyword],
) -> None:
    """Keep source evidence when a rewrite only makes a bullet smaller."""
    source_by_id = {paragraph.paragraph_id: paragraph.text for paragraph in document.paragraphs}
    summary_source = source_by_id.get("summary", "")
    if summary_source:
        summary_missing_systems = any(
            contains_term(summary_source, term) and not contains_term(plan.summary.text, term)
            for term in SYSTEM_TERMS
        )
        if len(plan.summary.text) < (0.90 * len(summary_source)) or summary_missing_systems:
            plan.summary.text = summary_source
    for bullet in plan.bullets:
        source = source_by_id.get(bullet.source_paragraph_id, "")
        if not source:
            continue
        new_terms = [
            keyword
            for keyword in keywords
            if contains_term(bullet.text, keyword.term) and not contains_term(source, keyword.term)
        ]
        missing_systems = [
            term
            for term in SYSTEM_TERMS
            if contains_term(source, term) and not contains_term(bullet.text, term)
        ]
        missing_context = [
            term
            for term in SOURCE_CONTEXT_TERMS
            if contains_term(source, term) and not contains_term(bullet.text, term)
        ]
        severe_shortening = len(bullet.text) < (0.90 * len(source))
        low_value_shortening = len(bullet.text) < len(source) and not new_terms
        no_target_value = bullet.text != source and not new_terms
        if (
            severe_shortening
            or low_value_shortening
            or no_target_value
            or missing_systems
            or missing_context
        ):
            bullet.text = source


def _sanitize_shorter_fallbacks(plan: RewritePlan, document: ResumeDocument) -> None:
    """Make every layout fallback preserve the base resume's evidence density."""
    source_by_id = {paragraph.paragraph_id: paragraph.text for paragraph in document.paragraphs}

    def unsafe(source: str, candidate: str) -> bool:
        missing_system = any(
            contains_term(source, term) and not contains_term(candidate, term)
            for term in SYSTEM_TERMS
        )
        missing_context = any(
            contains_term(source, term) and not contains_term(candidate, term)
            for term in SOURCE_CONTEXT_TERMS
        )
        return len(candidate) < (0.90 * len(source)) or missing_system or missing_context

    summary_source = source_by_id.get("summary", "")
    if summary_source and unsafe(summary_source, plan.summary.shorter_text):
        plan.summary.shorter_text = summary_source

    for bullet in plan.bullets:
        source = source_by_id.get(bullet.source_paragraph_id, "")
        if source and unsafe(source, bullet.shorter_text):
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
            continue
        placed_bullet = bullet_by_id.get(paragraph_id)
        if placed_bullet is not None:
            source = base_by_id.get(paragraph_id)
            placed_bullet.text = source.text if source is not None else placed_bullet.shorter_text
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
            (
                item
                for item in keywords
                if contains_term(risk.target_requirement, item.term)
                or contains_term(risk.claim, item.term)
            ),
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
        value = re.sub(
            r"^Investigated production incidents using (.*?), applying problem-solving "
            r"to isolate root cause and validate fixes in live environments\.$",
            r"Used problem-solving and \1 to investigate production incidents, isolate "
            r"root cause, and validate fixes in live environments.",
            value,
            flags=re.IGNORECASE,
        )
        value = re.sub(
            r"^Applied problem-solving to production incidents using (.*?), isolating "
            r"root cause and validating fixes in live environments\.$",
            r"Used problem-solving and \1 to investigate production incidents, isolate "
            r"root cause, and validate fixes in live environments.",
            value,
            flags=re.IGNORECASE,
        )
        value = re.sub(
            r"^Investigated production incidents through critical thinking and "
            r"problem-solving, (.*?), isolating root cause and validating fixes in "
            r"live environments\.$",
            r"Applied critical thinking, problem-solving, \1 to investigate production "
            r"incidents, isolate root cause, and validate fixes in live environments.",
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
    final_text = "\n".join(paragraph.text for paragraph in final_document.paragraphs)
    retained: list[ClaimRisk] = []
    indexes: dict[tuple[str, str], int] = {}
    risk_rank = {RiskLevel.low: 0, RiskLevel.medium: 1, RiskLevel.high: 2}
    for risk in collect_claim_risks(plan):
        keyword = next(
            (
                item
                for item in keywords
                if contains_term(risk.claim, item.term)
                or contains_term(risk.target_requirement, item.term)
            ),
            None,
        )
        if keyword is not None and not contains_term(final_text, keyword.term):
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
