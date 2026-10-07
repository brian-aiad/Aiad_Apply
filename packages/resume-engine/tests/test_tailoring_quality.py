from pathlib import Path

from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.evidence.loaders import build_evidence_graph
from aiadapply_v2.grading.keywords import grade_job_keywords
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify
from aiadapply_v2.planning.priorities import paragraph_priorities
from aiadapply_v2.planning.quality import demonstrates_ordinary_capability, tailoring_feedback
from aiadapply_v2.profiling.role_profile import build_target_role_profile
from aiadapply_v2.semantic.matcher import LexicalSemanticEncoder, build_transferability_map


def test_existing_deployment_and_live_operations_do_not_require_cosmetic_rewrites():
    source = 'Built, tested, and deployed Loavenly for staff across three locations.'
    assert demonstrates_ordinary_capability('deployment', source, source)
    assert not demonstrates_ordinary_capability('deployment', source, 'Supported staff.')
    operations = 'Resolved API and permission issues during live production operations.'
    assert demonstrates_ordinary_capability('product operations', operations, operations)
    assert not demonstrates_ordinary_capability('product operations', 'Wrote documentation.', operations)
    support = 'Resolved 200+ production support tickets across agency management SaaS.'
    assert demonstrates_ordinary_capability('product support', support, support)
    assert not demonstrates_ordinary_capability('product support', 'Managed inventory.', support)

    base = parse_resume_docx(Path('data/resumes/Brian_Aiad_BASE.docx'))
    job = parse_linkedin_simplify(
        'Example\nProduct Operations Specialist\nRemote\nAbout the job\n'
        'Responsibilities\nSupport deployment and product operations.\n'
        'Required Qualifications\nExperience with deployment and product operations.\n'
        + 'Support production applications and document incidents. ' * 10
    )
    keywords = grade_job_keywords(job)
    graph = build_evidence_graph(base, keywords)
    matches = build_transferability_map(
        build_target_role_profile(job, keywords), keywords, graph, LexicalSemanticEncoder())
    feedback = tailoring_feedback(base, {p.paragraph_id: p.text for p in base.paragraphs},
                                  keywords, graph, matches)
    assert not any('deployment' in item or 'product operations' in item for item in feedback)


def test_plan_and_final_quality_accept_configuration_and_script_inflections():
    from aiadapply_v2.validation.resume import validate_rewrite_plan

    from .helpers import identity_plan

    base = parse_resume_docx(Path('data/resumes/Brian_Aiad_BASE.docx'))
    job = parse_linkedin_simplify(
        'Example\nSystems Engineer\nRemote\nAbout the job\n'
        'Required Qualifications\nExperience with configuration and scripts.\n'
        + 'Support production applications and document incidents. ' * 10)
    keywords = [k for k in grade_job_keywords(job) if k.term in {'configuration', 'scripts'}]
    assert len(keywords) == 2
    for keyword in keywords:
        keyword.hiring_importance = 50
    profile = build_target_role_profile(job, keywords)
    graph = build_evidence_graph(base, keywords)
    matches = build_transferability_map(profile, keywords, graph, LexicalSemanticEncoder())
    plan = identity_plan(base)
    result = validate_rewrite_plan(base, plan, keywords, profile)
    assert not any(issue.code == 'important_keyword_missing' for issue in result.issues)
    assert not tailoring_feedback(base, {p.paragraph_id: p.text for p in base.paragraphs},
                                  keywords, graph, matches)
    for bullet in plan.bullets:
        bullet.text = (bullet.text.replace('configurations', 'settings')
                       .replace('Configured', 'Managed').replace('script', 'program'))
    result = validate_rewrite_plan(base, plan, keywords, profile)
    assert {issue.message for issue in result.issues if issue.code == 'important_keyword_missing'} == {
        'Important accepted keyword is absent: configuration.',
        'Important accepted keyword is absent: scripts.',
    }


def inputs():
    base = parse_resume_docx(Path("data/resumes/Brian_Aiad_BASE.docx"))
    job = parse_linkedin_simplify(
        Path("data/fixtures/pacific_life_platform_engineer_ii.txt").read_text()
    )
    keywords = grade_job_keywords(job)
    graph = build_evidence_graph(base, keywords)
    matches = build_transferability_map(
        build_target_role_profile(job, keywords), keywords, graph, LexicalSemanticEncoder()
    )
    return base, keywords, graph, matches


