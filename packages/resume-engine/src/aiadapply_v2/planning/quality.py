from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import TypedDict

from aiadapply_v2.evidence.loaders import supports_automatic_context
from aiadapply_v2.grading.keywords import NON_PROSE_QUALIFICATIONS
from aiadapply_v2.planning.coverage import build_keyword_coverage
from aiadapply_v2.planning.priorities import paragraph_priorities
from aiadapply_v2.schemas import (
    EvidenceStrength,
    JobKeyword,
    ResumeDocument,
    ResumeEvidenceGraph,
    TransferabilityMap,
)
from aiadapply_v2.semantic.matcher import ALWAYS_WEAK_TRANSFER_TERMS
from aiadapply_v2.text import contains_term, preserves_source_term

# These describe qualities, not a new responsibility or technical capability.
# Adding them alone must never satisfy the substantive-tailoring requirement.
SOFT_TERMS = {
    "problem-solving",
    "critical thinking",
    "communication skills",
    "written and verbal communication skills",
    "verbal communication",
    "organizational skills",
    "interpersonal skills",
    "fast-paced environment",
    "task prioritization",
    "cross-functional collaboration",
}


def demonstrates_ordinary_capability(term: str, source: str, final: str) -> bool:
    """Narrow ordinary-work equivalence, grounded in the same source paragraph."""
    equivalent_actions = {
        "deployment": r"\bdeploy(?:ed|ing|ment|ments)?\b",
        "product operations": r"\b(?:live production operations|product operations)\b",
        "product support": r"\b(?:production|application|software|product) support\b",
        "configuration": r"\b(?:configurations?|configured|configuring)\b",
        "scripts": r"\bscripts?\b",
        "webhooks": r"\bwebhooks?\b",
        "service desk": r"\b(?:(?:support|production) tickets|service desk|first-line application support)\b",
    }
    if term.casefold() == "end-to-end":
        return all(all(re.search(pattern, text, re.I) for pattern in (
            r"\bindependently\b", r"\b(?:built|build(?:ing)?|develop(?:ed|ing)?)\b",
            r"\btest(?:ed|ing)?\b", r"\bdeploy(?:ed|ing)?\b",
        )) for text in (source, final))
    if pattern := equivalent_actions.get(term.casefold()):
        return all(re.search(pattern, text, re.I) for text in (source, final))
    if not supports_automatic_context(term, source):
        return False
    if term.casefold() == "automation":
        return bool(
            re.search(r"\b(?:Python|PowerShell|scripts?|workflows?)\b", final, re.I)
            and re.search(r"reconcil|provision|ETL|repeated|nightly", final, re.I)
            and re.search(r"built|developed|created|automat|streamlin|reduced|cut|monitor", final, re.I)
        )
    if term.casefold() == "case management":
        return bool(
            (supports_automatic_context(term, final) or re.search(r"(?:support|Jira|incident).{0,40}(?:tickets|cases)", final, re.I))
            and re.search(r"\b(?:resolv(?:e|ed|ing)|manag(?:e|ed|ing)|handl(?:e|ed|ing)|track(?:ed|ing)?|maintain(?:ed|ing)?|coordinat(?:e|ed|ing)|document(?:ed|ing)?|escalat(?:e|ed|ing))\b", final, re.I)
        )
    return supports_automatic_context(term, final)


def tailoring_opportunities(
    base: ResumeDocument,
    keywords: list[JobKeyword],
    graph: ResumeEvidenceGraph,
    matches: TransferabilityMap,
) -> dict[str, list[str]]:
    """Include existing relevant evidence, not just words missing from a paragraph."""
    priorities = paragraph_priorities(base, keywords, graph, matches)
    important = {
        keyword.term
        for keyword in keywords
        if keyword.accepted
        and keyword.hiring_importance >= 25
        and keyword.normalized not in SOFT_TERMS | NON_PROSE_QUALIFICATIONS
    }
    project_terms = {
        keyword.term for keyword in keywords
        if keyword.accepted
        and keyword.normalized not in SOFT_TERMS | NON_PROSE_QUALIFICATIONS
        and (keyword.hiring_importance >= 10 or bool(
            {"required", "preferred", "responsibilities"} & set(keyword.source_sections)
        ))
    }
    source = {p.paragraph_id: p.text for p in base.paragraphs if p.editable}
    opportunities = {}
    for row in priorities:
        pid = row["paragraph_id"]
        if ".bullet." not in pid:
            continue
        terms = [term for term in row["missing_supported_terms"] if term in important]
        terms.extend(sorted(term for term in important if contains_term(source.get(pid, ""), term)))
        if pid.startswith("projects."):
            terms.extend(sorted(term for term in project_terms if contains_term(source.get(pid, ""), term)))
        if terms:
            opportunities[pid] = list(dict.fromkeys(terms))
    # Job-derived project adaptations remain separate from factual experience.
    for target in graph.draft_technologies:
        if target.required:
            for pid in target.paragraph_ids:
                if pid in source:
                    opportunities.setdefault(pid, []).append(target.term)
    return opportunities


