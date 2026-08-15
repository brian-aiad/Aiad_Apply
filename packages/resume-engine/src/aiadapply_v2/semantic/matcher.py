from __future__ import annotations

import os
import re
from collections.abc import Sequence
from difflib import SequenceMatcher
from typing import Protocol

import numpy as np

from aiadapply_v2.schemas import (
    EvidenceMatch,
    EvidenceStrength,
    JobKeyword,
    KeywordKind,
    ResumeEvidence,
    ResumeEvidenceGraph,
    TargetRoleProfile,
    TransferabilityMap,
)
from aiadapply_v2.text import contains_term

DEFAULT_MODEL = "BAAI/bge-small-en-v1.5"
SYSTEM_CATEGORY_EVIDENCE: dict[str, tuple[str, ...]] = {
    "api integrations": ("REST APIs", "Webhooks", "Microsoft Graph API"),
    "api security": ("OAuth 2.0", "MFA", "SSO", "RBAC"),
    "command line": ("Bash", "PowerShell"),
    "configuration": ("configured", "configurations"),
    "database": ("SQL", "PostgreSQL", "MySQL", "SQLite"),
    "erp": ("Dynamics 365", "D365 F&O"),
    "microsoft office": ("Microsoft 365", "Excel", "Outlook"),
    "operating systems": ("Windows", "Linux", "macOS", "UNIX"),
    "service level agreements": ("SLA", "SLA Management"),
    "stem degree": ("Bachelor of Science", "Computer Science"),
    "ticketing": ("support tickets", "Jira"),
    "web services": ("REST APIs", "Webhooks"),
}
EXACT_EVIDENCE_TERMS = {
    "atf access",
    "electrical engineering",
    "fintech",
    "internal controls",
    "residential lending",
    "security clearance",
    "sox",
    "u.s. citizenship",
    "u.s. person",
}
# Related resume evidence can support these concepts in conversation, but is
# insufficient to rename an artifact or duty as the employer's formal term.
ALWAYS_WEAK_TRANSFER_TERMS = {
    "knowledge base",
}


class SemanticEncoder(Protocol):
    def similarities(self, query: str, passages: Sequence[str]) -> list[float]: ...