def test_platform_posting_extracts_actual_operational_responsibilities():
    _, keywords, _, _ = inputs()
    accepted = {keyword.normalized for keyword in keywords if keyword.accepted}
    assert accepted >= {
        "automation",
        "access management",
        "platform administration",
        "role-based access",
        "scripts",
        "data feeds",
        "background jobs",
        "reporting",
        "workflows",
        "configuration",
        "api integrations",
    }


def test_one_best_match_does_not_hide_other_evidenced_bullet_placements():
    base, keywords, graph, matches = inputs()
    priorities = {
        row["paragraph_id"]: row for row in paragraph_priorities(base, keywords, graph, matches)
    }
    assert "access management" in priorities["experience.csulb.bullet.2"]["missing_supported_terms"]
    assert (
        "access management" in priorities["experience.wehelp.bullet.2"]["missing_supported_terms"]
    )
    assert (
        "automation"
        in priorities["experience.original_insurance.bullet.3"]["missing_supported_terms"]
    )
    assert (
        "platform administration"
        in priorities["experience.original_insurance.bullet.4"]["missing_supported_terms"]
    )
    assert all("AI" not in row["missing_supported_terms"] for row in priorities.values())


def test_skills_only_keyword_dump_cannot_pass_substantive_tailoring_review():
    base, keywords, graph, matches = inputs()
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    texts["skills.tools"] += ", " + ", ".join(k.term for k in keywords if k.accepted)
    feedback = tailoring_feedback(base, texts, keywords, graph, matches)
    assert any("Supported role requirements still need natural evidenced bullet placement" in item for item in feedback)


def test_supported_terms_must_survive_in_actual_bullets_and_final_document():
    base, keywords, graph, matches = inputs()
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    texts["experience.csulb.bullet.2"] = (
        texts["experience.csulb.bullet.2"]
        .replace("access and scheduling issues", "access management and scheduling issues")
        .replace("checking configurations", "checking configuration")
    )
    texts["experience.original_insurance.bullet.3"] = texts[
        "experience.original_insurance.bullet.3"
    ].replace("a Python reconciliation script", "Python reconciliation automation")
    texts["experience.original_insurance.bullet.4"] = texts[
        "experience.original_insurance.bullet.4"
    ].replace("Administered Microsoft", "Provided platform administration for Microsoft")
    texts["experience.original_insurance.bullet.5"] = texts[
        "experience.original_insurance.bullet.5"
    ].replace(
        "webhook and carrier integration workflows",
        "webhook and carrier API integrations and workflows",
    )
    assert any(
        "Supported role requirements still need natural evidenced bullet placement" in item
        for item in tailoring_feedback(base, texts, keywords, graph, matches)
    )
    texts["experience.wehelp.bullet.2"] = texts["experience.wehelp.bullet.2"].replace(
        "managing user access", "providing access management"
    )
    texts["projects.loavenly.bullet.2"] = texts["projects.loavenly.bullet.2"].replace(
        "Configured RBAC", "Configured RBAC for role-based access management"
    )
    # This gate measures missing term coverage once, not rewrite volume. Supply
    # the remaining exact terms at their strongest evidence-backed placement.
    covered = " ".join(text for pid, text in texts.items() if ".bullet." in pid)
    from aiadapply_v2.text import contains_term
    for row in paragraph_priorities(base, keywords, graph, matches):
        if ".bullet." not in row["paragraph_id"]:
            continue
        for term in row["missing_supported_terms"]:
            if not contains_term(covered, term):
                texts[row["paragraph_id"]] += " " + term
                covered += " " + term
    feedback = tailoring_feedback(base, texts, keywords, graph, matches)
    assert not any("Supported role requirements still need natural evidenced bullet placement" in item for item in feedback)
    assert not any("Too few substantive bullet rewrites" in item for item in feedback)
    # Remove the capability everywhere, including the equivalent "Configured RBAC".
    # One remaining factual configuration action still demonstrates the skill.
    for pid in texts:
        if ".bullet." in pid:
            texts[pid] = texts[pid].replace("configuration", "settings").replace("Configured", "Managed")
    assert any(
        "configuration" in item
        for item in tailoring_feedback(base, texts, keywords, graph, matches)
    )


