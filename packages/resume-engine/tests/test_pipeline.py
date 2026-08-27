from pathlib import Path

from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.evidence.loaders import build_evidence_graph
from aiadapply_v2.grading.keywords import NON_PROSE_QUALIFICATIONS, grade_job_keywords
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify
from aiadapply_v2.pipeline import (
    _certification_only_terms,
    _display_skill,
    _enforce_export_boundaries,
    _ensure_important_keyword_placement,
    _ensure_target_identity,
    _ensure_transferable_review_risks,
    _fuse_skill_inventory,
    _measured_skill_character_budget,
    _merge_transferability_map,
    _normalize_acronym_redundancy,
    _normalize_claim_risk_placements,
    _normalize_prose_collocations,
    _place_direct_category_keyword,
    _prune_absent_claim_risks,
    _prune_direct_evidence_risks,
    _prune_resolved_nonexportable_risks,
    _restore_unjustified_shortening,
    _sanitize_shorter_fallbacks,
    _select_compression_candidate,
    _select_expansion_candidate,
    _supported_keywords,
    transform_resume,
)
from aiadapply_v2.planning.rewrite_plan import all_proposed_text
from aiadapply_v2.profiling.role_profile import build_target_role_profile
from aiadapply_v2.schemas import (
    ClaimRisk,
    EvidenceMatch,
    EvidenceStrength,
    LayoutResult,
    ReasoningResult,
    RiskLevel,
    TargetRoleProfile,
    TransferabilityMap,
)
from aiadapply_v2.semantic.matcher import LexicalSemanticEncoder, build_transferability_map
from aiadapply_v2.text import split_skill_values
from aiadapply_v2.validation.resume import validate_rewrite_plan

from .helpers import IdentityReasoner, identity_plan

BASE = Path("data/resumes/Brian_Aiad_BASE.docx")


def test_end_to_end_pipeline_exports_job_specific_names_after_validation(tmp_path: Path) -> None:
    raw = """
Home
Jobs
Company logo for, Example Systems.
Example Systems
Technical Support Engineer
Los Angeles, CA · Posted today
Hybrid
Full-time
About the job
Example Systems provides production software to business customers. This paragraph
adds realistic page noise and sufficient text for a complete paste parser fixture.
Responsibilities
Troubleshoot production incidents using SQL, Postman, Jira, log analysis, and API debugging.
Resolve technical support tickets and document root cause analysis for SaaS applications.
Required Qualifications
Experience with SQL, Postman, Jira, technical support, troubleshooting, and REST APIs.
Strong written communication and cross-functional support experience.
Preferred Qualifications
Experience with Microsoft 365, Python, PowerShell, Linux, and Confluence.
Set alert for similar jobs
Candidates who clicked apply
100 total
About
Accessibility
LinkedIn Corporation
""" + ("navigation noise " * 20)
    progress: list[str] = []
    report = transform_resume(
        raw_paste=raw,
        base_resume=BASE,
        output_dir=tmp_path,
        reasoner=IdentityReasoner(),
        semantic_encoder=LexicalSemanticEncoder(),
        progress=progress.append,
    )

    assert (
        report.output_docx.name
        == "Brian_Aiad_Resume_Example_Systems_Technical_Support_Engineer.docx"
    )
    assert (
        report.output_pdf.name == "Brian_Aiad_Resume_Example_Systems_Technical_Support_Engineer.pdf"
    )
    assert report.output_docx.exists()
    assert report.output_pdf.exists()
    assert report.validation.passed
    assert report.layout.passed
    assert report.layout.page_count == 1
    assert report.keyword_decisions
    assert report.changes
    assert all(change.before_text for change in report.changes)
    assert {change.paragraph_id for change in report.changes} == set(
        parse_resume_docx(BASE).editable_paragraph_ids
    )
    assert (tmp_path / "transformation_report.json").exists()
    assert (tmp_path / "transformation_report.md").exists()
    audit = tmp_path / "character_audit.json"
    assert audit.exists()
    assert '"format_integrity_passed": true' in audit.read_text(encoding="utf-8")
    assert progress[0] == "Parsing and grading the job posting"
    assert progress[-1] == "Transformation complete"


def test_target_identity_is_repaired_in_primary_and_fallback_summaries() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/recent_floqast_integrations_support_2026_08_05.txt").read_text(
            encoding="utf-8"
        )
    )
    keywords = grade_job_keywords(job)
    document = parse_resume_docx(BASE)
    reasoning = ReasoningResult(
        role_profile=build_target_role_profile(job, keywords),
        transferability_map=TransferabilityMap(),
        rewrite_plan=identity_plan(document),
    )

    _ensure_target_identity(reasoning)

    assert reasoning.rewrite_plan.professional_identity == "Technical Support Engineer"
    assert reasoning.role_profile.professional_identity == "Technical Support Engineer"
    assert reasoning.rewrite_plan.summary.text.startswith("Technical Support Engineer with")
    assert reasoning.rewrite_plan.summary.shorter_text.startswith("Technical Support Engineer with")


def test_erp_identity_does_not_claim_an_unsupported_named_system() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/liquid_iv_d365_technical_analyst_2026_08_12.txt").read_text(
            encoding="utf-8"
        )
    )
    keywords = grade_job_keywords(job)
    reasoning = ReasoningResult(
        role_profile=build_target_role_profile(job, keywords),
        transferability_map=TransferabilityMap(
            unsupported_terms=["D365", "D365 F&O", "Dynamics 365", "ERP"]
        ),
        rewrite_plan=identity_plan(parse_resume_docx(BASE)),
    )

    _ensure_target_identity(reasoning)

    assert reasoning.rewrite_plan.professional_identity == "Application Support Analyst"
    assert reasoning.rewrite_plan.summary.text.startswith("Application Support Analyst with")
    assert not any(
        term in reasoning.rewrite_plan.summary.text for term in ("D365", "Dynamics 365", "ERP")
    )


