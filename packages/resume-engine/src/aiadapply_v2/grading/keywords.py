from __future__ import annotations

import re
from collections import Counter

from aiadapply_v2.schemas import (
    JobKeyword,
    KeywordKind,
    KeywordPriority,
    ParsedJob,
)
from aiadapply_v2.text import count_term, dedupe, normalized_term

TERM_CATALOG: dict[str, KeywordKind] = {
    "Active Directory": KeywordKind.system,
    "Abrigo": KeywordKind.system,
    "account management": KeywordKind.action,
    "AI": KeywordKind.environment,
    "API": KeywordKind.system,
    "API integrations": KeywordKind.system,
    "application support": KeywordKind.action,
    "APIs": KeywordKind.system,
    "API security": KeywordKind.system,
    "Ansible": KeywordKind.system,
    "AWS": KeywordKind.system,
    "AWS EKS": KeywordKind.system,
    "AWS RDS": KeywordKind.system,
    "AWS S3": KeywordKind.system,
    "Azure": KeywordKind.system,
    "Azure DevOps": KeywordKind.system,
    "Baker Hill": KeywordKind.system,
    "B2B SaaS": KeywordKind.environment,
    "Bash": KeywordKind.system,
    "bare metal": KeywordKind.environment,
    "BIOS": KeywordKind.system,
    "business analysis": KeywordKind.action,
    "business rules": KeywordKind.action,
    "build updates": KeywordKind.action,
    "C#": KeywordKind.system,
    "C++": KeywordKind.system,
    "CloudWatch": KeywordKind.system,
    "Cognito": KeywordKind.system,
    "CAD": KeywordKind.system,
    "case management": KeywordKind.action,
    "change management": KeywordKind.action,
    "CI/CD": KeywordKind.system,
    "cloud computing": KeywordKind.environment,
    "command line": KeywordKind.system,
    "containerization": KeywordKind.system,
    "communication skills": KeywordKind.qualification,
    "compliance": KeywordKind.environment,
    "Confluence": KeywordKind.system,
    "containerized applications": KeywordKind.environment,
    "configuration": KeywordKind.action,
    "continuous improvement": KeywordKind.outcome,
    "critical thinking": KeywordKind.action,
    "cross-functional collaboration": KeywordKind.qualification,
    "communications protocols": KeywordKind.system,
    "CRUD": KeywordKind.action,
    "customer case ownership": KeywordKind.action,
    "customer needs": KeywordKind.qualification,
    "customer service": KeywordKind.action,
    "dental operations": KeywordKind.environment,
    "digital engagement": KeywordKind.environment,
    "data integration": KeywordKind.action,
    "data center operations": KeywordKind.environment,
    "data mining": KeywordKind.action,
    "database": KeywordKind.system,
    "Datadog": KeywordKind.system,
    "D365 F&O": KeywordKind.system,
    "D365": KeywordKind.system,
    "DevOps": KeywordKind.environment,
    "diagnostics": KeywordKind.action,
    "document management": KeywordKind.action,
    "documentation": KeywordKind.action,
    "data collection": KeywordKind.action,
    "Docker": KeywordKind.system,
    "Dynamics 365": KeywordKind.system,
    "DynamoDB": KeywordKind.system,
    "Dynatrace": KeywordKind.system,
    "eFolder": KeywordKind.system,
    "EKS": KeywordKind.system,
    "Elasticsearch": KeywordKind.system,
    "Ellie Mae Encompass": KeywordKind.system,
    "Encompass": KeywordKind.system,
    "Encompass LOS": KeywordKind.system,
    "end-user support": KeywordKind.action,
    "end-to-end": KeywordKind.action,
    "enterprise software": KeywordKind.environment,
    "ERP": KeywordKind.system,
    "ETL": KeywordKind.system,
    "Epic": KeywordKind.system,
    "Epic certification": KeywordKind.qualification,
    "failure analysis": KeywordKind.action,
    "flight testing": KeywordKind.action,
    "fintech": KeywordKind.environment,
    "firmware": KeywordKind.system,
    "fast-paced environment": KeywordKind.environment,
    "Google Cloud": KeywordKind.system,
    "HPC": KeywordKind.environment,
    "GCP": KeywordKind.system,
    "Grafana": KeywordKind.system,
    "Groundcover": KeywordKind.system,
    "H.323": KeywordKind.system,
    "IAM": KeywordKind.system,
    "healthcare application ecosystems": KeywordKind.environment,
    "healthcare information systems": KeywordKind.environment,
    "help desk": KeywordKind.action,
    "hosting environment": KeywordKind.environment,
    "HTML": KeywordKind.system,
    "incident management": KeywordKind.action,
    "incident response": KeywordKind.action,
    "incident triage": KeywordKind.action,
    "information security": KeywordKind.environment,
    "integration testing": KeywordKind.action,
    "instrumentation": KeywordKind.system,
    "interface control documentation": KeywordKind.action,
    "integrated care delivery systems": KeywordKind.environment,
    "internal controls": KeywordKind.environment,
    "interpersonal communication": KeywordKind.qualification,
    "interpersonal skills": KeywordKind.qualification,
    "IoT": KeywordKind.environment,
    "iOS": KeywordKind.system,
    "Jira": KeywordKind.system,
    "Java": KeywordKind.system,
    "JavaScript": KeywordKind.system,
    "JSON": KeywordKind.system,
    "knowledge base": KeywordKind.action,
    "Kubernetes": KeywordKind.system,
    "LAN/WAN": KeywordKind.system,
    "Linear": KeywordKind.system,
    "Lifecycle Services": KeywordKind.system,
    "Linux": KeywordKind.system,
    "log analysis": KeywordKind.action,
    "loan origination system": KeywordKind.system,
    "macOS": KeywordKind.system,
    "Microsoft 365": KeywordKind.system,
    "Microsoft Office": KeywordKind.system,
    "MATLAB": KeywordKind.system,
    "MBSE": KeywordKind.system,
    "Moody's": KeywordKind.system,
    "ML": KeywordKind.environment,
    "microservices": KeywordKind.environment,
    "network architecture": KeywordKind.system,
    "nCino": KeywordKind.system,
    "NVIDIA GPUs": KeywordKind.system,
    "OAuth": KeywordKind.system,
    "Oracle": KeywordKind.system,
    "observability": KeywordKind.action,
    "oscilloscope": KeywordKind.system,
    "operational availability": KeywordKind.outcome,
    "operational efficiency": KeywordKind.outcome,
    "operating systems": KeywordKind.system,
    "organizational skills": KeywordKind.qualification,
    "Outlook": KeywordKind.system,
    "PagerDuty": KeywordKind.system,
    "Palantir Foundry": KeywordKind.system,
    "Postman": KeywordKind.system,
    "PowerShell": KeywordKind.system,
    "Power BI": KeywordKind.system,
    "problem-solving": KeywordKind.action,
    "Prometheus": KeywordKind.system,
    "Professional Billing": KeywordKind.vocabulary,
    "process improvement": KeywordKind.action,
    "product operations": KeywordKind.environment,
    "production support": KeywordKind.action,
    "Python": KeywordKind.system,
    "regression": KeywordKind.action,
    "regression testing": KeywordKind.action,
    "regulatory compliance": KeywordKind.environment,
    "reliability": KeywordKind.outcome,
    "release analysis": KeywordKind.action,
    "release management": KeywordKind.action,
    "report creation": KeywordKind.action,
    "residential lending": KeywordKind.environment,
    "REST APIs": KeywordKind.system,
    "RDS": KeywordKind.system,
    "root cause analysis": KeywordKind.action,
    "root cause and corrective action": KeywordKind.action,
    "radar": KeywordKind.environment,
    "RF electronics": KeywordKind.system,
    "RTP": KeywordKind.system,
    "SaaS": KeywordKind.environment,
    "SuperMicro": KeywordKind.system,
    "S3": KeywordKind.system,
    "Salesforce": KeywordKind.system,
    "SAML": KeywordKind.system,
    "service delivery": KeywordKind.action,
    "service desk": KeywordKind.environment,
    "ServiceNow": KeywordKind.system,
    "SFTP": KeywordKind.system,
    "SIP": KeywordKind.system,
    "SIPREC": KeywordKind.system,
    "SDKs": KeywordKind.system,
    "Slack": KeywordKind.system,
    "Splunk": KeywordKind.system,
    "SLA": KeywordKind.outcome,
    "Service Level Agreements": KeywordKind.outcome,
    "SDLC": KeywordKind.environment,
    "SOX": KeywordKind.environment,
    "SQL": KeywordKind.system,
    "SSO": KeywordKind.system,
    "system logs": KeywordKind.action,
    "telephony": KeywordKind.system,
    "system integration": KeywordKind.action,
    "systems integration": KeywordKind.action,
    "system maintenance": KeywordKind.action,
    "system workflows": KeywordKind.action,
    "system health": KeywordKind.outcome,
    "system testing": KeywordKind.action,
    "security clearance": KeywordKind.qualification,
    "spectrum analyzer": KeywordKind.system,
    "STEM degree": KeywordKind.qualification,
    "system updates": KeywordKind.action,
    "software adoption": KeywordKind.outcome,
    "software implementation": KeywordKind.action,
    "supply chain": KeywordKind.environment,
    "technical support": KeywordKind.environment,
    "technical changes": KeywordKind.action,
    "technical writing": KeywordKind.action,
    "Tableau": KeywordKind.system,
    "test automation": KeywordKind.action,
    "test equipment": KeywordKind.system,
    "test plans and procedures": KeywordKind.action,
    "telemetry": KeywordKind.system,
    "task prioritization": KeywordKind.action,
    "ticketing": KeywordKind.action,
    "training": KeywordKind.action,
    "troubleshooting": KeywordKind.action,
    "UNIX": KeywordKind.system,
    "workflow documentation": KeywordKind.action,
    "workflow management": KeywordKind.action,
    "vendor interfaces": KeywordKind.action,
    "use cases": KeywordKind.action,
    "U.S. citizenship": KeywordKind.qualification,
    "verification and validation": KeywordKind.action,
    "verbal communication": KeywordKind.qualification,
    "Vertica": KeywordKind.system,
    "VoIP": KeywordKind.system,
    "web hosting": KeywordKind.environment,
    "web services": KeywordKind.system,
    "written and verbal communication skills": KeywordKind.qualification,
    "3DEXPERIENCE": KeywordKind.system,
    "Ansys HFSS": KeywordKind.system,
    "AS9100": KeywordKind.system,
    "ATF access": KeywordKind.qualification,
    "antenna theory": KeywordKind.vocabulary,
    "AutoCAD": KeywordKind.system,
    "autoclave": KeywordKind.system,
    "bills of material": KeywordKind.action,
    "BOM": KeywordKind.action,
    "capability studies": KeywordKind.action,
    "CATIA": KeywordKind.system,
    "cleanroom": KeywordKind.environment,
    "CMES": KeywordKind.system,
    "composite fabrication": KeywordKind.environment,
    "control plans": KeywordKind.action,
    "corrective action requests": KeywordKind.action,
    "CST": KeywordKind.system,
    "Design for Manufacturability": KeywordKind.action,
    "Design of Experiments": KeywordKind.action,
    "DMM": KeywordKind.system,
    "EHS": KeywordKind.environment,
    "engineering drawings": KeywordKind.action,
    "First Article Inspection": KeywordKind.action,
    "First Pass Yield": KeywordKind.outcome,
    "FiberSim NX": KeywordKind.system,
    "Focal Plane Arrays": KeywordKind.vocabulary,
    "Gage R&R": KeywordKind.action,
    "GD&T": KeywordKind.system,
    "Integrated Product Team": KeywordKind.environment,
    "ISO 9001": KeywordKind.system,
    "Keysight ADS": KeywordKind.system,
    "LabVIEW": KeywordKind.system,
    "Lean": KeywordKind.action,
    "lithography": KeywordKind.system,
    "manufacturing documentation": KeywordKind.action,
    "manufacturing engineering": KeywordKind.environment,
    "manufacturing processes": KeywordKind.action,
    "MES": KeywordKind.system,
    "metal lift-off": KeywordKind.system,
    "MRB": KeywordKind.action,
    "NDI": KeywordKind.system,
    "nonconforming material": KeywordKind.action,
    "PFMEA": KeywordKind.action,
    "phased array antennas": KeywordKind.vocabulary,
    "PLM": KeywordKind.system,
    "plasma cleaning": KeywordKind.system,
    "process optimization": KeywordKind.outcome,
    "process travelers": KeywordKind.action,
    "production environment": KeywordKind.environment,
    "QMS": KeywordKind.system,
    "quality engineering": KeywordKind.environment,
    "RF/microwave": KeywordKind.system,
    "semiconductor processing": KeywordKind.environment,
    "signal generator": KeywordKind.system,
    "Six Sigma": KeywordKind.action,
    "SPC": KeywordKind.action,
    "statistical techniques": KeywordKind.action,
    "tooling": KeywordKind.system,
    "U.S. Person": KeywordKind.qualification,
    "VNA": KeywordKind.system,
    "wet etch": KeywordKind.system,
    "Windchill": KeywordKind.system,
    "work instructions": KeywordKind.action,
    "AdTech": KeywordKind.environment,
    "Agile": KeywordKind.environment,
    "Claims": KeywordKind.vocabulary,
    "CRM": KeywordKind.system,
    "GPU": KeywordKind.system,
    "hybrid cloud": KeywordKind.environment,
    "Looker": KeywordKind.system,
    "media buying": KeywordKind.environment,
    "patient experience": KeywordKind.environment,
    "Zendesk": KeywordKind.system,
    "electrical schematics": KeywordKind.system,
    "electronics": KeywordKind.system,
    "hardware integration": KeywordKind.action,
    "Electrical Engineering": KeywordKind.qualification,
}
TERM_PATTERNS: dict[str, re.Pattern[str]] = {
    "atf access": re.compile(r"\bATF access\b", re.I),
    "bills of material": re.compile(r"\b(?:bills? of materials?|BOMs?)\b", re.I),
    "corrective action requests": re.compile(r"\b(?:corrective action requests?|CARs?)\b", re.I),
    "design of experiments": re.compile(r"\b(?:Design of Experiments|DOE)\b", re.I),
    "first article inspection": re.compile(r"\bFirst Article Inspections?\b", re.I),
    "first pass yield": re.compile(r"\b(?:First[- ]Pass Yield|FPY)\b", re.I),
    "gage r&r": re.compile(r"\bGage R&Rs?\b", re.I),
    "integrated product team": re.compile(r"\bIntegrated Product Teams?\b|\bIPTs?\b", re.I),
    "mrb": re.compile(r"\bMaterial Review Board\b|\bMRB\b", re.I),
    "nonconforming material": re.compile(r"\bnon[- ]?conforming material\b", re.I),
    "qms": re.compile(r"\b(?:QMS|Quality Management System)\b", re.I),
    "rf/microwave": re.compile(r"\bRF\s*/\s*Microwave\b|\bRF/microwave\b", re.I),
    "spc": re.compile(r"\b(?:SPC|Statistical Process Control)\b", re.I),
    "security clearance": re.compile(
        r"\b(?:active(?: and existing| and transferable)?|existing|transferable)\s+"
        r"(?:U\.S\. government issued\s+)?security clearance\b|"
        r"\b(?:ability|required) to obtain(?: and maintain)?(?: an?\s+)?"
        r"(?:U\.S\. government issued\s+)?security clearance\b|"
        r"\bsecurity clearance is required\b",
        re.I,
    ),
    "u.s. person": re.compile(
        r"\b(?:job|position|role) requires an? U\.S\. Person\b|"
        r"\bmust be an? U\.S\. Person\b",
        re.I,
    ),
    "vna": re.compile(r"\bVNAs?\b|\bvector network analy[sz]ers?\b", re.I),
    "bare metal": re.compile(r"\bbare[- ]metal\b", re.I),
    "c#": re.compile(r"(?<![A-Za-z0-9])C#(?![A-Za-z0-9])", re.I),
    "c++": re.compile(r"(?<![A-Za-z0-9])C\+\+(?![A-Za-z0-9])", re.I),
    "data center operations": re.compile(
        r"\b(?:data centers?|data center (?:environment|operations?))\b", re.I
    ),
    "data collection": re.compile(
        r"\b(?:data collection|collection of (?:large )?data sets?)\b", re.I
    ),
    "electrical engineering": re.compile(r"\bElectrical Engineering\b", re.I),
    "hardware integration": re.compile(
        r"\b(?:hardware integration|integrat(?:e|ing) .{0,40}(?:hardware|electronics)|"
        r"hardware.{0,40}\bintegration)\b",
        re.I,
    ),
    "outlook": re.compile(
        r"\b(?:Microsoft|MS|Office 365|M365)\s+Outlook\b|"
        r"\bMicrosoft Office.{0,30}\bOutlook\b|"
        r"\bOutlook\s+(?:email|calendar|client)\b",
        re.I,
    ),
    "application support": re.compile(
        r"\b(?:application support|support(?:ing)? applications?|"
        r"application.{0,120}\bsupport|support.{0,120}\bapplication)\b",
        re.I,
    ),
    "build updates": re.compile(r"\b(?:build(?:ing)? updates?|build and deploy)\b", re.I),
    "cross-functional collaboration": re.compile(
        r"\b(?:cross[- ]functional(?:ly)?|collaborat(?:e|es|ing|ion).{0,50}"
        r"(?:departments?|teams?|stakeholders?))\b",
        re.I,
    ),
    "document management": re.compile(r"\b(?:document library|document management)\b", re.I),
    "end-user support": re.compile(
        r"\b(?:end[- ]user support|support for end users?|end users?)\b", re.I
    ),
    "epic certification": re.compile(r"\bEpic certification\b", re.I),
    "help desk": re.compile(r"\bhelp desk\b", re.I),
    "loan origination system": re.compile(r"\b(?:loan origination systems?|LOS)\b", re.I),
    "root cause and corrective action": re.compile(
        r"\broot cause and corrective action(?: processes?)?\b", re.I
    ),
    "problem-solving": re.compile(r"\bproblem[- ]solving\b", re.I),
    "report creation": re.compile(r"\b(?:report creation|creat(?:e|es|ing) reports?)\b", re.I),
    "service level agreements": re.compile(r"\b(?:service level agreements?|SLAs?)\b", re.I),
    "software adoption": re.compile(
        r"\b(?:software|platform)\s+(?:usage,\s*)?(?:adoption|engagement)\b|"
        r"\b(?:adoption|engagement)\s+(?:trends?|strateg(?:y|ies))\b",
        re.I,
    ),
    "software implementation": re.compile(
        r"\b(?:software|platform|system) implementations?\b|"
        r"\bimplement(?:ing|ed)?\s+(?:a\s+)?(?:software|platform|system)\b",
        re.I,
    ),
    "stem degree": re.compile(
        r"\b(?:STEM degree|Bachelor(?:'s)? degree in Science, Technology, Engineering or Mathematics)\b",
        re.I,
    ),
    "systems integration": re.compile(r"\bsystems? integration\b", re.I),
    "test plans and procedures": re.compile(r"\btest plans? and procedures?\b", re.I),
    "u.s. citizenship": re.compile(r"\bU\.S\. citizenship\b|\bUS citizenship\b", re.I),
    "verification and validation": re.compile(
        r"\bverification(?:,? and| &) validation\b|\bV&V\b|"
        r"\bIntegration, Verification, and Validation\b",
        re.I,
    ),
    "regulatory compliance": re.compile(
        r"\b(?:regulatory needs|regulatory compliance|compliance with regulations)\b", re.I
    ),
    "release analysis": re.compile(
        r"\b(?:release analysis|review(?: and summarize)? .{0,30}\breleases?)\b", re.I
    ),
    "system health": re.compile(r"\b(?:system health|health of systems)\b", re.I),
    "system maintenance": re.compile(
        r"\b(?:system maintenance|support and maintenance|maintain(?:ing)? systems?|"
        r"systems?.{0,60}\bmaintenance)\b",
        re.I,
    ),
    "system workflows": re.compile(r"\b(?:system workflows?|workflows? for systems?)\b", re.I),
    "task prioritization": re.compile(r"\b(?:task prioritization|prioriti[sz]e tasks?)\b", re.I),
    "technical changes": re.compile(r"\btechnical changes?\b", re.I),
    "verbal communication": re.compile(
        r"\b(?:verbal communication|communicat(?:e|es|ing) clearly)\b", re.I
    ),
    "vendor interfaces": re.compile(
        r"\b(?:vendor interfaces|vendors?.{0,50}\binterfaces?|interfaces?.{0,50}\bvendors?)\b",
        re.I,
    ),
    "workflow documentation": re.compile(
        r"\b(?:workflow documentation|documentation (?:to|of|for) workflows?)\b", re.I
    ),
    "written and verbal communication skills": re.compile(
        r"\b(?:written and verbal|verbal and written) communication skills\b", re.I
    ),
}
MALFORMED = re.compile(r"^[^A-Za-z0-9]*$|^[A-Za-z]$|[&/]$")
BOILERPLATE_ONLY = {"intellectual property", "equal opportunity", "artificial intelligence"}
GENERIC = {
    "ai",
    "business objectives",
    "compliance",
    "customer needs",
    "product features",
    "gaming",
}
HARD_GATE_TERMS = {
    "atf access",
    "security clearance",
    "stem degree",
    "u.s. citizenship",
    "u.s. person",
}
NON_PROSE_QUALIFICATIONS = {
    "atf access",
    "electrical engineering",
    "security clearance",
    "stem degree",
    "u.s. citizenship",
    "u.s. person",
}
TITLE_TERM_STOPWORDS = {
    "analyst",
    "and",
    "application",
    "associate",
    "business",
    "client",
    "customer",
    "desk",
    "engineer",
    "engineering",
    "functional",
    "information",
    "lead",
    "manager",
    "operation",
    "operations",
    "professional",
    "platform",
    "senior",
    "specialist",
    "support",
    "system",
    "systems",
    "technical",
    "technology",
    "the",
    "usd",
}


