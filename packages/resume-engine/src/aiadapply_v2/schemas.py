from __future__ import annotations

from enum import StrEnum
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class KeywordPriority(StrEnum):
    high = "high"
    low = "low"
    inferred = "inferred"


class KeywordKind(StrEnum):
    system = "system"
    action = "action"
    environment = "environment"
    qualification = "qualification"
    outcome = "outcome"
    vocabulary = "vocabulary"
    noise = "noise"


class KeywordContext(StrEnum):
    required = "required"
    responsibility = "responsibility"
    preferred = "preferred"
    job_title = "title"
    positive = "positive"
    scanner_only = "scanner_only"
    negative = "negative"


class EvidenceStrength(StrEnum):
    direct = "direct"
    strongly_transferable = "strongly_transferable"
    weakly_transferable = "weakly_transferable"
    unsupported = "unsupported"


class RiskLevel(StrEnum):
    low = "low"
    medium = "medium"
    high = "high"


class ParagraphKind(StrEnum):
    name = "name"
    contact = "contact"
    spacer = "spacer"
    summary = "summary"
    section_heading = "section_heading"
    skill_line = "skill_line"
    entry_heading = "entry_heading"
    bullet = "bullet"
    protected_body = "protected_body"


class ParsedJob(StrictModel):
    company: str = ""
    title: str = ""
    location: str = ""
    work_arrangement: str = ""
    compensation: str = ""
    source_url: str | None = None
    linkedin_url: str | None = None
    job_description: str
    responsibilities: list[str] = Field(default_factory=list)
    required_qualifications: list[str] = Field(default_factory=list)
    preferred_qualifications: list[str] = Field(default_factory=list)
    high_priority_keywords: list[str] = Field(default_factory=list)
    low_priority_keywords: list[str] = Field(default_factory=list)
    simplify_score: tuple[int, int] = (0, 0)
    rejected_regions: list[str] = Field(default_factory=list)
    raw_paste_sha256: str
    raw_paste: str = ""


class JobKeyword(StrictModel):
    term: str
    normalized: str
    priority: KeywordPriority = KeywordPriority.inferred
    kind: KeywordKind
    occurrences: int = 0
    source_sections: list[str] = Field(default_factory=list)
    scoring_factors: dict[str, float] = Field(default_factory=dict)
    hiring_importance: float = Field(ge=0.0, le=100.0)
    placement_utility: float = Field(ge=0.0, le=100.0)
    accepted: bool = True
    rejection_reason: str = ""
    context: KeywordContext = KeywordContext.positive
    context_snippets: list[str] = Field(default_factory=list)


class TargetRoleProfile(StrictModel):
    company: str = ""
    title: str
    normalized_role_family: str
    professional_identity: str
    seniority: str = "unknown"
    industry: list[str] = Field(default_factory=list)
    core_systems: list[str] = Field(default_factory=list)
    core_actions: list[str] = Field(default_factory=list)
    environment_signals: list[str] = Field(default_factory=list)
    customer_or_stakeholder_type: list[str] = Field(default_factory=list)
    primary_responsibilities: list[str] = Field(default_factory=list)
    required_qualifications: list[str] = Field(default_factory=list)
    preferred_qualifications: list[str] = Field(default_factory=list)
    high_priority_keywords: list[str] = Field(default_factory=list)
    secondary_keywords: list[str] = Field(default_factory=list)
    noisy_rejected_keywords: list[str] = Field(default_factory=list)
    expected_outcome_language: list[str] = Field(default_factory=list)
    expected_metrics: list[str] = Field(default_factory=list)
    role_specific_vocabulary: list[str] = Field(default_factory=list)
    role_specific_action_verbs: list[str] = Field(default_factory=list)


class TextRun(StrictModel):
    text: str
    bold: bool | None = None
    italic: bool | None = None
    underline: bool | None = None
    font_name: str | None = None
    font_size_points: float | None = None
    color: str | None = None
    style_id: str = ""
    hyperlink_target: str | None = None
    format_sha256: str = ""


class ResumeParagraph(StrictModel):
    paragraph_id: str
    index: int
    section: str
    kind: ParagraphKind
    text: str
    runs: list[TextRun] = Field(default_factory=list)
    editable: bool = False
    bullet_slot: int | None = None
    line_budget: int = 1
    character_budget: int = 0
    rendered_line_widths_points: list[float] = Field(default_factory=list)
    rendered_max_width_points: float = 0.0
    rendered_top_points: float | None = None
    rendered_bottom_points: float | None = None
    paragraph_format_sha256: str = ""
    run_format_sha256: list[str] = Field(default_factory=list)