def test_deterministic_direct_evidence_fills_incomplete_reasoner_map() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/recent_cresta_application_support_2026_08_05.txt").read_text(
            encoding="utf-8"
        )
    )
    keywords = grade_job_keywords(job)
    document = parse_resume_docx(BASE)
    profile = build_target_role_profile(job, keywords)
    graph = build_evidence_graph(document, keywords)
    preliminary = build_transferability_map(
        profile,
        keywords,
        graph,
        LexicalSemanticEncoder(),
    )
    reasoning = ReasoningResult(
        role_profile=profile,
        transferability_map=TransferabilityMap(),
        rewrite_plan=identity_plan(document),
    )

    _merge_transferability_map(reasoning, preliminary, keywords)

    by_term = {
        match.target_term.casefold(): match for match in reasoning.transferability_map.matches
    }
    assert by_term["apis"].strength == "direct"
    assert by_term["api integrations"].strength == "direct"
    assert by_term["h.323"].strength == "unsupported"
    assert by_term["zendesk"].strength == "unsupported"
    assert "APIs" in reasoning.transferability_map.direct_terms
    assert len(reasoning.transferability_map.matches) == len(
        [keyword for keyword in keywords if keyword.accepted]
    )


def test_curated_transfer_bridge_is_stable_when_reasoner_downgrades_it() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/liquid_iv_d365_technical_analyst_2026_08_12.txt").read_text(
            encoding="utf-8"
        )
    )
    keywords = grade_job_keywords(job)
    document = parse_resume_docx(BASE)
    profile = build_target_role_profile(job, keywords)
    preliminary = build_transferability_map(
        profile,
        keywords,
        build_evidence_graph(document, keywords),
        LexicalSemanticEncoder(),
    )
    deterministic = next(
        match
        for match in preliminary.matches
        if match.target_term.casefold() == "cross-functional collaboration"
    )
    assert deterministic.strength == EvidenceStrength.strongly_transferable
    downgraded = deterministic.model_copy(update={"strength": EvidenceStrength.unsupported})
    reasoning = ReasoningResult(
        role_profile=profile,
        transferability_map=TransferabilityMap(
            matches=[downgraded],
            unsupported_terms=[downgraded.target_term],
        ),
        rewrite_plan=identity_plan(document),
    )

    _merge_transferability_map(reasoning, preliminary, keywords)

    merged = next(
        match
        for match in reasoning.transferability_map.matches
        if match.target_term.casefold() == "cross-functional collaboration"
    )
    assert merged.strength == EvidenceStrength.strongly_transferable


def test_protected_certifications_and_suite_aliases_count_as_existing_evidence() -> None:
    document = parse_resume_docx(BASE)
    encoder = LexicalSemanticEncoder()

    la_job = parse_linkedin_simplify(
        Path("data/fixtures/los_angeles_times_application_support_full.txt").read_text(
            encoding="utf-8"
        )
    )
    la_keywords = grade_job_keywords(la_job)
    la_profile = build_target_role_profile(la_job, la_keywords)
    la_graph = build_evidence_graph(document, la_keywords)
    la_map = build_transferability_map(la_profile, la_keywords, la_graph, encoder)
    azure = next(match for match in la_map.matches if match.target_term.casefold() == "azure")

    assert azure.strength == EvidenceStrength.direct
    assert azure.evidence_id == "evidence.certifications.protected_body.40"

    niagara_job = parse_linkedin_simplify(
        Path("data/fixtures/niagara_it_systems_functional_i_2026_08_06.txt").read_text(
            encoding="utf-8"
        )
    )
    niagara_keywords = grade_job_keywords(niagara_job)
    niagara_profile = build_target_role_profile(niagara_job, niagara_keywords)
    niagara_graph = build_evidence_graph(document, niagara_keywords)
    niagara_map = build_transferability_map(
        niagara_profile,
        niagara_keywords,
        niagara_graph,
        encoder,
    )
    office = next(
        match for match in niagara_map.matches if match.target_term.casefold() == "microsoft office"
    )

    assert office.strength == EvidenceStrength.direct


def test_existing_protected_keyword_is_not_duplicated_into_skills() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/los_angeles_times_application_support_full.txt").read_text(
            encoding="utf-8"
        )
    )
    keywords = grade_job_keywords(job)
    azure = next(keyword for keyword in keywords if keyword.normalized == "azure")
    document = parse_resume_docx(BASE)
    reasoning = ReasoningResult(
        role_profile=build_target_role_profile(job, keywords),
        transferability_map=TransferabilityMap(direct_terms=["Azure"]),
        rewrite_plan=identity_plan(document),
    )

    _ensure_important_keyword_placement(reasoning, [azure], document)

    skill_text = " ".join(
        skill for line in reasoning.rewrite_plan.skills.lines for skill in line.skills
    )
    assert "Azure" not in skill_text


def test_stem_degree_is_satisfied_by_education_not_inserted_as_a_skill() -> None:
    job = parse_linkedin_simplify(
        Path(
            "data/fixtures/rtx_raytheon_systems_engineer_radar_integration_test_2026_08_10.txt"
        ).read_text(encoding="utf-8")
    )
    keywords = grade_job_keywords(job)
    stem = next(keyword for keyword in keywords if keyword.normalized == "stem degree")
    document = parse_resume_docx(BASE)
    reasoning = ReasoningResult(
        role_profile=build_target_role_profile(job, keywords),
        transferability_map=TransferabilityMap(direct_terms=["STEM degree"]),
        rewrite_plan=identity_plan(document),
    )
    technical = next(
        line
        for line in reasoning.rewrite_plan.skills.lines
        if line.paragraph_id == "skills.technical_support"
    )
    technical.skills.append("STEM degree")

    _fuse_skill_inventory(
        reasoning.rewrite_plan,
        document,
        keywords,
        skill_ineligible_terms=NON_PROSE_QUALIFICATIONS,
    )
    _ensure_important_keyword_placement(reasoning, [stem], document)

    skill_text = " ".join(
        skill for line in reasoning.rewrite_plan.skills.lines for skill in line.skills
    )
    assert "STEM degree" not in skill_text