def grade_job_keywords(job: ParsedJob) -> list[JobKeyword]:
    simplify_high = {normalized_term(value) for value in job.high_priority_keywords}
    simplify_low = {normalized_term(value) for value in job.low_priority_keywords}
    candidates = dedupe(
        [
            *job.high_priority_keywords,
            *job.low_priority_keywords,
            *(term for term in TERM_CATALOG if _count_job_term(job.job_description, term)),
            *_inferred_composite_terms(job),
            *_extract_title_terms(job.title),
        ]
    )

    graded = [
        _grade_one(job, term, simplify_high=simplify_high, simplify_low=simplify_low)
        for term in candidates
    ]
    return sorted(
        graded,
        key=lambda item: (item.accepted, item.hiring_importance, item.placement_utility),
        reverse=True,
    )


def accepted_keywords(keywords: list[JobKeyword]) -> list[JobKeyword]:
    return [keyword for keyword in keywords if keyword.accepted]


def important_keywords(keywords: list[JobKeyword]) -> list[JobKeyword]:
    return [keyword for keyword in keywords if keyword.accepted and keyword.hiring_importance >= 35]


def _grade_one(
    job: ParsedJob,
    term: str,
    *,
    simplify_high: set[str],
    simplify_low: set[str],
) -> JobKeyword:
    normalized = normalized_term(term)
    factors: Counter[str] = Counter()
    sections: list[str] = []
    priority = KeywordPriority.inferred

    if normalized in simplify_high:
        priority = KeywordPriority.high
        factors["simplify_high"] += 12
        sections.append("simplify_high")
    elif normalized in simplify_low:
        priority = KeywordPriority.low
        factors["simplify_low"] += 6
        sections.append("simplify_low")

    required_occurrences = _count_in_lines(job.required_qualifications, term)
    responsibility_occurrences = _count_in_lines(job.responsibilities, term)
    preferred_occurrences = _count_in_lines(job.preferred_qualifications, term)
    title_occurrences = _count_job_term(job.title, term)
    total_occurrences = _count_job_term(job.job_description, term)
    composite_inferred = normalized in {
        normalized_term(value) for value in _inferred_composite_terms(job)
    }

    if composite_inferred:
        factors["title_responsibility_composite"] += 18
        sections.extend(["title", "responsibilities"])

    if total_occurrences and normalized in HARD_GATE_TERMS:
        factors["mandatory_gate"] += 40
        sections.append("required")

    if required_occurrences:
        factors["required_qualification"] += 25
        sections.append("required")
        if _kind_for(term) in {KeywordKind.system, KeywordKind.action}:
            factors["required_technical_core"] += 10
    if responsibility_occurrences:
        factors["responsibility"] += 18
        factors["responsibility_repetition"] += min(8, 2 * (responsibility_occurrences - 1))
        sections.append("responsibilities")
    if preferred_occurrences:
        factors["preferred_qualification"] += 6
        sections.append("preferred")
    if title_occurrences:
        factors["title"] += 15
        sections.append("title")
    kind = _kind_for(term)
    if (
        total_occurrences
        and not (required_occurrences or responsibility_occurrences or preferred_occurrences)
        and kind in {KeywordKind.system, KeywordKind.action, KeywordKind.outcome}
    ):
        factors["technical_role_summary"] += 6
        sections.append("job_description")
    if TERM_CATALOG.get(term, TERM_CATALOG.get(_catalog_key(normalized))) == KeywordKind.system:
        factors["specific_system"] += 10
    if total_occurrences >= 2:
        factors["posting_repetition"] += min(8, total_occurrences * 2)

    rejection = ""
    if MALFORMED.search(term.strip()) or len(normalized) < 2:
        factors["malformed"] -= 50
        rejection = "Malformed or truncated keyword."
    if normalized in BOILERPLATE_ONLY:
        factors["legal_or_company_boilerplate"] -= 50
        rejection = "Legal or company boilerplate, not a hiring requirement."
    if (
        normalized in GENERIC
        and priority != KeywordPriority.high
        and not (required_occurrences or responsibility_occurrences or preferred_occurrences)
    ):
        factors["generic_outside_requirements"] -= 30
        rejection = "Generic term appears outside the role requirements."
    if normalized == "fusion" and not (
        required_occurrences or responsibility_occurrences or preferred_occurrences
    ):
        factors["company_marketing_only"] -= 40
        rejection = "Term appears in company/product marketing rather than candidate requirements."

    score = min(100.0, max(0.0, float(sum(factors.values()))))
    accepted = score >= 6 and not rejection
    placement = min(
        100.0,
        max(
            0.0,
            score
            + (10 if _kind_for(term) in {KeywordKind.system, KeywordKind.action} else 0)
            - (8 if normalized in GENERIC else 0),
        ),
    )
    return JobKeyword(
        term=term,
        normalized=normalized,
        priority=priority,
        kind=_kind_for(term) if accepted else KeywordKind.noise,
        occurrences=total_occurrences,
        source_sections=dedupe(sections),
        scoring_factors=dict(factors),
        hiring_importance=score,
        placement_utility=placement,
        accepted=accepted,
        rejection_reason=rejection,
    )


