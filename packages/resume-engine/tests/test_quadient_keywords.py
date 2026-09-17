from aiadapply_v2.grading.keywords import grade_job_keywords
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify


def test_quadient_product_support_vocabulary_is_extracted() -> None:
    job = parse_linkedin_simplify(
        "Product Support Specialist\nQuadient\nIrvine, CA · Hybrid · Full-time\n"
        "About the job\nResponsibilities\nProvide product support and troubleshoot locker hardware, "
        "software, kiosks, APIs, local databases, network/VPN connectivity, Linux and Windows "
        "systems. Read logs, contribute to the Knowledge Base, train peers, support connected "
        "devices and device management.\nQualifications\nExperience with Salesforce CRM, remote "
        "troubleshooting tools, API troubleshooting, Linux, Windows, databases, logs, VPN and "
        "network connectivity."
    )

    accepted = {item.normalized for item in grade_job_keywords(job) if item.accepted}

    assert {
        "api",
        "connected devices",
        "database",
        "device management",
        "kiosk",
        "knowledge base",
        "linux",
        "log analysis",
        "network connectivity",
        "product support",
        "remote troubleshooting tools",
        "salesforce",
        "vpn",
        "windows",
    } <= accepted
