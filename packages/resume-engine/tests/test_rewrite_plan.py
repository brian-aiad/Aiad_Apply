from pathlib import Path

from aiadapply_v2.evidence.loaders import load_resume_evidence
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify
from aiadapply_v2.planning.rewrite_plan import build_rewrite_plan
from aiadapply_v2.profiling.role_profile import build_target_role_profile
from aiadapply_v2.schemas import RiskLevel


def test_floqast_plan_flags_unconfirmed_hard_tools() -> None:
    raw = Path("data/fixtures/floqast_sample.txt").read_text(encoding="utf-8")
    job = parse_linkedin_simplify(raw)
    profile = build_target_role_profile(job)
    graph = load_resume_evidence("data/resumes/brian_application_support_base.json")
    plan = build_rewrite_plan(profile, graph)

    by_keyword = {match.target_keyword.lower(): match for match in plan.matches}
    assert by_keyword["postman"].risk == RiskLevel.grounded
    assert by_keyword["jira"].risk == RiskLevel.grounded
    assert by_keyword["ai"].risk == RiskLevel.unsupported
    assert by_keyword["zendesk"].risk == RiskLevel.human_confirm
    assert "Zendesk" in plan.unsupported_keywords