def substantive_reframe(before: str, after: str) -> bool:
    """Do not count punctuation, case, moved words or one synonym as a rewrite."""
    def tokens(text: str) -> list[str]:
        return re.findall(r"[a-z0-9+#]+", text.casefold())

    for term in sorted(SOFT_TERMS, key=len, reverse=True):
        after = re.sub(re.escape(term), "", after, flags=re.I)
        before = re.sub(re.escape(term), "", before, flags=re.I)
    original, final = tokens(before), tokens(after)
    if not original or not final or set(original) == set(final):
        return False
    changed_words = set(original).symmetric_difference(final)
    return len(changed_words) >= 4 and SequenceMatcher(None, original, final).ratio() < 0.90


class TailoringBreadth(TypedDict):
    opportunities: dict[str, list[str]]
    adapted: list[str]
    minimum: int


def tailoring_breadth(
    base: ResumeDocument,
    final_text: dict[str, str],
    keywords: list[JobKeyword],
    graph: ResumeEvidenceGraph,
    matches: TransferabilityMap,
) -> TailoringBreadth:
    opportunities = tailoring_opportunities(base, keywords, graph, matches)
    source = {p.paragraph_id: p.text for p in base.paragraphs}
    adapted = [
        pid for pid, terms in opportunities.items()
        if (
            substantive_reframe(source.get(pid, ""), final_text.get(pid, ""))
            or any(
                keyword.accepted
                and keyword.normalized not in SOFT_TERMS
                and contains_term(final_text.get(pid, ""), keyword.term)
                and not contains_term(source.get(pid, ""), keyword.term)
                for keyword in keywords
            )
        )
        and any(contains_term(final_text.get(pid, ""), term) for term in terms)
    ]
    # Report useful coverage; never manufacture edits to meet a count.
    return {"opportunities": opportunities, "adapted": adapted, "minimum": 0}


