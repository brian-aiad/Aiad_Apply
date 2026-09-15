from __future__ import annotations

import re
from collections import Counter

from aiadapply_v2.documents.formatting import compare_format_integrity
from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.evidence.loaders import SYSTEM_TERMS
from aiadapply_v2.grading.keywords import NON_PROSE_QUALIFICATIONS, important_keywords
from aiadapply_v2.planning.rewrite_plan import all_proposed_text
from aiadapply_v2.schemas import (
    EvidenceStrength,
    JobKeyword,
    ResumeDocument,
    RewritePlan,
    TargetRoleProfile,
    ValidationIssue,
    ValidationResult,
)
from aiadapply_v2.text import contains_term, split_skill_values

QUALITY_STOPWORDS = {
    "a",
    "an",
    "and",
    "as",
    "at",
    "by",
    "for",
    "from",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to",
    "using",
    "with",
}
WEAK_FILLER_PHRASES = (
    "results-driven",
    "dynamic professional",
    "proven track record",
    "seasoned professional",
    "highly motivated",
)


def _normalized_words(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9+#.]+", value.casefold())
        if token not in QUALITY_STOPWORDS and len(token) > 1
    }


def _meaning_similarity(left: str, right: str) -> float:
    left_words = _normalized_words(left)
    right_words = _normalized_words(right)
    if min(len(left_words), len(right_words)) < 5:
        return 0.0
    return len(left_words & right_words) / len(left_words | right_words)


def _opening_word(value: str) -> str:
    match = re.search(r"[A-Za-z]+", value)
    return match.group(0).casefold() if match else ""


def _language_quality_issues(
    base: ResumeDocument,
    plan: RewritePlan,
) -> list[ValidationIssue]:
    """Flag safe-but-poor prose separately from factual validation failures."""
    source_by_id = {
        paragraph.paragraph_id: paragraph.text
        for paragraph in base.paragraphs
        if paragraph.kind.value == "bullet" and paragraph.editable
    }
    proposed = [bullet.text for bullet in plan.bullets]
    source = [source_by_id.get(bullet.source_paragraph_id, "") for bullet in plan.bullets]
    issues: list[ValidationIssue] = []

    proposed_openings = Counter(_opening_word(text) for text in proposed)
    source_openings = Counter(_opening_word(text) for text in source)
    for opening, count in proposed_openings.items():
        if opening and count >= 3 and count > source_openings[opening]:
            issues.append(
                ValidationIssue(
                    code="repeated_bullet_opening",
                    message=(
                        f'{count} bullets begin with "{opening.title()}" after tailoring. '
                        "Review for natural variation without weakening precise verbs."
                    ),
                    severity="warning",
                )
            )

    for index, bullet in enumerate(plan.bullets):
        original = source[index]
        changed = " ".join(original.split()) != " ".join(bullet.text.split())
        if not changed:
            continue
        if len(bullet.text) > max(240, int(len(original) * 1.25)):
            issues.append(
                ValidationIssue(
                    code="long_changed_bullet",
                    message=(
                        f"A changed bullet is {len(bullet.text)} characters and materially longer "
                        "than its source. Review scanability and layout pressure."
                    ),
                    paragraph_id=bullet.paragraph_id,
                    severity="warning",
                )
            )
        lowered = bullet.text.casefold()
        filler = next((phrase for phrase in WEAK_FILLER_PHRASES if phrase in lowered), None)
        if filler and filler not in original.casefold():
            issues.append(
                ValidationIssue(
                    code="generic_filler_added",
                    message=f'Tailoring introduced generic filler: "{filler}".',
                    paragraph_id=bullet.paragraph_id,
                    severity="warning",
                )
            )
        if bullet.text.count(";") >= 3 and bullet.text.count(";") > original.count(";"):
            issues.append(
                ValidationIssue(
                    code="punctuation_density",
                    message="A changed bullet introduced three or more semicolons.",
                    paragraph_id=bullet.paragraph_id,
                    severity="warning",
                )
            )

    for index, left in enumerate(proposed):
        for other_index in range(index + 1, len(proposed)):
            proposed_similarity = _meaning_similarity(left, proposed[other_index])
            source_similarity = _meaning_similarity(source[index], source[other_index])
            if proposed_similarity >= 0.78 and proposed_similarity > source_similarity + 0.12:
                issues.append(
                    ValidationIssue(
                        code="semantic_bullet_repetition",
                        message=(
                            "Two tailored bullets now communicate substantially overlapping "
                            "evidence. Preserve distinct accomplishments."
                        ),
                        paragraph_id=plan.bullets[other_index].paragraph_id,
                        severity="warning",
                    )
                )
    return issues