def test_no_edit_quota_when_there_are_no_missing_supported_requirements():
    base, _, graph, matches = inputs()
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    assert tailoring_feedback(base, texts, [], graph, matches) == []


def test_generic_keyword_opening_is_rejected_even_with_no_edit_quota():
    base, _, graph, matches = inputs()
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    texts["experience.original_insurance.bullet.2"] = (
        "Used problem-solving to investigate production incidents."
    )
    assert any(
        "concrete action verb" in item
        for item in tailoring_feedback(base, texts, [], graph, matches)
    )


def test_keyword_insertion_cannot_break_verb_object_grammar():
    base, _, graph, matches = inputs()
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    texts["experience.wehelp.bullet.1"] = (
        "Independently built, completed application testing, and deployed Loavenly."
    )
    assert any(
        "verb-object grammar" in item
        for item in tailoring_feedback(base, texts, [], graph, matches)
    )


def test_generic_filler_is_rejected_inside_a_substantive_bullet():
    base, _, graph, matches = inputs()
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    key = "experience.original_insurance.bullet.2"
    texts[key] = texts[key].replace(
        "isolating root cause", "isolating root cause through structured problem-solving"
    )
    assert any(
        "concrete action verb" in item
        for item in tailoring_feedback(base, texts, [], graph, matches)
    )


def test_mendix_named_platform_and_low_code_are_not_inferred_from_saas_experience():
    from aiadapply_v2.schemas import EvidenceStrength, KeywordKind
    from aiadapply_v2.semantic.matcher import _strength

    assert (
        _strength("Mendix", KeywordKind.system, False, False, 0.99) == EvidenceStrength.unsupported
    )
    assert (
        _strength("low-code", KeywordKind.environment, False, False, 0.99)
        == EvidenceStrength.unsupported
    )


def test_reproduction_work_cannot_transfer_between_employers():
    base, _, graph, matches = inputs()
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    key = "experience.original_insurance.bullet.2"
    texts[key] = texts[key].replace("Investigated", "Investigated and reproduced")
    feedback = tailoring_feedback(base, texts, [], graph, matches)
    assert any(key in item and "reproducing issues" in item for item in feedback)
    assert not any("experience.csulb" in item for item in feedback)


def test_existing_keywords_are_opportunities_for_substantial_reframing():
    from aiadapply_v2.planning.quality import tailoring_breadth, tailoring_opportunities

    base, keywords, graph, matches = inputs()
    opportunities = tailoring_opportunities(base, keywords, graph, matches)
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    assert "experience.original_insurance.bullet.2" in opportunities
    assert "API" in opportunities["experience.original_insurance.bullet.2"]
    breadth = tailoring_breadth(base, texts, keywords, graph, matches)
    assert breadth["adapted"] == []
    assert breadth["minimum"] == 0  # Matching evidence is not a rewrite quota.


def test_substantive_reframe_ignores_cosmetic_and_word_order_changes():
    from aiadapply_v2.planning.quality import substantive_reframe

    before = "Investigated production incidents using SQL queries and API logs to isolate root causes."
    assert not substantive_reframe(before, before.upper())
    assert not substantive_reframe(before, before.replace("Investigated", "Examined"))
    assert not substantive_reframe(before, "Using SQL queries and API logs, investigated production incidents to isolate root causes.")
    assert substantive_reframe(before, "Isolated root causes of production incidents by correlating API logs with SQL query results and tracing failed requests.")


def test_sparse_posting_does_not_force_every_bullet_to_change():
    from aiadapply_v2.planning.quality import tailoring_breadth

    base, keywords, graph, matches = inputs()
    keywords = [k for k in keywords if k.term == "SQL"]
    breadth = tailoring_breadth(base, {p.paragraph_id: p.text for p in base.paragraphs}, keywords, graph, matches)
    assert breadth["minimum"] == 0


def test_generic_confirmed_knowledge_base_cannot_become_employer_work():
    from aiadapply_v2.schemas import ResumeEvidence
    base, keywords, graph, matches = inputs()
    graph.evidence.append(ResumeEvidence(
        evidence_id="evidence.candidate_profile.knowledge_base",
        paragraph_id="skills.additional", section="candidate_profile",
        source_text="Candidate confirmed knowledge base exposure.",
        claim_scope="general_exposure",
    ))
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    texts["experience.csulb.bullet.3"] += " Wrote knowledge base articles."
    feedback = tailoring_feedback(base, texts, keywords, graph, matches)
    assert any("knowledge base needs evidence for this employer/project" in item for item in feedback)


