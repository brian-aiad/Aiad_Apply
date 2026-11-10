from pathlib import Path

import pytest
from aiadapply_v2 import pipeline
from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.evidence.candidate_profile import (
    add_candidate_profile_evidence,
    apply_candidate_profile_to_keywords,
    load_candidate_profile,
)
from aiadapply_v2.evidence.loaders import build_evidence_graph
from aiadapply_v2.planning.coverage import build_keyword_coverage, coverage_feedback
from aiadapply_v2.schemas import CandidateProfile, JobKeyword, KeywordKind
from aiadapply_v2.semantic.matcher import LexicalSemanticEncoder

from .helpers import IdentityReasoner


def scenario(terms, profile=None):
    base = parse_resume_docx("data/resumes/Brian_Aiad_BASE.docx")
    keywords = [
        JobKeyword(
            term=t,
            normalized=t.lower(),
            kind=KeywordKind.system,
            hiring_importance=45,
            placement_utility=45,
        )
        for t in terms
    ]
    if profile is None:
        profile = load_candidate_profile(Path("data/profile/Brian_Aiad_PROFILE.json"))
    apply_candidate_profile_to_keywords(keywords, profile)
    graph = build_evidence_graph(base, keywords)
    add_candidate_profile_evidence(graph, profile)
    return base, keywords, graph, {p.paragraph_id: p.text for p in base.paragraphs}


def test_productivity_and_ai_knowledge_no_longer_require_confirmation():
    base, keywords, graph, texts = scenario(
        [
            "Excel",
            "Microsoft Word",
            "Google Docs",
            "Google Drive",
            "PowerPoint",
            "ChatGPT",
            "Claude",
            "Codex",
            "Tableau",
        ]
    )
    rows = build_keyword_coverage(base, keywords, graph, texts)
    assert all(row.status != "needs_confirmation" for row in rows)
    tableau = next(row for row in rows if row.term == "Tableau")
    assert tableau.evidence_ids
    assert tableau.eligible_bullet_ids
    for row in rows:
        assert row.eligible_bullet_ids, row.term
        assert not row.required_bullet_groups  # permission, not mandatory placement
        assert row.status in {"available", "skills_only"}
    assert not coverage_feedback(base, keywords, graph, texts)


def test_excel_routine_reconciliation_allowed_but_unrelated_bullet_rejected():
    base, keywords, graph, texts = scenario(["Excel"])
    row = build_keyword_coverage(base, keywords, graph, texts)[0]
    assert "experience.original_insurance.bullet.3" in row.eligible_bullet_ids
    texts["experience.original_insurance.bullet.3"] += " Used Excel for reconciliation review."
    assert not coverage_feedback(base, keywords, graph, texts)
    wrong = next(
        p.paragraph_id
        for p in base.paragraphs
        if p.kind.value == "bullet" and p.paragraph_id not in row.eligible_bullet_ids
    )
    texts[wrong] += " Used Excel."
    assert any(
        wrong in issue and "no evidence" in issue
        for issue in coverage_feedback(base, keywords, graph, texts)
    )


def test_basic_office_knowledge_is_available_without_an_inclusion_quota():
    base, keywords, graph, texts = scenario(["Office 365"])
    rows = build_keyword_coverage(base, keywords, graph, texts)
    assert all(row.status == "available" for row in rows)
    assert all(row.eligible_bullet_ids and not row.required_bullet_groups for row in rows)
    assert not coverage_feedback(base, keywords, graph, texts)
    texts["experience.csulb.bullet.3"] = (
        "Kept incident and escalation notes using Microsoft Office and Office 365, "
        "coordinating with campus IT and third-party vendors."
    )
    assert not coverage_feedback(base, keywords, graph, texts)


def test_specialized_systems_do_not_inherit_basic_tool_permission():
    terms = ["Salesforce", "AutoCAD", "Power BI", "Qualtrics", "SPSS", "BigQuery"]
    base, keywords, graph, texts = scenario(terms)
    rows = build_keyword_coverage(base, keywords, graph, texts)
    assert all(row.status in {"excluded", "needs_confirmation"} for row in rows)
    assert not any(row.eligible_bullet_ids for row in rows)