class ResumeSection(StrictModel):
    section_id: str
    heading: str
    paragraph_ids: list[str]
    editable_paragraph_ids: list[str] = Field(default_factory=list)
    bullet_count: int = 0
    line_budget: int = 0


class ResumeDocument(StrictModel):
    source_path: Path
    source_sha256: str
    paragraphs: list[ResumeParagraph]
    sections: list[ResumeSection]
    protected_strings: list[str]
    protected_hyperlinks: list[str]
    protected_metrics_by_section: dict[str, list[str]]
    editable_paragraph_ids: list[str]
    page_width_points: float
    page_height_points: float
    margins_points: dict[str, float]
    package_parts: list[str] = Field(default_factory=list)
    immutable_package_part_sha256: dict[str, str] = Field(default_factory=dict)
    document_format_skeleton_sha256: str = ""
    section_properties_sha256: str = ""
    baseline_page_count: int | None = None
    baseline_rendered_lines: int | None = None


class EvidenceConcept(StrictModel):
    concept: str
    kind: KeywordKind
    direct_terms: list[str] = Field(default_factory=list)
    transferable_terms: list[str] = Field(default_factory=list)


class ResumeEvidence(StrictModel):
    evidence_id: str
    paragraph_id: str
    section: str
    source_text: str
    concepts: list[EvidenceConcept] = Field(default_factory=list)
    systems: list[str] = Field(default_factory=list)
    actions: list[str] = Field(default_factory=list)
    environment_signals: list[str] = Field(default_factory=list)
    outcomes: list[str] = Field(default_factory=list)
    metrics: list[str] = Field(default_factory=list)
    claim_scope: Literal["source_specific", "skills_only", "general_exposure"] = "source_specific"
    source_reference: str = ""
    routine_tool_context: bool = False
    established_technical_context: bool = False


class DraftTechnology(StrictModel):
    term: str
    paragraph_ids: list[str] = Field(default_factory=list)
    required: bool = True
    explanation: str = "Job-derived draft assumption; verify or edit before applying."


class ResumeEvidenceGraph(StrictModel):
    candidate_name: str
    document_sha256: str
    evidence: list[ResumeEvidence]
    draft_technologies: list[DraftTechnology] = Field(default_factory=list)
    automatic_technical_policy: bool = False


class CandidateEvidenceItem(StrictModel):
    term: str
    category: Literal["technology", "method", "domain", "qualification", "other"]
    scope: Literal["skills_only", "general_exposure", "source_specific"] = "skills_only"
    confidence: Literal["confirmed"] = "confirmed"
    source: str = "candidate_confirmation"
    evidence_reference: str = ""
    notes: str = ""


class CandidateProfile(StrictModel):
    candidate_name: str
    everyday_tools: list[str] = Field(default_factory=list)
    established_technologies: list[str] = Field(default_factory=list)
    automatic_technical_policy: bool = False
    confirmed_skills: list[str] = Field(default_factory=list)
    confirmed_exposure: list[str] = Field(default_factory=list)
    confirmed_evidence: list[CandidateEvidenceItem] = Field(default_factory=list)
    drafting_notes: list[str] = Field(default_factory=list)
    rejected_terms: list[str] = Field(default_factory=list)
    review_history: list[dict[str, str]] = Field(default_factory=list)


class EvidenceMatch(StrictModel):
    target_term: str
    target_requirement: str
    evidence_id: str | None = None
    source_text: str = ""
    semantic_score: float = Field(ge=0.0, le=1.0)
    action_compatibility: float = Field(ge=0.0, le=1.0)
    system_compatibility: float = Field(ge=0.0, le=1.0)
    environment_compatibility: float = Field(ge=0.0, le=1.0)
    outcome_compatibility: float = Field(ge=0.0, le=1.0)
    strength: EvidenceStrength
    reasoning: str
    suggested_placement: str


class TransferabilityMap(StrictModel):
    matches: list[EvidenceMatch] = Field(default_factory=list)
    direct_terms: list[str] = Field(default_factory=list)
    strongly_transferable_terms: list[str] = Field(default_factory=list)
    weakly_transferable_terms: list[str] = Field(default_factory=list)
    unsupported_terms: list[str] = Field(default_factory=list)


class StretchOpportunity(StrictModel):
    target_term: str
    evidence_strength: EvidenceStrength
    evidence_ids: list[str] = Field(default_factory=list)
    rationale: str
    review_question: str
    export_allowed: Literal[False] = False


class StretchGap(StrictModel):
    target_term: str
    category: Literal["technology", "method", "domain", "qualification", "other"]
    hiring_importance: float = Field(ge=0.0, le=100.0)
    why_it_matters: str
    proof_needed: list[str] = Field(default_factory=list)
    language_after_confirmation: str
    export_allowed: Literal[False] = False