def test_credential_specializations_require_exact_evidence_while_stem_degree_is_direct() -> None:
    document = parse_resume_docx(BASE)

    radar_job = parse_linkedin_simplify(
        Path(
            "data/fixtures/rtx_raytheon_systems_engineer_radar_integration_test_2026_08_10.txt"
        ).read_text(encoding="utf-8")
    )
    radar_keywords = grade_job_keywords(radar_job)
    radar_map = build_transferability_map(
        build_target_role_profile(radar_job, radar_keywords),
        radar_keywords,
        build_evidence_graph(document, radar_keywords),
        LexicalSemanticEncoder(),
    )
    radar_matches = {match.target_term.casefold(): match for match in radar_map.matches}
    assert radar_matches["stem degree"].strength == EvidenceStrength.direct
    assert radar_matches["security clearance"].strength == EvidenceStrength.unsupported

    rf_job = parse_linkedin_simplify(
        Path("data/fixtures/rtx_raytheon_rf_microwave_antenna_engineer_i_01864246.txt").read_text(
            encoding="utf-8"
        )
    )
    rf_keywords = grade_job_keywords(rf_job)
    rf_map = build_transferability_map(
        build_target_role_profile(rf_job, rf_keywords),
        rf_keywords,
        build_evidence_graph(document, rf_keywords),
        LexicalSemanticEncoder(),
    )
    rf_matches = {match.target_term.casefold(): match for match in rf_map.matches}
    assert rf_matches["electrical engineering"].strength == EvidenceStrength.unsupported
    assert rf_matches["u.s. citizenship"].strength == EvidenceStrength.unsupported


def test_supported_stretch_role_actions_are_placed_in_existing_investigation_evidence() -> None:
    job = parse_linkedin_simplify(
        Path(
            "data/fixtures/rtx_raytheon_semiconductor_manufacturing_engineer_01862457.txt"
        ).read_text(encoding="utf-8")
    )
    keywords = grade_job_keywords(job)
    supported = [
        keyword
        for keyword in keywords
        if keyword.normalized in {"problem-solving", "root cause and corrective action"}
    ]
    document = parse_resume_docx(BASE)
    reasoning = ReasoningResult(
        role_profile=build_target_role_profile(job, keywords),
        transferability_map=TransferabilityMap(
            strongly_transferable_terms=[keyword.term for keyword in supported]
        ),
        rewrite_plan=identity_plan(document),
    )

    _ensure_important_keyword_placement(reasoning, supported, document)

    investigation = next(
        bullet
        for bullet in reasoning.rewrite_plan.bullets
        if bullet.paragraph_id == "experience.original_insurance.bullet.2"
    )
    assert "problem-solving" in investigation.text
    assert "root cause and corrective action" in investigation.text


def test_certification_only_system_is_removed_from_proposed_skill_additions() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/los_angeles_times_application_support_full.txt").read_text(
            encoding="utf-8"
        )
    )
    keywords = grade_job_keywords(job)
    document = parse_resume_docx(BASE)
    profile = build_target_role_profile(job, keywords)
    graph = build_evidence_graph(document, keywords)
    transferability = build_transferability_map(
        profile,
        keywords,
        graph,
        LexicalSemanticEncoder(),
    )
    plan = identity_plan(document)
    cloud = next(line for line in plan.skills.lines if line.paragraph_id == "skills.cloud_systems")
    cloud.skills.append("Azure")

    _fuse_skill_inventory(
        plan,
        document,
        keywords,
        skill_ineligible_terms=_certification_only_terms(transferability),
    )

    assert "Azure" not in cloud.skills


def test_sla_acronym_redundancy_is_rewritten_as_natural_prose() -> None:
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    plan.summary.text = "Resolved tickets to support SLA and Service Level Agreements."
    plan.summary.shorter_text = plan.summary.text

    _normalize_acronym_redundancy(plan)

    assert plan.summary.text == "Resolved tickets to meet Service Level Agreements (SLA) targets."
    assert plan.summary.shorter_text == plan.summary.text


def test_direct_web_services_category_is_placed_through_existing_webhook_evidence() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/los_angeles_times_application_support_full.txt").read_text(
            encoding="utf-8"
        )
    )
    keyword = next(item for item in grade_job_keywords(job) if item.normalized == "web services")
    plan = identity_plan(parse_resume_docx(BASE))

    _place_direct_category_keyword(plan, keyword)

    bullet = next(
        item
        for item in plan.bullets
        if item.paragraph_id == "experience.original_insurance.bullet.5"
    )
    assert "webhook-based web services" in bullet.text
    assert "webhook-based web services" in bullet.shorter_text


def test_business_analysis_is_placed_without_removing_project_evidence() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/niagara_it_systems_functional_i_2026_08_06.txt").read_text(
            encoding="utf-8"
        )
    )
    keyword = next(
        item for item in grade_job_keywords(job) if item.normalized == "business analysis"
    )
    plan = identity_plan(parse_resume_docx(BASE))

    _place_direct_category_keyword(plan, keyword)

    bullet = next(
        item for item in plan.bullets if item.paragraph_id == "experience.wehelp.bullet.1"
    )
    assert bullet.text.startswith("Applied business analysis to identify the need")
    assert "independently built, tested, and deployed Loavenly" in bullet.text
    assert "staff and volunteers" in bullet.text