def validate_rewrite_plan(
    base: ResumeDocument,
    plan: RewritePlan,
    keywords: list[JobKeyword],
    profile: TargetRoleProfile,
    *,
    forbidden_terms: list[str] | None = None,
    coverage_keywords: list[JobKeyword] | None = None,
) -> ValidationResult:
    issues: list[ValidationIssue] = []
    expected_skill_ids = {
        paragraph.paragraph_id
        for paragraph in base.paragraphs
        if paragraph.kind.value == "skill_line"
    }
    actual_skill_ids = {line.paragraph_id for line in plan.skills.lines}
    fixed_skill_categories = {
        paragraph.paragraph_id: paragraph.text.split(":", 1)[0].strip()
        for paragraph in base.paragraphs
        if paragraph.kind.value == "skill_line"
    }
    expected_bullet_ids = {
        paragraph.paragraph_id
        for paragraph in base.paragraphs
        if paragraph.kind.value == "bullet" and paragraph.editable
    }
    actual_bullet_ids = {bullet.paragraph_id for bullet in plan.bullets}
    source_bullets = Counter(
        " ".join(paragraph.text.casefold().split())
        for paragraph in base.paragraphs
        if paragraph.kind.value == "bullet" and paragraph.editable
    )
    proposed_bullets = Counter(" ".join(bullet.text.casefold().split()) for bullet in plan.bullets)
    for text, count in proposed_bullets.items():
        if count > max(1, source_bullets[text]):
            issues.append(
                ValidationIssue(
                    code="duplicate_bullet",
                    message="Tailoring introduced duplicate bullets. Preserve the distinct source accomplishments.",
                )
            )

    issues.extend(_language_quality_issues(base, plan))

    if expected_skill_ids != actual_skill_ids:
        issues.append(
            ValidationIssue(
                code="skill_slots_changed",
                message=(
                    f"Expected skill slots {sorted(expected_skill_ids)}, "
                    f"got {sorted(actual_skill_ids)}."
                ),
            )
        )
    for line in plan.skills.lines:
        if fixed_skill_categories.get(line.paragraph_id) != line.category:
            issues.append(
                ValidationIssue(
                    code="skill_category_changed",
                    message=(
                        f"Skill category {line.paragraph_id} must remain "
                        f"{fixed_skill_categories.get(line.paragraph_id)!r}."
                    ),
                    paragraph_id=line.paragraph_id,
                )
            )
        source_skill_line = next(
            (
                paragraph.text
                for paragraph in base.paragraphs
                if paragraph.paragraph_id == line.paragraph_id
            ),
            "",
        )
        source_skills = split_skill_values(source_skill_line.split(":", 1)[-1])
        missing_base_skills = [
            skill
            for skill in source_skills
            if not any(contains_term(value, skill) for value in line.skills)
        ]
        if missing_base_skills:
            issues.append(
                ValidationIssue(
                    code="base_skill_removed",
                    message=(
                        "Tailoring removed verified base skills: "
                        + ", ".join(missing_base_skills)
                        + ". Preserve them in this skill category."
                    ),
                    paragraph_id=line.paragraph_id,
                )
            )
    if expected_bullet_ids != actual_bullet_ids:
        issues.append(
            ValidationIssue(
                code="bullet_slots_changed",
                message=(
                    f"Expected bullet slots {sorted(expected_bullet_ids)}, "
                    f"got {sorted(actual_bullet_ids)}."
                ),
            )
        )

    valid_sources_by_section: dict[str, set[str]] = {}
    for paragraph in base.paragraphs:
        if paragraph.kind.value == "bullet":
            valid_sources_by_section.setdefault(paragraph.section, set()).add(
                paragraph.paragraph_id
            )
    paragraph_section = {paragraph.paragraph_id: paragraph.section for paragraph in base.paragraphs}
    for bullet in plan.bullets:
        section = paragraph_section.get(bullet.paragraph_id, "")
        if bullet.source_paragraph_id not in valid_sources_by_section.get(section, set()):
            issues.append(
                ValidationIssue(
                    code="cross_role_bullet_source",
                    message="A bullet may only reorder evidence within its existing role.",
                    paragraph_id=bullet.paragraph_id,
                )
            )
        boundary_enforced = any(not risk.export_allowed for risk in bullet.claim_risks)
        invalid_shorter = (
            not bullet.shorter_text
            or len(bullet.shorter_text) > len(bullet.text)
            or (not boundary_enforced and len(bullet.shorter_text) == len(bullet.text))
        )
        if invalid_shorter:
            issues.append(
                ValidationIssue(
                    code="invalid_shorter_candidate",
                    message=(
                        "shorter_text must be present and shorter than the primary bullet, "
                        "unless an export boundary already selected that fallback."
                    ),
                    paragraph_id=bullet.paragraph_id,
                )
            )
        source = next(
            (
                paragraph.text
                for paragraph in base.paragraphs
                if paragraph.paragraph_id == bullet.source_paragraph_id
            ),
            "",
        )
        missing_systems = [
            term
            for term in SYSTEM_TERMS
            if contains_term(source, term) and not contains_term(bullet.text, term)
        ]
        if missing_systems:
            issues.append(
                ValidationIssue(
                    code="source_system_removed",
                    message=(
                        "Primary rewrite removed established source systems/tools: "
                        + ", ".join(missing_systems)
                        + ". Preserve them or keep the source paragraph unchanged."
                    ),
                    paragraph_id=bullet.paragraph_id,
                )
            )
    summary_boundary_enforced = any(
        not risk.export_allowed and "summary" in risk.selected_placement.casefold()
        for risk in plan.claim_risks
    )
    invalid_summary_fallback = (
        not plan.summary.shorter_text
        or len(plan.summary.shorter_text) > len(plan.summary.text)
        or (
            not summary_boundary_enforced
            and len(plan.summary.shorter_text) == len(plan.summary.text)
        )
    )
    if invalid_summary_fallback:
        issues.append(
            ValidationIssue(
                code="invalid_shorter_summary",
                message=(
                    "The summary fallback must be shorter than the primary summary, unless an "
                    "export boundary already selected that fallback."
                ),
                paragraph_id="summary",
            )
        )

    identity_terms = {
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
            "Product Operations",
            "Technical Operations Specialist",
            "Application Support Specialist",
            "Application Support Engineer",
        ),
        "technical_operations_support": (
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
    }.get(profile.normalized_role_family, ())
    if identity_terms and not any(
        contains_term(plan.summary.text, term) for term in identity_terms
    ):
        issues.append(
            ValidationIssue(
                code="target_identity_missing",
                message=(
                    "Summary does not express the target role identity for "
                    f"{profile.normalized_role_family}."
                ),
                paragraph_id="summary",
            )
        )

    proposed = "\n".join(all_proposed_text(plan))
    protected = "\n".join(paragraph.text for paragraph in base.paragraphs if not paragraph.editable)
    resume_text = "\n".join((protected, proposed))
    for term in forbidden_terms or []:
        if contains_term(proposed, term):
            issues.append(
                ValidationIssue(
                    code="unsupported_keyword_inserted",
                    message=f"Remove unsupported target term from resume prose: {term}.",
                )
            )
    for keyword in important_keywords(keywords):
        if keyword.normalized not in NON_PROSE_QUALIFICATIONS and not contains_term(
            resume_text, keyword.term
        ):
            issues.append(
                ValidationIssue(
                    code="important_keyword_missing",
                    message=f"Important accepted keyword is absent: {keyword.term}.",
                )
            )

    unsupported_included = {
        match_term.casefold()
        for bullet in plan.bullets
        for risk in bullet.claim_risks
        for match_term in [risk.claim]
        if risk.strength == EvidenceStrength.unsupported
    }
    unsupported_included.update(
        risk.claim.casefold()
        for risk in plan.claim_risks
        if risk.strength == EvidenceStrength.unsupported
    )
    for keyword in keywords:
        if (
            keyword.accepted
            and contains_term(proposed, keyword.term)
            and keyword.normalized not in unsupported_included
            and any(
                risk.target_requirement.casefold() == keyword.normalized
                and risk.strength == EvidenceStrength.unsupported
                for risk in plan.claim_risks
            )
        ):
            issues.append(
                ValidationIssue(
                    code="unsupported_claim_unlabeled",
                    message=f"Unsupported inserted term lacks a placement risk: {keyword.term}.",
                    severity="warning",
                )
            )

    base_primary_chars = sum(
        len(paragraph.text)
        for paragraph in base.paragraphs
        if paragraph.editable and paragraph.kind.value in {"summary", "bullet", "skill_line"}
    )
    proposed_primary_chars = sum(len(text) for text in all_proposed_text(plan))
    if base_primary_chars and proposed_primary_chars < (0.90 * base_primary_chars):
        issues.append(
            ValidationIssue(
                code="resume_information_density_reduced",
                message=(
                    "Primary tailored content is more than 10% shorter than the protected base. "
                    "Keep useful source detail and leave low-value paragraphs unchanged."
                ),
            )
        )

    coverage = weighted_keyword_coverage(resume_text, coverage_keywords or keywords)
    errors = [issue for issue in issues if issue.severity == "error"]
    return ValidationResult(
        passed=not errors,
        issues=issues,
        protected_fields_passed=True,
        metrics_passed=True,
        structure_passed=not any(
            issue.code
            in {
                "skill_slots_changed",
                "skill_category_changed",
                "bullet_slots_changed",
                "cross_role_bullet_source",
            }
            for issue in errors
        ),
        keyword_coverage=coverage,
    )


