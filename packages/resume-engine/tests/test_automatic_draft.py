from pathlib import Path

import pytest
from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.evidence.candidate_profile import apply_candidate_profile_to_keywords
from aiadapply_v2.evidence.loaders import build_evidence_graph
from aiadapply_v2.grading.keywords import grade_job_keywords
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify
from aiadapply_v2.pipeline import (
    _build_keyword_decisions,
    _enforce_export_boundaries,
    _final_claim_risks,
    transform_resume,
)
from aiadapply_v2.planning.coverage import build_keyword_coverage, coverage_feedback
from aiadapply_v2.planning.draft import (
    allow_draft_technology_risks,
    draft_distribution_feedback,
    draft_prose_feedback,
    select_draft_technologies,
)
from aiadapply_v2.schemas import (
    CandidateProfile,
    ClaimRisk,
    DraftTechnology,
    EvidenceStrength,
    RiskLevel,
    TransferabilityMap,
)
from aiadapply_v2.semantic.matcher import LexicalSemanticEncoder, _direct_match

from .helpers import IdentityReasoner, identity_plan


def draft_inputs():
    base = parse_resume_docx(Path("data/resumes/Brian_Aiad_BASE.docx"))
    job = parse_linkedin_simplify(
        Path("data/fixtures/mendix_application_support_engineer_2026_09_22.txt").read_text()
    )
    keywords = grade_job_keywords(job)
    graph = build_evidence_graph(base, keywords)
    graph.draft_technologies = select_draft_technologies(base, keywords, graph)
    return base, keywords, graph


def test_project_draft_permission_does_not_relabel_employer_evidence():
    base, _, _ = draft_inputs()
    plan = identity_plan(base)
    employer_id = "experience.original_insurance.bullet.3"
    project_id = "projects.loavenly.bullet.3"
    risk = ClaimRisk(
        claim="Python",
        target_requirement="Python",
        evidence_ids=["source.python"],
        strength=EvidenceStrength.direct,
        risk_level=RiskLevel.low,
        explanation="Supported employer usage",
        selected_placement=employer_id,
        export_allowed=True,
    )
    plan.claim_risks.append(risk)
    project = next(b for b in plan.bullets if b.paragraph_id == project_id)
    project.text += " Orchestrated Python checks."
    allow_draft_technology_risks(
        plan, [DraftTechnology(term="Python", paragraph_ids=[project_id], required=True)]
    )
    assert risk.strength == EvidenceStrength.direct
    assert risk.evidence_ids == ["source.python"]
    python_risks = [r for r in plan.claim_risks if r.claim == "Python"]
    assert {r.selected_placement for r in python_risks} == {employer_id, project_id}
    assert (
        next(r for r in python_risks if r.selected_placement == project_id).strength
        == EvidenceStrength.unsupported
    )


def test_final_review_drops_project_warning_when_only_employer_or_skills_retains_term():
    base, _, _ = draft_inputs()
    keywords = grade_job_keywords(
        parse_linkedin_simplify(
            "Example\nPlatform Engineer\nRemote\nAbout the job\nRequired Skills\n"
            "Python\nResponsibilities\n"
            + "Support production software and investigate reported issues. "
            * 10
        )
    )
    plan = identity_plan(base)
    project_id = "projects.loavenly.bullet.3"
    project = next(b for b in plan.bullets if b.paragraph_id == project_id)
    project.text += " Validated reporting records with Python."
    allow_draft_technology_risks(plan, [DraftTechnology(term="Python", paragraph_ids=[project_id])])
    assert any(r.claim == "Python" for r in plan.claim_risks)
    # The actual export reverted to base; Python still exists in employer/Skills.
    assert not any(r.claim == "Python" for r in _final_claim_risks(plan, keywords, base))
    targets = [DraftTechnology(term="Python", paragraph_ids=[project_id])]
    decision = next(
        row
        for row in _build_keyword_decisions(
            keywords, TransferabilityMap(), base, draft_technologies=targets
        )
        if row.term == "Python"
    )
    assert decision.used
    assert "project adaptation is absent" in decision.explanation
    assert "survives elsewhere" in decision.explanation
    final = base.model_copy(deep=True)
    next(p for p in final.paragraphs if p.paragraph_id == project_id).text = project.text
    retained = [r for r in _final_claim_risks(plan, keywords, final) if r.claim == "Python"]
    assert len(retained) == 1
    assert retained[0].selected_placement == project_id
    assert retained[0].strength == EvidenceStrength.unsupported
    decision = next(
        row
        for row in _build_keyword_decisions(
            keywords, TransferabilityMap(), final, draft_technologies=targets
        )
        if row.term == "Python"
    )
    assert "unverified editable project adaptation" in decision.explanation
    assert project_id in decision.explanation