def test_client_operations_terms_are_placed_in_supported_volunteer_evidence() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/nesco_technical_client_operations_specialist_2026_08_12.txt").read_text(
            encoding="utf-8"
        )
    )
    by_term = {item.normalized: item for item in grade_job_keywords(job)}
    plan = identity_plan(parse_resume_docx(BASE))

    _place_direct_category_keyword(plan, by_term["software implementation"])
    _place_direct_category_keyword(plan, by_term["software adoption"])

    implementation = next(
        item for item in plan.bullets if item.paragraph_id == "experience.wehelp.bullet.1"
    )
    adoption = next(
        item for item in plan.bullets if item.paragraph_id == "experience.wehelp.bullet.2"
    )
    assert implementation.text.startswith("Led software implementation")
    assert "Loavenly by independently building, testing, and deploying" in implementation.text
    assert "software adoption" in adoption.text
    assert "software adoption" in adoption.shorter_text


def test_support_process_terms_are_placed_in_direct_experience_evidence() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/liquid_iv_d365_technical_analyst_2026_08_12.txt").read_text(
            encoding="utf-8"
        )
    )
    by_term = {item.normalized: item for item in grade_job_keywords(job)}
    plan = identity_plan(parse_resume_docx(BASE))

    _place_direct_category_keyword(plan, by_term["ticketing"])
    _place_direct_category_keyword(plan, by_term["incident management"])

    ticket = next(
        item
        for item in plan.bullets
        if item.paragraph_id == "experience.original_insurance.bullet.1"
    )
    incident = next(
        item for item in plan.bullets if item.paragraph_id == "experience.csulb.bullet.3"
    )
    assert "Jira ticketing" in ticket.text
    assert "Jira ticketing" in ticket.shorter_text
    assert incident.text.startswith("Supported incident management")
    assert "campus IT and third-party vendors" in incident.text


def test_account_management_is_placed_in_existing_identity_administration_evidence() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/liquid_iv_d365_technical_analyst_2026_08_12.txt").read_text(
            encoding="utf-8"
        )
    )
    keyword = next(
        item for item in grade_job_keywords(job) if item.normalized == "account management"
    )
    plan = identity_plan(parse_resume_docx(BASE))
    source_bullet = next(
        item
        for item in plan.bullets
        if item.paragraph_id == "experience.original_insurance.bullet.4"
    )
    source_length = len(source_bullet.text)

    _place_direct_category_keyword(plan, keyword)

    bullet = next(
        item
        for item in plan.bullets
        if item.paragraph_id == "experience.original_insurance.bullet.4"
    )
    assert "MFA, RBAC, and account management" in bullet.text
    assert "MFA, RBAC, and account management" in bullet.shorter_text
    assert len(bullet.text) == source_length
    assert "account management" in bullet.target_terms


def test_weakly_transferable_terms_are_not_export_supported() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/los_angeles_times_application_support_full.txt").read_text(
            encoding="utf-8"
        )
    )
    keywords = grade_job_keywords(job)
    reasoning = ReasoningResult(
        role_profile=build_target_role_profile(job, keywords),
        transferability_map=TransferabilityMap(weakly_transferable_terms=["change management"]),
        rewrite_plan=identity_plan(parse_resume_docx(BASE)),
    )

    supported = _supported_keywords(reasoning, keywords)

    assert "change management" not in {keyword.normalized for keyword in supported}


def test_literal_keyword_collocations_are_rewritten_as_natural_prose() -> None:
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    bullet = next(item for item in plan.bullets if item.paragraph_id == "experience.csulb.bullet.3")
    bullet.text = (
        "Maintained documentation while coordinating cross-functional collaboration with campus IT."
    )
    volunteer = next(
        item for item in plan.bullets if item.paragraph_id == "experience.wehelp.bullet.2"
    )
    volunteer.text = (
        "Support live distributions through user access management, troubleshooting issues, "
        "update validation, customer service, and training for staff."
    )

    _normalize_prose_collocations(plan)

    assert "supporting cross-functional collaboration" in bullet.text
    assert "by managing user access" in volunteer.text
    assert "delivering customer service and training to staff" in volunteer.text

    bullet.text = (
        "Maintained incident records, demonstrating organizational skills while coordinating "
        "with IT."
    )
    _normalize_prose_collocations(plan)
    assert bullet.text == (
        "Applied organizational skills to maintain incident records while coordinating with IT."
    )

    platform = next(
        item for item in plan.bullets if item.paragraph_id == "projects.loavenly.bullet.1"
    )
    platform.text = platform.text.replace(
        "across three food bank locations",
        ", and system maintenance across three food bank locations",
    )
    _normalize_prose_collocations(plan)
    assert "system maintenance" not in platform.text.casefold()

    plan.summary.text = "Resolved tickets by applying diagnostics, and Service Level Agreements."
    _normalize_prose_collocations(plan)
    assert plan.summary.text == (
        "Resolved tickets by applying diagnostics while meeting Service Level Agreements."
    )

    plan.summary.text = (
        "Resolved tickets by applying diagnostics and root cause analysis within "
        "Service Level Agreements."
    )
    _normalize_prose_collocations(plan)
    assert plan.summary.text == (
        "Resolved tickets by applying diagnostics and root cause analysis while meeting "
        "Service Level Agreements."
    )

    volunteer.text = (
        "Support Loavenly during live distributions through customer service, "
        "user-access management, troubleshooting production issues, validating updates, "
        "and training staff and volunteers."
    )
    _normalize_prose_collocations(plan)
    assert volunteer.text == (
        "Provide customer service for Loavenly during live distributions by managing user "
        "access, troubleshooting production issues, validating updates, and training staff "
        "and volunteers."
    )

    bullet.text = (
        "Supported incident management through documentation, escalation notes, and recurring "
        "issue tracking, using cross-functional collaboration and written and verbal "
        "communication skills with campus IT and third-party vendors."
    )
    _normalize_prose_collocations(plan)
    assert bullet.text == (
        "Supported incident management by maintaining documentation, escalation notes, and "
        "recurring issue tracking while applying written and verbal communication skills during "
        "cross-functional collaboration with campus IT and third-party vendors."
    )

    ticket = next(
        item
        for item in plan.bullets
        if item.paragraph_id == "experience.original_insurance.bullet.1"
    )
    ticket.text = "Resolved tickets across Microsoft 365,, maintaining SLA performance."
    _normalize_prose_collocations(plan)
    assert ",," not in ticket.text

    volunteer.text = (
        "Support Loavenly during live distributions through customer service, "
        "user-access management, production troubleshooting, update validation, and "
        "training for staff and volunteers."
    )
    _normalize_prose_collocations(plan)
    assert volunteer.text == (
        "Provide customer service for Loavenly during live distributions by managing user "
        "access, troubleshooting production issues, validating updates, and training staff "
        "and volunteers."
    )

    volunteer.text = (
        "Support Loavenly during live distributions through customer service, "
        "user-access management, troubleshooting production issues, update validation, "
        "and training for staff and volunteers."
    )
    _normalize_prose_collocations(plan)
    assert volunteer.text == (
        "Provide customer service for Loavenly during live distributions by managing user "
        "access, troubleshooting production issues, validating updates, and training staff "
        "and volunteers."
    )


