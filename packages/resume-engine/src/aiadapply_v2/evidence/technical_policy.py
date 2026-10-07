"""Apply per-posting technical judgment under the candidate's standing permission.

The model classifies previously unseen tools, not the candidate's history. Store
that judgment in this run; never promote generated prose into profile evidence.
"""

from aiadapply_v2.planning.coverage import build_keyword_coverage
from aiadapply_v2.schemas import (
    JobKeyword,
    ResumeDocument,
    ResumeEvidence,
    ResumeEvidenceGraph,
    TechnologyAssessment,
)
from aiadapply_v2.text import contains_term, normalized_term

_ASSESSMENT_PREFIX = "evidence.candidate_profile.assessed."
# These are counterexamples/boundaries, not an allowlist of common technologies.
# Previously unseen languages, libraries and tools are judged for each posting.
_SPECIALIZED = (
    "Salesforce", "Zendesk", "Qualtrics", "SPSS", "CAD", "AutoCAD", "SolidWorks",
    "CATIA", "ANSYS", "Terraform", "Kubernetes", "Kafka", "SAP", "ERP", "MES", "PLM",
    "FPGA", "Verilog", "CUDA", "RTOS", "clearance", "certification",
)


def pending_technology_assessments(
    base: ResumeDocument, keywords: list[JobKeyword], graph: ResumeEvidenceGraph,
) -> list[str]:
    if not graph.automatic_technical_policy:
        return []
    # Ignore a previous attempt's inference when deciding what needs assessment.
    source_graph = graph.model_copy(update={"evidence": [
        s for s in graph.evidence if not s.evidence_id.startswith(_ASSESSMENT_PREFIX)
    ]})
    rows = build_keyword_coverage(base, keywords, source_graph, {p.paragraph_id: p.text for p in base.paragraphs})
    return [r.term for r in rows if r.accepted and not r.eligible_bullet_ids]


def apply_technology_assessments(
    base: ResumeDocument, keywords: list[JobKeyword], graph: ResumeEvidenceGraph,
    assessments: list[TechnologyAssessment],
) -> list[str]:
    graph.evidence[:] = [s for s in graph.evidence if not s.evidence_id.startswith(_ASSESSMENT_PREFIX)]
    pending = pending_technology_assessments(base, keywords, graph)
    if not pending:
        return []
    by_term: dict[str, list[TechnologyAssessment]] = {}
    for item in assessments:
        by_term.setdefault(normalized_term(item.term), []).append(item)
    duties = {p.paragraph_id: p for p in base.paragraphs
              if p.editable and p.kind.value == "bullet"
              and p.section.startswith(("experience.", "projects."))}
    errors = []
    for term in pending:
        rows = by_term.get(normalized_term(term), [])
        if len(rows) != 1:
            errors.append(f"Assess {term} exactly once in technology_assessments: decide common development use versus specialized/advanced or unrelated. Do not ask the candidate to classify basic tools.")
            continue
        assessment = rows[0]
        if not assessment.reasoning.strip() or not assessment.usage_boundary.strip():
            errors.append(f"{term}: explain its category and the ordinary-use boundary.")
            continue
        if assessment.classification != "common_development":
            continue
        if any(contains_term(term, specialized) for specialized in _SPECIALIZED):
            errors.append(f"{term} is a specialized/advanced exception, not automatic basic technical use. Leave it out unless separately evidenced.")
            continue
        if not assessment.duty_paragraph_ids or any(pid not in duties for pid in assessment.duty_paragraph_ids):
            errors.append(f"{term}: choose actual editable work/project bullet IDs for relevant ordinary use; Skills or invented duties do not qualify.")
            continue
        for pid in dict.fromkeys(assessment.duty_paragraph_ids):
            graph.evidence.append(ResumeEvidence(
                evidence_id=f"{_ASSESSMENT_PREFIX}{term}.{pid}",
                paragraph_id=f"candidate_profile.assessed.{term}.{pid}",
                section="candidate_profile", systems=[term], claim_scope="source_specific",
                source_reference=pid, established_technical_context=True,
                source_text=(f"Standing automatic technical-use policy applied to {term}. "
                             f"Per-posting category judgment: {assessment.reasoning} "
                             f"Existing duty: {duties[pid].text} "
                             f"Ordinary-use boundary: {assessment.usage_boundary} "
                             "Use naturally in one matching duty when requested. This classification "
                             "is not proof of a specific architecture, new deliverable or measured outcome."),
            ))
    return errors
