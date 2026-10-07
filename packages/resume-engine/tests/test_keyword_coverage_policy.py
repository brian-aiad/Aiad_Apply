from pathlib import Path

from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.evidence.candidate_profile import add_candidate_profile_evidence
from aiadapply_v2.evidence.loaders import build_evidence_graph
from aiadapply_v2.grading.keywords import grade_job_keywords
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify
from aiadapply_v2.planning.coverage import build_keyword_coverage, coverage_feedback
from aiadapply_v2.schemas import CandidateEvidenceItem, CandidateProfile, JobKeyword, KeywordKind
from aiadapply_v2.semantic.matcher import _direct_match
from aiadapply_v2.text import contains_term, count_term

BASE = Path("data/resumes/Brian_Aiad_BASE.docx")


def test_singular_webhook_satisfies_its_existing_employer_scope():
    base = parse_resume_docx(BASE)
    keywords = [JobKeyword(term='Webhooks', normalized='webhooks', kind=KeywordKind.system,
                           hiring_importance=50, placement_utility=50)]
    graph = build_evidence_graph(base, keywords)
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    row = build_keyword_coverage(base, keywords, graph, texts)[0]
    assert row.status == 'in_context'
    assert 'experience.original_insurance.bullet.5' in row.placements
    assert not coverage_feedback(base, keywords, graph, texts)
    texts['experience.original_insurance.bullet.5'] = 'Supported carrier data feeds.'
    assert any('Missing supported keyword Webhooks' in issue
               for issue in coverage_feedback(base, keywords, graph, texts))


def inputs(profile=None):
    document = parse_resume_docx(BASE)
    job = parse_linkedin_simplify(
        Path("data/fixtures/mendix_application_support_engineer_2026_09_22.txt").read_text()
    )
    keywords = grade_job_keywords(job)
    graph = build_evidence_graph(document, keywords)
    add_candidate_profile_evidence(graph, profile)
    return document, keywords, graph, {p.paragraph_id: p.text for p in document.paragraphs}


def test_java_is_not_javascript_and_skills_do_not_prove_project_use():
    base, keywords, graph, texts = inputs()
    rows = {row.term: row for row in build_keyword_coverage(base, keywords, graph, texts)}
    assert rows["Java"].status == "needs_confirmation"
    assert rows["JavaScript"].status == "skills_only"
    assert rows["JavaScript"].eligible_bullet_ids == []
    texts["projects.loavenly.bullet.1"] += " Built with JavaScript and Java."
    errors = coverage_feedback(base, keywords, graph, texts, require_coverage=False)
    assert any("JavaScript has no evidence" in message for message in errors)
    assert any("Java has no evidence" in message for message in errors)


def test_confirmed_loavenly_language_is_required_in_project_not_other_employer():
    # Hypothetical confirmation is confined to this test, never the real profile.
    profile = CandidateProfile(
        candidate_name="Test",
        confirmed_evidence=[
            CandidateEvidenceItem(
                term="Java",
                category="technology",
                scope="source_specific",
                evidence_reference="projects.loavenly",
                notes="Built a Java API for inventory synchronization.",
            )
        ],
    )
    base, keywords, graph, texts = inputs(profile)
    rows = {row.term: row for row in build_keyword_coverage(base, keywords, graph, texts)}
    assert rows["Java"].status == "missing_supported"
    assert rows["Java"].eligible_bullet_ids == [
        f"projects.loavenly.bullet.{i}" for i in range(1, 4)
    ]
    texts["skills.languages_dbs"] += ", Java"
    assert any(
        "Missing supported keyword Java:" in item
        for item in coverage_feedback(base, keywords, graph, texts)
    )
    texts["projects.loavenly.bullet.1"] += " Built a Java API for inventory synchronization."
    assert not any(
        "Missing supported keyword Java:" in item
        for item in coverage_feedback(base, keywords, graph, texts)
    )
    texts["experience.original_insurance.bullet.2"] += " Maintained Java APIs."
    assert any(
        "experience.original_insurance.bullet.2: Java has no evidence" in item
        for item in coverage_feedback(base, keywords, graph, texts)
    )
    # Layout compression cannot silently remove the only contextual placement.
    texts["projects.loavenly.bullet.1"] = next(
        p.text for p in base.paragraphs if p.paragraph_id == "projects.loavenly.bullet.1"
    )
    assert any(
        "Missing supported keyword Java:" in item
        for item in coverage_feedback(base, keywords, graph, texts)
    )


def test_drafting_notes_and_negated_tools_never_become_confirmed_technology():
    profile = CandidateProfile(
        candidate_name="Test",
        confirmed_skills=["JavaScript"],
        drafting_notes=["Want to use Java and Kubernetes in a future Loavenly extension."],
        confirmed_evidence=[
            CandidateEvidenceItem(
                term="JavaScript", category="technology", notes="Not Java. No Kubernetes use."
            )
        ],
    )
    _, _, graph, _ = inputs(profile)
    evidence = [item for item in graph.evidence if item.section == "candidate_profile"]
    assert any(_direct_match("JavaScript", item) for item in evidence)
    assert not any(
        _direct_match("Java", item) or _direct_match("Kubernetes", item) for item in evidence
    )