def test_supported_tier_one_soft_skills_are_placed_in_concrete_evidence() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/niagara_it_systems_functional_i_2026_08_06.txt").read_text(
            encoding="utf-8"
        )
    )
    soft_terms = {"critical thinking", "problem-solving", "task prioritization"}
    keywords = [keyword for keyword in grade_job_keywords(job) if keyword.normalized in soft_terms]
    document = parse_resume_docx(BASE)
    reasoning = ReasoningResult(
        role_profile=build_target_role_profile(job, keywords),
        transferability_map=TransferabilityMap(),
        rewrite_plan=identity_plan(document),
    )

    _ensure_important_keyword_placement(reasoning, keywords, document)

    proposed_text = "\n".join(all_proposed_text(reasoning.rewrite_plan)).casefold()
    for term in soft_terms:
        assert term in proposed_text
    incident = next(
        item
        for item in reasoning.rewrite_plan.bullets
        if item.paragraph_id == "experience.original_insurance.bullet.2"
    )
    ticket = next(
        item
        for item in reasoning.rewrite_plan.bullets
        if item.paragraph_id == "experience.original_insurance.bullet.1"
    )
    assert "critical thinking and problem-solving" in incident.text.casefold()
    assert "task prioritization" in ticket.text.casefold()


def test_communication_terms_survive_the_shorter_evidence_candidate() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/liquid_iv_d365_technical_analyst_2026_08_12.txt").read_text(
            encoding="utf-8"
        )
    )
    keywords = grade_job_keywords(job)
    document = parse_resume_docx(BASE)
    reasoning = ReasoningResult(
        role_profile=build_target_role_profile(job, keywords),
        transferability_map=TransferabilityMap(),
        rewrite_plan=identity_plan(document),
    )
    incident = next(item for item in keywords if item.normalized == "incident management")
    _place_direct_category_keyword(reasoning.rewrite_plan, incident)

    supported = [
        item
        for item in keywords
        if item.normalized in {"cross-functional collaboration", "verbal communication"}
    ]
    _ensure_important_keyword_placement(reasoning, supported, document)

    bullet = next(
        item
        for item in reasoning.rewrite_plan.bullets
        if item.paragraph_id == "experience.csulb.bullet.3"
    )
    for text in (bullet.text, bullet.shorter_text):
        assert "cross-functional collaboration" in text.casefold()
        assert "verbal communication" in text.casefold()


def test_encompass_role_separates_platform_gaps_from_transferable_support_work() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/bank_of_hope_encompass_full_2026_08_06.txt").read_text(encoding="utf-8")
    )
    keywords = grade_job_keywords(job)
    document = parse_resume_docx(BASE)
    profile = build_target_role_profile(job, keywords)
    graph = build_evidence_graph(document, keywords)
    transferability = build_transferability_map(
        profile,
        keywords,
        graph,
        LexicalSemanticEncoder(),
    )
    by_term = {match.target_term.casefold(): match for match in transferability.matches}

    assert by_term["encompass"].strength == "unsupported"
    assert by_term["loan origination system"].strength == "unsupported"
    assert by_term["residential lending"].strength == "unsupported"
    assert by_term["troubleshooting"].strength == "direct"
    assert by_term["system testing"].strength == "strongly_transferable"
    assert by_term["vendor interfaces"].strength == "strongly_transferable"
    assert by_term["workflow documentation"].strength == "strongly_transferable"


def test_rewrite_plan_rejects_unsupported_protocol_in_resume_prose() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/recent_cresta_application_support_2026_08_05.txt").read_text(
            encoding="utf-8"
        )
    )
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    plan.summary.text += " with H.323 support"

    validation = validate_rewrite_plan(
        document,
        plan,
        [],
        build_target_role_profile(job, grade_job_keywords(job)),
        forbidden_terms=["H.323"],
    )

    assert not validation.passed
    assert any(issue.code == "unsupported_keyword_inserted" for issue in validation.issues)


def test_gap_risk_is_normalized_when_term_is_present_in_resume() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/recent_cresta_application_support_2026_08_05.txt").read_text(
            encoding="utf-8"
        )
    )
    keywords = grade_job_keywords(job)
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    technical_support = next(
        line for line in plan.skills.lines if line.paragraph_id == "skills.technical_support"
    )
    technical_support.skills.append("Web Hosting")
    plan.claim_risks.append(
        ClaimRisk(
            claim="Web-hosting experience",
            target_requirement="Experience with web hosting.",
            strength=EvidenceStrength.weakly_transferable,
            risk_level=RiskLevel.medium,
            explanation="Excluded from resume prose.",
            selected_placement="Recorded as a gap; omitted from resume prose.",
        )
    )
    reasoning = ReasoningResult(
        role_profile=build_target_role_profile(job, keywords),
        transferability_map=TransferabilityMap(),
        rewrite_plan=plan,
    )

    _normalize_claim_risk_placements(reasoning, keywords)

    risk = reasoning.rewrite_plan.claim_risks[0]
    assert risk.selected_placement == "skills.technical_support"
    assert "verify this wording" in risk.explanation