def test_known_collaboration_app_support_is_allowed_in_existing_ticket_work():
    from aiadapply_v2.evidence.everyday_tools import routine_usage_in_context

    profile = CandidateProfile(
        candidate_name="Brian",
        confirmed_skills=["Microsoft Teams"],
        everyday_tools=["Microsoft Teams"],
    )
    base, keywords, graph, texts = scenario(["Teams"], profile)
    pid = "experience.original_insurance.bullet.1"
    assert pid in build_keyword_coverage(base, keywords, graph, texts)[0].eligible_bullet_ids
    texts[pid] = (
        "Resolved 200+ Jira tickets for agency management SaaS, internal integrations, "
        "and Microsoft 365 (Outlook, Teams), maintaining sub-90-minute average resolution."
    )
    assert not coverage_feedback(base, keywords, graph, texts)
    assert routine_usage_in_context("Teams", texts[pid])
    assert not routine_usage_in_context("Teams", "Tools: Teams, ticketing.")
    assert not routine_usage_in_context("Teams", "Familiar with troubleshooting Teams.")
    # No permission is inferred for another candidate or specialized products.
    _, _, unknown, _ = scenario(["Teams"], CandidateProfile(candidate_name="Other"))
    assert not any(e.routine_tool_context for e in unknown.evidence)


def test_policy_is_candidate_specific_and_rejection_overrides_it():
    for profile in [
        CandidateProfile(candidate_name="Other", confirmed_skills=["Excel"]),
        CandidateProfile(
            candidate_name="Brian",
            confirmed_skills=["Excel"],
            everyday_tools=["Excel"],
            rejected_terms=["Excel"],
        ),
    ]:
        base, keywords, graph, texts = scenario(["Excel"], profile)
        assert not any(e.routine_tool_context for e in graph.evidence)
        row = build_keyword_coverage(base, keywords, graph, texts)[0]
        assert not row.eligible_bullet_ids
        if profile.rejected_terms:
            assert row.status == "excluded"


def test_tableau_can_be_used_naturally_without_mandatory_work_placement():
    base, keywords, graph, texts = scenario(["Tableau"])
    assert build_keyword_coverage(base, keywords, graph, texts)[0].status == "available"
    assert not coverage_feedback(base, keywords, graph, texts)
    texts["skills.tools"] += ", Tableau"
    assert build_keyword_coverage(base, keywords, graph, texts)[0].status == "skills_only"
    assert not coverage_feedback(base, keywords, graph, texts)
    pid = "experience.original_insurance.bullet.3"
    texts[pid] += " Reviewed reconciliation data in Tableau."
    assert build_keyword_coverage(base, keywords, graph, texts)[0].status == "in_context"
    assert not coverage_feedback(base, keywords, graph, texts)


def test_no_context_does_not_manufacture_work_and_specialized_tools_cannot_be_whitelisted():
    profile = CandidateProfile(
        candidate_name="Test",
        confirmed_skills=["Salesforce", "Tableau"],
        everyday_tools=["Salesforce", "Tableau"],
    )
    base, keywords, graph, texts = scenario(["Salesforce", "Tableau"], profile)
    assert not any(e.routine_tool_context and "Salesforce" in e.systems for e in graph.evidence)
    assert all(
        e.source_reference != "experience.original_insurance.bullet.1"
        for e in graph.evidence
        if e.routine_tool_context and "Tableau" in e.systems
    )


def test_primary_and_shortened_work_contexts_can_use_different_natural_wording():
    base, keywords, graph, texts = scenario(["Excel", "Tableau"])
    pid = "experience.original_insurance.bullet.3"
    original = texts[pid]
    for clause in [
        " Reviewed reconciliation data using Excel and Tableau.",
        " Reviewed reconciliation in Excel and Tableau.",
    ]:
        texts[pid] = original + clause
        assert not coverage_feedback(base, keywords, graph, texts)