def _count_in_lines(lines: list[str], term: str) -> int:
    return sum(_count_job_term(line, term) for line in lines)


def _count_job_term(text: str, term: str) -> int:
    pattern = TERM_PATTERNS.get(normalized_term(term))
    return len(pattern.findall(text)) if pattern else count_term(text, term)


def _catalog_key(normalized: str) -> str:
    return next(
        (term for term in TERM_CATALOG if normalized_term(term) == normalized),
        "",
    )


def _kind_for(term: str) -> KeywordKind:
    return TERM_CATALOG.get(
        term, TERM_CATALOG.get(_catalog_key(normalized_term(term)), KeywordKind.vocabulary)
    )


def _extract_title_terms(title: str) -> list[str]:
    """Capture product and domain names without depending on a scanner keyword panel."""
    terms: list[str] = []
    for token in re.findall(r"[A-Za-z][A-Za-z0-9.+#]*", title):
        normalized = normalized_term(token)
        covered_by_catalog_phrase = any(
            " " in catalog_term
            and contains_word(catalog_term, token)
            and _count_job_term(title, catalog_term)
            for catalog_term in TERM_CATALOG
        )
        if (
            len(normalized) < 3
            or normalized in TITLE_TERM_STOPWORDS
            or re.fullmatch(r"[ivx]+", normalized)
            or covered_by_catalog_phrase
            or (not token.isupper() and not any(character.isdigit() for character in token))
        ):
            continue
        terms.append(token)
    return dedupe(terms)


def _inferred_composite_terms(job: ParsedJob) -> list[str]:
    """Join role-title context to duties when employers split a concept across lines."""
    terms: list[str] = []
    if contains_word(job.title, "application") and any(
        contains_word(line, "support") for line in job.responsibilities
    ):
        terms.append("application support")
    return terms


def contains_word(text: str, word: str) -> bool:
    return bool(re.search(rf"\b{re.escape(word)}\b", text, re.I))