def test_free_form_risk_placement_is_normalized_before_export_enforcement() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/pds_health_epic_analyst_full_2026_08_06.txt").read_text(
            encoding="utf-8"
        )
    )
    keywords = grade_job_keywords(job)
    customer_service = next(
        keyword for keyword in keywords if keyword.normalized == "customer service"
    )
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    technical = next(
        line for line in plan.skills.lines if line.paragraph_id == "skills.technical_support"
    )
    technical.skills.append("Customer Service")
    risk = ClaimRisk(
        claim="Customer Service proficiency",
        target_requirement="customer service",
        strength=EvidenceStrength.strongly_transferable,
        risk_level=RiskLevel.medium,
        explanation="Review before export.",
        selected_placement="Use this in the support skills row.",
        export_allowed=False,
    )
    plan.claim_risks.append(risk)
    reasoning = ReasoningResult(
        role_profile=build_target_role_profile(job, keywords),
        transferability_map=TransferabilityMap(),
        rewrite_plan=plan,
    )

    _normalize_claim_risk_placements(reasoning, [customer_service])
    _enforce_export_boundaries(plan, document)

    assert risk.selected_placement == "skills.technical_support"
    assert "Customer Service" not in technical.skills


def test_model_risk_is_removed_when_deterministic_evidence_is_direct() -> None:
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    plan.claim_risks.append(
        ClaimRisk(
            claim="Microsoft Office proficiency",
            target_requirement="Microsoft Office",
            strength=EvidenceStrength.strongly_transferable,
            risk_level=RiskLevel.medium,
            explanation="Model was overly cautious.",
            selected_placement="skills.tools",
            export_allowed=False,
        )
    )
    reasoning = ReasoningResult(
        role_profile=TargetRoleProfile(
            title="IT Systems Functional I",
            normalized_role_family="business_systems_functional",
            professional_identity="Business Systems Support Analyst",
        ),
        transferability_map=TransferabilityMap(
            matches=[
                EvidenceMatch(
                    target_term="Microsoft Office",
                    target_requirement="Microsoft Office proficiency",
                    evidence_id="evidence.skills.tools",
                    source_text="Microsoft 365 and Excel",
                    semantic_score=1.0,
                    action_compatibility=0.5,
                    system_compatibility=0.9,
                    environment_compatibility=0.1,
                    outcome_compatibility=0.1,
                    strength=EvidenceStrength.direct,
                    reasoning="Direct suite evidence.",
                    suggested_placement="skills.tools",
                )
            ],
            direct_terms=["Microsoft Office"],
        ),
        rewrite_plan=plan,
    )

    _prune_direct_evidence_risks(reasoning)

    assert reasoning.rewrite_plan.claim_risks == []


def test_sensitive_transferable_duty_gets_an_automatic_review_risk() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/niagara_it_systems_functional_i_2026_08_06.txt").read_text(
            encoding="utf-8"
        )
    )
    keywords = grade_job_keywords(job)
    document = parse_resume_docx(BASE)
    profile = build_target_role_profile(job, keywords)
    graph = build_evidence_graph(document, keywords)
    transferability = build_transferability_map(
        profile,
        keywords,
        graph,
        LexicalSemanticEncoder(),
    )
    plan = identity_plan(document)
    bullet = next(
        item for item in plan.bullets if item.paragraph_id == "experience.wehelp.bullet.1"
    )
    bullet.text = bullet.text.replace(
        "Identified the need",
        "Applied business analysis and identified the need",
    )
    reasoning = ReasoningResult(
        role_profile=profile,
        transferability_map=transferability,
        rewrite_plan=plan,
    )

    _ensure_transferable_review_risks(reasoning, keywords, document)

    risk = next(risk for risk in plan.claim_risks if risk.claim == "business analysis")
    assert risk.strength == EvidenceStrength.strongly_transferable
    assert risk.risk_level == RiskLevel.medium
    assert risk.selected_placement == "experience.wehelp.bullet.1"
    assert risk.export_allowed is True


def test_export_boundary_uses_safe_fallback_for_blocked_bullet_claim() -> None:
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    bullet = plan.bullets[0]
    safe_text = next(
        paragraph.text
        for paragraph in document.paragraphs
        if paragraph.paragraph_id == bullet.paragraph_id
    )
    bullet.text = f"{safe_text} and documented an unsupported workflow."
    bullet.claim_risks.append(
        ClaimRisk(
            claim="Documented an unsupported workflow",
            target_requirement="Technical documentation",
            strength=EvidenceStrength.unsupported,
            risk_level=RiskLevel.high,
            explanation="The source does not establish documentation.",
            selected_placement=bullet.paragraph_id,
            export_allowed=False,
        )
    )

    _enforce_export_boundaries(plan, document)

    assert bullet.text == safe_text
    assert bullet.claim_risks[0].export_allowed is False


def test_important_omitted_term_does_not_displace_verified_base_skills() -> None:
    job = parse_linkedin_simplify(Path("data/fixtures/hanmi_full.txt").read_text(encoding="utf-8"))
    keywords = grade_job_keywords(job)
    document = parse_resume_docx(BASE)
    reasoning = ReasoningResult(
        role_profile=build_target_role_profile(job, keywords),
        transferability_map=TransferabilityMap(),
        rewrite_plan=identity_plan(document),
    )

    _fuse_skill_inventory(reasoning.rewrite_plan, document, keywords)
    _ensure_important_keyword_placement(reasoning, keywords, document)

    cloud = next(
        line
        for line in reasoning.rewrite_plan.skills.lines
        if line.paragraph_id == "skills.cloud_systems"
    )
    base_cloud = next(
        paragraph
        for paragraph in document.paragraphs
        if paragraph.paragraph_id == "skills.cloud_systems"
    )
    base_skills = split_skill_values(base_cloud.text.split(":", 1)[1])
    assert all(skill in cloud.skills for skill in base_skills)
    assert all(skill in cloud.shorter_skills for skill in base_skills)


