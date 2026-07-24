from pathlib import Path

from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.evidence.loaders import build_evidence_graph
from aiadapply_v2.grading.keywords import grade_job_keywords
from aiadapply_v2.parsers.linkedin_simplify import parse_linkedin_simplify
from aiadapply_v2.profiling.role_profile import build_target_role_profile
from aiadapply_v2.schemas import EvidenceStrength
from aiadapply_v2.semantic.matcher import LexicalSemanticEncoder, build_transferability_map
from aiadapply_v2.validation.resume import _claim_numbers

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
    assert by_term["salesforce"].strength != EvidenceStrength.direct
    assert by_term["zendesk"].strength != EvidenceStrength.direct


def test_numeric_claim_scanner_ignores_digits_inside_product_names() -> None:
    assert _claim_numbers("D365 F&O with OAuth 2.0") == {"2.0"}