def tailoring_feedback(
    base: ResumeDocument,
    final_text: dict[str, str],
    keywords: list[JobKeyword],
    graph: ResumeEvidenceGraph,
    matches: TransferabilityMap,
) -> list[str]:
    """Reject cosmetic tailoring when the posting offers concrete, safe opportunities.

    Compare the actual export, not target-term annotations. A matched base resume,
    a sparse posting, or an unsupported stretch role has no arbitrary edit quota.
    """
    exported = "\n".join(final_text.values())
    source_by_id = {paragraph.paragraph_id: paragraph.text for paragraph in base.paragraphs}
    priorities = paragraph_priorities(base, keywords, graph, matches)
    routine_evidence = {item.evidence_id for item in graph.evidence if item.routine_tool_context}
    optional_tools = {
        row.term.casefold()
        for row in build_keyword_coverage(base, keywords, graph, final_text)
        if not row.required_bullet_groups and routine_evidence.intersection(row.evidence_ids)
    }
    opportunity_terms = {
        keyword.term
        for keyword in keywords
        if keyword.accepted
        and keyword.hiring_importance >= 25
        and keyword.normalized not in SOFT_TERMS | NON_PROSE_QUALIFICATIONS
        and keyword.term.casefold() not in optional_tools
    }
    candidates = {
        row["paragraph_id"]: [
            term for term in row["missing_supported_terms"] if term in opportunity_terms
        ]
        for row in priorities
        if ".bullet." in row["paragraph_id"]
    }
    candidates = {key: terms for key, terms in candidates.items() if terms}
    # Require coverage of supported gaps, not a number of changed paragraphs.
    # One evidenced placement can satisfy several candidate placement options.
    feedback: list[str] = []
    missing_placements = {
        term: [pid for pid, terms in candidates.items() if term in terms]
        for term in {term for terms in candidates.values() for term in terms}
        if not any(
            preserves_source_term(final_text.get(pid, ""), term)
            or demonstrates_ordinary_capability(term, source_by_id.get(pid, ""), final_text.get(pid, ""))
            for pid in final_text if ".bullet." in pid
        )
    }
    if missing_placements:
        feedback.append(
            "Supported role requirements still need natural evidenced bullet placement: "
            + "; ".join(f"{term} ({', '.join(pids)})" for term, pids in sorted(missing_placements.items()))
            + ". Choose the strongest factual placement for each requirement; do not "
            "repeat it across every candidate bullet or append a keyword list. "
            "Keep already effective bullets unchanged."
        )
    direct_terms = {
        match.target_term.casefold()
        for match in matches.matches
        if match.strength == EvidenceStrength.direct
    }
    missing = [
        keyword.term
        for keyword in keywords
        if keyword.accepted
        and keyword.hiring_importance >= 35
        and keyword.normalized in direct_terms
        and keyword.normalized not in SOFT_TERMS
        and keyword.term.casefold() not in optional_tools
        and not preserves_source_term(exported, keyword.term)
        and not any(demonstrates_ordinary_capability(keyword.term, source_by_id.get(pid, ""), text) for pid, text in final_text.items() if ".bullet." in pid)
        and keyword.normalized not in NON_PROSE_QUALIFICATIONS
    ]
    if missing:
        feedback.append(
            "Final document lost important directly supported terms: "
            + ", ".join(missing)
            + ". Use another evidenced paragraph or a shorter natural formulation; "
            "retain the term in shorter_text so layout repair cannot silently erase it."
        )
    for paragraph_id, text in final_text.items():
        if ".bullet." in paragraph_id:
            section = paragraph_id.rsplit(".bullet.", 1)[0]
            for term in ALWAYS_WEAK_TRANSFER_TERMS:
                if not contains_term(text, term) or contains_term(source_by_id.get(paragraph_id, ""), term):
                    continue
                if not any(
                    item.claim_scope == "source_specific"
                    and (item.section == section or item.source_reference in {section, paragraph_id})
                    and contains_term(item.source_text, term)
                    for item in graph.evidence
                ):
                    feedback.append(f"{paragraph_id}: {term} needs evidence for this employer/project; general exposure or ordinary documentation does not establish this formal duty.")
        reproduction = re.compile(r"\breproduc(?:e|ed|ing|tion)\b", re.I)
        if ".bullet." in paragraph_id and reproduction.search(text):
            section = paragraph_id.rsplit(".bullet.", 1)[0]
            sources = [
                item.source_text
                for item in graph.evidence
                if item.section == section
                or (
                    item.claim_scope == "source_specific"
                    and item.source_reference in {section, paragraph_id}
                )
            ]
            if not any(reproduction.search(source) for source in sources):
                feedback.append(
                    f"{paragraph_id}: reproducing issues is not established for this "
                    "employer/project. Preserve the evidenced investigation or "
                    "troubleshooting action; another role's reproduction work is not proof."
                )
        if ".bullet." in paragraph_id and re.search(
            r"\b(?:built|developed|created), (?:completed|performed|conducted) "
            r"application testing, and deployed\b|application testing on production incidents",
            text,
            re.I,
        ):
            feedback.append(
                f"{paragraph_id}: keyword insertion broke natural verb-object grammar. "
                "Give build/develop its product object; test applications and investigate "
                "incidents. Rewrite the sentence coherently while retaining the supported terms."
            )
        if ".bullet." in paragraph_id and re.search(
            r"\b(?:used|applied|utilized|leveraged|through structured) "
            r"(?:problem.solving|critical thinking|organizational skills|communication skills)\b",
            text,
            re.I,
        ):
            feedback.append(
                f"{paragraph_id}: replace the generic soft-skill opening with a concrete "
                "action verb and demonstrate the quality through the work performed."
            )
    return feedback