def test_all_confirmed_project_technologies_and_methods_need_context_for_other_postings():
    base = parse_resume_docx(BASE)
    job = parse_linkedin_simplify(
        "Example\nSoftware Engineer\nRemote\nAbout the job\nRequired Qualifications\n"
        "Build SaaS applications with JavaScript and Kubernetes using Agile development.\n"
        + "Support production applications and investigate incidents. "
        * 10
    )
    keywords = grade_job_keywords(job)
    profile = CandidateProfile(
        candidate_name="Test",
        confirmed_evidence=[
            CandidateEvidenceItem(
                term=term,
                category=category,
                scope="source_specific",
                evidence_reference="projects.loavenly",
                notes=notes,
            )
            for term, category, notes in [
                ("JavaScript", "technology", "Built the inventory user interface in JavaScript."),
                ("Kubernetes", "technology", "Deployed the inventory API on Kubernetes."),
                ("Agile", "method", "Delivered inventory features in Agile sprint iterations."),
            ]
        ],
    )
    graph = build_evidence_graph(base, keywords)
    add_candidate_profile_evidence(graph, profile)
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    texts["skills.languages_dbs"] += ", Kubernetes, Agile"
    errors = coverage_feedback(base, keywords, graph, texts)
    for term in ("JavaScript", "Kubernetes", "Agile"):
        assert any(f"Missing supported keyword {term}:" in item for item in errors)
    texts["projects.loavenly.bullet.1"] += (
        " Built a JavaScript inventory interface, deployed its API on Kubernetes,"
        " and delivered features in Agile sprints."
    )
    rows = {row.term: row for row in build_keyword_coverage(base, keywords, graph, texts)}
    for term in ("JavaScript", "Kubernetes", "Agile", "SaaS"):
        assert rows[term].status == "in_context"


def test_credentials_do_not_authorize_hands_on_cloud_project_claims():
    base, keywords, graph, texts = inputs()
    rows = {row.term: row for row in build_keyword_coverage(base, keywords, graph, texts)}
    assert rows["Azure"].status == "credential_only"
    texts["projects.loavenly.bullet.1"] += " Deployed to Azure."
    assert any(
        "Azure has no evidence" in item for item in coverage_feedback(base, keywords, graph, texts)
    )


def test_languages_and_candidate_specific_tools_are_extracted_across_postings():
    cases = [
        ("Java, JavaScript, Kubernetes, SQL", {"Java", "JavaScript", "Kubernetes", "SQL"}),
        ("Go, Rust, Kotlin, C#, C++, Docker", {"Go", "Rust", "Kotlin", "C#", "C++", "Docker"}),
        (
            "Scala, Ruby, PHP, Elixir, Haskell, Lua",
            {"Scala", "Ruby", "PHP", "Elixir", "Haskell", "Lua"},
        ),
        ("Dart, Swift, Terraform, Helm, DuckDB", {"Dart", "Swift", "Terraform", "Helm", "DuckDB"}),
    ]
    for stack, expected in cases:
        raw = (
            "Example\nPlatform Engineer\nLos Angeles, CA\nAbout the job\nRequired Qualifications\nExperience with "
            + stack
            + ".\n"
            + "Support production applications and investigate incidents. " * 10
        )
        keywords = grade_job_keywords(
            parse_linkedin_simplify(raw), additional_technologies=["DuckDB"]
        )
        assert expected <= {k.term for k in keywords if k.accepted}
        assert all(k.kind.value == "system" for k in keywords if k.term in expected)


def test_saas_platform_context_is_preserved_without_promoting_agile_benefits():
    base, keywords, graph, texts = inputs()
    by_term = {k.term: k for k in keywords}
    assert by_term["SaaS"].accepted
    assert not by_term["Agile"].accepted
    rows = {row.term: row for row in build_keyword_coverage(base, keywords, graph, texts)}
    assert rows["SaaS"].status == "in_context"
    assert "projects.loavenly.bullet.1" in rows["SaaS"].placements
    assert rows["Agile"].status == "excluded"
    assert any(pid.startswith("experience.original_insurance.") for pid in rows["SaaS"].placements)
    for pid in texts:
        if pid.startswith("experience.original_insurance."):
            texts[pid] = texts[pid].replace("SaaS", "software")
    assert any(
        message.startswith("Missing supported keyword SaaS:")
        for message in coverage_feedback(base, keywords, graph, texts)
    )


def test_unknown_posting_tools_are_visible_without_candidate_confirmation():
    base = parse_resume_docx(BASE)
    job = parse_linkedin_simplify(
        "Example\nPlatform Engineer\nRemote\nAbout the job\nRequired Qualifications\n"
        "Frameworks: FastAPI, Litestar.\nDatabases: DuckDB, ClickHouse.\n"
        "Experience with Temporal and Dagster.\n"
        + "Support production applications and investigate incidents. "
        * 10
    )
    keywords = grade_job_keywords(job)
    expected = {"FastAPI", "Litestar", "DuckDB", "ClickHouse", "Temporal", "Dagster"}
    assert expected <= {k.term for k in keywords if k.accepted and k.kind.value == "system"}
    graph = build_evidence_graph(base, keywords)
    rows = {
        row.term: row
        for row in build_keyword_coverage(
            base, keywords, graph, {p.paragraph_id: p.text for p in base.paragraphs}
        )
    }
    assert all(rows[term].status == "needs_confirmation" for term in expected)


def test_single_letter_languages_are_not_malformed_or_confused_with_other_languages():
    def keywords(stack):
        return grade_job_keywords(
            parse_linkedin_simplify(
                "Example\nSoftware Engineer\nRemote\nAbout the job\nRequired Qualifications\n"
                f"Programming languages: {stack}.\n"
                + "Support production applications and investigate incidents. "
                * 10
            )
        )

    assert {"C", "R"} <= {k.term for k in keywords("C, R") if k.accepted}
    assert "C" not in {k.term for k in keywords("C++, C#") if k.accepted}
    assert not contains_term("Built a C++ and C# application", "C")
    assert count_term("C, C++, C#", "C") == 1
