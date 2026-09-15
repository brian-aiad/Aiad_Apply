from pathlib import Path

from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.evidence.loaders import build_evidence_graph
from aiadapply_v2.grading.keywords import grade_job_keywords
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify
from aiadapply_v2.planning.priorities import paragraph_priorities
from aiadapply_v2.profiling.role_profile import build_target_role_profile
from aiadapply_v2.semantic.matcher import LexicalSemanticEncoder, build_transferability_map
from aiadapply_v2.validation.resume import validate_rewrite_plan

from .helpers import identity_plan


def inputs():
    document = parse_resume_docx(Path("data/resumes/Brian_Aiad_BASE.docx"))
    job = parse_linkedin_simplify(Path("data/fixtures/floqast_full.txt").read_text(encoding="utf8"))
    keywords = grade_job_keywords(job)
    profile = build_target_role_profile(job, keywords)
    graph = build_evidence_graph(document, keywords)
    matches = build_transferability_map(profile, keywords, graph, LexicalSemanticEncoder())
    return document, keywords, profile, graph, matches


def test_priorities_never_suggest_unsupported_terms_or_protected_paragraphs():
    document, keywords, _, graph, matches = inputs()
    priorities = paragraph_priorities(document, keywords, graph, matches)
    assert priorities
    assert {item["paragraph_id"] for item in priorities} == set(document.editable_paragraph_ids)
    assert [item["priority"] for item in priorities] == sorted(
        [item["priority"] for item in priorities], reverse=True
    )
    forbidden = set(matches.unsupported_terms + matches.weakly_transferable_terms)
    assert all(not (set(item["missing_supported_terms"]) & forbidden) for item in priorities)
    assert all(
        item["priority"] == max(0, item["expected_benefit"] - item["rewrite_risk"])
        for item in priorities
    )
    assert all(
        item["preserve_original"] == (not item["missing_supported_terms"] or item["priority"] <= 0)
        for item in priorities
    )
    assert paragraph_priorities(document, [], graph, matches)[0]["priority"] == 0


def test_new_duplicate_accomplishments_are_rejected():
    document, keywords, profile, _, _ = inputs()
    plan = identity_plan(document)
    plan.bullets[1].text = plan.bullets[0].text
    result = validate_rewrite_plan(document, plan, keywords, profile)
    assert any(issue.code == "duplicate_bullet" for issue in result.issues)


def test_language_quality_warns_without_reclassifying_safe_prose_as_unsafe():
    document, keywords, profile, _, _ = inputs()
    plan = identity_plan(document)
    for bullet in plan.bullets[:3]:
        bullet.text = "Managed " + bullet.text[bullet.text.find(" ") + 1 :]
    plan.bullets[3].text = (
        "Dynamic professional with a proven track record; handled support; documented work; "
        + plan.bullets[3].text
    )
    plan.bullets[3].shorter_text = plan.bullets[3].text[:200]

    result = validate_rewrite_plan(document, plan, keywords, profile)
    codes = {issue.code for issue in result.issues}

    assert "repeated_bullet_opening" in codes
    assert "generic_filler_added" in codes
    assert "punctuation_density" in codes
    assert all(
        issue.severity == "warning"
        for issue in result.issues
        if issue.code in {"repeated_bullet_opening", "generic_filler_added", "punctuation_density"}
    )


def test_language_quality_leaves_unchanged_long_high_value_bullets_alone():
    document, keywords, profile, _, _ = inputs()
    plan = identity_plan(document)

    result = validate_rewrite_plan(document, plan, keywords, profile)

    assert not any(issue.code == "long_changed_bullet" for issue in result.issues)