def validate_candidate_docx(
    base: ResumeDocument,
    candidate_path: str,
    keywords: list[JobKeyword],
    *,
    coverage_keywords: list[JobKeyword] | None = None,
) -> ValidationResult:
    candidate = parse_resume_docx(candidate_path)
    issues: list[ValidationIssue] = []
    candidate_text = "\n".join(paragraph.text for paragraph in candidate.paragraphs)

    issues.extend(
        ValidationIssue(code=code, message=message)
        for code, message in compare_format_integrity(
            base_path=base.source_path,
            candidate_path=candidate_path,
        )
    )

    for protected in base.protected_strings:
        if protected not in candidate_text:
            issues.append(
                ValidationIssue(
                    code="protected_text_changed",
                    message=f"Protected text was changed or removed: {protected}",
                )
            )
    for hyperlink in base.protected_hyperlinks:
        if hyperlink not in candidate.protected_hyperlinks:
            issues.append(
                ValidationIssue(
                    code="hyperlink_changed",
                    message=f"Protected hyperlink was changed or removed: {hyperlink}",
                )
            )

    base_counts = _structure_counts(base)
    candidate_counts = _structure_counts(candidate)
    if base_counts != candidate_counts:
        issues.append(
            ValidationIssue(
                code="structure_changed",
                message=(
                    f"Structural counts differ: expected {base_counts}, got {candidate_counts}."
                ),
            )
        )

    if _normalized_metrics(base.protected_metrics_by_section) != _normalized_metrics(
        candidate.protected_metrics_by_section
    ):
        issues.append(
            ValidationIssue(
                code="protected_metrics_changed",
                message=(
                    "A verified numerical metric was added, removed, or moved to another section."
                ),
            )
        )

    new_numbers = _claim_numbers(candidate_text) - _claim_numbers(
        "\n".join(paragraph.text for paragraph in base.paragraphs)
    )
    if new_numbers:
        issues.append(
            ValidationIssue(
                code="new_numeric_claim",
                message=f"Candidate introduced new numeric tokens: {sorted(new_numbers)}.",
            )
        )

    for keyword in important_keywords(keywords):
        if keyword.normalized not in NON_PROSE_QUALIFICATIONS and not contains_term(
            candidate_text, keyword.term
        ):
            issues.append(
                ValidationIssue(
                    code="important_keyword_missing_after_compression",
                    message=(f"Compression removed an important accepted keyword: {keyword.term}."),
                    severity="warning",
                )
            )

    errors = [issue for issue in issues if issue.severity == "error"]
    return ValidationResult(
        passed=not errors,
        issues=issues,
        protected_fields_passed=not any(
            issue.code in {"protected_text_changed", "hyperlink_changed"} for issue in errors
        ),
        metrics_passed=not any(
            issue.code in {"protected_metrics_changed", "new_numeric_claim"} for issue in errors
        ),
        structure_passed=not any(
            issue.code
            in {
                "structure_changed",
                "package_parts_changed",
                "immutable_package_part_changed",
                "document_format_skeleton_changed",
                "section_properties_changed",
                "format_paragraph_count_changed",
                "paragraph_format_changed",
                "run_format_changed",
            }
            for issue in errors
        ),
        keyword_coverage=weighted_keyword_coverage(candidate_text, coverage_keywords or keywords),
    )


def weighted_keyword_coverage(text: str, keywords: list[JobKeyword]) -> float:
    accepted = [keyword for keyword in keywords if keyword.accepted]
    total = sum(max(keyword.hiring_importance, 1.0) for keyword in accepted)
    if not total:
        return 0.0
    matched = sum(
        max(keyword.hiring_importance, 1.0)
        for keyword in accepted
        if contains_term(text, keyword.term)
    )
    return round(100.0 * matched / total, 2)


def _structure_counts(document: ResumeDocument) -> dict[str, object]:
    return {
        "paragraphs": len(document.paragraphs),
        "sections": [section.section_id for section in document.sections],
        "bullets": {
            section.section_id: section.bullet_count
            for section in document.sections
            if section.bullet_count
        },
        "skill_lines": sum(
            paragraph.kind.value == "skill_line" for paragraph in document.paragraphs
        ),
    }


def _normalized_metrics(values: dict[str, list[str]]) -> dict[str, Counter[str]]:
    return {
        section: Counter(metric.casefold() for metric in metrics)
        for section, metrics in values.items()
    }


def _claim_numbers(text: str) -> set[str]:
    return set(re.findall(r"(?<![A-Za-z0-9])\d+(?:\.\d+)?\+?", text))