def test_final_review_does_not_substitute_umbrella_keyword_for_missing_service():
    base, _, _ = draft_inputs()
    job = parse_linkedin_simplify(
        "Example\nPlatform Engineer\nRemote\nAbout the job\nRequired Skills\n"
        "AWS, AWS S3\nResponsibilities\n"
        + "Support production software and investigate reported issues. "
        * 10
    )
    keywords = grade_job_keywords(job)
    assert {"AWS", "AWS S3"} <= {k.term for k in keywords}
    plan = identity_plan(base)
    project_id = "projects.loavenly.bullet.1"
    project = next(b for b in plan.bullets if b.paragraph_id == project_id)
    project.text += " Stored inventory exports in AWS S3."
    allow_draft_technology_risks(plan, [DraftTechnology(term="AWS S3", paragraph_ids=[project_id])])
    final = base.model_copy(deep=True)
    paragraph = next(p for p in final.paragraphs if p.paragraph_id == project_id)
    paragraph.text += " Deployed inventory services on AWS."
    assert not _final_claim_risks(plan, keywords, final)
    paragraph.text = project.text
    assert len(_final_claim_risks(plan, keywords, final)) == 1


def test_rejected_tool_is_not_drafted_even_when_posting_requests_it():
    base = parse_resume_docx(Path("data/resumes/Brian_Aiad_BASE.docx"))
    job = parse_linkedin_simplify(
        Path("data/fixtures/evlo_ai_technical_support_engineer_2026_09_23.txt").read_text()
    )
    keywords = grade_job_keywords(job)
    apply_candidate_profile_to_keywords(
        keywords, CandidateProfile(candidate_name="Brian", rejected_terms=["Zendesk"])
    )
    graph = build_evidence_graph(base, keywords)
    drafts = select_draft_technologies(base, keywords, graph)

    assert not next(keyword for keyword in keywords if keyword.term == "Zendesk").accepted
    assert "Zendesk" not in {item.term for item in drafts}
    assert any(
        item.section == "experience.original_insurance" and _direct_match("webhooks", item)
        for item in graph.evidence
    )


def test_draft_automatically_targets_posting_technologies_without_confirmation():
    base, keywords, graph = draft_inputs()
    by_term = {item.term: item for item in graph.draft_technologies}
    for term in ("Java", "JavaScript", "Kubernetes", "Mendix", "low-code"):
        assert by_term[term].required
        assert "projects.loavenly.bullet.1" in by_term[term].paragraph_ids
    assert "projects.loavenly.bullet.2" in by_term["web services"].paragraph_ids
    assert by_term["web services"].required
    assert all("Java" not in item.systems for item in graph.evidence)
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    assert any(
        "Missing draft technology Java:" in item
        for item in coverage_feedback(base, keywords, graph, texts)
    )
    texts["projects.loavenly.bullet.1"] += (
        " Java, JavaScript, Kubernetes, Mendix, low-code, APIs, AWS, Azure, SQL, web services."
    )
    rows = {row.term: row for row in build_keyword_coverage(base, keywords, graph, texts)}
    assert rows["Java"].status == "draft_assumption"
    assert rows["Java"].evidence_ids == []
    assert not any(
        "Missing draft technology" in item
        for item in coverage_feedback(base, keywords, graph, texts)
    )
    texts["projects.loavenly.bullet.2"] += " Adapted web services."
    assert not any(
        "web services has no evidence" in item
        for item in coverage_feedback(base, keywords, graph, texts)
    )
    # Draft permission for a new project placement never erases actual employer coverage.
    texts["experience.original_insurance.bullet.5"] = "Supported carrier integration workflows."
    assert any(
        "Missing supported keyword web services" in item
        for item in coverage_feedback(base, keywords, graph, texts)
    )