def test_work_wording_accepts_notes_and_issue_logs_without_forcing_synonyms():
    base, keywords, graph, texts = scenario(["Excel", "Microsoft Word", "Word"])
    texts["experience.csulb.bullet.3"] = (
        "Kept incident and escalation notes in Microsoft Word and recurring issue logs in Excel, "
        "coordinating with campus IT and third-party vendors."
    )
    assert not coverage_feedback(base, keywords, graph, texts)


@pytest.mark.parametrize("restore_work_bullet", [False, True])
def test_rendered_export_accepts_useful_tool_or_optional_layout_omission(
    tmp_path, monkeypatch, restore_work_bullet
):
    class TableauReasoner(IdentityReasoner):
        def __init__(self):
            self.feedback = []

        def reason(self, **kwargs):
            self.feedback.append(kwargs.get("revision_feedback") or [])
            result = super().reason(**kwargs)
            bullet = next(
                b
                for b in result.rewrite_plan.bullets
                if b.paragraph_id == "experience.original_insurance.bullet.3"
            )
            bullet.text = bullet.text.replace(
                "triaging failures and building a Python reconciliation script",
                "triaging failures, reviewing data in Tableau, and scripting Python reconciliation",
            )
            bullet.shorter_text = bullet.text
            bullet.target_terms = ["Tableau"]
            return result

    if restore_work_bullet:
        writer = pipeline.write_resume_candidate

        def restore_during_layout(base, plan, output_path, **kwargs):
            # Exercise the real writer's overflow fallback after a valid plan.
            kwargs["reverted_paragraph_ids"] = {
                *(kwargs.get("reverted_paragraph_ids") or set()),
                "experience.original_insurance.bullet.3",
            }
            return writer(base, plan, output_path, **kwargs)

        monkeypatch.setattr(pipeline, "write_resume_candidate", restore_during_layout)

    reasoner = TableauReasoner()
    raw = (
        "Example Systems\nApplication Support Engineer\nRemote\nAbout the job\n"
        "Responsibilities\nReview reconciliation reporting in Tableau.\n"
        "Required Qualifications\nExperience with Tableau reporting.\n"
        + "Support production applications and investigate incidents. "
        * 12
    )
    args = dict(
        raw_paste=raw,
        base_resume="data/resumes/Brian_Aiad_BASE.docx",
        output_dir=tmp_path,
        reasoner=reasoner,
        semantic_encoder=LexicalSemanticEncoder(),
        candidate_profile="data/profile/Brian_Aiad_PROFILE.json",
    )
    import fitz

    report = pipeline.transform_resume(**args)
    assert report.validation.passed
    assert report.layout.passed
    assert report.layout.page_count == 1
    final = parse_resume_docx(report.output_docx)
    work = next(
        p.text
        for p in final.paragraphs
        if p.paragraph_id == "experience.original_insurance.bullet.3"
    )
    assert ("reviewing data in Tableau" in work) is not restore_work_bullet
    assert len(reasoner.feedback) == 1
    with fitz.open(report.output_pdf) as pdf:
        assert len(pdf) == 1
        assert ("Tableau" in pdf[0].get_text()) is not restore_work_bullet


@pytest.mark.parametrize(
    "text",
    [
        "Excel for monthly reporting.",
        "Plan to use Excel for monthly reporting.",
        "Did not use Excel for monthly reporting.",
    ],
)
def test_routine_coverage_requires_affirmed_work_action(text):
    from aiadapply_v2.evidence.everyday_tools import routine_usage_in_context

    assert not routine_usage_in_context("Excel", text)
    assert routine_usage_in_context("Excel", "Used Excel to reconcile monthly records.")


def test_routine_future_and_excluded_tools_are_not_work_usage():
    from aiadapply_v2.evidence.everyday_tools import routine_usage_in_context

    assert not routine_usage_in_context("Excel", "Will analyze Excel reports.")
    assert not routine_usage_in_context("Excel", "Maintained monthly reports without Excel.")
    assert routine_usage_in_context("Excel", "Prepared Excel reports.")


