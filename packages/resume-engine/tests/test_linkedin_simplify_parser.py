from pathlib import Path

from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify


def test_parse_floqast_fixture_filters_malformed_keyword() -> None:
    raw = Path("data/fixtures/floqast_sample.txt").read_text(encoding="utf-8")
    job = parse_linkedin_simplify(raw)

    assert job.company == "FloQast"
    assert job.title == "Technical Support Engineer (Integrations)"
    assert job.location == "Los Angeles, CA"
    assert job.simplify_score == (7, 22)
    assert "Postman" in job.high_priority_keywords
    assert "technical writing" in job.low_priority_keywords
    assert "R&" not in job.simplify_keywords