def test_new_skill_terms_are_relocated_out_of_incorrect_model_categories() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/liquid_iv_d365_technical_analyst_2026_08_12.txt").read_text(
            encoding="utf-8"
        )
    )
    keywords = grade_job_keywords(job)
    compliance = next(item for item in keywords if item.normalized == "compliance")
    compliance.hiring_importance = 25
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    tools = next(line for line in plan.skills.lines if line.paragraph_id == "skills.tools")
    tools.skills.append("Compliance")

    _fuse_skill_inventory(plan, document, keywords)

    technical = next(
        line for line in plan.skills.lines if line.paragraph_id == "skills.technical_support"
    )
    assert "Compliance" in technical.skills
    assert "Compliance" not in tools.skills


def test_skill_display_is_professional_and_preserves_product_casing() -> None:
    assert _display_skill("technical support") == "Technical Support"
    assert _display_skill("cross-functional collaboration") == "Cross-Functional Collaboration"
    assert _display_skill("ai") == "AI"
    assert _display_skill("PowerShell") == "PowerShell"
    assert _display_skill("OAuth 2.0") == "OAuth 2.0"


def test_skill_fusion_preserves_base_tools_and_drops_weak_panel_noise() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/anduril_rotation_full.txt").read_text(encoding="utf-8")
    )
    keywords = grade_job_keywords(job)
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    tools = next(line for line in plan.skills.lines if line.paragraph_id == "skills.tools")
    tools.skills = ["Compliance", "Project Management", "AI", "Computer Vision"]
    tools.shorter_skills = list(tools.skills)

    _fuse_skill_inventory(plan, document, keywords)

    assert tools.skills[:3] == ["Jira", "Confluence", "Excel"]
    assert "Project Management" in tools.skills
    assert "Compliance" not in tools.skills
    assert "AI" not in tools.skills
    assert "Computer Vision" not in tools.skills


def test_skill_fusion_drops_unverified_additions_and_keeps_base_inventory_size() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/pds_health_epic_analyst_full_2026_08_06.txt").read_text(
            encoding="utf-8"
        )
    )
    keywords = grade_job_keywords(job)
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    tools = next(line for line in plan.skills.lines if line.paragraph_id == "skills.tools")
    technical = next(
        line for line in plan.skills.lines if line.paragraph_id == "skills.technical_support"
    )
    tools.skills = ["Jira", "Confluence", "Excel", "Outlook"]
    tools.shorter_skills = list(tools.skills)
    technical.skills = ["Production Support", "Troubleshooting", "Customer Service"]
    technical.shorter_skills = list(technical.skills)

    _fuse_skill_inventory(plan, document, keywords)
    reasoning = ReasoningResult(
        role_profile=build_target_role_profile(job, keywords),
        transferability_map=TransferabilityMap(),
        rewrite_plan=plan,
    )
    supported = [
        keyword
        for keyword in keywords
        if keyword.normalized
        not in {"epic", "epic certification", "professional billing", "claims"}
    ]
    _ensure_important_keyword_placement(reasoning, supported, document)

    assert "Outlook" not in tools.skills
    assert "VS Code" in tools.skills
    base_technical = next(
        paragraph
        for paragraph in document.paragraphs
        if paragraph.paragraph_id == "skills.technical_support"
    )
    base_skills = [value.strip() for value in base_technical.text.split(":", 1)[1].split(",")]
    assert all(skill in technical.skills for skill in base_skills)


def test_skill_budget_uses_measured_spare_width_without_changing_the_fallback_inventory() -> None:
    document = parse_resume_docx(BASE)
    skill_paragraphs = [
        paragraph for paragraph in document.paragraphs if paragraph.kind.value == "skill_line"
    ]
    for paragraph in skill_paragraphs:
        paragraph.rendered_max_width_points = 560.0
    tools = next(
        paragraph for paragraph in skill_paragraphs if paragraph.paragraph_id == "skills.tools"
    )
    tools.rendered_max_width_points = 315.0

    budget = _measured_skill_character_budget(document, tools)

    assert budget > tools.character_budget
    assert budget <= round(tools.character_budget * 1.5)


def test_unjustified_or_severe_shortening_restores_source_bullet() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/pds_health_epic_analyst_full_2026_08_06.txt").read_text(
            encoding="utf-8"
        )
    )
    keywords = grade_job_keywords(job)
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    paragraph_id = "experience.original_insurance.bullet.4"
    bullet = next(item for item in plan.bullets if item.paragraph_id == paragraph_id)
    source = bullet.text
    bullet.text = "Administered Microsoft 365 and Entra ID configurations."

    _restore_unjustified_shortening(plan, document, keywords)

    assert bullet.text == source


def test_rewording_without_a_new_target_term_restores_source_bullet() -> None:
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    paragraph_id = "experience.csulb.bullet.2"
    bullet = next(item for item in plan.bullets if item.paragraph_id == paragraph_id)
    source = bullet.text
    bullet.text = source.replace("resetting user access", "restoring user access")

    _restore_unjustified_shortening(plan, document, [])

    assert bullet.text == source


def test_rewrite_that_drops_a_named_source_system_is_restored() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/pds_health_epic_analyst_full_2026_08_06.txt").read_text(
            encoding="utf-8"
        )
    )
    keywords = grade_job_keywords(job)
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    paragraph_id = "experience.original_insurance.bullet.3"
    bullet = next(item for item in plan.bullets if item.paragraph_id == paragraph_id)
    source = bullet.text
    bullet.text = source.replace("production database", "production") + " Improved efficiency."

    _restore_unjustified_shortening(plan, document, keywords)

    assert bullet.text == source