class SentenceTransformerEncoder:
    def __init__(self, model_name: str | None = None) -> None:
        from sentence_transformers import SentenceTransformer

        self.model_name = model_name or os.environ.get("AIADAPPLY_EMBEDDING_MODEL", DEFAULT_MODEL)
        self._model = SentenceTransformer(self.model_name)

    def similarities(self, query: str, passages: Sequence[str]) -> list[float]:
        if not passages:
            return []
        query_text = f"Represent this sentence for searching relevant passages: {query}"
        vectors = self._model.encode(
            [query_text, *passages],
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        query_vector = np.asarray(vectors[0])
        passage_vectors = np.asarray(vectors[1:])
        values = (passage_vectors @ query_vector).astype(float).tolist()
        return [float(value) for value in values]


class LexicalSemanticEncoder:
    """Deterministic test fallback; production uses SentenceTransformerEncoder."""

    def similarities(self, query: str, passages: Sequence[str]) -> list[float]:
        query_tokens = _tokens(query)
        scores: list[float] = []
        for passage in passages:
            passage_tokens = _tokens(passage)
            union = query_tokens | passage_tokens
            jaccard = len(query_tokens & passage_tokens) / len(union) if union else 0.0
            ratio = SequenceMatcher(None, query.lower(), passage.lower()).ratio()
            scores.append(min(1.0, 0.7 * jaccard + 0.3 * ratio))
        return scores


def build_transferability_map(
    profile: TargetRoleProfile,
    keywords: list[JobKeyword],
    graph: ResumeEvidenceGraph,
    encoder: SemanticEncoder,
) -> TransferabilityMap:
    evidence = list(graph.evidence)
    passages = [_evidence_passage(item) for item in evidence]
    matches: list[EvidenceMatch] = []

    for keyword in (item for item in keywords if item.accepted):
        requirement = _requirement_for(keyword.term, profile)
        scores = encoder.similarities(f"{keyword.term}: {requirement}", passages)
        direct_indices = [
            index
            for index, evidence_item in enumerate(evidence)
            if _direct_match(keyword.term, evidence_item)
        ]
        transferable_indices = [
            index
            for index, evidence_item in enumerate(evidence)
            if _transferable_match(keyword.term, evidence_item)
        ]
        if direct_indices:
            best_index = max(direct_indices, key=lambda index: scores[index])
        elif transferable_indices:
            best_index = max(transferable_indices, key=lambda index: scores[index])
        else:
            best_index = int(np.argmax(scores)) if scores else -1
        best = evidence[best_index] if best_index >= 0 else None
        semantic_score = float(scores[best_index]) if best_index >= 0 else 0.0
        direct = _direct_match(keyword.term, best)
        transferable = _transferable_match(keyword.term, best)
        strength = _strength(keyword.term, keyword.kind, direct, transferable, semantic_score)
        matches.append(
            EvidenceMatch(
                target_term=keyword.term,
                target_requirement=requirement,
                evidence_id=best.evidence_id if best else None,
                source_text=best.source_text if best else "",
                semantic_score=max(0.0, min(1.0, semantic_score)),
                action_compatibility=_compatibility(
                    keyword.kind.value == "action", best.actions if best else []
                ),
                system_compatibility=_compatibility(
                    keyword.kind.value == "system", best.systems if best else []
                ),
                environment_compatibility=_compatibility(
                    keyword.kind.value == "environment",
                    best.environment_signals if best else [],
                ),
                outcome_compatibility=_compatibility(
                    keyword.kind.value == "outcome", best.outcomes if best else []
                ),
                strength=strength,
                reasoning=_reasoning(keyword.term, best, strength, semantic_score),
                suggested_placement=_placement(keyword.term, keyword.kind.value, best),
            )
        )

    return TransferabilityMap(
        matches=matches,
        direct_terms=[
            item.target_term for item in matches if item.strength == EvidenceStrength.direct
        ],
        strongly_transferable_terms=[
            item.target_term
            for item in matches
            if item.strength == EvidenceStrength.strongly_transferable
        ],
        weakly_transferable_terms=[
            item.target_term
            for item in matches
            if item.strength == EvidenceStrength.weakly_transferable
        ],
        unsupported_terms=[
            item.target_term for item in matches if item.strength == EvidenceStrength.unsupported
        ],
    )


def _evidence_passage(evidence: ResumeEvidence) -> str:
    return " | ".join(
        [
            evidence.source_text,
            "systems: " + ", ".join(evidence.systems),
            "actions: " + ", ".join(evidence.actions),
            "environment: " + ", ".join(evidence.environment_signals),
            "outcomes: " + ", ".join(evidence.outcomes),
        ]
    )


def _direct_match(term: str, evidence: ResumeEvidence | None) -> bool:
    if not evidence:
        return False
    direct_fields = [
        evidence.source_text,
        *evidence.systems,
        *evidence.actions,
        *evidence.environment_signals,
        *evidence.outcomes,
    ]
    if any(contains_term(value, term) for value in direct_fields):
        return True
    category_evidence = SYSTEM_CATEGORY_EVIDENCE.get(term.casefold(), ())
    return any(
        contains_term(value, evidence_term)
        for evidence_term in category_evidence
        for value in direct_fields
    )


def _transferable_match(term: str, evidence: ResumeEvidence | None) -> bool:
    if not evidence:
        return False
    for concept in evidence.concepts:
        if concept.concept.casefold() == term.casefold() and concept.transferable_terms:
            return True
    return False


def _strength(
    term: str,
    kind: KeywordKind,
    direct: bool,
    transferable: bool,
    score: float,
) -> EvidenceStrength:
    if direct:
        return EvidenceStrength.direct
    if term.casefold() in EXACT_EVIDENCE_TERMS:
        return EvidenceStrength.unsupported
    if term.casefold() in ALWAYS_WEAK_TRANSFER_TERMS:
        return EvidenceStrength.weakly_transferable
    # Named tools, products, protocols, and platforms are not interchangeable.
    # Semantic proximity to another system is not evidence of hands-on experience.
    if kind == KeywordKind.system:
        return EvidenceStrength.unsupported
    if transferable or score >= 0.64:
        return EvidenceStrength.strongly_transferable
    if score >= 0.42:
        return EvidenceStrength.weakly_transferable
    return EvidenceStrength.unsupported


def _compatibility(expected_kind: bool, values: list[str]) -> float:
    if expected_kind and values:
        return 0.9
    if values:
        return 0.5
    return 0.1


def _reasoning(
    term: str,
    evidence: ResumeEvidence | None,
    strength: EvidenceStrength,
    score: float,
) -> str:
    if not evidence:
        return f"No resume evidence was retrieved for {term}."
    if strength == EvidenceStrength.direct:
        return f"{term} is stated directly in {evidence.paragraph_id}."
    if strength == EvidenceStrength.strongly_transferable:
        return (
            f"{evidence.paragraph_id} provides a strong contextual bridge to {term} "
            f"(semantic score {score:.2f})."
        )
    if strength == EvidenceStrength.weakly_transferable:
        return (
            f"{evidence.paragraph_id} is adjacent to {term}, but the relationship requires "
            f"aggressive reframing (semantic score {score:.2f})."
        )
    return (
        f"The closest paragraph, {evidence.paragraph_id}, does not substantiate {term}; "
        "the term must remain outside resume prose."
    )


def _requirement_for(term: str, profile: TargetRoleProfile) -> str:
    candidates = [
        *profile.primary_responsibilities,
        *profile.required_qualifications,
        *profile.preferred_qualifications,
    ]
    return next((line for line in candidates if contains_term(line, term)), term)


def _placement(term: str, kind: str, evidence: ResumeEvidence | None) -> str:
    if evidence and evidence.section.startswith(("experience.", "projects.")):
        return evidence.section
    if kind == "system":
        return "skills"
    if kind in {"environment", "outcome"}:
        return "summary"
    return "experience.original_insurance"


def _tokens(value: str) -> set[str]:
    return set(re.findall(r"[a-z0-9+#./-]+", value.lower()))