class StretchProject(StrictModel):
    title: str
    status: Literal["proposed_not_completed"] = "proposed_not_completed"
    target_terms: list[str] = Field(default_factory=list)
    objective: str
    build_steps: list[str] = Field(default_factory=list)
    evidence_to_collect: list[str] = Field(default_factory=list)
    resume_language_after_completion: str
    export_allowed: Literal[False] = False


class StretchLab(StrictModel):
    disclaimer: str = (
        "Review-only development ideas. These items are not verified resume claims and are "
        "never exported into the application-ready resume."
    )
    transferable_opportunities: list[StretchOpportunity] = Field(default_factory=list)
    gaps: list[StretchGap] = Field(default_factory=list)
    proposed_projects: list[StretchProject] = Field(default_factory=list)


class ClaimRisk(StrictModel):
    claim: str
    target_requirement: str
    evidence_ids: list[str] = Field(default_factory=list)
    strength: EvidenceStrength
    risk_level: RiskLevel
    explanation: str
    selected_placement: str
    export_allowed: bool = True


class RewriteIntent(StrictModel):
    paragraph_id: str
    purpose: str
    target_terms: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    recruiter_priority: int = Field(ge=0, le=100)


class ProposedSummary(StrictModel):
    text: str
    shorter_text: str
    target_terms: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)


class ProposedSkillLine(StrictModel):
    paragraph_id: str
    category: str
    skills: list[str]
    shorter_skills: list[str] = Field(default_factory=list)


class ProposedSkills(StrictModel):
    lines: list[ProposedSkillLine]


class ProposedBullet(StrictModel):
    paragraph_id: str
    source_paragraph_id: str
    text: str
    shorter_text: str
    purpose: str
    target_terms: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    claim_risks: list[ClaimRisk] = Field(default_factory=list)


class RewritePlan(StrictModel):
    professional_identity: str
    summary: ProposedSummary
    skills: ProposedSkills
    bullets: list[ProposedBullet]
    intents: list[RewriteIntent] = Field(default_factory=list)
    claim_risks: list[ClaimRisk] = Field(default_factory=list)


class TechnologySummary(StrictModel):
    term: str
    summary: str = Field(
        min_length=1,
        max_length=240,
        description="One short plain-language sentence explaining what the technology is and its usual purpose, not candidate experience.",
    )


class TechnologyAssessment(StrictModel):
    term: str
    classification: Literal["common_development", "specialized_or_advanced", "unrelated"]
    duty_paragraph_ids: list[str] = Field(default_factory=list)
    reasoning: str
    usage_boundary: str


class ReasoningResult(StrictModel):
    role_profile: TargetRoleProfile
    transferability_map: TransferabilityMap
    rewrite_plan: RewritePlan
    stretch_lab: StretchLab = Field(default_factory=StretchLab)
    technology_assessments: list[TechnologyAssessment] = Field(default_factory=list)
    technology_summaries: list[TechnologySummary] = Field(default_factory=list)


class ValidationIssue(StrictModel):
    code: str
    message: str
    paragraph_id: str | None = None
    severity: Literal["warning", "error"] = "error"


class ValidationResult(StrictModel):
    passed: bool
    issues: list[ValidationIssue] = Field(default_factory=list)
    protected_fields_passed: bool = False
    metrics_passed: bool = False
    structure_passed: bool = False
    keyword_coverage: float = Field(default=0.0, ge=0.0, le=100.0)


class LayoutResult(StrictModel):
    passed: bool
    page_count: int
    rendered_lines: int
    section_anchor_deltas: dict[str, float] = Field(default_factory=dict)
    overflow_paragraph_ids: list[str] = Field(default_factory=list)
    paragraph_line_counts: dict[str, int] = Field(default_factory=dict)
    baseline_paragraph_line_counts: dict[str, int] = Field(default_factory=dict)
    paragraph_max_width_points: dict[str, float] = Field(default_factory=dict)
    paragraph_left_points: dict[str, float] = Field(default_factory=dict)
    paragraph_right_points: dict[str, float] = Field(default_factory=dict)
    bullet_marker_x_points: dict[str, float] = Field(default_factory=dict)
    bullet_first_line_x_points: dict[str, float] = Field(default_factory=dict)
    bullet_continuation_x_points: dict[str, float] = Field(default_factory=dict)
    bullet_alignment_issues: list[str] = Field(default_factory=list)
    skill_wrap_issues: list[str] = Field(default_factory=list)
    employer_heading_issues: list[str] = Field(default_factory=list)
    employer_spacing_issues: list[str] = Field(default_factory=list)
    section_geometry_issues: list[str] = Field(default_factory=list)
    protected_horizontal_deltas: dict[str, float] = Field(default_factory=dict)
    font_inventory: dict[str, list[float]] = Field(default_factory=dict)
    font_inventory_changed: bool = False
    right_edge_clearance_points: float = 0.0
    bottom_edge_clearance_points: float = 0.0
    density_band_deltas: list[int] = Field(default_factory=list)
    boundary_issues: list[str] = Field(default_factory=list)
    out_of_bounds_items: list[str] = Field(default_factory=list)
    overlap_items: list[str] = Field(default_factory=list)
    collapsed_tab_items: list[str] = Field(default_factory=list)
    pdf_path: Path | None = None
    attempts: int = 1


