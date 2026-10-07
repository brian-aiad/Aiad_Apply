from aiadapply_v2.grading.keywords import grade_job_keywords
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify


def test_rocket_name_and_legal_citations_are_not_programming_requirements():
    raw = (
        "Example Systems\nBusiness Systems Analyst\nRemote\nAbout the job\n"
        "Our Terran R vehicle delivers payloads.\nResponsibilities\n"
        "Support the entire lifecycle of Terran R and document operational issues.\n"
        "Required Qualifications\nMaintain documentation and support users.\n"
        "A U.S. Person is defined in 8 U.S.C. 1101(a)(20). "
        "See https://www.ecfr.gov/current/title-22/subpart-C/section-120.62.\n"
        + "Provide technical support and investigate production incidents. " * 8
    )
    job = parse_linkedin_simplify(raw)
    assert not {'r', 'c'} & {
        k.normalized for k in grade_job_keywords(job, additional_technologies=['R', 'C'])
        if k.accepted
    }
    # Genuine language requirements still count even beside the same boilerplate.
    job.required_qualifications.append('Experience programming in R and C.')
    job.job_description += '\nExperience programming in R and C.'
    assert {'r', 'c'} <= {k.normalized for k in grade_job_keywords(job) if k.accepted}


def test_domains_and_generic_tooling_are_not_named_software_products():
    job = parse_linkedin_simplify(
        'Example\nIT Systems Engineer\nRemote\nAbout the job\nRequired Qualifications\n'
        '3+ years of experience in IT Engineering.\n'
        'Familiarity with air defense systems, Integrated Air and Missile Defense concepts.\n'
        'Experience with observability tooling such as DataDog, Grafana, or Palantir Foundry.\n'
        + 'Support production applications and document incidents. ' * 10
    )
    products = {k.term for k in grade_job_keywords(job) if k.accepted and k.kind.value == 'system'}
    assert not {'Integrated Air', 'IT Engineering', 'tooling'} & products
    assert {'Grafana', 'Palantir Foundry'} <= products


def test_unfamiliar_standalone_and_multiword_stack_names_are_extracted():
    job = parse_linkedin_simplify(
        "Example\nSoftware Support Engineer\nRemote\nAbout the job\n"
        "Required Skills\nDuckDB\nFastAPI\nPolars\nSQL/PLSQL\n"
        "Communication\nLeadership\nTeamwork\nAttention To Detail\nWelding\n"
        "Preferred Qualifications\nExperience with Apache Spark and dbt.\n"
        "About us\nCompany Perks\nFun Events\n"
        + "We offer generous benefits and a collaborative company culture. "
        * 8
    )
    accepted = {k.term for k in grade_job_keywords(job) if k.accepted}
    assert {"DuckDB", "FastAPI", "Polars", "Apache Spark", "dbt"} <= accepted
    assert (
        not {
            "Company Perks",
            "Fun Events",
            "SQL/PLSQL",
            "Communication",
            "Leadership",
            "Teamwork",
            "Attention To Detail",
            "Welding",
        }
        & accepted
    )


def test_symbol_bearing_technologies_and_languages_survive_keyword_parsing() -> None:
    job = parse_linkedin_simplify(
        "Platform Support Engineer\nExample Systems\nLong Beach, CA · Full-time\n"
        "About the job\nResponsibilities\nDebug production Node.js and .NET services, "
        "review XML and JSON payloads, and automate diagnostics with Python and C++. "
        "Support React applications through REST APIs on Linux and Windows.\n"
        "Qualifications\nExperience with Python, C++, Node.js, .NET, React, SQL, XML, "
        "scripting, monitoring, root cause analysis, incident management, and "
        "cross-functional collaboration.\n"
        + ("Provide technical support and document production issues. " * 8)
    )

    accepted = {item.normalized for item in grade_job_keywords(job) if item.accepted}

    assert {
        "net",
        "c++",
        "cross-functional collaboration",
        "incident management",
        "monitoring",
        "node.js",
        "python",
        "react",
        "root cause analysis",
        "scripting",
        "xml",
    } <= accepted


def test_technology_names_do_not_match_unrelated_words() -> None:
    job = parse_linkedin_simplify(
        "Customer Support Specialist\nExample Systems\nLong Beach, CA · Full-time\n"
        "About the job\nResponsibilities\nSupport customers and document application "
        "issues with the engineering team.\nQualifications\nClear written communication.\n"
        + ("Provide customer support in a fast-paced environment. " * 12)
    )

    accepted = {item.normalized for item in grade_job_keywords(job) if item.accepted}

    assert not {"r", "c++", ".net", "node.js"} & accepted
