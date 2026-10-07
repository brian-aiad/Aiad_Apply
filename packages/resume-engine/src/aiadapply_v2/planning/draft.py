"""Job-driven draft adaptation kept separate from confirmed candidate evidence."""

import re

from aiadapply_v2.planning.coverage import build_keyword_coverage
from aiadapply_v2.schemas import (
    ClaimRisk,
    DraftTechnology,
    EvidenceStrength,
    JobKeyword,
    ResumeDocument,
    ResumeEvidenceGraph,
    RewritePlan,
    RiskLevel,
)
from aiadapply_v2.text import contains_term, normalized_term

NON_PROJECT_SYSTEMS = {
    "3dexperience",
    "ansys hfss",
    "as9100",
    "autoclave",
    "cmes",
    "cst",
    "dmm",
    "fibersim nx",
    "iso 9001",
    "keysight ads",
    "lithography",
    "metal lift-off",
    "ndi",
    "plasma cleaning",
    "wet etch",
    "oscilloscope",
    "rf electronics",
    "bios",
    "firmware",
    "supermicro",
    "mbse",
    "cad",
    "catia",
    "cnc",
    "gd&t",
    "plm",
    "mes",
    "vna",
    "qms",
    "rf/microwave",
    "electrical schematics",
    "electronics",
    "test equipment",
    "spectrum analyzer",
    "signal generator",
    "windchill",
    "autocad",
    "manufacturing processes",
    "tooling",
    "database",
}
PROJECT_CONTEXT_TERMS = {
    "saas",
    "low-code",
    "continuous integration",
    "test-driven development methodologies",
}


def _project_applicable(keyword: JobKeyword) -> bool:
    """Only software/data technologies belong in a Loavenly implementation draft."""
    return (
        keyword.accepted
        and keyword.normalized not in NON_PROJECT_SYSTEMS
        and (keyword.kind.value == "system" or keyword.normalized in PROJECT_CONTEXT_TERMS)
        and bool(
            {"required", "responsibilities", "preferred", "job_description"}
            & set(keyword.source_sections)
        )
    )


def _covered_by_more_specific_term(term: str, terms: list[str]) -> bool:
    def compact(value: str) -> str:
        return re.sub(r"[^a-z0-9+#]", "", normalized_term(value))

    concrete_implementations = {
        "ci/cd": {"continuous integration", "jenkins", "gitlab ci", "github actions"},
        "continuous integration": {"jenkins", "gitlab ci", "github actions"},
        "operating systems": {"linux", "windows", "unix", "macos"},
    }
    if concrete_implementations.get(normalized_term(term), set()) & {
        normalized_term(other) for other in terms
    }:
        return True
    return any(
        other != term
        and (
            (contains_term(other, term) and len(other) > len(term))
            or (compact(term) and compact(term) == compact(other) and len(other) > len(term))
        )
        for other in terms
    )


def select_draft_technologies(
    base: ResumeDocument, keywords: list[JobKeyword], graph: ResumeEvidenceGraph
) -> list[DraftTechnology]:
    projects = [
        p.paragraph_id
        for p in base.paragraphs
        if p.kind.value == "bullet" and p.section.startswith("projects.")
    ]
    loavenly = [pid for pid in projects if pid.startswith("projects.loavenly.")]
    if loavenly:
        projects = loavenly
    elif projects:
        section = projects[0].rsplit(".bullet.", 1)[0]
        projects = [pid for pid in projects if pid.startswith(section + ".")]
    rows = build_keyword_coverage(
        base, keywords, graph, {p.paragraph_id: p.text for p in base.paragraphs}
    )
    by_term = {item.term: item for item in keywords if _project_applicable(item)}
    opportunities = [
        row
        for row in rows
        if row.term in by_term and not set(row.eligible_bullet_ids).intersection(projects)
    ]
    terms = [row.term for row in opportunities]
    required = [row for row in opportunities if not _covered_by_more_specific_term(row.term, terms)]
    implied = [row for row in opportunities if _covered_by_more_specific_term(row.term, terms)]
    # Source-specific employer evidence still has to remain in that employer's
    # bullets. A second, explicitly unverified project placement is a draft only.
    required.sort(key=lambda row: -by_term[row.term].hiring_importance)
    return [
        DraftTechnology(term=row.term, paragraph_ids=projects, required=True) for row in required
    ] + [DraftTechnology(term=row.term, paragraph_ids=projects, required=False) for row in implied]


