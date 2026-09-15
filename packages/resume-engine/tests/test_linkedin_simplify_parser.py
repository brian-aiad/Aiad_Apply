import re
from pathlib import Path

import pytest
from aiadapply_v2.grading.keywords import grade_job_keywords, important_keywords
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify
from aiadapply_v2.profiling.role_profile import build_target_role_profile

FIXTURES = Path("data/fixtures")


def test_every_saved_real_posting_produces_a_usable_role_profile() -> None:
    fixture_paths = sorted(FIXTURES.rglob("*.txt"))
    assert len(fixture_paths) >= 35

    for path in fixture_paths:
        job = parse_linkedin_simplify(path.read_text(encoding="utf-8", errors="replace"))
        keywords = grade_job_keywords(job)
        profile = build_target_role_profile(job, keywords)
        label = str(path.relative_to(FIXTURES))

        assert job.company and job.company != "Unknown company", label
        assert job.title and job.title != "Untitled role", label
        assert len(job.job_description) >= 100, label
        assert job.responsibilities, f"{label}: responsibilities"
        assert job.required_qualifications, f"{label}: qualifications"
        assert profile.professional_identity, label
        assert any(keyword.accepted for keyword in keywords), f"{label}: keywords"


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
            "anduril_rotation_full.txt",
            "Anduril Industries",
            "Early Career Product Operations Rotation Program",
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
        (
            "los_angeles_times_application_support_full.txt",
            "Los Angeles Times",
            "Application Support Engineer",
            "application_support_engineering",
        ),
        (
            "jpmorgan_technology_support_ii_full.txt",
            "JPMorganChase",
            "Technology Support II",
            "technical_operations_support",
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
    assert "ai" not in {item.normalized for item in important_keywords(grade_job_keywords(job))}


def test_parse_rtx_employer_page_without_linkedin_boundary() -> None:
    raw = (
        FIXTURES / "rtx_raytheon_systems_engineer_radar_integration_test_2026_08_10.txt"
    ).read_text(encoding="utf-8")

    job = parse_linkedin_simplify(raw)

    assert job.company == "Raytheon"
    assert job.title == "Systems Engineer I: Radar System Integration & Test - Onsite"
    assert job.location == "El Segundo, California"
    assert job.work_arrangement == "On-site"
    assert job.compensation == "62,900 USD - 119,700 USD"
    assert len(job.responsibilities) == 11
    assert len(job.required_qualifications) == 4
    assert len(job.preferred_qualifications) == 5
    assert not any(item.startswith("After completion") for item in job.responsibilities)

    keywords = {item.normalized: item for item in grade_job_keywords(job)}
    for term in (
        "security clearance",
        "stem degree",
        "matlab",
        "test equipment",
        "electronics",
        "oscilloscope",
        "spectrum analyzer",
        "u.s. citizenship",
    ):
        assert keywords[term].accepted
    assert keywords["security clearance"].hiring_importance >= 40
    assert keywords["stem degree"].hiring_importance >= 40


def test_parse_greenhouse_page_with_banner_navigation_and_custom_headings() -> None:
    raw = (FIXTURES / "inspire_home_loans_technology_operations_engineer_2026_09_14.txt").read_text(
        encoding="utf-8"
    )

    job = parse_linkedin_simplify(raw)

    assert job.company == "Inspire Home Loans"
    assert job.title == "Technology Operations Engineer"
    assert job.location == "Newport Beach, CA"
    assert len(job.responsibilities) == 20
    assert len(job.required_qualifications) == 11
    assert len(job.preferred_qualifications) == 2
    assert "Apply for this job" not in job.job_description
    assert "First Name" not in job.job_description


@pytest.mark.parametrize(
    ("filename", "company", "title", "location", "family", "counts", "terms"),
    [
        (
            "rtx_collins_manufacturing_engineer_riverside_01865676.txt",
            "Collins Aerospace",
            "Manufacturing Engineer",
            "Riverside, California",
            "manufacturing_engineering",
            (9, 5, 6),
            {"u.s. person", "composite fabrication", "pfmea", "spc", "catia"},
        ),
        (
            "rtx_collins_product_quality_engineer_i_01863833.txt",
            "Collins Aerospace",
            "Product Quality Engineer I (Onsite)",
            "Fairfield, California",
            "product_quality_engineering",
            (11, 4, 7),
            {"atf access", "nonconforming material", "qms", "as9100", "gd&t"},
        ),
        (
            "rtx_raytheon_semiconductor_manufacturing_engineer_01862457.txt",
            "Raytheon",
            "Semiconductor Manufacturing Engineer - Goleta, CA",
            "Goleta, California",
            "semiconductor_manufacturing_engineering",
            (8, 3, 8),
            {"cleanroom", "lithography", "wet etch", "focal plane arrays"},
        ),
        (
            "rtx_raytheon_rf_microwave_antenna_engineer_i_01864246.txt",
            "Raytheon",
            "RF/Microwave Antenna Electrical Engineer I (Onsite)",
            "El Segundo, California",
            "rf_antenna_engineering",
            (3, 3, 10),
            {"rf/microwave", "vna", "ansys hfss", "antenna theory"},
        ),
        (
            "rtx_raytheon_manufacturing_engineer_goleta_01864965.txt",
            "Raytheon",
            "Manufacturing Engineer",
            "Goleta, California",
            "manufacturing_engineering",
            (8, 2, 8),
            {"erp", "mes", "gage r&r", "design of experiments", "spc"},
        ),
    ],
)
def test_rtx_stress_set_preserves_official_identity_sections_and_role_vocabulary(
    filename: str,
    company: str,
    title: str,
    location: str,
    family: str,
    counts: tuple[int, int, int],
    terms: set[str],
) -> None:
    job = parse_linkedin_simplify((FIXTURES / filename).read_text(encoding="utf-8"))
    keywords = grade_job_keywords(job)
    profile = build_target_role_profile(job, keywords)

    assert (job.company, job.title, job.location, job.work_arrangement) == (
        company,
        title,
        location,
        "On-site",
    )
    assert (
        len(job.responsibilities),
        len(job.required_qualifications),
        len(job.preferred_qualifications),
    ) == counts
    assert "necessary cookies" not in job.job_description
    assert "Similar Jobs" not in job.job_description
    assert "Workday, Inc." not in job.job_description
    assert profile.normalized_role_family == family
    assert terms <= {item.normalized for item in keywords if item.accepted}


def test_rtx_none_required_clearance_metadata_does_not_create_a_false_gate() -> None:
    for filename in (
        "rtx_collins_manufacturing_engineer_riverside_01865676.txt",
        "rtx_collins_product_quality_engineer_i_01863833.txt",
    ):
        job = parse_linkedin_simplify((FIXTURES / filename).read_text(encoding="utf-8"))
        accepted = {item.normalized for item in grade_job_keywords(job) if item.accepted}
        assert "security clearance" not in accepted


def test_nesco_negative_help_desk_phrase_is_not_a_resume_target() -> None:
    job = parse_linkedin_simplify(
        (
            FIXTURES / "nesco_resource_technical_client_operations_specialist_aliso_viejo.txt"
        ).read_text(encoding="utf-8")
    )
    by_term = {item.normalized: item for item in grade_job_keywords(job)}

    help_desk = by_term["help desk"]
    assert not help_desk.accepted
    assert help_desk.context == "negative"
    assert "explicitly excludes" in help_desk.rejection_reason
    assert "negative_context" in help_desk.source_sections
    assert help_desk.context_snippets == [
        "This is not a traditional help desk role where you spend the day waiting for tickets "
        "to come in."
    ]
    assert by_term["technical support"].accepted
    assert by_term["software implementation"].accepted


def test_positive_help_desk_requirement_remains_eligible_for_transfer() -> None:
    job = parse_linkedin_simplify(
        (FIXTURES / "pds_health_epic_analyst_full_2026_08_06.txt").read_text(encoding="utf-8")
    )
    keyword = next(item for item in grade_job_keywords(job) if item.normalized == "help desk")

    assert keyword.accepted
    assert keyword.context != "negative"

    riverside = parse_linkedin_simplify(
        (FIXTURES / "rtx_collins_manufacturing_engineer_riverside_01865676.txt").read_text(
            encoding="utf-8"
        )
    )
    accepted = {item.normalized for item in grade_job_keywords(riverside) if item.accepted}
    assert "u.s. person" in accepted
    assert "u.s. citizenship" not in accepted


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
    assert "compliance" not in important
    assert "operating systems" in important


def test_jpmorgan_hiring_requirements_outrank_scanner_tools() -> None:
    job = parse_linkedin_simplify(
        (FIXTURES / "jpmorgan_technology_support_ii_full.txt").read_text(encoding="utf-8")
    )
    by_term = {item.normalized: item for item in grade_job_keywords(job)}

    assert by_term["production support"].accepted
    assert by_term["production support"].hiring_importance >= 35
    assert by_term["sql"].accepted
    assert by_term["oracle"].accepted
    assert by_term["datadog"].placement_utility < by_term["production support"].placement_utility


def test_trade_desk_api_requirements_parse_without_company_footer_noise() -> None:
    job = parse_linkedin_simplify(
        (FIXTURES / "trade_desk_support_engineer_full.txt").read_text(encoding="utf-8")
    )
    by_term = {item.normalized: item for item in grade_job_keywords(job)}

    assert job.company == "The Trade Desk"
    assert job.title == "Support Engineer"
    assert by_term["rest apis"].accepted
    assert by_term["sql"].accepted
    assert by_term["graphql"].accepted


@pytest.mark.parametrize(
    ("filename", "company", "title", "location", "arrangement", "family", "terms"),
    [
        (
            "recent_floqast_integrations_support_2026_08_05.txt",
            "FloQast",
            "Technical Support Engineer (Integrations)",
            "Los Angeles, CA",
            "Hybrid",
            "technical_support_integrations",
            {"api", "postman", "sso"},
        ),
        (
            "recent_cresta_application_support_2026_08_05.txt",
            "Cresta",
            "Application Support Engineer",
            "United States (Remote)",
            "Remote",
            "application_support_engineering",
            {
                "apis",
                "jira",
                "log analysis",
                "network architecture",
                "sip",
                "voip",
                "web hosting",
            },
        ),
        (
            "recent_goodleap_application_support_2026_08_05.txt",
            "GoodLeap",
            "Application Support Engineer",
            "Remote, US",
            "Remote",
            "application_support_engineering",
            {
                "aws",
                "cloudwatch",
                "database",
                "dynamodb",
                "iam",
                "javascript",
                "powershell",
                "s3",
            },
        ),
    ],
)
def test_current_employer_postings_exercise_application_support_variants(
    filename: str,
    company: str,
    title: str,
    location: str,
    arrangement: str,
    family: str,
    terms: set[str],
) -> None:
    raw = (FIXTURES / filename).read_text(encoding="utf-8")
    job = parse_linkedin_simplify(raw)
    keywords = grade_job_keywords(job)
    profile = build_target_role_profile(job, keywords)
    important = {item.normalized for item in important_keywords(keywords)}

    assert "Source checked: 2026-08-05" in job.raw_paste
    assert "Official posting: https://" in job.raw_paste
    assert job.source_url and job.source_url.startswith("https://")
    assert job.company == company
    assert job.title == title
    assert job.location == location
    assert job.work_arrangement == arrangement
    assert job.compensation
    assert len(job.responsibilities) >= 8
    assert len(job.required_qualifications) >= 6
    assert profile.normalized_role_family == family
    assert terms <= important


def test_bank_of_hope_unheaded_duties_and_nested_qualification_headings() -> None:
    raw = (FIXTURES / "bank_of_hope_encompass_full_2026_08_06.txt").read_text(encoding="utf-8")
    job = parse_linkedin_simplify(raw)
    keywords = grade_job_keywords(job)
    by_term = {item.normalized: item for item in keywords}
    profile = build_target_role_profile(job, keywords)

    assert job.company == "Bank of Hope"
    assert job.title == "Analyst - Encompass"
    assert job.location == "Irvine, CA"
    assert job.work_arrangement == "On-site"
    assert job.compensation == "$90,000 - $120,000"
    assert len(job.responsibilities) == 8
    assert len(job.required_qualifications) == 1
    assert len(job.preferred_qualifications) == 6
    assert job.required_qualifications == ["Minimum Education Level: Associates Degree"]
    assert all(line.startswith("Preferred:") for line in job.preferred_qualifications)
    assert by_term["encompass"].accepted
    assert by_term["encompass"].hiring_importance >= 35
    assert by_term["troubleshooting"].accepted
    assert by_term["business rules"].accepted
    assert by_term["vendor interfaces"].accepted
    assert by_term["system health"].accepted
    assert by_term["system testing"].accepted
    assert by_term["workflow documentation"].accepted
    assert by_term["release analysis"].accepted
    assert by_term["loan origination system"].accepted
    assert profile.normalized_role_family == "application_support_administration"


def test_pds_epic_terms_come_from_job_text_without_simplify_keyword_panels() -> None:
    raw = (FIXTURES / "pds_health_epic_analyst_full_2026_08_06.txt").read_text(encoding="utf-8")
    job = parse_linkedin_simplify(raw)
    keywords = grade_job_keywords(job)
    by_term = {item.normalized: item for item in keywords}

    assert job.company == "PDS Health"
    assert job.title == "Analyst I, Epic Application Professional Billing and Claims"
    assert job.high_priority_keywords == []
    assert job.low_priority_keywords == []
    assert len(job.responsibilities) == 6
    assert len(job.preferred_qualifications) == 5
    assert len(job.required_qualifications) == 6
    assert {
        "application support",
        "build updates",
        "claims",
        "configuration",
        "end-user support",
        "epic",
        "epic certification",
        "help desk",
        "organizational skills",
        "problem-solving",
        "professional billing",
        "report creation",
        "system maintenance",
        "system workflows",
        "technical changes",
        "training",
        "troubleshooting",
    } <= set(by_term)
    assert by_term["epic"].hiring_importance >= 35
    assert "simplify_high" not in by_term["epic"].source_sections


@pytest.mark.parametrize(
    ("filename", "company", "title", "family", "responsibilities", "required", "preferred"),
    [
        (
            "niagara_it_systems_functional_i_2026_08_06.txt",
            "Niagara Bottling",
            "IT Systems Functional I",
            "business_systems_functional",
            11,
            12,
            1,
        ),
        (
            "nscale_support_desk_engineer_2026_08_06.txt",
            "Nscale",
            "Support Desk Engineer",
            "support_desk_engineering",
            14,
            10,
            6,
        ),
        (
            "trade_desk_platform_support_analyst_i_2026_08_06.txt",
            "The Trade Desk",
            "Platform Support Analyst I",
            "platform_support_analysis",
            13,
            11,
            4,
        ),
    ],
)
def test_user_supplied_stress_fixtures_parse_hiring_sections_without_scanner_input(
    filename: str,
    company: str,
    title: str,
    family: str,
    responsibilities: int,
    required: int,
    preferred: int,
) -> None:
    job = parse_linkedin_simplify((FIXTURES / filename).read_text(encoding="utf-8"))
    keywords = grade_job_keywords(job)
    profile = build_target_role_profile(job, keywords)

    assert job.company == company
    assert job.title == title
    assert len(job.responsibilities) == responsibilities
    assert len(job.required_qualifications) == required
    assert len(job.preferred_qualifications) == preferred
    assert job.high_priority_keywords == []
    assert job.low_priority_keywords == []
    assert profile.normalized_role_family == family


def test_stress_fixture_keywords_are_derived_from_the_job_and_generic_titles_are_rejected() -> None:
    expectations = {
        "niagara_it_systems_functional_i_2026_08_06.txt": {
            "business analysis",
            "critical thinking",
            "cross-functional collaboration",
            "data mining",
            "microsoft office",
            "outlook",
            "supply chain",
            "use cases",
        },
        "nscale_support_desk_engineer_2026_08_06.txt": {
            "aws",
            "docker",
            "gcp",
            "gpu",
            "kubernetes",
            "linux",
            "prometheus",
            "servicenow",
            "ticketing",
            "zendesk",
        },
        "trade_desk_platform_support_analyst_i_2026_08_06.txt": {
            "adtech",
            "agile",
            "confluence",
            "html",
            "jira",
            "salesforce",
            "sql",
            "tableau",
            "vertica",
        },
    }
    generic_title_terms = {"desk", "functional", "platform", "system", "systems"}

    for filename, expected in expectations.items():
        job = parse_linkedin_simplify((FIXTURES / filename).read_text(encoding="utf-8"))
        terms = {item.normalized for item in grade_job_keywords(job) if item.accepted}
        assert expected <= terms
        assert not (generic_title_terms & terms)


@pytest.mark.parametrize(
    (
        "filename",
        "company",
        "title",
        "arrangement",
        "responsibilities",
        "required",
        "preferred",
    ),
    [
        (
            "nesco_technical_client_operations_specialist_2026_08_12.txt",
            "Nesco Resource",
            "Technical Client Operations Specialist",
            "Remote",
            11,
            9,
            6,
        ),
        (
            "liquid_iv_d365_technical_analyst_2026_08_12.txt",
            "Liquid I.V.",
            "D365 Technical Analyst",
            "Hybrid",
            12,
            9,
            2,
        ),
    ],
)
def test_current_linkedin_posts_preserve_identity_and_hiring_section_boundaries(
    filename: str,
    company: str,
    title: str,
    arrangement: str,
    responsibilities: int,
    required: int,
    preferred: int,
) -> None:
    raw = (FIXTURES / filename).read_text(encoding="utf-8")
    job = parse_linkedin_simplify(raw)

    assert (job.company, job.title, job.work_arrangement) == (company, title, arrangement)
    assert len(job.responsibilities) == responsibilities
    assert len(job.required_qualifications) == required
    assert len(job.preferred_qualifications) == preferred

    accepted = {item.normalized for item in grade_job_keywords(job) if item.accepted}
    assert not ({"client", "operations", "reposted", "segundo"} & accepted)

    without_logo = re.sub(r"^Company logo for,.*\n", "", raw, count=1, flags=re.MULTILINE)
    fallback = parse_linkedin_simplify(without_logo)
    assert (fallback.company, fallback.title) == (company, title)


@pytest.mark.parametrize(
    ("filename", "company", "title", "arrangement", "compensation", "counts"),
    [
        (
            "linkedin_4215127819_coreweave_technical_support_engineer_bare_metal.txt",
            "CoreWeave",
            "Technical Support Engineer (Bare Metal)",
            "",
            "$83,000 to $145,000",
            (13, 13, 0),
        ),
        (
            "linkedin_4369610709_infinite_giving_client_operations_specialist.txt",
            "Infinite Giving",
            "Client Operations Specialist",
            "Remote",
            "",
            (3, 7, 3),
        ),
        (
            "linkedin_4401508206_liveramp_technical_support_engineer.txt",
            "LiveRamp",
            "Technical Support Engineer",
            "Hybrid",
            "$75,000 to $109,000",
            (5, 15, 3),
        ),
        (
            "linkedin_4431436073_crossover_technical_support_engineer_trilogy_remote_60_000_y.txt",
            "Crossover",
            "Technical Support Engineer, Trilogy (Remote) - $60,000/year USD",
            "Remote",
            "$60,000/year",
            (1, 6, 4),
        ),
        (
            "linkedin_4432540287_kapsch_group_technical_support_engineer.txt",
            "Kapsch Group",
            "Technical Support Engineer",
            "Remote",
            "$62,000 - $110,000",
            (10, 7, 0),
        ),
        (
            "linkedin_4435487199_community_energy_labs_technical_support_engineer_field_engin.txt",
            "Community Energy Labs",
            "Technical Support Engineer / Field Engineer",
            "Remote",
            "$75k-$100k",
            (17, 12, 6),
        ),
        (
            "linkedin_4453661445_southern_california_edison_sce_gis_and_system_support_specia.txt",
            "Southern California Edison (SCE)",
            "GIS and System Support Specialist",
            "Hybrid",
            "",
            (5, 1, 6),
        ),
    ],
)
def test_live_linkedin_corpus_has_stable_identity_sections_and_compensation(
    filename: str,
    company: str,
    title: str,
    arrangement: str,
    compensation: str,
    counts: tuple[int, int, int],
) -> None:
    path = FIXTURES / "live_linkedin_20260813" / filename
    job = parse_linkedin_simplify(path.read_text(encoding="utf-8"))

    assert (job.company, job.title) == (company, title)
    assert job.work_arrangement == arrangement
    assert job.compensation == compensation
    assert (
        len(job.responsibilities),
        len(job.required_qualifications),
        len(job.preferred_qualifications),
    ) == counts


def test_live_linkedin_keyword_grading_rejects_prose_and_title_fragments() -> None:
    path = (
        FIXTURES
        / "live_linkedin_20260813"
        / "linkedin_4215127819_coreweave_technical_support_engineer_bare_metal.txt"
    )
    job = parse_linkedin_simplify(path.read_text(encoding="utf-8"))
    accepted = {item.normalized for item in grade_job_keywords(job) if item.accepted}

    assert {
        "gpu",
        "firmware",
        "bare metal",
        "data center operations",
        "bios",
        "nvidia gpus",
        "hpc",
    } <= accepted
    assert not ({"outlook", "bare", "metal", "field"} & accepted)

    crossover_path = (
        FIXTURES
        / "live_linkedin_20260813"
        / "linkedin_4431436073_crossover_technical_support_engineer_trilogy_remote_60_000_y.txt"
    )
    crossover = parse_linkedin_simplify(crossover_path.read_text(encoding="utf-8"))
    crossover_terms = {item.normalized for item in grade_job_keywords(crossover) if item.accepted}
    assert "usd" not in crossover_terms