def test_google_suite_alias_reuses_authorized_routine_duties_and_rejections():
    profile = CandidateProfile(
        candidate_name="Fixture", confirmed_skills=["Google Workspace"], everyday_tools=["G Suite"]
    )
    base, keywords, graph, texts = scenario(["Google Suite"], profile)
    row = build_keyword_coverage(base, keywords, graph, texts)[0]
    assert row.eligible_bullet_ids
    assert row.status != "needs_confirmation"
    profile.rejected_terms = ["Google Workspace"]
    base, keywords, graph, texts = scenario(["Google Suite"], profile)
    assert not keywords[0].accepted
    assert build_keyword_coverage(base, keywords, graph, texts)[0].status == "excluded"


def test_suite_alias_keyword_filter_and_entra_direction_do_not_expand_products():
    from aiadapply_v2.schemas import ResumeEvidence
    from aiadapply_v2.semantic.matcher import _direct_match
    from aiadapply_v2.text import preserves_source_term

    evidence = ResumeEvidence(
        evidence_id="fixture",
        paragraph_id="experience.fixture.bullet.1",
        section="experience.fixture",
        source_text="Administered Entra ID access.",
    )
    assert _direct_match("Microsoft Entra", evidence)
    for term in [
        "Microsoft Entra Private Access",
        "Microsoft Entra Internet Access",
        "Intune",
        "Active Directory",
    ]:
        assert not _direct_match(term, evidence)
    assert not preserves_source_term("Worked with Microsoft Entra.", "Entra ID")
    assert not preserves_source_term("Used Google Workspace.", "Google Cloud")
    profile = CandidateProfile(
        candidate_name="Fixture",
        confirmed_skills=["Google Workspace"],
        everyday_tools=["Google Workspace"],
    )
    base = parse_resume_docx("data/resumes/Brian_Aiad_BASE.docx")
    keywords = [
        JobKeyword(
            term="Google Suite",
            normalized="google suite",
            kind=KeywordKind.system,
            hiring_importance=45,
            placement_utility=45,
        )
    ]
    graph = build_evidence_graph(base, keywords)
    add_candidate_profile_evidence(graph, profile, keywords)
    assert any(e.routine_tool_context for e in graph.evidence)


def test_suite_alias_retains_affirmed_action_and_rejects_negated_use():
    from aiadapply_v2.evidence.everyday_tools import routine_usage_in_context

    assert routine_usage_in_context("Google Suite", "Coordinated schedules using Google Workspace.")
    assert not routine_usage_in_context(
        "Google Suite", "Coordinated schedules without Google Workspace."
    )
    profile = CandidateProfile(
        candidate_name="Fixture",
        confirmed_skills=["Google Workspace"],
        everyday_tools=["Google Workspace"],
        rejected_terms=["Google Suite"],
    )
    base, keywords, graph, texts = scenario(["Google Suite"], profile)
    pid = "experience.csulb.bullet.1"
    original = next(p for p in base.paragraphs if p.paragraph_id == pid)
    original.text = "Coordinated schedules using Google Workspace."
    texts[pid] = original.text
    assert not any(
        "remove this new claim" in issue
        for issue in coverage_feedback(base, keywords, graph, texts, require_coverage=False)
    )
    original.text = "Coordinated schedules."
    assert any(
        "remove this new claim" in issue
        for issue in coverage_feedback(base, keywords, graph, texts, require_coverage=False)
    )


def test_office_data_review_is_routine_context_not_a_new_implementation():
    from aiadapply_v2.evidence.everyday_tools import routine_usage_in_context

    assert routine_usage_in_context(
        "Microsoft Office",
        "Monitored vendor feeds, triaging failures with Microsoft Office data review.",
    )
    assert not routine_usage_in_context(
        "Microsoft Office", "Will use Microsoft Office for data review."
    )
    assert not routine_usage_in_context(
        "Microsoft Office", "Reviewed data without Microsoft Office."
    )
    assert not routine_usage_in_context("Microsoft Office", "Tools: Microsoft Office, data review.")
    assert not routine_usage_in_context(
        "Microsoft Office", "Deployed Microsoft Office across servers."
    )