def test_draft_permissions_survive_export_boundary_without_becoming_evidence():
    base, _, graph = draft_inputs()
    plan = identity_plan(base)
    bullet = next(
        item for item in plan.bullets if item.paragraph_id == "projects.loavenly.bullet.1"
    )
    bullet.text += " Java and Kubernetes."
    allow_draft_technology_risks(plan, graph.draft_technologies)
    _enforce_export_boundaries(plan, base)
    assert "Java and Kubernetes" in bullet.text
    for term in ("Java", "Kubernetes"):
        risk = next(item for item in plan.claim_risks if item.claim == term)
        assert risk.export_allowed
        assert risk.strength == EvidenceStrength.unsupported
        assert risk.evidence_ids == []


def test_draft_permission_does_not_invent_credentials_or_employer_experience():
    base, keywords, graph = draft_inputs()
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    texts["experience.original_insurance.bullet.1"] += " Developed Java services."
    assert any(
        "experience.original_insurance.bullet.1: Java has no evidence" in item
        for item in coverage_feedback(base, keywords, graph, texts)
    )
    assert not any(
        item.term in {"U.S. citizenship", "security clearance", "Bachelor's degree"}
        for item in graph.draft_technologies
    )


def test_all_relevant_posting_technologies_are_required_in_project_drafts():
    base, _, _ = draft_inputs()
    job = parse_linkedin_simplify(
        "Example\nSoftware Engineer\nRemote\nAbout the job\nRequired Qualifications\n"
        "Languages: Rust, Go, Kotlin, Scala, Ruby, PHP, Elixir, Haskell, Lua, Dart, Swift.\n"
        + "Support production applications and investigate incidents. "
        * 10
    )
    keywords = grade_job_keywords(job)
    graph = build_evidence_graph(base, keywords)
    targets = select_draft_technologies(base, keywords, graph)
    assert {"Rust", "Kotlin", "Elixir", "Swift"} <= {item.term for item in targets}
    assert sum(item.required for item in targets) == 11
    assert all(item.paragraph_ids for item in targets)


@pytest.mark.parametrize("term", ["MATLAB", "DuckDB", "FastAPI", "Apache Spark"])
def test_skills_only_or_lost_project_term_cannot_satisfy_draft_coverage(term):
    base, _, _ = draft_inputs()
    job = parse_linkedin_simplify(
        "Example\nApplication Support Engineer\nRemote\nAbout the job\n"
        f"Required Skills\n{term}\nResponsibilities\n"
        + "Support production software and investigate reported issues. "
        * 10
    )
    keywords = grade_job_keywords(job)
    graph = build_evidence_graph(base, keywords)
    graph.draft_technologies = select_draft_technologies(base, keywords, graph)
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    texts["skills.tools"] += f", {term}"
    missing = f"Missing draft technology {term}:"
    assert any(f.startswith(missing) for f in coverage_feedback(base, keywords, graph, texts))
    pid = "projects.loavenly.bullet.3"
    original = texts[pid]
    texts[pid] += f" Validated reporting records with {term}."
    assert not any(f.startswith(missing) for f in coverage_feedback(base, keywords, graph, texts))
    # A rendered fallback that restores the base cannot count the Skills mention.
    texts[pid] = original
    assert any(f.startswith(missing) for f in coverage_feedback(base, keywords, graph, texts))


def test_techaxis_requires_specific_software_stack_without_umbrella_duplicates():
    base = parse_resume_docx(Path("data/resumes/Brian_Aiad_BASE.docx"))
    job = parse_linkedin_simplify(
        Path("data/fixtures/techaxis_l3_production_support_engineer_2026_09_24.txt").read_text()
    )
    keywords = grade_job_keywords(job)
    graph = build_evidence_graph(base, keywords)
    targets = select_draft_technologies(base, keywords, graph)
    terms = {item.term for item in targets}

    assert {
        "Python",
        "R",
        "Alteryx",
        "PL/SQL",
        "AWS S3",
        "AWS SNS",
        "AWS ECR",
        "Airflow",
        "Kubernetes",
        "Harness",
    } <= terms
    required = {item.term for item in targets if item.required}
    assert not {"BAU", "RCA"} & required
    assert "AWS" not in required and "S3" not in required and "SQL" not in required
    assert {"AWS", "S3", "SQL"} <= terms
    graph.draft_technologies = targets
    texts = {p.paragraph_id: p.text for p in base.paragraphs}
    texts["projects.loavenly.bullet.1"] += " Managed AWS S3 storage with SQL/PLSQL validation."
    assert not any(
        message.startswith("projects.loavenly.bullet.1: AWS ")
        or message.startswith("projects.loavenly.bullet.1: S3 ")
        or message.startswith("projects.loavenly.bullet.1: SQL ")
        for message in coverage_feedback(base, keywords, graph, texts, require_coverage=False)
    )
    assert draft_distribution_feedback(targets, {"projects.loavenly.bullet.1": ", ".join(terms)})


