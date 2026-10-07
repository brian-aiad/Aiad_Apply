"""Candidate-confirmed basic technical use, matched to existing resume duties.

Authorization comes from the candidate profile, never from a degree alone or a
posting. These contexts allow ordinary use, not an invented architecture/stack.
"""

import re

from aiadapply_v2.text import contains_term

_FAMILIES = {
    "python": ("Python",),
    "api": ("API", "APIs"),
    "rest": ("REST API", "REST APIs", "RESTful APIs", "REST"),
    "webhooks": ("Webhook", "Webhooks"),
    "aws": ("AWS", "Amazon Web Services"),
    "ci": ("CI/CD", "Continuous Integration", "Continuous Delivery", "Continuous Deployment"),
    "javascript": ("JavaScript",), "typescript": ("TypeScript",),
    "java": ("Java",), "c": ("C",), "cpp": ("C++",), "csharp": ("C#",),
    "go": ("Go", "Golang"), "rust": ("Rust",), "ruby": ("Ruby",),
    "php": ("PHP",), "swift": ("Swift",), "kotlin": ("Kotlin",),
    "r": ("R",), "matlab": ("MATLAB",), "bash": ("Bash", "Shell scripting"),
    "powershell": ("PowerShell",),
    "sql": ("SQL",), "postgres": ("PostgreSQL", "Postgres"),
    "mysql": ("MySQL",), "sqlite": ("SQLite",), "mongodb": ("MongoDB",),
    "html": ("HTML", "HTML5"), "css": ("CSS", "CSS3"),
    "react": ("React", "React.js"), "node": ("Node.js", "NodeJS"),
    "express": ("Express", "Express.js"), "vue": ("Vue", "Vue.js"),
    "angular": ("Angular",), "next": ("Next.js",),
    "django": ("Django",), "flask": ("Flask",), "fastapi": ("FastAPI",),
    "git": ("Git",), "github": ("GitHub",), "gitlab": ("GitLab",),
    "github_actions": ("GitHub Actions",), "docker": ("Docker",),
    "linux": ("Linux",), "unix": ("Unix",),
    "json": ("JSON",), "http": ("HTTP", "HTTPS"), "xml": ("XML",),
    "postman": ("Postman",), "vscode": ("VS Code", "Visual Studio Code"),
    "pytest": ("pytest",), "jest": ("Jest",), "junit": ("JUnit",),
}
_CONTEXTS = {
    "python": r"\b(script\w*|automat\w*|reconcil\w*|ETL|debug\w*)\b",
    "api": r"\b(APIs?|integrat\w*|payloads?|synchronization|data.sync)\b",
    "rest": r"\b(APIs?|integrat\w*|payloads?|synchronization|data.sync)\b",
    "webhooks": r"\b(webhooks?|integrat\w*|payloads?|synchronization|data.sync)\b",
    "aws": r"\b(deploy\w*|cloud|hosting|hosted|infrastructure|production support|production (?:incidents|tickets)|user provisioning)\b",
    "ci": r"\b(deploy\w*|release\w*|version control|CI/CD|continuous (?:integration|delivery))\b",
}
_CODING = r"\b(script\w*|coding|develop\w*|built|build\w*|test\w*|debug\w*|APIs?)\b"
_DATA = r"\b(databases?|SQL|queries|ETL|reconcil\w*|data.sync|indexing|aggregation)\b"
_WEB = r"\b(SaaS|platform|APIs?|application|authentication|permissions?|user access)\b"
_DEV = r"\b(built|build\w*|test\w*|deploy\w*|script\w*|debug\w*|code|develop\w*)\b"
for _family in ("javascript", "typescript", "java", "c", "cpp", "csharp", "go", "rust", "ruby",
                "php", "swift", "kotlin", "r", "matlab", "bash", "powershell"):
    _CONTEXTS[_family] = _CODING
for _family in ("sql", "postgres", "mysql", "sqlite", "mongodb"):
    _CONTEXTS[_family] = _DATA
for _family in ("html", "css", "react", "node", "express", "vue", "angular", "next", "django", "flask", "fastapi"):
    _CONTEXTS[_family] = _WEB
for _family in ("git", "github", "gitlab", "github_actions", "docker", "vscode", "pytest", "jest", "junit"):
    _CONTEXTS[_family] = _DEV
for _family in ("json", "http", "xml", "postman"):
    _CONTEXTS[_family] = _CONTEXTS["api"]
for _family in ("linux", "unix"):
    _CONTEXTS[_family] = r"\b(script\w*|deploy\w*|production|logs?|troubleshoot\w*|configur\w*)\b"

# Candidate opts into these names. This is not a global assumption for new users.
COMMON_DEVELOPMENT_TECHNOLOGIES = [aliases[0] for aliases in _FAMILIES.values()]


def technical_family(term: str) -> str | None:
    return next((key for key, aliases in _FAMILIES.items()
                 if term.casefold() in {a.casefold() for a in aliases}), None)


def established_technology(profile_terms: list[str], term: str, rejected: list[str]) -> bool:
    family = technical_family(term)
    return bool(family and any(technical_family(t) == family for t in profile_terms)
                and not any(technical_family(t) == family for t in rejected))


def technical_duty_fits(term: str, duty: str) -> bool:
    family = technical_family(term)
    return bool(family and re.search(_CONTEXTS[family], duty, re.I))


def technical_usage_in_context(term: str, text: str) -> bool:
    """Require an action in the same clause; a familiarity or skills list fails."""
    family = technical_family(term)
    aliases = _FAMILIES[family] if family else (term,)
    for clause in re.split(r"[.!?;](?:\s+|$)", text):
        if not any(contains_term(clause, a) for a in aliases):
            continue
        if re.search(r"\b(?:familiar(?:ity)? with|knowledge of|exposure to|coursework|classroom|(?:tools|skills|technologies)\s*:)", clause, re.I):
            continue
        # Matching the technology's name alone is not a documented work action.
        if (not family or technical_duty_fits(term, clause)) and re.search(
            r"\b(?:support\w*|debug\w*|investigat\w*|test\w*|validat\w*|resolv\w*|"
            r"monitor\w*|check\w*|deploy\w*|built|build\w*|automat\w*|script\w*|"
            r"maintain\w*|configur\w*|review\w*|operat\w*|triag\w*|run(?:ning)?|ran)\b", clause, re.I
        ):
            return True
    return False
