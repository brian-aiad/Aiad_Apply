from pathlib import Path

import pytest
from aiadapply_v2.grading.keywords import grade_job_keywords, important_keywords
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify
from aiadapply_v2.profiling.role_profile import build_target_role_profile

FIXTURES = Path("data/fixtures")


@pytest.mark.parametrize(
    ("filename", "company", "title", "family"),
    [
        (
            "floqast_full.txt",
            "FloQast",
            "Technical Support Engineer (Integrations)",
            "technical_support_integrations",
        ),
        (
            "anduril_full.txt",
            "Anduril Industries",
            "Product Operations Technical Specialist, Ghost",
            "product_operations",
        ),
        (
            "sony_full.txt",
            "Sony Interactive Entertainment",
            "Technical Operations Support Analyst",
            "technical_operations_support",
        ),
        ("bulletproof_full.txt", "Bulletproof", "Technical Analyst II", "it_service_desk"),
        (
            "hanmi_full.txt",
            "Hanmi Bank",
            "Application Support Administrator",
            "application_support_administration",
        ),
        (
            "dormakaba_full.txt",
            "dormakaba Americas",
            "Application & Systems Engineer (Remote - San Diego or Los Angeles Area only)",
            "application_systems_engineering",
        ),
        (
            "liquid_iv_full.txt",
            "Liquid I.V.",
            "D365 Technical Analyst",
            "erp_application_support",
        ),
    ],
)
def test_parse_and_classify_full_noisy_fixtures(
    filename: str,
    company: str,
    title: str,
    family: str,
) -> None:
    raw = (FIXTURES / filename).read_text(encoding="utf-8")
    job = parse_linkedin_simplify(raw)
    keywords = grade_job_keywords(job)
    profile = build_target_role_profile(job, keywords)

    assert job.company == company
    assert job.title == title
    assert job.location
    assert job.responsibilities
    assert job.required_qualifications
    assert profile.normalized_role_family == family
    assert "linkedin_navigation_and_job_chrome" in job.rejected_regions


def test_floqast_grading_uses_job_sections_and_rejects_malformed_terms() -> None:
    raw = (FIXTURES / "floqast_full.txt").read_text(encoding="utf-8")
    job = parse_linkedin_simplify(raw)
    by_term = {item.term.casefold(): item for item in grade_job_keywords(job)}

    assert "R&" not in by_term
    assert by_term["postman"].accepted
    assert by_term["postman"].hiring_importance >= 40
    assert by_term["technical writing"].accepted
    assert not by_term["ai"].accepted
    assert not by_term["compliance"].accepted


def test_anduril_rejects_marketing_and_legal_simplify_noise() -> None:
    raw = (FIXTURES / "anduril_full.txt").read_text(encoding="utf-8")
    job = parse_linkedin_simplify(raw)
    by_term = {item.term.casefold(): item for item in grade_job_keywords(job)}

    assert not by_term["fusion"].accepted
    assert "marketing" in by_term["fusion"].rejection_reason.casefold()
    assert not by_term["intellectual property"].accepted
    assert "boilerplate" in by_term["intellectual property"].rejection_reason.casefold()
    assert by_term["linux"].accepted
    assert by_term["command line"].accepted


def test_asset_language_is_preferred_not_required() -> None:
    raw = (FIXTURES / "bulletproof_full.txt").read_text(encoding="utf-8")
    job = parse_linkedin_simplify(raw)

    assert not any("hosting environment" in line for line in job.required_qualifications)
    assert any("hosting environment" in line for line in job.preferred_qualifications)


@pytest.mark.parametrize(
    ("filename", "family"),
    [
        ("daybreak_application_support.txt", "application_support_engineering"),
        ("jobgether_product_support.txt", "product_support_engineering"),
        ("cartesia_product_support.txt", "product_support_engineering"),
    ],
)
def test_independently_sourced_linkedin_fixtures(
    filename: str,
    family: str,
) -> None:
    raw = (FIXTURES / filename).read_text(encoding="utf-8")
    job = parse_linkedin_simplify(raw)
    profile = build_target_role_profile(job, grade_job_keywords(job))

    assert job.linkedin_url and job.linkedin_url.startswith("https://www.linkedin.com/jobs/")
    assert job.responsibilities
    assert job.required_qualifications
    assert profile.normalized_role_family == family


def test_new_fixture_keyword_panels_are_graded_in_their_hiring_sections() -> None:
    expected = {
        "hanmi_full.txt": {"production support", "sql", "information security"},
        "dormakaba_full.txt": {"python", "rest apis", "test automation"},
        "liquid_iv_full.txt": {"sox", "erp", "internal controls"},
    }
    for filename, important_terms in expected.items():
        job = parse_linkedin_simplify((FIXTURES / filename).read_text(encoding="utf-8"))
        by_term = {item.term.casefold(): item for item in grade_job_keywords(job)}
        for term in important_terms:
            assert by_term[term].accepted
            assert by_term[term].source_sections

    hanmi = parse_linkedin_simplify((FIXTURES / "hanmi_full.txt").read_text(encoding="utf-8"))
    important = {item.normalized for item in important_keywords(grade_job_keywords(hanmi))}
    assert "compliance" in important
    assert "operating systems" in important