def test_soft_skill_appendix_does_not_count_as_meaningful_breadth():
    from aiadapply_v2.planning.quality import tailoring_breadth
    base, keywords, graph, matches = inputs()
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    pid = "experience.original_insurance.bullet.2"
    texts[pid] = texts[pid].rstrip(".") + ", demonstrating critical thinking."
    assert pid not in tailoring_breadth(base, texts, keywords, graph, matches)["adapted"]


def test_ordinary_capabilities_are_covered_by_same_source_final_actions():
    from aiadapply_v2.planning.quality import demonstrates_ordinary_capability
    base, _, _, _ = inputs()
    source = {p.paragraph_id: p.text for p in base.paragraphs}
    tickets = source["experience.original_insurance.bullet.1"]
    automation = source["experience.original_insurance.bullet.3"]
    assert demonstrates_ordinary_capability("case management", tickets, tickets)
    assert demonstrates_ordinary_capability("automation", automation, automation)
    assert not demonstrates_ordinary_capability("case management", tickets, "Familiar with support tickets.")
    assert not demonstrates_ordinary_capability("automation", automation, "Used Python for support.")
    assert not demonstrates_ordinary_capability("automation", source["experience.csulb.bullet.2"], automation)
    for term in ("Python", "AI", "CRUD", "knowledge base", "B2B SaaS"):
        assert not demonstrates_ordinary_capability(term, tickets, tickets)


def test_ordinary_duties_do_not_require_cosmetic_exact_nouns():
    from aiadapply_v2.pipeline import _build_keyword_decisions
    from aiadapply_v2.planning.quality import tailoring_feedback
    from aiadapply_v2.schemas import EvidenceStrength
    base, _, _, _ = inputs()
    # Both terms are ordinary role capabilities established by the existing work.
    job = parse_linkedin_simplify(
        Path("data/fixtures/floqast_full.txt").read_text().replace(
            "case management.", "case management and automation."
        )
    )
    keywords = [k for k in grade_job_keywords(job) if k.normalized in {"case management", "automation"}]
    assert len(keywords) == 2
    for keyword in keywords:
        keyword.hiring_importance = 50
    graph = build_evidence_graph(base, keywords)
    matches = build_transferability_map(build_target_role_profile(job, keywords), keywords, graph, LexicalSemanticEncoder())
    # Also exercise the direct-evidence missing-term branch, e.g. a saved profile.
    matches.matches = [item.model_copy(update={"strength": EvidenceStrength.direct}) for item in matches.matches]
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    assert tailoring_feedback(base, texts, keywords, graph, matches) == []
    decisions = _build_keyword_decisions(keywords, matches, base, base_document=base)
    assert all(not item.used and item.placements == [] for item in decisions)
    assert all(item.explanation.startswith("Demonstrated by documented work in ") for item in decisions)
    assert all("exact phrase not added" in item.explanation for item in decisions)
    for pid in texts:
        if ".bullet." in pid:
            texts[pid] = "Performed support work."
    assert any("Supported role requirements" in item for item in tailoring_feedback(base, texts, keywords, graph, matches))


def test_existing_full_build_test_deploy_ownership_and_ticket_support_are_demonstrated():
    from aiadapply_v2.planning.quality import demonstrates_ordinary_capability
    source = "Independently built, tested, and deployed the application."
    assert demonstrates_ordinary_capability("end-to-end", source, source)
    assert not demonstrates_ordinary_capability("end-to-end", source, "Supported an integration.")
    assert demonstrates_ordinary_capability("service desk", "Resolved production support tickets.",
                                           "Resolved production tickets across application systems.")


def test_full_delivery_ownership_accepts_verb_inflection_without_rewrite_pressure():
    from aiadapply_v2.planning.quality import demonstrates_ordinary_capability
    assert demonstrates_ordinary_capability(
        "end-to-end", "Independently built, tested, and deployed the application.",
        "Centralized tracking by independently building, testing and deploying the application.")