def test_resolved_nonexportable_gap_is_removed_from_review_flags() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/pds_health_epic_analyst_full_2026_08_06.txt").read_text(
            encoding="utf-8"
        )
    )
    keywords = grade_job_keywords(job)
    plan = identity_plan(parse_resume_docx(BASE))
    plan.claim_risks.append(
        ClaimRisk(
            claim="Report creation",
            target_requirement="report creation",
            strength=EvidenceStrength.weakly_transferable,
            risk_level=RiskLevel.medium,
            explanation="Excluded from export.",
            selected_placement="keyword gap only",
            export_allowed=False,
        )
    )

    _prune_resolved_nonexportable_risks(plan, keywords)

    assert plan.claim_risks == []


def test_absent_transferable_claim_is_removed_from_review_flags() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/pds_health_epic_analyst_full_2026_08_06.txt").read_text(
            encoding="utf-8"
        )
    )
    keywords = grade_job_keywords(job)
    plan = identity_plan(parse_resume_docx(BASE))
    plan.claim_risks.append(
        ClaimRisk(
            claim="System maintenance",
            target_requirement="system maintenance",
            strength=EvidenceStrength.strongly_transferable,
            risk_level=RiskLevel.low,
            explanation="Review this adjacent duty.",
            selected_placement="projects.loavenly.bullet.1",
            export_allowed=True,
        )
    )

    _prune_absent_claim_risks(plan, keywords)

    assert plan.claim_risks == []


def test_rewrite_validation_rejects_removal_of_a_verified_base_skill() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/pds_health_epic_analyst_full_2026_08_06.txt").read_text(
            encoding="utf-8"
        )
    )
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    technical = next(
        line for line in plan.skills.lines if line.paragraph_id == "skills.technical_support"
    )
    technical.skills.remove("Root Cause Analysis")

    validation = validate_rewrite_plan(
        document,
        plan,
        [],
        build_target_role_profile(job, grade_job_keywords(job)),
    )

    assert not validation.passed
    assert any(issue.code == "base_skill_removed" for issue in validation.issues)


def test_layout_fallbacks_preserve_source_evidence_instead_of_overcompressing() -> None:
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    plan.summary.text = f"{plan.summary.text} Strengths include customer service."
    plan.summary.shorter_text = "Application Support Engineer with customer service."
    volunteer = next(
        item for item in plan.bullets if item.paragraph_id == "experience.wehelp.bullet.2"
    )
    volunteer.shorter_text = "Supported users and fixed issues."

    _sanitize_shorter_fallbacks(plan, document)

    source_by_id = {item.paragraph_id: item.text for item in document.paragraphs}
    assert plan.summary.shorter_text == source_by_id["summary"]
    assert volunteer.shorter_text == source_by_id["experience.wehelp.bullet.2"]


def test_primary_summary_cannot_drop_a_named_source_system() -> None:
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    plan.summary.text = plan.summary.text.replace(
        " and built Loavenly, a production multi-tenant SaaS platform",
        "",
    )

    _restore_unjustified_shortening(plan, document, [])

    source = next(item.text for item in document.paragraphs if item.paragraph_id == "summary")
    assert plan.summary.text == source


def test_role_identity_is_reapplied_after_summary_source_restoration() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/trade_desk_platform_support_analyst_i_2026_08_06.txt").read_text(
            encoding="utf-8"
        )
    )
    keywords = grade_job_keywords(job)
    document = parse_resume_docx(BASE)
    reasoning = ReasoningResult(
        role_profile=build_target_role_profile(job, keywords),
        transferability_map=TransferabilityMap(),
        rewrite_plan=identity_plan(document),
    )
    reasoning.rewrite_plan.summary.text = "Platform Support Analyst with production support."

    _restore_unjustified_shortening(reasoning.rewrite_plan, document, keywords)
    _ensure_target_identity(reasoning)
    _sanitize_shorter_fallbacks(reasoning.rewrite_plan, document)
    _ensure_target_identity(reasoning)

    assert reasoning.rewrite_plan.summary.text.startswith("Application Support Analyst")
    assert reasoning.rewrite_plan.summary.shorter_text.startswith("Application Support Analyst")
    assert "Loavenly" in reasoning.rewrite_plan.summary.text


def test_compression_prioritizes_measured_overflow_paragraph() -> None:
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    overflow = "experience.original_insurance.bullet.3"
    layout = LayoutResult(
        passed=False,
        page_count=2,
        rendered_lines=62,
        overflow_paragraph_ids=[overflow, "PROJECTS"],
    )

    selected = _select_compression_candidate(document, plan, layout, set())

    assert selected == overflow


def test_expansion_restores_shortened_paragraph_before_shifted_anchor() -> None:
    document = parse_resume_docx(BASE)
    plan = identity_plan(document)
    paragraph_id = "experience.original_insurance.bullet.3"
    bullet = next(item for item in plan.bullets if item.paragraph_id == paragraph_id)
    bullet.text = "Monitored ETL jobs."
    layout = LayoutResult(
        passed=False,
        page_count=1,
        rendered_lines=50,
        section_anchor_deltas={"PROJECTS": -12.0},
        paragraph_line_counts={paragraph_id: 1},
        baseline_paragraph_line_counts={paragraph_id: 2},
    )

    selected = _select_expansion_candidate(document, plan, layout, set())

    assert selected == paragraph_id


def test_dense_erp_keywords_are_balanced_across_fixed_skill_rows() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/liquid_iv_full.txt").read_text(encoding="utf-8")
    )
    keywords = grade_job_keywords(job)
    document = parse_resume_docx(BASE)
    reasoning = ReasoningResult(
        role_profile=build_target_role_profile(job, keywords),
        transferability_map=TransferabilityMap(),
        rewrite_plan=identity_plan(document),
    )

    _ensure_important_keyword_placement(reasoning, keywords, document)

    by_id = {paragraph.paragraph_id: paragraph for paragraph in document.paragraphs}
    for line in reasoning.rewrite_plan.skills.lines:
        paragraph = by_id[line.paragraph_id]
        _label, values = paragraph.text.split(":", 1)
        base_items = split_skill_values(values)
        assert len(line.skills) >= len(base_items)