class KeywordDecisionRecord(StrictModel):
    term: str
    normalized: str
    kind: KeywordKind
    priority: KeywordPriority
    occurrences: int = 0
    source_sections: list[str] = Field(default_factory=list)
    hiring_importance: float = Field(ge=0.0, le=100.0)
    placement_utility: float = Field(ge=0.0, le=100.0)
    accepted: bool
    used: bool
    evidence_level: EvidenceStrength
    placements: list[str] = Field(default_factory=list)
    rejection_reason: str = ""
    explanation: str = ""
    context: KeywordContext = KeywordContext.positive
    context_snippets: list[str] = Field(default_factory=list)


class ResumeChangeRecord(StrictModel):
    paragraph_id: str
    section: str
    paragraph_kind: ParagraphKind
    before_text: str
    proposed_text: str
    final_text: str
    change_type: Literal["added", "removed", "reframed", "unchanged"]
    target_terms: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    risk_level: RiskLevel = RiskLevel.low
    compressed: bool = False
    explanation: str = ""
    added_terms: list[str] = Field(default_factory=list)


class TailoringSummary(StrictModel):
    relevant_bullets: int | None = None
    substantive_bullets_rewritten: int | None = None
    minimum_substantive_rewrites: int | None = None
    substantive_paragraph_ids: list[str] = Field(default_factory=list)
    experience_bullets_changed: int = 0
    project_bullets_changed: int = 0
    skills_rows_changed: int = 0
    summary_changed: bool = False
    newly_represented_terms: list[str] = Field(default_factory=list)
    already_present_terms: list[str] = Field(default_factory=list)


class KeywordCoverage(StrictModel):
    term: str
    category: str
    accepted: bool = True
    automatic_technical_use: bool = False
    evidence_ids: list[str] = Field(default_factory=list)
    eligible_bullet_ids: list[str] = Field(default_factory=list)
    required_bullet_groups: list[list[str]] = Field(default_factory=list)
    placements: list[str] = Field(default_factory=list)
    status: Literal[
        "in_context",
        "skills_only",
        "credential_only",
        "covered",
        "missing_supported",
        "available",
        "needs_confirmation",
        "excluded",
        "draft_assumption",
        "missing_draft",
    ]
    explanation: str


class ModelCallUsage(StrictModel):
    model: str
    input_tokens: int | None = Field(default=None, ge=0)
    cached_input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    prompt_characters: int = Field(default=0, ge=0)
    duration_seconds: float = Field(default=0, ge=0)
    succeeded: bool = False


class TransformationReport(StrictModel):
    job: ParsedJob
    keywords: list[JobKeyword]
    keyword_decisions: list[KeywordDecisionRecord] = Field(default_factory=list)
    role_profile: TargetRoleProfile
    transferability_map: TransferabilityMap
    rewrite_plan: RewritePlan
    stretch_lab: StretchLab = Field(default_factory=StretchLab)
    changes: list[ResumeChangeRecord] = Field(default_factory=list)
    tailoring_summary: TailoringSummary = Field(default_factory=TailoringSummary)
    keyword_coverage: list[KeywordCoverage] = Field(default_factory=list)
    technology_assessments: list[TechnologyAssessment] = Field(default_factory=list)
    technology_summaries: list[TechnologySummary] = Field(default_factory=list)
    tailoring_mode: Literal["aggressive_draft", "evidence_only"] = "evidence_only"
    draft_technologies: list[DraftTechnology] = Field(default_factory=list)
    claim_risks: list[ClaimRisk]
    validation: ValidationResult
    layout: LayoutResult
    output_docx: Path
    output_pdf: Path
    base_sha256: str
    reasoner: str
    model_calls: int = Field(default=1, ge=1)
    model_usage: list[ModelCallUsage] = Field(default_factory=list)
    document_candidates: int = Field(default=1, ge=1)
    layout_repairs: list[str] = Field(default_factory=list)
    pipeline_version: str