def draft_distribution_feedback(targets: list[DraftTechnology], texts: dict[str, str]) -> list[str]:
    """Keep dense software stacks in several coherent project bullets."""
    feedback = draft_prose_feedback(targets, texts)
    required = [item for item in targets if item.required and item.paragraph_ids]
    if len(required) < 5:
        return feedback
    project_ids = list(dict.fromkeys(pid for item in required for pid in item.paragraph_ids))
    covered = [
        pid
        for pid in project_ids
        if any(contains_term(texts.get(pid, ""), item.term) for item in required)
    ]
    minimum = min(len(project_ids), 3 if len(required) >= 8 else 2)
    if len(covered) >= minimum:
        return feedback
    return [
        *feedback,
        f"Spread the {len(required)} required posting technologies across at least "
        f"{minimum} project bullets using coherent implementation language; "
        "a Skills row or one packed project bullet is insufficient.",
    ]


def draft_prose_feedback(targets: list[DraftTechnology], texts: dict[str, str]) -> list[str]:
    """Reject obvious keyword-only clauses, not legitimate technical prose."""
    feedback = []
    project_ids = {pid for target in targets for pid in target.paragraph_ids}
    for pid in sorted(project_ids):
        text = texts.get(pid, "")
        # Preserve periods within Node.js and similar product names.
        for clause in re.split(r"[;:]|(?<=[.!?])\s+", text):
            residual = clause
            matched = 0
            for term in sorted({t.term for t in targets}, key=len, reverse=True):
                if contains_term(residual, term):
                    residual = re.sub(
                        rf"(?<![a-z0-9]){re.escape(normalized_term(term))}(?![a-z0-9])",
                        " ",
                        residual,
                        flags=re.I,
                    )
                    matched += 1
            residual = re.sub(
                r"\b(?:and|or|with|using|used|stack|technologies|tools|including)\b",
                " ",
                residual,
                flags=re.I,
            )
            if matched and not re.search(r"[a-z0-9]", residual, re.I):
                feedback.append(
                    f"{pid}: bare technology list does not explain implementation. "
                    "Give each tool a concrete role in Loavenly's intake, inventory, "
                    "reporting, access, deployment, or support workflows."
                )
                break
    return feedback


def allow_draft_technology_risks(plan: RewritePlan, targets: list[DraftTechnology]) -> None:
    """Allow draft export without upgrading assumptions into confirmed evidence."""
    by_term = {normalized_term(target.term): target for target in targets}
    for risk in [
        *plan.claim_risks,
        *(risk for bullet in plan.bullets for risk in bullet.claim_risks),
    ]:
        target = by_term.get(normalized_term(risk.claim)) or by_term.get(
            normalized_term(risk.target_requirement)
        )
        if target and risk.selected_placement in target.paragraph_ids:
            risk.export_allowed = True
            risk.strength = EvidenceStrength.unsupported
            risk.evidence_ids = []
            risk.risk_level = RiskLevel.high
            risk.explanation = "Job-derived technology adaptation for an editable draft. Verify or edit this usage before applying."
    texts = {bullet.paragraph_id: bullet.text for bullet in plan.bullets}
    texts.update({line.paragraph_id: ", ".join(line.skills) for line in plan.skills.lines})
    for target in targets:
        for pid, text in texts.items():
            if pid not in target.paragraph_ids or not contains_term(text, target.term):
                continue
            if any(
                risk.claim == target.term and risk.selected_placement == pid
                for risk in plan.claim_risks
            ):
                continue
            plan.claim_risks.append(
                ClaimRisk(
                    claim=target.term,
                    target_requirement=target.term,
                    evidence_ids=[],
                    strength=EvidenceStrength.unsupported,
                    risk_level=RiskLevel.high,
                    explanation=target.explanation,
                    selected_placement=pid,
                    export_allowed=True,
                )
            )
