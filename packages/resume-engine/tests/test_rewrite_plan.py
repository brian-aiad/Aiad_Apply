from pathlib import Path

from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.evidence.loaders import build_evidence_graph
from aiadapply_v2.grading.keywords import grade_job_keywords
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify
from aiadapply_v2.planning.rewrite_plan import collect_claim_risks
from aiadapply_v2.profiling.role_profile import build_target_role_profile
from aiadapply_v2.schemas import ClaimRisk, EvidenceStrength, RiskLevel
from aiadapply_v2.semantic.matcher import LexicalSemanticEncoder, build_transferability_map
from aiadapply_v2.validation.resume import _claim_numbers

from .helpers import identity_plan

BASE = Path("data/resumes/Brian_Aiad_BASE.docx")


def test_semantic_match_does_not_treat_transferable_labels_as_direct_evidence() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/floqast_full.txt").read_text(encoding="utf-8")
    )
    keywords = grade_job_keywords(job)
    document = parse_resume_docx(BASE)
    graph = build_evidence_graph(document, keywords)
    profile = build_target_role_profile(job, keywords)
    transferability = build_transferability_map(
        profile,
        keywords,
        graph,
        LexicalSemanticEncoder(),
    )
    by_term = {match.target_term.casefold(): match for match in transferability.matches}

    assert by_term["postman"].strength == EvidenceStrength.direct
    assert by_term["jira"].strength == EvidenceStrength.direct
    assert by_term["salesforce"].strength == EvidenceStrength.unsupported
    assert by_term["zendesk"].strength == EvidenceStrength.unsupported


def test_numeric_claim_scanner_ignores_digits_inside_product_names() -> None:
    assert _claim_numbers("D365 F&O with OAuth 2.0") == {"2.0"}


def test_formal_knowledge_base_is_not_inferred_from_incident_notes() -> None:
    job = parse_linkedin_simplify(
        Path("data/fixtures/trade_desk_platform_support_analyst_i_2026_08_06.txt").read_text(
            encoding="utf-8"
        )
    )
    keywords = grade_job_keywords(job)
    profile = build_target_role_profile(job, keywords)
    graph = build_evidence_graph(parse_resume_docx(BASE), keywords)
    transferability = build_transferability_map(
        profile,
        keywords,
        graph,
        LexicalSemanticEncoder(),
    )
    match = next(item for item in transferability.matches if item.target_term == "knowledge base")
    assert match.strength == EvidenceStrength.weakly_transferable


def test_claim_risks_are_deduplicated_by_semantic_paragraph() -> None:
    plan = identity_plan(parse_resume_docx(BASE))
    risk = ClaimRisk(
        claim="Knowledge Base",
        target_requirement="Maintain customer-facing knowledge base content.",
        strength=EvidenceStrength.strongly_transferable,
        risk_level=RiskLevel.medium,
        explanation="Documentation transfers, but a formal knowledge base is not explicit.",
        selected_placement="Adjacent wording for experience.csulb.bullet.3.",
    )
    plan.claim_risks.append(risk)
    duplicate = risk.model_copy(
        update={
            "claim": "Documentation is reframed as knowledge-base work.",
            "selected_placement": "Target metadata in experience.csulb.bullet.3.",
            "explanation": "The same review concern expressed a second way.",
        }
    )
    plan.bullets[0].claim_risks.append(duplicate)

    assert collect_claim_risks(plan) == [risk]