def test_matlab_is_project_applicable_but_unrelated_physical_tools_are_not():
    base = parse_resume_docx(Path("data/resumes/Brian_Aiad_BASE.docx"))
    job = parse_linkedin_simplify(
        "Example\nSoftware Support Engineer\nRemote\nAbout the job\n"
        "Responsibilities\nDevelop MATLAB data-analysis workflows for support operations.\n"
        "Required Qualifications\nMATLAB, CNC drilling, and electrical schematics.\n"
        + "Support production software applications and document issues. "
        * 10
    )
    keywords = grade_job_keywords(job)
    graph = build_evidence_graph(base, keywords)
    terms = {item.term for item in select_draft_technologies(base, keywords, graph)}

    assert "MATLAB" in terms
    assert "CNC" not in terms
    assert "electrical schematics" not in terms


def test_physical_engineering_stack_is_not_adapted_into_loavenly():
    base, _, _ = draft_inputs()
    job = parse_linkedin_simplify(
        "Example\nManufacturing Engineer\nRemote\nAbout the job\n"
        "Required Skills\nMATLAB\nPython\nCNC\nDMM\noscilloscope\n"
        "Ansys HFSS\nRF electronics\nautoclave\nwet etch\nCATIA\n"
        "Required Qualifications\nExperience with manufacturing processes and tooling.\n"
        + "Support engineering operations and document quality investigations. "
        * 8
    )
    keywords = grade_job_keywords(job)
    graph = build_evidence_graph(base, keywords)
    terms = {t.term for t in select_draft_technologies(base, keywords, graph)}
    assert {"MATLAB", "Python"} <= terms
    assert (
        not {
            "CNC",
            "DMM",
            "oscilloscope",
            "Ansys HFSS",
            "RF electronics",
            "autoclave",
            "wet etch",
            "CATIA",
            "tooling",
        }
        & terms
    )


@pytest.mark.parametrize(
    "text",
    [
        "Built reporting workflows. MATLAB, Python, DuckDB.",
        "Built reporting workflows; used MATLAB and Python.",
        "Built reporting workflows. Technologies: MATLAB, Python, DuckDB.",
    ],
)
def test_bare_lists_do_not_satisfy_natural_project_placement(text):
    pid = "projects.loavenly.bullet.3"
    targets = [
        DraftTechnology(term=t, paragraph_ids=[pid], required=True)
        for t in ("MATLAB", "Python", "DuckDB")
    ]
    assert draft_distribution_feedback(targets, {pid: text})
    assert not draft_prose_feedback(
        targets, {pid: "Validated inventory reports with MATLAB and Python against DuckDB records."}
    )


def test_explicit_legacy_mode_exports_reviewable_project_adaptation_without_confirmation(tmp_path):
    class DraftReasoner(IdentityReasoner):
        calls = 0

        def reason(self, **kwargs):
            self.calls += 1
            assert any(item.term == "Java" for item in kwargs["evidence_graph"].draft_technologies)
            result = super().reason(**kwargs)
            bullet = next(
                item
                for item in result.rewrite_plan.bullets
                if item.paragraph_id == "projects.loavenly.bullet.3"
            )
            bullet.text = bullet.text.replace(
                "server-side aggregation", "Java server-side aggregation"
            )
            if self.calls == 1:
                bullet.text = bullet.text.replace("Java server-side", "server-side") + " Java."
            else:
                assert any("bare technology list" in f for f in kwargs["revision_feedback"])
            bullet.shorter_text = bullet.text.rstrip(".")
            return result

    reasoner = DraftReasoner()
    report = transform_resume(
        raw_paste="Example\nTechnical Support Engineer\nRemote\nAbout the job\nRequired Qualifications\nExperience with Java.\n"
        + "Support production applications and investigate incidents. " * 10,
        base_resume=Path("data/resumes/Brian_Aiad_BASE.docx"),
        output_dir=tmp_path,
        reasoner=reasoner,
        semantic_encoder=LexicalSemanticEncoder(),
        aggressive_draft=True,
    )
    assert report.tailoring_mode == "aggressive_draft"
    assert reasoner.calls == 2
    row = next(item for item in report.keyword_coverage if item.term == "Java")
    assert row.status == "draft_assumption"
    assert "projects.loavenly.bullet.3" in row.placements
    assert report.validation.passed and report.layout.passed
    risk = next(item for item in report.claim_risks if item.claim == "Java")
    assert risk.strength == EvidenceStrength.unsupported and risk.export_allowed


def test_cpp_and_ada_are_project_targets_but_los_angeles_and_radar_are_not():
    base = parse_resume_docx(Path("data/resumes/Brian_Aiad_BASE.docx"))
    job = parse_linkedin_simplify(
        "Company logo for, Raytheon\nRaytheon\nSoftware Engineer I\n"
        "El Segundo, California\nAbout the job\nResponsibilities\n"
        "Develop software in Los Angeles and collaborate across teams.\n"
        "Required Qualifications\nExperience developing software utilizing C/C++, ADA, and related tools and applications.\n"
        "Knowledge of Software Development Processes.\nPreferred Qualifications\n"
        "Knowledge and Experience with Radar Technology.\n"
        "Collaborate with software developers to investigate production defects and verify tested fixes across the software lifecycle."
    )
    keywords = grade_job_keywords(job)
    graph = build_evidence_graph(base, keywords)
    targets = {target.term for target in select_draft_technologies(base, keywords, graph)}
    assert {"C++", "Ada"} <= targets
    assert (
        not {"loan origination system", "Radar Technology", "Software Development Processes"}
        & targets
    )


def test_named_actions_do_not_become_tools_and_concrete_ci_tools_outrank_umbrella():
    from aiadapply_v2.planning.draft import _covered_by_more_specific_term

    assert _covered_by_more_specific_term("CI/CD", ["CI/CD", "Jenkins"])
    assert _covered_by_more_specific_term(
        "Continuous Integration", ["Continuous Integration", "GitLab CI"]
    )
    assert _covered_by_more_specific_term("operating systems", ["operating systems", "Linux"])
    assert not _covered_by_more_specific_term("C", ["C", "C++"])
    base = parse_resume_docx(Path("data/resumes/Brian_Aiad_BASE.docx"))
    job = parse_linkedin_simplify(
        "Example\nSoftware Engineer\nLong Beach, CA\nAbout the job\n"
        "Required Qualifications\nKnowledge of Verification, Validation, and Software Development Processes.\n"
        "Programming languages: C++, Python\nResponsibilities\n"
        + "Implement software interfaces and investigate production defects with the application team. "
        * 8
    )
    keywords = grade_job_keywords(job)
    graph = build_evidence_graph(base, keywords)
    targets = {t.term for t in select_draft_technologies(base, keywords, graph)}
    assert not {"Verification", "Validation", "Software Development Processes"} & targets


def test_financial_posting_drafts_office_software_not_employer_or_financial_methods():
    from aiadapply_v2.grading.keywords import grade_job_keywords
    from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify

    text = (
        """Company logo for, Raytheon
Raytheon
Program Cost Controls Analyst
California
Full-time
About the job
Qualifications You Must Have
Experience using Microsoft Excel, PowerPoint, and Word for financial analysis and reporting.
Qualifications We Prefer
Experience with Work Breakdown Structures (WBS).
Experience with Earned Value Management (EVM).
Experience with Raytheon or RTX financial systems, processes, projects, or programs.
"""
        + "Prepare accurate reports and work independently with program teams. " * 4
    )
    keywords = grade_job_keywords(parse_linkedin_simplify(text))
    systems = {k.term for k in keywords if k.accepted and k.kind.value == "system"}
    assert {"Excel", "PowerPoint", "Microsoft Word"} <= systems
    assert not {"Raytheon", "RTX", "Work Breakdown Structures", "Earned Value Management"} & systems
